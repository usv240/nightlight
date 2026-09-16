import {
  DEFAULT_CONFIG,
  type Effect,
  type HouseholdConfig,
  type NightSummary,
  type RingEvent,
  type TimelineResult,
  processTimeline,
  summarizeNights,
  undisturbedStreak,
} from "@nightlight/engine";
import type { NightlightStore, EffectExecutionRecord } from "./store";

/**
 * Household runtime.
 *
 * The event log in the store is the source of truth; every read model
 * (incidents, nights, baseline) is a deterministic replay of it, so the
 * live webhook path, the demo replay, and the tests can never disagree.
 *
 * Effects are executed at most once across any number of backend
 * instances: an effect is first CLAIMED through the store (a conditional
 * write) and dispatched only by the claimer. On Lambda this is what keeps
 * two concurrent invocations from playing the 3am voice prompt twice.
 *
 * A full replay per request is O(events) and costs microseconds at
 * household scale (hundreds of events a month); correctness first.
 */

export interface Adapters {
  playVoice: (incidentId: string, at: string) => Promise<string>;
  fetchSnapshot: (incidentId: string, at: string) => Promise<string>;
  notifyCaregiver: (incidentId: string, at: string) => Promise<string>;
  escalate: (incidentId: string, at: string) => Promise<string>;
}

export interface HouseholdSnapshot {
  incidents: TimelineResult["incidents"];
  effects: Effect[];
  baselineDays: number;
  nights: NightSummary[];
  undisturbedStreak: number;
  executions: EffectExecutionRecord[];
}

export class HouseholdRuntime {
  readonly config: HouseholdConfig;

  constructor(
    private readonly store: NightlightStore,
    private readonly adapters: Adapters,
    config?: Partial<HouseholdConfig>,
  ) {
    this.config = { householdId: "default", ...DEFAULT_CONFIG, ...config };
  }

  private get householdId(): string {
    return this.config.householdId;
  }

  private effectKey(e: Effect): string {
    return `${e.kind}:${e.incidentId}:${e.at}`;
  }

  private async replay(): Promise<TimelineResult> {
    const [events, acks] = await Promise.all([
      this.store.listEvents(this.householdId),
      this.store.listAcks(this.householdId),
    ]);
    return processTimeline(events, this.config, { acks });
  }

  async ingestEvent(event: RingEvent): Promise<Effect[]> {
    await this.store.appendEvent(this.householdId, event);
    return this.executeNewEffects();
  }

  async ingestBatch(events: RingEvent[]): Promise<Effect[]> {
    for (const event of events) {
      await this.store.appendEvent(this.householdId, event);
    }
    return this.executeNewEffects();
  }

  async acknowledge(at: string): Promise<Effect[]> {
    await this.store.appendAck(this.householdId, { at });
    return this.executeNewEffects();
  }

  private async executeNewEffects(): Promise<Effect[]> {
    const { effects } = await this.replay();
    const fresh: Effect[] = [];
    for (const effect of effects) {
      const key = this.effectKey(effect);
      // Claim before dispatch: at most one instance ever executes an effect.
      const claimed = await this.store.claimEffect(this.householdId, key, {
        executedAt: new Date().toISOString(),
        detail: effect.kind,
      });
      if (!claimed) continue;
      await this.dispatch(effect);
      fresh.push(effect);
    }
    return fresh;
  }

  /**
   * Execute one effect, and never let a failure end in silence.
   *
   * Effects are claimed exactly-once before dispatch, so an exception here
   * would burn the claim and the effect would never run again. For most
   * effects a lost retry is an inconvenience. For PLAY_VOICE it is a safety
   * failure with a specific shape: the incident state machine advances to
   * WATCHING on the assumption that a voice was tried, so a silent failure
   * means nothing happened at the door and nobody was told, while someone is
   * outside at 3am.
   *
   * The rule is therefore: if the voice does not play, wake the caregiver
   * immediately. Waiting is only safe when the gentle path was actually
   * attempted. Degrading to "wake someone" is always safe; degrading to
   * silence never is.
   */
  private async dispatch(effect: Effect): Promise<string> {
    switch (effect.kind) {
      case "PLAY_VOICE": {
        try {
          return await this.adapters.playVoice(effect.incidentId, effect.at);
        } catch (err) {
          const reason = (err as Error).message;
          // Compensate: the quiet path failed, so go straight to the loud one.
          let escalation = "caregiver notification also failed";
          try {
            escalation = await this.adapters.notifyCaregiver(
              effect.incidentId,
              effect.at,
            );
          } catch {
            // Swallow: we are already in the failure path, and throwing here
            // would burn the claim for an effect that cannot be retried.
          }
          return `Voice failed (${reason}); woke the caregiver immediately instead. ${escalation}`;
        }
      }
      case "FETCH_SNAPSHOT":
        try {
          return await this.adapters.fetchSnapshot(effect.incidentId, effect.at);
        } catch (err) {
          // A missing snapshot degrades the caregiver's context, not their
          // safety. Record it and carry on rather than losing the incident.
          return `Snapshot unavailable: ${(err as Error).message}`;
        }
      case "NOTIFY_CAREGIVER":
        return this.adapters.notifyCaregiver(effect.incidentId, effect.at);
      case "ESCALATE":
        return this.adapters.escalate(effect.incidentId, effect.at);
    }
  }

  async snapshot(): Promise<HouseholdSnapshot> {
    const result = await this.replay();
    const events = await this.store.listEvents(this.householdId);
    const first = events[0]?.ts ?? new Date().toISOString();
    const last = events[events.length - 1]?.ts ?? first;
    const nights = summarizeNights(
      first,
      last,
      result.incidents,
      result.effects,
      this.config,
    );
    return {
      incidents: result.incidents,
      effects: result.effects,
      baselineDays: result.baseline.daysObserved,
      nights,
      undisturbedStreak: undisturbedStreak(nights),
      executions: await this.store.listExecutions(this.householdId),
    };
  }

  /**
   * Change the household's night hours.
   *
   * Safe to do at any time: nights, incidents, and the baseline are all
   * derived by replaying the event log, so the next read simply computes
   * them under the new window. Nothing is migrated because nothing about
   * the window was ever stored.
   */
  setNightWindow(start: string, end: string): void {
    this.config.nightWindow = { start, end };
  }

  async reset(): Promise<void> {
    await this.store.reset(this.householdId);
  }
}
