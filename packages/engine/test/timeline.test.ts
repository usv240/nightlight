import { describe, expect, it } from "vitest";
import { processTimeline } from "../src/timeline";
import { DEFAULT_CONFIG, type HouseholdConfig, type RingEvent } from "../src/types";

const cfg: HouseholdConfig = { householdId: "h", ...DEFAULT_CONFIG, timezone: "UTC" };

function motion(ts: string): RingEvent {
  return { ts, type: "motion_detected", subType: "human", deviceId: "d1" };
}

/** Daytime pattern in UTC: events at 14:00 for `days` days from Jan 1 2026. */
function daytime(days: number): RingEvent[] {
  const out: RingEvent[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(Date.UTC(2026, 0, 1 + d));
    for (let i = 0; i < 3; i++) {
      out.push(motion(new Date(day.getTime() + 14 * 3600_000 + i * 600_000).toISOString()));
    }
  }
  return out;
}

describe("processTimeline seedDays (history backfill)", () => {
  it("seeds the baseline from the first N days and arms immediately after", () => {
    const events = [
      ...daytime(28),
      motion("2026-01-29T03:05:00.000Z"), // 3am on the first live day
    ];
    const result = processTimeline(events, cfg, { seedDays: 28 });
    expect(result.incidents).toHaveLength(1);
    expect(result.baseline.daysObserved).toBeGreaterThanOrEqual(28);
  });

  it("never opens incidents on seed days themselves (leakage-safe)", () => {
    const events = [
      ...daytime(28),
      motion("2026-01-10T03:05:00.000Z"), // 3am inside the seed window
    ];
    const result = processTimeline(events, cfg, { seedDays: 28 });
    expect(result.incidents).toHaveLength(0);
  });

  it("without seeding, the warmup week still gates as before", () => {
    const events = [...daytime(3), motion("2026-01-04T03:05:00.000Z")];
    const result = processTimeline(events, cfg);
    expect(result.incidents).toHaveLength(0);
  });
});
