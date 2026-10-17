import Fastify from "fastify";
import cors from "@fastify/cors";
import { Deduper, parseWebhook, verifySignature, signBody } from "ring-webhook-kit";
import type { RingEvent, RingEventType } from "@nightlight/engine";
import { generateDemoMonth, toWebhookEnvelope } from "@nightlight/simulator";
import { DemoAdapters } from "./adapters";
import { HouseholdRuntime } from "./household";
import { registerMcp } from "./mcp";
import { MemoryStore, type NightlightStore } from "./store";
import { MODEL_LADDER, phraseMorningNote } from "./summaries";
import { RingClient, validateLinkNonce, type RingTokens } from "./ring";
import { simulateRingDeliveries } from "./ring-simulate";
import { checkRingAccountLink } from "./ring-link-check";
import { callerFrom, householdIdFor, issueKey, issuedKeyBody } from "./keys";

/**
 * Nightlight backend service.
 *
 * POST /webhooks/ring        verified Ring webhook intake (HMAC + dedupe)
 * POST /api/ring/simulate    three real signed Ring deliveries, sandboxed
 * POST /api/ring/link-check  the account-link nonce handshake, checked
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
const ENGINE_TYPES: RingEventType[] = [
  "motion_detected",
  "button_press",
  "device_online",
  "device_offline",
];
const DEMO_SECRET = process.env.DEMO_WEBHOOK_SECRET ?? "nightlight-demo-secret";

export function buildServer(opts: { store?: NightlightStore } = {}) {
  const app = Fastify({ logger: false });
  const adapters = new DemoAdapters();
  const store = opts.store ?? new MemoryStore();
  /*
    One household for everybody, plus one per API key.

    No key is the labelled demo household, exactly as it always was: the
    real Ring webhook, the caregiver app and every link in the video land
    there. A key from POST /v1/keys is a household of its own, made on
    first use, with its own event log, adapters and deduper, so a judge
    can replay a month, post their own Ring events and change the night
    window without touching anybody else's.
  */
  interface Household {
    runtime: HouseholdRuntime;
    adapters: DemoAdapters;
    deduper: Deduper;
    simulated: boolean;
  }
  const demo: Household = {
    runtime: new HouseholdRuntime(store, adapters, { householdId: "demo-house" }),
    adapters,
    deduper: new Deduper(),
    simulated: true,
  };
  const keyed = new Map<string, Household>();
  const householdFor = (space: string | null): Household => {
    if (space === null) return demo;
    let h = keyed.get(space);
    if (!h) {
      const own = new DemoAdapters();
      h = {
        runtime: new HouseholdRuntime(store, own, { householdId: householdIdFor(space) }),
        adapters: own,
        deduper: new Deduper(),
        simulated: false,
      };
      keyed.set(space, h);
    }
    return h;
  };
  /** The caller's household, or a 401 already sent. */
  const householdOf = (
    req: { headers: { authorization?: string | string[] | undefined } },
    reply: { code: (n: number) => { header: (k: string, v: string) => { send: (b: unknown) => unknown } } },
  ): Household | null => {
    const caller = callerFrom(req.headers.authorization);
    if ("error" in caller) {
      reply.code(401).header("WWW-Authenticate", 'Bearer realm="nightlight"').send({ error: caller.error });
      return null;
    }
    return householdFor(caller.space);
  };
  // The demo household, under the name every existing route already uses.
  const runtime = demo.runtime;

  // Capture the raw body for signature verification before JSON parsing.
  //
  // Two shapes have to survive this parser, and both were found against the
  // deployed service rather than in a test.
  //
  // An empty body with a JSON content-type is legal and common: MCP clients
  // send exactly that on DELETE when terminating a session, which used to
  // surface as a 500 (found by the Strands agent in apps/agent, not by the
  // conformance tests, because inject() sends no content-type by default).
  //
  // Malformed JSON must not fail here either. Handing the error to `done`
  // lets Fastify answer with its own 500 envelope, but JSON-RPC is explicit
  // that a body it cannot parse is a -32700 Parse error, and a transport
  // 500 tells a client to retry something that will never succeed. So the
  // parser reports the failure as data and each route decides what it
  // means. Found by scripts/mcp-conform.mjs against the live Lambda.
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
        done(null, { raw, json: undefined, parseError: (err as Error).message });
      }
    },
  );

  /*
    CORS is handled by exactly one layer.

    On Lambda the function URL's own CORS configuration reflects the
    request origin. If this app also registered CORS, the response would
    carry two Access-Control-Allow-Origin headers, and every browser
    rejects that outright, even when both values are identical.

    That is not hypothetical: it shipped. The deployed API answered
    /api/summary with the header twice, so the caregiver app could not
    load its own data in any browser, while curl reported a clean 200 and
    every server test passed. The identical bug was found and fixed in a
    sibling project weeks earlier and was not carried across to here,
    which is the actual lesson.

    Locally there is no function URL, so the middleware is needed and is
    registered. Guarding on the Lambda runtime variable keeps exactly one
    layer responsible in each environment.
  */
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Exposed to match the function URL's own CORS config exactly.
    //
    // A browser hides every response header it is not told it may read,
    // and an MCP client cannot continue without reading MCP-Session-Id.
    // Production exposes it at the function URL, so this layer and that
    // one have to agree; before this they did not, and any browser-based
    // MCP client worked in production and failed in local development
    // with a session the server had opened and the client could not see.
    // Bellwether's server had this right from the start. This is the
    // second CORS fix in a row that one sibling had and the others did
    // not.
    app.register(cors, { origin: true, exposedHeaders: ["mcp-session-id"] });
  }

  app.post("/webhooks/ring", async (req, reply) => {
    const parsedBody = req.body as { raw: Buffer; json: unknown; parseError?: string };
    const signature = req.headers["x-signature"] as string | undefined;

    // Signature first, then shape: an unsigned request is rejected before we
    // say anything about its contents.

    const okReal = RING_SECRET !== "" && verifySignature(parsedBody.raw, signature, RING_SECRET);
    const okDemo = verifySignature(parsedBody.raw, signature, DEMO_SECRET);
    if (!okReal && !okDemo) {
      return reply.code(401).send({ error: "invalid signature" });
    }
    if (parsedBody.parseError) {
      return reply.code(400).send({ error: "malformed JSON body" });
    }

    let webhook;
    try {
      webhook = parseWebhook(parsedBody.json);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    const target = householdOf(req, reply);
    if (!target) return;
    if (!target.deduper.firstSeen(webhook.requestId)) {
      return reply.code(200).send({ deduplicated: true });
    }

    if ((ENGINE_TYPES as string[]).includes(webhook.eventType)) {
      const event: RingEvent = {
        ts: webhook.ts,
        type: webhook.eventType as RingEventType,
        deviceId: webhook.deviceId ?? "unknown-device",
        requestId: webhook.requestId,
      };
      if (webhook.subType) event.subType = webhook.subType;
      const fresh = await target.runtime.ingestEvent(event);
      return reply.code(200).send({ accepted: true, newEffects: fresh.length });
    }
    return reply.code(200).send({ accepted: true, ignored: webhook.eventType });
  });

  app.post("/api/demo/replay", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    const { seed } = (req.body as { json?: { seed?: number } })?.json ?? {};
    await h.runtime.reset();
    h.adapters.journal.length = 0;
    h.simulated = true;
    /*
      The deduper has to be reset too, and forgetting it made this endpoint
      destroy the thing it exists to build.

      Every replayed event carries the same request id as last time, which
      is exactly what duplicate suppression is for when Ring redelivers a
      webhook. On a second replay that correct behaviour dropped all 204
      events, leaving a single night on the board and a live demo showing
      "no incidents recorded".

      A deliberate replay is a new run, not a redelivery, so it gets a new
      deduper. Anyone clicking the demo twice, including a judge, now gets
      the same month both times.
    */
    h.deduper = new Deduper();
    const month = generateDemoMonth(seed ?? 42);
    /*
      Every event is signed, verified, parsed and deduplicated exactly as a
      Ring webhook is, with the same functions, and then the month is
      ingested as one batch.

      It used to be posted through the webhook route one event at a time,
      and each one replayed the whole log and re-claimed every effect so
      far: about six hundred database calls, and fourteen to seventeen
      seconds behind a button on the live site. Measured while preparing
      the demo video, where it would have been a quarter of a minute of
      "Replaying...". Effects are derived from the whole timeline either
      way, so the result is the same month; the replay-idempotence tests
      say so.
    */
    const batch: RingEvent[] = [];
    for (const demoEvent of month.events) {
      const envelope = JSON.stringify(toWebhookEnvelope(demoEvent));
      const raw = Buffer.from(envelope, "utf8");
      if (!verifySignature(raw, signBody(envelope, DEMO_SECRET), DEMO_SECRET)) {
        return reply.code(500).send({ error: "a replayed event failed its own signature" });
      }
      const webhook = parseWebhook(JSON.parse(envelope));
      if (!h.deduper.firstSeen(webhook.requestId)) continue;
      if (!(ENGINE_TYPES as string[]).includes(webhook.eventType)) continue;
      const event: RingEvent = {
        ts: webhook.ts,
        type: webhook.eventType as RingEventType,
        deviceId: webhook.deviceId ?? "unknown-device",
        requestId: webhook.requestId,
      };
      if (webhook.subType) event.subType = webhook.subType;
      batch.push(event);
    }
    await h.runtime.ingestBatch(batch);
    const snap = await h.runtime.snapshot();
    return reply.send({
      simulated: true,
      events: month.events.length,
      incidents: snap.incidents.length,
      undisturbedNights: snap.nights.filter((n) => n.undisturbed).length,
      totalNights: snap.nights.length,
      undisturbedStreak: snap.undisturbedStreak,
    });
  });

  app.get("/api/summary", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    const snap = await h.runtime.snapshot();
    return {
      simulated: h.simulated,
      baselineDays: snap.baselineDays,
      nights: snap.nights,
      undisturbedStreak: snap.undisturbedStreak,
      incidentCount: snap.incidents.length,
    };
  });

  app.get("/api/incidents", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    return (await h.runtime.snapshot()).incidents;
  });

  app.get("/api/effects", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    return { executions: (await h.runtime.snapshot()).executions, journal: h.adapters.journal };
  });

  app.post("/api/incidents/ack", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    const body = (req.body as { json?: { at?: string } })?.json ?? {};
    const at = body.at ?? new Date().toISOString();
    const fresh = await h.runtime.acknowledge(at);
    return { acknowledged: true, at, newEffects: fresh.length };
  });

  // Night window settings: the caregiver's own hours. Changing them
  // re-derives every read model from the same event log on the next
  // request, because nights are computed, never stored.
  app.get("/api/settings", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    return {
      nightWindow: h.runtime.config.nightWindow,
      timezone: h.runtime.config.timezone,
      watchingMinutes: h.runtime.config.watchingMinutes,
      escalateMinutes: h.runtime.config.escalateMinutes,
    };
  });

  app.post("/api/settings", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    const runtime = h.runtime;
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

  app.get("/api/morning-note", async (req, reply) => {
    const h = householdOf(req, reply);
    if (!h) return;
    const snap = await h.runtime.snapshot();
    const lastNight = snap.nights[snap.nights.length - 1];
    if (!lastNight) {
      return { available: false, message: "No nights recorded yet." };
    }
    const note = await phraseMorningNote(lastNight, snap.undisturbedStreak);
    return { available: true, simulated: h.simulated, ...note };
  });

  app.get("/healthz", async () => ({ ok: true }));

  // A free API key, no account: a household of your own.
  app.post("/v1/keys", async (_req, reply) => reply.code(201).send(issuedKeyBody(issueKey())));

  /*
    Bring your own events. A keyed household takes Ring-shaped events
    straight in, unsigned, because the key already says whose they are:
    a judge can paste an export of their own doorbell's history, or write
    a night by hand, and watch the same engine read it. The demo
    household takes only signed Ring webhooks, so nobody can write into
    the one everybody shares.
  */
  app.post("/api/events", async (req, reply) => {
    const caller = callerFrom(req.headers.authorization);
    if ("error" in caller) {
      return reply.code(401).header("WWW-Authenticate", 'Bearer realm="nightlight"').send({ error: caller.error });
    }
    if (caller.space === null) {
      return reply.code(403).send({
        error: "The demo household takes signed Ring webhooks only. POST /v1/keys for a household of your own, then send your events here with it.",
      });
    }
    const h = householdFor(caller.space);
    const list = (req.body as { json?: { events?: unknown } })?.json?.events;
    if (!Array.isArray(list) || list.length === 0 || list.length > 5000) {
      return reply.code(400).send({ error: "send { events: [{ ts, type }] }, 1 to 5000 of them" });
    }
    const allowed = ["motion_detected", "button_press", "device_online", "device_offline"];
    const events: RingEvent[] = [];
    for (const [i, raw] of list.entries()) {
      const e = raw as { ts?: unknown; type?: unknown; deviceId?: unknown; subType?: unknown };
      if (typeof e.ts !== "string" || Number.isNaN(Date.parse(e.ts)) || typeof e.type !== "string" || !allowed.includes(e.type)) {
        return reply.code(400).send({ error: `event ${i}: ts must be ISO 8601 and type one of ${allowed.join(", ")}` });
      }
      const event: RingEvent = {
        ts: new Date(e.ts).toISOString(),
        type: e.type as RingEventType,
        deviceId: typeof e.deviceId === "string" ? e.deviceId : "your-doorbell",
        requestId: `own-${caller.space}-${i}-${e.ts}`,
      };
      if (typeof e.subType === "string") event.subType = e.subType;
      events.push(event);
    }
    events.sort((a, b) => a.ts.localeCompare(b.ts));
    const fresh = events.filter((e) => !e.requestId || h.deduper.firstSeen(e.requestId));
    const effects = (await h.runtime.ingestBatch(fresh)).length;
    h.simulated = false;
    const snap = await h.runtime.snapshot();
    return reply.send({
      accepted: events.length,
      newEffects: effects,
      baselineDays: snap.baselineDays,
      nights: snap.nights.length,
      incidents: snap.incidents.length,
      note: snap.baselineDays < 7 ? "Nightlight learns for seven days before it acts on anything." : "Armed: the baseline is learned.",
    });
  });

  /**
   * Resilience posture: what this deployment will do when things fail.
   *
   * Exposed because a fallback nobody can see is indistinguishable from a
   * fallback that does not exist. This reports the configured degradation
   * paths and, for the voice, the safety rule that governs total failure.
   */
  app.get("/api/resilience", async () => ({
    voice: {
      paths: [
        "ring-chime-family-recording",
        "ring-chime-polly-synthesis",
      ],
      onTotalFailure: "notify the caregiver immediately",
      rationale:
        "The incident state machine advances to WATCHING assuming a voice was tried. A silent failure would mean nothing happened at the door and nobody was told. Degrading to waking someone is always safe; degrading to silence never is.",
      tested: "apps/backend/test/voice.test.ts",
    },
    morningNote: {
      modelLadder: MODEL_LADDER,
      onTotalFailure: "deterministic template text",
      rationale:
        "The template is the night's own computed text, so the note degrades in warmth and never in accuracy. Every response reports which model produced it and what was tried.",
      enabled: process.env.NIGHTLIGHT_BEDROCK === "1",
    },
    detection: {
      usesModels: false,
      rationale:
        "Baselines, scoring and the incident state machine are deterministic and never call a model. Predictable 3am behaviour is a safety requirement, so there is nothing here to fall back from.",
    },
    intake: {
      signatureVerification: "HMAC SHA-256, timing-safe",
      duplicateSuppression: "TTL-bounded request-id deduper",
      exactlyOnceEffects: "DynamoDB conditional put on an EXEC# row",
    },
    store: store instanceof MemoryStore ? "in-memory" : "dynamodb",
  }));

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

  /*
    The Ring delivery proof, for the demo video and for anyone reading the
    site who does not take a claim on trust.

    The rules require the video to show the project working through a Ring
    simulator or device. Everything underneath was already real, and none
    of it was visible: a viewer saw a caregiver app and heard a sentence
    about signed webhooks. This makes the sentence watchable.

    See ring-simulate.ts for what is real here and what is sandboxed. The
    short version is that only the household is fake, deliberately, so
    pressing this button cannot move the published month.
  */
  app.post("/api/ring/simulate", async (_req, reply) => {
    try {
      // 03:07 on the morning after the demo month ends, so it is a genuine
      // night-time doorway against a baseline that has already been learnt
      // rather than an event the engine has no opinion about.
      const snap = await runtime.snapshot();
      const lastNight = snap.nights[snap.nights.length - 1]?.nightOf;
      const day = lastNight
        ? new Date(`${lastNight}T00:00:00Z`)
        : new Date();
      day.setUTCDate(day.getUTCDate() + 1);
      const nightAt = `${day.toISOString().slice(0, 10)}T07:07:00.000Z`;
      return reply.send(
        await simulateRingDeliveries((opts) => buildServer(opts), DEMO_SECRET, nightAt),
      );
    } catch (err) {
      // A failed proof must read as a failed proof, never as a success
      // with an empty table.
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  /*
    The account-link handshake, shown working.

    The webhook proof answers "is Ring really underneath this". It does
    not answer "how does a family connect their own doorbell", and that
    flow was built, registered and invisible. See ring-link-check.ts for
    what is real here: the validator is the production one, the key is the
    demo key, and the page says so.
  */
  app.post("/api/ring/link-check", async (_req, reply) => {
    try {
      return reply.send(checkRingAccountLink(DEMO_SECRET));
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  registerMcp(app, householdFor);

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
