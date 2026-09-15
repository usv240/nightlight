import Fastify from "fastify";
import cors from "@fastify/cors";
import { Deduper, parseWebhook, verifySignature, signBody } from "ring-webhook-kit";
import type { RingEvent, RingEventType } from "@nightlight/engine";
import { generateDemoMonth, toWebhookEnvelope } from "@nightlight/simulator";
import { DemoAdapters } from "./adapters";
import { HouseholdRuntime } from "./household";
import { registerMcp } from "./mcp";
import { MemoryStore, type NightlightStore } from "./store";
import { phraseMorningNote } from "./summaries";
import { RingClient, validateLinkNonce, type RingTokens } from "./ring";

/**
 * Nightlight backend service.
 *
 * POST /webhooks/ring        verified Ring webhook intake (HMAC + dedupe)
 * POST /api/demo/replay      replay the simulated month through the real intake path
 * GET  /api/summary          nights, streak, incidents overview
 * GET  /api/incidents        incident detail
 * GET  /api/effects          executed effect journal
 * POST /api/incidents/ack    caregiver acknowledgement
 * GET  /healthz
 *
 * Secrets: RING_WEBHOOK_SECRET verifies real deliveries. The demo replay
 * signs with DEMO_WEBHOOK_SECRET and is accepted only for the demo household,
 * so simulated traffic can never impersonate a real device.
 */

const RING_SECRET = process.env.RING_WEBHOOK_SECRET ?? "";
const DEMO_SECRET = process.env.DEMO_WEBHOOK_SECRET ?? "nightlight-demo-secret";

