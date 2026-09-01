import { beforeEach, describe, expect, it } from "vitest";
import {
  openIncident,
  resetIncidentCounter,
  stepIncident,
} from "../src/incidents";
import { DEFAULT_CONFIG, type HouseholdConfig, type RingEvent, type ScoreResult } from "../src/types";

const cfg: HouseholdConfig = { householdId: "h1", ...DEFAULT_CONFIG };

const score: ScoreResult = {
  inNightWindow: true,
  expected: 0,
  score: 1,
  anomalous: true,
  flags: ["below_household_baseline"],
};

function motion(ts: string): RingEvent {
  return { ts, type: "motion_detected", subType: "human", deviceId: "d1" };
}

beforeEach(() => resetIncidentCounter());

describe("incident state machine", () => {
  it("opens with snapshot and voice effects and a watch timer", () => {
    const res = openIncident("h1", motion("2026-09-13T07:05:00Z"), score, cfg);
    expect(res.incident.state).toBe("WATCHING");
    expect(res.effects.map((e) => e.kind)).toEqual(["FETCH_SNAPSHOT", "PLAY_VOICE"]);
    expect(res.timers).toHaveLength(1);
    expect(res.timers[0]!.name).toBe("WATCH_EXPIRED");
    expect(res.timers[0]!.at).toBe("2026-09-13T07:10:00.000Z");
  });

  it("quiet watch resolves by voice alone: the caregiver sleeps", () => {
    const open = openIncident("h1", motion("2026-09-13T07:05:00Z"), score, cfg);
    const res = stepIncident(
      open.incident,
      { kind: "TIMER", name: "WATCH_EXPIRED", at: "2026-09-13T07:10:00.000Z" },
      cfg,
    );
    expect(res.incident.state).toBe("RESOLVED");
    expect(res.incident.outcome).toBe("RESOLVED_VOICE");
    expect(res.effects).toHaveLength(0);
  });

  it("continued activity during the watch notifies the caregiver", () => {
    const open = openIncident("h1", motion("2026-09-13T07:05:00Z"), score, cfg);
    const res = stepIncident(
      open.incident,
      { kind: "EVENT", event: motion("2026-09-13T07:08:00Z"), score },
      cfg,
    );
    expect(res.incident.state).toBe("NOTIFY_CAREGIVER");
    expect(res.effects.map((e) => e.kind)).toEqual(["NOTIFY_CAREGIVER"]);
    expect(res.timers[0]!.name).toBe("ACK_EXPIRED");
  });

  it("acknowledgement closes as resolved by caregiver", () => {
    const open = openIncident("h1", motion("2026-09-13T07:05:00Z"), score, cfg);
    const notified = stepIncident(
      open.incident,
      { kind: "EVENT", event: motion("2026-09-13T07:08:00Z"), score },
      cfg,
    );
    const acked = stepIncident(
      notified.incident,
      { kind: "ACK", at: "2026-09-13T07:12:00Z" },
      cfg,
    );
    expect(acked.incident.state).toBe("ACKNOWLEDGED");
    expect(acked.incident.outcome).toBe("RESOLVED_CAREGIVER");
  });

  it("unacknowledged notification escalates", () => {
    const open = openIncident("h1", motion("2026-09-13T07:05:00Z"), score, cfg);
    const notified = stepIncident(
      open.incident,
      { kind: "EVENT", event: motion("2026-09-13T07:08:00Z"), score },
      cfg,
    );
    const escalated = stepIncident(
      notified.incident,
      { kind: "TIMER", name: "ACK_EXPIRED", at: notified.timers[0]!.at },
      cfg,
    );
    expect(escalated.incident.state).toBe("ESCALATED");
    expect(escalated.incident.outcome).toBe("ESCALATED");
    expect(escalated.effects.map((e) => e.kind)).toEqual(["ESCALATE"]);
  });

  it("a stale watch timer cannot resolve a notified incident", () => {
    const open = openIncident("h1", motion("2026-09-13T07:05:00Z"), score, cfg);
    const notified = stepIncident(
      open.incident,
      { kind: "EVENT", event: motion("2026-09-13T07:08:00Z"), score },
      cfg,
    );
    const res = stepIncident(
      notified.incident,
      { kind: "TIMER", name: "WATCH_EXPIRED", at: "2026-09-13T07:10:00.000Z" },
      cfg,
    );
    expect(res.incident.state).toBe("NOTIFY_CAREGIVER");
  });

  it("false positive marking preserves history", () => {
    const open = openIncident("h1", motion("2026-09-13T07:05:00Z"), score, cfg);
    const resolved = stepIncident(
      open.incident,
      { kind: "TIMER", name: "WATCH_EXPIRED", at: "2026-09-13T07:10:00.000Z" },
      cfg,
    );
    const marked = stepIncident(
      resolved.incident,
      { kind: "MARK_FALSE_POSITIVE", at: "2026-09-13T12:00:00Z" },
      cfg,
    );
    expect(marked.incident.outcome).toBe("FALSE_POSITIVE");
    expect(marked.incident.eventTimestamps).toHaveLength(1);
  });
});
