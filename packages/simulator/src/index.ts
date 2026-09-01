import {
  DEFAULT_CONFIG,
  type HouseholdConfig,
  type RingEvent,
} from "@nightlight/engine";

/**
 * The demo household: one month of realistic Ring events for a home in
 * America/New_York, September 2026 (EDT, UTC-4).
 *
 * Everything here is deterministic from the seed, and everything that
 * consumes it must label it Simulated. The month tells a true-to-life story:
 *
 * - Days 1 to 7: the engine's warmup week (shadow mode, no incidents)
 * - Night of Sep 12: wandering that continues; caregiver notified, unacknowledged, escalated
 * - Night of Sep 23: a 2:40am doorway moment settled by the familiar voice alone
 * - Night of Sep 27: an 11:50pm doorway moment settled by the voice alone
 *
 * Expected outcome: 3 incidents, exactly 1 disturbed night, 29 of 30 undisturbed.
 */

export interface DemoMonth {
  events: RingEvent[];
  config: HouseholdConfig;
  scripted: {
    escalationNight: string;
    voiceNights: string[];
  };
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build an ISO timestamp for local EDT time on a September 2026 day. */
function edt(day: number, hour: number, minute: number): string {
  return new Date(Date.UTC(2026, 8, day, hour + 4, minute)).toISOString();
}

function ev(
  ts: string,
  type: RingEvent["type"],
  subType?: string,
): RingEvent {
  const e: RingEvent = { ts, type, deviceId: "front-door-cam" };
  if (subType) e.subType = subType;
  return e;
}

export function generateDemoMonth(seed = 42): DemoMonth {
  const rand = rng(seed);
  const events: RingEvent[] = [];
  const jitter = (spread: number): number => Math.floor(rand() * spread);

  for (let day = 1; day <= 30; day++) {
    const weekday = new Date(Date.UTC(2026, 8, day)).getUTCDay();
    const sunday = weekday === 0;

    // Morning departures.
    if (!sunday || rand() > 0.5) {
      events.push(ev(edt(day, 7, 25 + jitter(20)), "motion_detected", "human"));
      events.push(ev(edt(day, 8, 5 + jitter(25)), "motion_detected", "human"));
    }
    // Midday delivery on most days.
    if (rand() > 0.25) {
      const h = 13 + jitter(2);
      events.push(ev(edt(day, h, jitter(59)), "motion_detected", "human"));
      if (rand() > 0.6) events.push(ev(edt(day, h, 59), "button_press"));
    }
    // A passing car or animal, which must never matter.
    if (rand() > 0.5) {
      events.push(
        ev(edt(day, 10 + jitter(8), jitter(59)), "motion_detected", "vehicle"),
      );
    }
    // Evening comings and goings.
    const eveningCount = sunday ? 2 : 3 + (rand() > 0.5 ? 1 : 0);
    for (let i = 0; i < eveningCount; i++) {
      const h = 17 + jitter(4); // 17:00 to 20:59
      events.push(ev(edt(day, h, jitter(59)), "motion_detected", "human"));
    }
    // Rare connectivity blips.
    if (rand() > 0.9) {
      const h = 9 + jitter(10);
      events.push(ev(edt(day, h, 10), "device_offline"));
      events.push(ev(edt(day, h, 12 + jitter(5)), "device_online"));
    }
  }

  // A guest evening just before the night window: normal life, not an incident.
  events.push(ev(edt(18, 21, 12), "motion_detected", "human"));
  events.push(ev(edt(18, 21, 40), "motion_detected", "human"));

  // Night of Sep 12 (events early on Sep 13): wandering that continues.
  events.push(ev(edt(13, 3, 5), "motion_detected", "human"));
  events.push(ev(edt(13, 3, 9), "motion_detected", "human"));

  // Night of Sep 23 (early Sep 24): the familiar voice is enough.
  events.push(ev(edt(24, 2, 40), "motion_detected", "human"));

  // Night of Sep 27, 23:50: the voice is enough again.
  events.push(ev(edt(27, 23, 50), "motion_detected", "human"));

  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  events.forEach((e, i) => {
    e.requestId = `sim-${String(i + 1).padStart(5, "0")}`;
  });

  return {
    events,
    config: { householdId: "demo-house", ...DEFAULT_CONFIG },
    scripted: {
      escalationNight: "2026-09-12",
      voiceNights: ["2026-09-23", "2026-09-27"],
    },
  };
}

/** Wrap an event as a Ring-style webhook envelope for end-to-end replay. */
export function toWebhookEnvelope(
  event: RingEvent,
  accountId = "demo-account",
): Record<string, unknown> {
  return {
    data: {
      type: event.type,
      id: event.deviceId,
      attributes: event.subType ? { sub_type: event.subType } : {},
    },
    meta: {
      request_id: event.requestId ?? `sim-${event.ts}`,
      account_id: accountId,
      timestamp: event.ts,
    },
  };
}
