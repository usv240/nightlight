import type { AddressInfo } from "node:net";
import { signBody } from "ring-webhook-kit";
import { toWebhookEnvelope } from "@nightlight/simulator";
import { MemoryStore, type EffectExecutionRecord, type NightlightStore } from "./store";
import type { RingEvent } from "@nightlight/engine";

/**
 * The Ring delivery proof, run on demand against a throwaway household.
 *
 * Why this exists
 * ---------------
 * The hackathon rules require the demo video to **show** the project
 * working through a Ring simulator or device, not to assert that it does.
 * Everything else in this product was already real: the Ring Partner API
 * is called, webhooks are verified, `docs/RING_LIVE.md` records three of
 * three read endpoints answering. None of that is visible on camera. A
 * viewer saw a caregiver app and heard a sentence claiming Ring was
 * underneath it, which is exactly the kind of claim this project refuses
 * to make anywhere else.
 *
 * So this makes it watchable. One request performs three real signed
 * deliveries and reports what the production route did with each:
 *
 *   1. a genuine 3am human-motion event from the front door doorbell
 *   2. the same delivery with one byte changed in transit
 *   3. Ring redelivering the first event, which it does on retry
 *
 * The second and third are the point. Anyone can show a success. What a
 * family is actually trusting is that a forged delivery cannot play audio
 * into their home at 3am, and that a retry cannot play it twice.
 *
 * What is real here, and what is not
 * ----------------------------------
 * Real: the envelope shape, the HMAC SHA-256 signature over the raw body
 * computed by the published `ring-webhook-kit`, an HTTP POST over a real
 * socket, the production `/webhooks/ring` route, its verification, its
 * deduper, and the engine's decision.
 *
 * Not real: the household. The deliveries land in a sandbox instance with
 * its own in-memory store, built by the same `buildServer` that serves
 * production. That is deliberate rather than convenient. The published
 * month, the thirty-night strip and the streak are claims this project
 * has committed to, and a judge pressing a button on the marketing page
 * must not be able to move them. The UI says so on screen; the proof is
 * worth nothing if it needs a footnote the viewer never sees.
 */

export interface Delivery {
  /** Plain-language label for the row. Written for a viewer, not a log. */
  label: string;
  /** What Ring would have sent, trimmed for the screen. */
  request: {
    method: "POST";
    path: "/webhooks/ring";
    signatureHeader: string;
    body: string;
  };
  response: { status: number; body: unknown };
  verdict: "accepted" | "rejected" | "deduplicated";
  /** One sentence a non-engineer can read off the screen. */
  explain: string;
}

export interface SimulationResult {
  deliveries: Delivery[];
  /** What the engine did with the one delivery it accepted. */
  engine: { incidents: number; effect: string | null };
  /** Stated plainly so the panel never has to imply more than happened. */
  transport: "http";
  sandbox: true;
  ms: number;
}

type App = { listen: Function; close: Function; inject: Function; server: unknown };
type ServerBuilder = (opts?: { store?: NightlightStore }) => { app: App };

const HOUSEHOLD = "demo-house";

/**
 * The seeded household, built once per process and copied per call.
 *
 * A single event into an empty household proves nothing: the engine spends
 * its first seven days in shadow mode by design, so it would have nothing
 * to find 3am unusual against. The first version of this route replayed
 * the whole demo month through the webhook route on every press. Locally
 * that was 600ms. On the deployed Lambda it was five seconds, every time,
 * and on camera the cursor was still waiting for the rows while the
 * narration was already describing them.
 *
 * The seed is deterministic, so it is computed once and its event log and
 * effect claims are copied into a fresh MemoryStore for each call. Each
 * call still gets its own store, its own deduper and its own journal; the
 * isolation the panel promises is unchanged. Only the repeated work is
 * gone.
 */
interface Seed {
  events: RingEvent[];
  executions: EffectExecutionRecord[];
}

let seedPromise: Promise<Seed> | null = null;