export function buildServer(opts: { store?: NightlightStore } = {}) {
  const app = Fastify({ logger: false });
  const adapters = new DemoAdapters();
  const store = opts.store ?? new MemoryStore();
  const runtime = new HouseholdRuntime(store, adapters, { householdId: "demo-house" });
  const deduper = new Deduper();

  // Capture the raw body for signature verification before JSON parsing.
  // An empty body with a JSON content-type is legal and common: MCP clients
  // send exactly that on DELETE when terminating a session, which used to
  // surface as a 500 (found by the Strands agent in apps/agent, not by the
  // conformance tests, because inject() sends no content-type by default).
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      const raw = body as Buffer;
      if (raw.length === 0) {
        done(null, { raw, json: undefined });
        return;
      }
      try {
        done(null, { raw, json: JSON.parse(raw.toString("utf8")) });
      } catch (err) {
        done(err as Error);
      }
    },
  );

  app.register(cors, { origin: true });

  app.post("/webhooks/ring", async (req, reply) => {
    const parsedBody = req.body as { raw: Buffer; json: unknown };
    const signature = req.headers["x-signature"] as string | undefined;

    const okReal = RING_SECRET !== "" && verifySignature(parsedBody.raw, signature, RING_SECRET);
    const okDemo = verifySignature(parsedBody.raw, signature, DEMO_SECRET);
    if (!okReal && !okDemo) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    let webhook;
    try {
      webhook = parseWebhook(parsedBody.json);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    if (!deduper.firstSeen(webhook.requestId)) {
      return reply.code(200).send({ deduplicated: true });
    }

    const engineTypes: RingEventType[] = [
      "motion_detected",
      "button_press",
      "device_online",
      "device_offline",
    ];
    if ((engineTypes as string[]).includes(webhook.eventType)) {
      const event: RingEvent = {
        ts: webhook.ts,
        type: webhook.eventType as RingEventType,
        deviceId: webhook.deviceId ?? "unknown-device",
        requestId: webhook.requestId,
      };
      if (webhook.subType) event.subType = webhook.subType;
      const fresh = await runtime.ingestEvent(event);
      return reply.code(200).send({ accepted: true, newEffects: fresh.length });
    }
    return reply.code(200).send({ accepted: true, ignored: webhook.eventType });
  });

  app.post("/api/demo/replay", async (req, reply) => {
    const { seed } = (req.body as { json?: { seed?: number } })?.json ?? {};
    await runtime.reset();
    adapters.journal.length = 0;
    const demo = generateDemoMonth(seed ?? 42);
    // Drive the real webhook route for fidelity: sign, post, verify, dedupe.
    for (const event of demo.events) {
      const envelope = JSON.stringify(toWebhookEnvelope(event));
      await app.inject({
        method: "POST",
        url: "/webhooks/ring",
        headers: {
          "content-type": "application/json",
          "x-signature": signBody(envelope, DEMO_SECRET),
        },
        payload: envelope,
      });
    }
    const snap = await runtime.snapshot();
    return reply.send({
      simulated: true,
      events: demo.events.length,
      incidents: snap.incidents.length,
      undisturbedNights: snap.nights.filter((n) => n.undisturbed).length,
      totalNights: snap.nights.length,
      undisturbedStreak: snap.undisturbedStreak,
    });
  });

  app.get("/api/summary", async () => {
    const snap = await runtime.snapshot();
    return {
      simulated: true,
      baselineDays: snap.baselineDays,
      nights: snap.nights,
      undisturbedStreak: snap.undisturbedStreak,
      incidentCount: snap.incidents.length,
    };
  });

  app.get("/api/incidents", async () => (await runtime.snapshot()).incidents);

  app.get("/api/effects", async () => ({
    executions: (await runtime.snapshot()).executions,
    journal: adapters.journal,
  }));

  app.post("/api/incidents/ack", async (req) => {
    const body = (req.body as { json?: { at?: string } })?.json ?? {};
    const at = body.at ?? new Date().toISOString();
    const fresh = await runtime.acknowledge(at);
    return { acknowledged: true, at, newEffects: fresh.length };
  });

  // Night window settings: the caregiver's own hours. Changing them
  // re-derives every read model from the same event log on the next
  // request, because nights are computed, never stored.
  app.get("/api/settings", async () => ({
    nightWindow: runtime.config.nightWindow,
    timezone: runtime.config.timezone,
    watchingMinutes: runtime.config.watchingMinutes,
    escalateMinutes: runtime.config.escalateMinutes,
  }));

  app.post("/api/settings", async (req, reply) => {
    const body = (req.body as { json?: { start?: string; end?: string } })?.json ?? {};
    const hhmm = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!body.start || !body.end || !hhmm.test(body.start) || !hhmm.test(body.end)) {
      return reply.code(400).send({ error: "start and end must be HH:MM in 24 hour time" });
    }
    if (body.start === body.end) {
      return reply.code(400).send({ error: "start and end must differ" });
    }
    runtime.setNightWindow(body.start, body.end);
    const snap = await runtime.snapshot();
    return reply.send({
      nightWindow: runtime.config.nightWindow,
      recomputed: {
        nights: snap.nights.length,
        undisturbedStreak: snap.undisturbedStreak,
        incidents: snap.incidents.length,
      },
    });
  });

  app.get("/api/morning-note", async () => {
    const snap = await runtime.snapshot();
    const lastNight = snap.nights[snap.nights.length - 1];
    if (!lastNight) {
      return { available: false, message: "No nights recorded yet." };
    }
    const note = await phraseMorningNote(lastNight, snap.undisturbedStreak);
    return { available: true, simulated: true, ...note };
  });

  app.get("/healthz", async () => ({ ok: true }));

  // ---- Live Ring Partner API surface -----------------------------------
  // The track's required technology, called for real. Tokens persist in
  // the store; RING_ACCESS_TOKEN (console playground) overrides for spikes.
  const ringConfigured = Boolean(
    process.env.RING_CLIENT_ID && process.env.RING_CLIENT_SECRET,
  );
  const ring = ringConfigured
    ? new RingClient({
        clientId: process.env.RING_CLIENT_ID!,
        clientSecret: process.env.RING_CLIENT_SECRET!,
        loadTokens: async () => {
          const raw = await store.getMeta("demo-house", "ring-tokens");
          return raw ? (JSON.parse(raw) as RingTokens) : null;
        },
        saveTokens: async (t) => {
          await store.putMeta("demo-house", "ring-tokens", JSON.stringify(t));
        },
      })
    : null;

  // Token Exchange URL (registered in the Ring console): Ring delivers an
  // authorization code here; we exchange it at oauth.ring.com and persist.
  const handleTokenExchange = async (code: string | undefined, reply: import("fastify").FastifyReply) => {
    if (!ring) return reply.code(503).send({ error: "Ring credentials not configured" });
    if (!code) return reply.code(400).send({ error: "missing code" });
    await ring.exchangeCode(code);
    return reply
      .type("text/html")
      .send("<html><body style='font-family:system-ui;padding:2rem'><h2>Nightlight is connected to Ring.</h2><p>You can close this window.</p></body></html>");
  };
  app.get("/oauth/ring/token", async (req, reply) =>
    handleTokenExchange((req.query as { code?: string }).code, reply),
  );
  app.post("/oauth/ring/token", async (req, reply) => {
    const q = req.query as { code?: string };
    const b = (req.body as { json?: { code?: string } })?.json ?? {};
    return handleTokenExchange(q.code ?? b.code, reply);
  });

  // Account Link URL: Ring redirects the user's browser here with a nonce
  // that cryptographically binds the link to a specific Ring account
  // (HMAC-SHA256 over "time:accountId" with the app's signature key,
  // validated within a 600 second window; see validateLinkNonce and the
  // ring.test.ts vectors). The pending nonce is stored, then claimed via
  // POST /v1/accounts/me/app-integrations once tokens identify the user.
  app.get("/oauth/ring/link", async (req, reply) => {
    const { nonce, time } = req.query as { nonce?: string; time?: string };
    if (!nonce || !time) return reply.code(400).send({ error: "missing nonce or time" });
    await store.putMeta("demo-house", "ring-pending-link", JSON.stringify({ nonce, time, receivedAt: Date.now() }));
    return reply
      .type("text/html")
      .send("<html><body style='font-family:system-ui;padding:2rem'><h2>Linking Nightlight to your Ring account...</h2><p>Nightlight received Ring's secure link request. Finish sign-in in the app to complete the connection.</p></body></html>");
  });

  // Validate a pending link nonce against a known account id (used by the
  // claim step and exercised by the live spike script).
  app.post("/api/ring/validate-link", async (req, reply) => {
    const b = (req.body as { json?: { accountId?: string } })?.json ?? {};
    const raw = await store.getMeta("demo-house", "ring-pending-link");
    if (!raw || !b.accountId) return reply.code(400).send({ error: "no pending link or missing accountId" });
    const pending = JSON.parse(raw) as { nonce: string; time: string };
    const result = validateLinkNonce(pending.nonce, pending.time, b.accountId, RING_SECRET);
    return reply.send(result);
  });

  // Live proof routes: real calls to api.amazonvision.com.
  app.get("/api/ring/me", async (_req, reply) => {
    if (!ring) return reply.code(503).send({ error: "Ring credentials not configured" });
    return reply.send(await ring.getUserMe());
  });
  app.get("/api/ring/devices", async (_req, reply) => {
    if (!ring) return reply.code(503).send({ error: "Ring credentials not configured" });
    return reply.send(await ring.listDevices());
  });

  registerMcp(app, runtime);

  return { app, runtime, adapters, ring };
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/server.ts") ?? false;
if (isMain) {
  const { app } = buildServer();
  const port = Number(process.env.PORT ?? 8787);
  app
    .listen({ port, host: "127.0.0.1" })
    .then(() => console.log(`Nightlight backend listening on http://127.0.0.1:${port}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
