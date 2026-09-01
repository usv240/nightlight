/**
 * Core domain types for the Nightlight engine.
 *
 * The engine is deliberately deterministic and explainable: every incident
 * can be traced to a baseline cell, a score, and a list of named flags.
 * Language models are used elsewhere to phrase summaries, never to decide.
 */

/** Ring Partner API event types consumed by Nightlight. */
export type RingEventType =
  | "motion_detected"
  | "button_press"
  | "device_online"
  | "device_offline";

export interface RingEvent {
  /** ISO 8601 timestamp with offset, as delivered by the webhook. */
  ts: string;
  type: RingEventType;
  deviceId: string;
  /** Ring motion classification, e.g. "human". Present on motion_detected. */
  subType?: string;
  /** Webhook idempotency id (meta.request_id). */
  requestId?: string;
}

/** Household-local night window. Wraps midnight when start > end. */
export interface NightWindow {
  /** "HH:MM" 24h local time, inclusive. */
  start: string;
  /** "HH:MM" 24h local time, exclusive. */
  end: string;
}

export interface HouseholdConfig {
  householdId: string;
  /** IANA timezone, e.g. "America/New_York". */
  timezone: string;
  nightWindow: NightWindow;
  /**
   * Expected events per hour-of-week cell below which a night event is
   * considered outside the household's normal pattern.
   */
  quietThreshold: number;
  /** Minutes to watch quietly after the voice prompt before resolving. */
  watchingMinutes: number;
  /** Minutes to wait for caregiver acknowledgement before escalating. */
  escalateMinutes: number;
  /** Events within this many minutes join the same incident. */
  joinWindowMinutes: number;
}

export const DEFAULT_CONFIG: Omit<HouseholdConfig, "householdId"> = {
  timezone: "America/New_York",
  nightWindow: { start: "22:00", end: "06:00" },
  quietThreshold: 0.2,
  watchingMinutes: 5,
  escalateMinutes: 10,
  joinWindowMinutes: 10,
};

/** 24x7 baseline of expected event rates, one cell per hour of week. */
export interface BaselineState {
  /** Expected events per week in each hour-of-week cell (length 168). */
  cells: number[];
  /** Expected events per day in each hour-of-day cell (length 24), a smoothing fallback. */
  hourly: number[];
  /** Number of days of data the baseline has absorbed. */
  daysObserved: number;
  /**
   * Asymmetric EWMA factors. Activity above the current mean is absorbed
   * slowly (lambdaUp) and quiet below it quickly (lambdaDown). This is a
   * safety property: a night of wandering must not teach the baseline that
   * wandering is normal, while a household that genuinely changes routine
   * still adapts within weeks.
   */
  lambdaUp: number;
  lambdaDown: number;
}

export interface ScoreResult {
  inNightWindow: boolean;
  /** Blended expected events for this cell, per week. */
  expected: number;
  /** 0..1, where 1 means fully unexpected activity. */
  score: number;
  anomalous: boolean;
  flags: string[];
}

export type IncidentState =
  | "OPEN"
  | "VOICE_PLAYED"
  | "WATCHING"
  | "NOTIFY_CAREGIVER"
  | "ACKNOWLEDGED"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED";

export type IncidentOutcome =
  | "RESOLVED_VOICE"
  | "RESOLVED_CAREGIVER"
  | "ESCALATED"
  | "FALSE_POSITIVE";

export interface Incident {
  id: string;
  householdId: string;
  openedAt: string;
  state: IncidentState;
  eventTimestamps: string[];
  score: number;
  flags: string[];
  stageTimestamps: Partial<Record<IncidentState, string>>;
  outcome?: IncidentOutcome;
  closedAt?: string;
}

/** Side effects the engine requests; adapters in the backend execute them. */
export type Effect =
  | { kind: "PLAY_VOICE"; incidentId: string; at: string }
  | { kind: "FETCH_SNAPSHOT"; incidentId: string; at: string }
  | { kind: "NOTIFY_CAREGIVER"; incidentId: string; at: string }
  | { kind: "ESCALATE"; incidentId: string; at: string };

export interface NightSummary {
  /** Local calendar date the night began on (YYYY-MM-DD). */
  nightOf: string;
  incidentIds: string[];
  /** True when the caregiver was never notified or escalated that night. */
  undisturbed: boolean;
  text: string;
}
