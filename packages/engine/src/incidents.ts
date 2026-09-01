import type {
  Effect,
  HouseholdConfig,
  Incident,
  RingEvent,
  ScoreResult,
} from "./types";
import { addMinutesIso } from "./time";

/**
 * Incident state machine.
 *
 * OPEN -> VOICE_PLAYED -> WATCHING -(quiet)-> RESOLVED (outcome RESOLVED_VOICE)
 *                                  -(more activity)-> NOTIFY_CAREGIVER
 * NOTIFY_CAREGIVER -(ack)-> ACKNOWLEDGED -> CLOSED (outcome RESOLVED_CAREGIVER)
 *                  -(timeout)-> ESCALATED -> CLOSED (outcome ESCALATED)
 *
 * The machine is a pure function of (incident, action, config). Side effects
 * are returned as data; adapters execute them. Timers are returned as data;
 * the caller schedules them (EventBridge in production, the timeline replayer
 * in tests and demos). This is what makes 3am behavior unit-testable.
 */

export type IncidentAction =
  | { kind: "EVENT"; event: RingEvent; score: ScoreResult }
  | { kind: "TIMER"; name: "WATCH_EXPIRED" | "ACK_EXPIRED"; at: string }
  | { kind: "ACK"; at: string }
  | { kind: "MARK_FALSE_POSITIVE"; at: string };

export interface TimerRequest {
  name: "WATCH_EXPIRED" | "ACK_EXPIRED";
  at: string;
  incidentId: string;
}

export interface StepResult {
  incident: Incident;
  effects: Effect[];
  timers: TimerRequest[];
}

let counter = 0;
export function resetIncidentCounter(): void {
  counter = 0;
}

export function openIncident(
  householdId: string,
  event: RingEvent,
  score: ScoreResult,
  cfg: HouseholdConfig,
): StepResult {
  counter += 1;
  const id = `inc_${String(counter).padStart(4, "0")}`;
  const at = event.ts;
  const incident: Incident = {
    id,
    householdId,
    openedAt: at,
    state: "WATCHING",
    eventTimestamps: [at],
    score: score.score,
    flags: [...score.flags],
    stageTimestamps: { OPEN: at, VOICE_PLAYED: at, WATCHING: at },
  };
  return {
    incident,
    effects: [
      { kind: "FETCH_SNAPSHOT", incidentId: id, at },
      { kind: "PLAY_VOICE", incidentId: id, at },
    ],
    timers: [
      { name: "WATCH_EXPIRED", at: addMinutesIso(at, cfg.watchingMinutes), incidentId: id },
    ],
  };
}

export function stepIncident(
  incident: Incident,
  action: IncidentAction,
  cfg: HouseholdConfig,
): StepResult {
  const effects: Effect[] = [];
  const timers: TimerRequest[] = [];
  const next: Incident = {
    ...incident,
    eventTimestamps: [...incident.eventTimestamps],
    flags: [...incident.flags],
    stageTimestamps: { ...incident.stageTimestamps },
  };

  switch (action.kind) {
    case "EVENT": {
      const at = action.event.ts;
      next.eventTimestamps.push(at);
      next.score = Math.max(next.score, action.score.score);
      for (const f of action.score.flags) {
        if (!next.flags.includes(f)) next.flags.push(f);
      }
      if (incident.state === "WATCHING") {
        // The voice prompt did not settle things: wake the caregiver gently.
        next.state = "NOTIFY_CAREGIVER";
        next.stageTimestamps.NOTIFY_CAREGIVER = at;
        effects.push({ kind: "NOTIFY_CAREGIVER", incidentId: incident.id, at });
        timers.push({
          name: "ACK_EXPIRED",
          at: addMinutesIso(at, cfg.escalateMinutes),
          incidentId: incident.id,
        });
      }
      // In NOTIFY_CAREGIVER and later states, extra events only join the record.
      break;
    }
    case "TIMER": {
      if (action.name === "WATCH_EXPIRED" && incident.state === "WATCHING") {
        next.state = "RESOLVED";
        next.outcome = "RESOLVED_VOICE";
        next.stageTimestamps.RESOLVED = action.at;
        next.closedAt = action.at;
      }
      if (action.name === "ACK_EXPIRED" && incident.state === "NOTIFY_CAREGIVER") {
        next.state = "ESCALATED";
        next.outcome = "ESCALATED";
        next.stageTimestamps.ESCALATED = action.at;
        next.closedAt = action.at;
        effects.push({ kind: "ESCALATE", incidentId: incident.id, at: action.at });
      }
      break;
    }
    case "ACK": {
      if (incident.state === "NOTIFY_CAREGIVER") {
        next.state = "ACKNOWLEDGED";
        next.outcome = "RESOLVED_CAREGIVER";
        next.stageTimestamps.ACKNOWLEDGED = action.at;
        next.closedAt = action.at;
      }
      break;
    }
    case "MARK_FALSE_POSITIVE": {
      next.outcome = "FALSE_POSITIVE";
      if (!next.closedAt) next.closedAt = action.at;
      break;
    }
  }
  return { incident: next, effects, timers };
}

export function isIncidentActive(incident: Incident): boolean {
  return incident.state === "WATCHING" || incident.state === "NOTIFY_CAREGIVER";
}
