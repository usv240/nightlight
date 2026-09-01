import type { BaselineState, HouseholdConfig, RingEvent, ScoreResult } from "./types";
import { expectedForTs } from "./baseline";
import { inNightWindow, minutesBetween } from "./time";

/**
 * Score a single event against the household baseline.
 *
 * Only human-classified motion and doorbell presses can open incidents:
 * pets, vehicles, and wind do not wake anyone, by design.
 */
export function scoreEvent(
  baseline: BaselineState,
  event: RingEvent,
  cfg: HouseholdConfig,
  recentEventTimestamps: string[] = [],
): ScoreResult {
  const night = inNightWindow(event.ts, cfg.timezone, cfg.nightWindow);
  const expected = expectedForTs(baseline, event.ts, cfg.timezone);
  const flags: string[] = [];

  const actionable =
    (event.type === "motion_detected" && event.subType === "human") ||
    event.type === "button_press";

  if (!actionable) flags.push("non_actionable_event");
  if (!night) flags.push("outside_night_window");

  const repeats = recentEventTimestamps.filter(
    (ts) => Math.abs(minutesBetween(ts, event.ts)) <= cfg.joinWindowMinutes,
  ).length;
  if (repeats > 0) flags.push("repeat_activity");

  // 1.0 when the cell is fully quiet, tapering to 0 at the quiet threshold.
  const rawScore = Math.max(0, 1 - expected / cfg.quietThreshold);
  const score = night && actionable ? Math.min(1, rawScore + repeats * 0.1) : 0;

  const anomalous = night && actionable && expected < cfg.quietThreshold;
  if (anomalous) flags.push("below_household_baseline");

  return { inNightWindow: night, expected, score, anomalous, flags };
}
