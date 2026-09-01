import Fastify from "fastify";
import cors from "@fastify/cors";
import { Deduper, parseWebhook, verifySignature, signBody } from "ring-webhook-kit";
import type { RingEvent, RingEventType } from "@nightlight/engine";
import { generateDemoMonth, toWebhookEnvelope } from "@nightlight/simulator";
import { DemoAdapters } from "./adapters";
import { HouseholdRuntime } from "./household";
import { registerMcp } from "./mcp";

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

export function buildServer() {
  const app = Fastify({ logger: false });
  const adapters = new DemoAdapters();
  const runtime = new HouseholdRuntime(adapters, { householdId: "demo-house" });
  const deduper = new Deduper();

  // Capture the raw body for signature verification before JSON parsing.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      try {
        done(null, { raw: body as Buffer, json: JSON.parse((body as Buffer).toString("utf8")) });
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
    runtime.reset();
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
    const snap = runtime.snapshot();
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
    const snap = runtime.snapshot();
    return {
      simulated: true,
      baselineDays: snap.baselineDays,
      nights: snap.nights,
      undisturbedStreak: snap.undisturbedStreak,
      incidentCount: snap.incidents.length,
    };
  });

  app.get("/api/incidents", async () => runtime.snapshot().incidents);

  app.get("/api/effects", async () => ({
    executions: runtime.snapshot().executions,
    journal: adapters.journal,
  }));

  app.post("/api/incidents/ack", async (req) => {
    const body = (req.body as { json?: { at?: string } })?.json ?? {};
    const at = body.at ?? new Date().toISOString();
    const fresh = await runtime.acknowledge(at);
    return { acknowledged: true, at, newEffects: fresh.length };
  });

  app.get("/healthz", async () => ({ ok: true }));

  registerMcp(app, runtime);

  return { app, runtime, adapters };
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
