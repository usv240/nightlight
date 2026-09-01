import type { BaselineState, RingEvent } from "./types";
import { hourOfWeek, localTime } from "./time";

/**
 * Per-household activity baseline.
 *
 * cells[i] holds the expected number of events per week in hour-of-week cell i.
 * hourly[h] holds the expected number of events per day in local hour h and is
 * used as a smoothing fallback for sparse weekday cells, so one unusual Tuesday
 * does not distort Tuesday forever and quiet weekdays are not falsely noisy.
 *
 * Updates are an exponentially weighted moving average applied once per local
 * day, with deliberately asymmetric factors:
 *
 * - lambdaUp (default 0.02): how fast the baseline accepts MORE activity as
 *   normal. Kept small so a single 3am wandering night (even several events)
 *   cannot lift a quiet cell over the anomaly threshold; a genuine routine
 *   change (a new night-shift job) still normalizes within a few weeks.
 * - lambdaDown (default 0.2): how fast the baseline accepts LESS activity as
 *   normal. Quiet is safe to learn quickly.
 *
 * This asymmetry is a safety property, verified in baseline.test.ts:
 * "one anomalous night cannot normalize wandering".
 */

export const PRODUCTION_LAMBDA_UP = 0.02;
export const PRODUCTION_LAMBDA_DOWN = 0.2;

export function emptyBaseline(
  lambdaUp = PRODUCTION_LAMBDA_UP,
  lambdaDown = PRODUCTION_LAMBDA_DOWN,
): BaselineState {
  return {
    cells: new Array<number>(168).fill(0),
    hourly: new Array<number>(24).fill(0),
    daysObserved: 0,
    lambdaUp,
    lambdaDown,
  };
}

function ewma(prev: number, obs: number, up: number, down: number): number {
  const lambda = obs > prev ? up : down;
  return (1 - lambda) * prev + lambda * obs;
}

/** Group events by local calendar date. */
export function groupByLocalDate(
  events: RingEvent[],
  timezone: string,
): Map<string, RingEvent[]> {
  const byDate = new Map<string, RingEvent[]>();
  for (const e of events) {
    const date = localTime(e.ts, timezone).date;
    const arr = byDate.get(date);
    if (arr) arr.push(e);
    else byDate.set(date, [e]);
  }
  return byDate;
}

/** Apply one local day of events to the baseline (asymmetric EWMA per cell). */
export function updateBaselineWithDay(
  state: BaselineState,
  dayEvents: RingEvent[],
  timezone: string,
): BaselineState {
  const cellCounts = new Array<number>(168).fill(0);
  const hourCounts = new Array<number>(24).fill(0);
  for (const e of dayEvents) {
    const cell = hourOfWeek(e.ts, timezone);
    cellCounts[cell] = (cellCounts[cell] ?? 0) + 1;
    const h = cell % 24;
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const { lambdaUp, lambdaDown } = state;
  const cells = state.cells.slice();
  const weekday = dayEvents.length > 0
    ? Math.floor(hourOfWeek(dayEvents[0]!.ts, timezone) / 24)
    : null;
  // A day only carries observations for its own weekday's 24 cells. Cells for
  // other weekdays are left untouched by this update.
  if (weekday !== null) {
    for (let h = 0; h < 24; h++) {
      const cell = weekday * 24 + h;
      cells[cell] = ewma(cells[cell] ?? 0, cellCounts[cell] ?? 0, lambdaUp, lambdaDown);
    }
  }
  const hourly = state.hourly.map((v, h) =>
    ewma(v, hourCounts[h] ?? 0, lambdaUp, lambdaDown),
  );
  return {
    cells,
    hourly,
    daysObserved: state.daysObserved + 1,
    lambdaUp,
    lambdaDown,
  };
}

/** Seed a baseline from a history backfill by replaying whole local days. */
export function seedBaseline(
  events: RingEvent[],
  timezone: string,
  lambdaUp = PRODUCTION_LAMBDA_UP,
  lambdaDown = PRODUCTION_LAMBDA_DOWN,
): BaselineState {
  // Seeding replays days with fast symmetric factors so a 1 to 4 week
  // backfill produces a usable picture, then hands back the asymmetric
  // production factors for live operation.
  let state = emptyBaseline(0.3, 0.3);
  const byDate = [...groupByLocalDate(events, timezone).entries()].sort(
    ([a], [b]) => (a < b ? -1 : 1),
  );
  for (const [, dayEvents] of byDate) {
    state = updateBaselineWithDay(state, dayEvents, timezone);
  }
  return { ...state, lambdaUp, lambdaDown };
}

/**
 * Blended expectation for a timestamp: the weekday cell, floored by half the
 * hour-of-day average so sparse weekday data cannot under-report a busy hour.
 */
export function expectedForTs(
  state: BaselineState,
  tsIso: string,
  timezone: string,
): number {
  const cell = hourOfWeek(tsIso, timezone);
  const h = cell % 24;
  const cellRate = state.cells[cell] ?? 0;
  const hourlyRate = state.hourly[h] ?? 0;
  return Math.max(cellRate, 0.5 * hourlyRate);
}

/** Days of data required before incidents may open (shadow mode until then). */
export const WARMUP_DAYS = 7;
