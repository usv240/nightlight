import {
  DEFAULT_CONFIG,
  type CaregiverAck,
  type Effect,
  type HouseholdConfig,
  type NightSummary,
  type RingEvent,
  type TimelineResult,
  processTimeline,
  summarizeNights,
  undisturbedStreak,
} from "@nightlight/engine";

/**
 * In-process household runtime.
 *
 * The event log is the source of truth; every read model (incidents, nights,
 * baseline) is a deterministic replay of it, so the live webhook path, the
 * demo replay, and the tests can never disagree. New effects are diffed by
 * key so adapters run exactly once per effect. At household scale a full
 * replay per event is microseconds; DynamoDB persistence and an incremental
 * runtime are deployment work, not engine work.
 */

export interface EffectExecution {
  effect: Effect;
  executedAt: string;
  adapter: string;
  detail: string;
}

export interface Adapters {
  playVoice: (incidentId: string, at: string) => Promise<string>;
  fetchSnapshot: (incidentId: string, at: string) => Promise<string>;
  notifyCaregiver: (incidentId: string, at: string) => Promise<string>;
  escalate: (incidentId: string, at: string) => Promise<string>;
}

export class HouseholdRuntime {
  readonly config: HouseholdConfig;
  private events: RingEvent[] = [];
  private acks: CaregiverAck[] = [];
  private executed = new Map<string, EffectExecution>();
  private cache: TimelineResult | null = null;

  constructor(
    private readonly adapters: Adapters,
    config?: Partial<HouseholdConfig>,
  ) {
    this.config = { householdId: "default", ...DEFAULT_CONFIG, ...config };
  }

  get eventCount(): number {
    return this.events.length;
  }

  private effectKey(e: Effect): string {
    return `${e.kind}:${e.incidentId}:${e.at}`;
  }

  private recompute(): TimelineResult {
    if (!this.cache) {
      this.cache = processTimeline(this.events, this.config, { acks: this.acks });
    }
    return this.cache;
  }

  private invalidate(): void {
    this.cache = null;
  }

  async ingestEvent(event: RingEvent): Promise<Effect[]> {
    this.events.push(event);
    this.events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    this.invalidate();
    return this.executeNewEffects();
  }

  async ingestBatch(events: RingEvent[]): Promise<Effect[]> {
    this.events.push(...events);
    this.events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    this.invalidate();
    return this.executeNewEffects();
  }

  async acknowledge(at: string): Promise<Effect[]> {
    this.acks.push({ at });
    this.invalidate();
    return this.executeNewEffects();
  }

  private async executeNewEffects(): Promise<Effect[]> {
    const { effects } = this.recompute();
    const fresh: Effect[] = [];
    for (const effect of effects) {
      const key = this.effectKey(effect);
      if (this.executed.has(key)) continue;
      const detail = await this.dispatch(effect);
      this.executed.set(key, {
        effect,
        executedAt: new Date().toISOString(),
        adapter: effect.kind,
        detail,
      });
      fresh.push(effect);
    }
    return fresh;
  }

  private dispatch(effect: Effect): Promise<string> {
    switch (effect.kind) {
      case "PLAY_VOICE":
        return this.adapters.playVoice(effect.incidentId, effect.at);
      case "FETCH_SNAPSHOT":
        return this.adapters.fetchSnapshot(effect.incidentId, effect.at);
      case "NOTIFY_CAREGIVER":
        return this.adapters.notifyCaregiver(effect.incidentId, effect.at);
      case "ESCALATE":
        return this.adapters.escalate(effect.incidentId, effect.at);
    }
  }

  snapshot(): {
    incidents: TimelineResult["incidents"];
    effects: Effect[];
    baselineDays: number;
    nights: NightSummary[];
    undisturbedStreak: number;
    executions: EffectExecution[];
  } {
    const result = this.recompute();
    const first = this.events[0]?.ts ?? new Date().toISOString();
    const last = this.events[this.events.length - 1]?.ts ?? first;
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
      executions: [...this.executed.values()],
    };
  }

  reset(): void {
    this.events = [];
    this.acks = [];
    this.executed.clear();
    this.invalidate();
  }
}
