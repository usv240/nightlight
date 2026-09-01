import { describe, expect, it } from "vitest";
import {
  emptyBaseline,
  expectedForTs,
  seedBaseline,
  updateBaselineWithDay,
} from "../src/baseline";
import type { RingEvent } from "../src/types";

const TZ = "America/New_York";

function motion(ts: string): RingEvent {
  return { ts, type: "motion_detected", subType: "human", deviceId: "d1" };
}

/** Build daytime events (14:00 EDT = 18:00Z) for consecutive days from Sep 1. */
function daytimePattern(days: number, perDay = 3): RingEvent[] {
  const events: RingEvent[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(Date.UTC(2026, 8, 1 + d));
    for (let i = 0; i < perDay; i++) {
      const ts = new Date(day.getTime() + (18 + 0) * 3600_000 + i * 300_000);
      events.push(motion(ts.toISOString()));
    }
  }
  return events;
}

describe("baseline learning", () => {
  it("learns a busy afternoon and stays quiet at 3am", () => {
    const b = seedBaseline(daytimePattern(28), TZ);
    const busy = expectedForTs(b, "2026-09-29T18:05:00Z", TZ); // 14:05 EDT
    const night = expectedForTs(b, "2026-09-29T07:05:00Z", TZ); // 03:05 EDT
    expect(busy).toBeGreaterThan(1);
    expect(night).toBeLessThan(0.05);
  });

  it("one anomalous night cannot normalize wandering (asymmetric learning)", () => {
    let b = seedBaseline(daytimePattern(28), TZ);
    // A single night with three 3am events, applied as a daily update.
    const nightEvents = [
      motion("2026-09-29T07:05:00Z"),
      motion("2026-09-29T07:09:00Z"),
      motion("2026-09-29T07:15:00Z"),
    ];
    b = updateBaselineWithDay(b, nightEvents, TZ);
    const after = expectedForTs(b, "2026-10-06T07:05:00Z", TZ); // same weekday 3am
    // lambdaUp is small by design: still comfortably below the 0.2 threshold.
    expect(after).toBeLessThan(0.2);
  });

  it("a genuine routine change does normalize within about six weeks", () => {
    let b = seedBaseline(daytimePattern(28), TZ);
    // The same weekday's 3am activity repeating week after week (for example
    // a new night-shift job) should eventually become the household's normal.
    // All dates stay inside EDT: baseline cells follow the local wall clock,
    // so a fixed UTC hour would land in a different cell after the DST change
    // (which is correct behavior, verified the hard way).
    for (let week = 0; week < 6; week++) {
      const day = 8 + week * 7; // Sep 8 through Oct 13, via Date.UTC overflow
      const ts = new Date(Date.UTC(2026, 8, day, 7, 5)).toISOString();
      b = updateBaselineWithDay(
        b,
        [motion(ts), motion(ts), motion(ts)],
        TZ,
      );
    }
    const after = expectedForTs(b, new Date(Date.UTC(2026, 8, 8 + 42, 7, 5)).toISOString(), TZ);
    expect(after).toBeGreaterThan(0.2);
  });

  it("empty baseline expects nothing anywhere", () => {
    const b = emptyBaseline();
    expect(expectedForTs(b, "2026-09-01T18:00:00Z", TZ)).toBe(0);
    expect(b.daysObserved).toBe(0);
  });

  it("counts observed days including quiet ones", () => {
    let b = emptyBaseline();
    b = updateBaselineWithDay(b, daytimePattern(1), TZ);
    b = updateBaselineWithDay(b, [], TZ);
    expect(b.daysObserved).toBe(2);
  });
});