async function seed(build: ServerBuilder): Promise<Seed> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const store = new MemoryStore();
      const { app } = build({ store });
      try {
        // inject() runs the real replay route without opening a socket,
        // which is all the seed needs; the socket is for the deliveries.
        await app.inject({
          method: "POST",
          url: "/api/demo/replay",
          headers: { "content-type": "application/json" },
          payload: "{}",
        });
        return {
          events: await store.listEvents(HOUSEHOLD),
          executions: await store.listExecutions(HOUSEHOLD),
        };
      } finally {
        await app.close();
      }
    })().catch((err) => {
      // A failed seed must not poison every later call.
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function seededStore(build: ServerBuilder): Promise<MemoryStore> {
  const { events, executions } = await seed(build);
  const store = new MemoryStore();
  for (const e of events) await store.appendEvent(HOUSEHOLD, e);
  // The month's own effects are copied as already executed. Without this
  // the sandbox would run the September voice prompts and escalation
  // again on its first request, and the journal would report one of those
  // as "what the engine did" instead of the delivery that was just sent.
  for (const x of executions) {
    await store.claimEffect(HOUSEHOLD, x.key, { executedAt: x.executedAt, detail: x.detail });
  }
  return store;
}

async function post(
  base: string,
  body: string,
  signature: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}/webhooks/ring`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": signature },
    body,
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

function verdictOf(status: number, body: unknown): Delivery["verdict"] {
  if (status !== 200) return "rejected";
  if ((body as { deduplicated?: boolean })?.deduplicated) return "deduplicated";
  return "accepted";
}

/**
 * Three signed deliveries against a sandbox household.
 *
 * `build` is injected rather than imported so this module does not have to
 * import the server that imports it.
 */
export async function simulateRingDeliveries(
  build: ServerBuilder,
  demoSecret: string,
  nightAt: string,
): Promise<SimulationResult> {
  const started = Date.now();
  const { app } = build({ store: await seededStore(build) });
  // Port 0 asks the OS for a free port, so two simulations cannot collide
  // and nothing has to be reserved. Loopback only: this listener exists for
  // the length of one request and must never be reachable from outside.
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server as { address(): AddressInfo }).address().port}`;

  try {
    const requestId = `ring-sim-${Date.now()}`;
    const body = JSON.stringify(
      toWebhookEnvelope({
        ts: nightAt,
        type: "motion_detected",
        deviceId: "front-door-doorbell",
        subType: "human",
        requestId,
      }),
    );
    // The header exactly as Ring sends it: "sha256=" and the hex digest
    // (Ring API reference, webhook authentication). The kit accepts the
    // bare digest too, which is why the earlier form passed unnoticed.
    const signature = `sha256=${signBody(body, demoSecret)}`;

    const first = await post(base, body, signature);

    // One byte, changed after signing. This is the whole reason a webhook
    // signature covers the raw body rather than a parsed object: an
    // attacker who can alter the payload in flight still cannot produce a
    // signature for what they altered it to.
    const tampered = body.replace('"human"', '"humaN"');
    const second = await post(base, tampered, signature);

    // Byte-identical to the first, which is what Ring sends when it did not
    // see our acknowledgement. Accepting it would play the voice twice.
    const third = await post(base, body, signature);

    const effects = (await fetch(`${base}/api/effects`).then((r) => r.json())) as {
      journal?: { action: string; detail?: string }[];
    };
    const incidents = (await fetch(`${base}/api/incidents`).then((r) => r.json())) as unknown[];
    const last = effects.journal?.[effects.journal.length - 1] ?? null;

    const deliveries: Delivery[] = [
      {
        label: "A Ring doorbell reports human motion at the front door, 3am",
        request: { method: "POST", path: "/webhooks/ring", signatureHeader: signature, body },
        response: first,
        verdict: verdictOf(first.status, first.body),
        explain:
          "Signature verified against the raw body. The event was accepted and the engine opened an incident.",
      },
      {
        label: "The same delivery, one byte changed in transit",
        request: {
          method: "POST",
          path: "/webhooks/ring",
          signatureHeader: signature,
          body: tampered,
        },
        response: second,
        verdict: verdictOf(second.status, second.body),
        explain:
          "The signature no longer matches the bytes received, so it never reached the engine. A forged event cannot play audio into a home.",
      },
      {
        label: "Ring redelivering the first event, which it does on retry",
        request: { method: "POST", path: "/webhooks/ring", signatureHeader: signature, body },
        response: third,
        verdict: verdictOf(third.status, third.body),
        explain:
          "Correctly signed and correctly ignored. The request id was already seen, so the familiar voice does not play a second time.",
      },
    ];

    return {
      deliveries,
      engine: {
        incidents: Array.isArray(incidents) ? incidents.length : 0,
        effect: last ? `${last.action}${last.detail ? `: ${last.detail}` : ""}` : null,
      },
      transport: "http",
      sandbox: true,
      ms: Date.now() - started,
    };
  } finally {
    await app.close();
  }
}
