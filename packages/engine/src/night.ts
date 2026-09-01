import type {
  Effect,
  HouseholdConfig,
  Incident,
  NightSummary,
} from "./types";
import { localTime, nightOf } from "./time";

/**
 * Fold incidents and effects into per-night summaries.
 *
 * "Undisturbed" is the product's hero metric and is defined precisely:
 * a night is undisturbed when no NOTIFY_CAREGIVER or ESCALATE effect
 * occurred that night. An incident that the voice prompt resolved on its
 * own still counts as undisturbed, because nobody was woken. Summary text
 * here is deterministic templating; a language model may rephrase it
 * elsewhere but never changes the facts.
 */
export function summarizeNights(
  rangeStartIso: string,
  rangeEndIso: string,
  incidents: Incident[],
  effects: Effect[],
  cfg: HouseholdConfig,
): NightSummary[] {
  const nights = new Map<string, NightSummary>();

  const startDate = localTime(rangeStartIso, cfg.timezone).date;
  const endDate = localTime(rangeEndIso, cfg.timezone).date;
  for (
    let d = new Date(`${startDate}T12:00:00Z`);
    d.toISOString().slice(0, 10) <= endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10);
    nights.set(key, {
      nightOf: key,
      incidentIds: [],
      undisturbed: true,
      text: "Quiet night. No doorway activity outside the household's normal pattern.",
    });
  }

  const disturbing = new Set(["NOTIFY_CAREGIVER", "ESCALATE"]);
  for (const eff of effects) {
    const key = nightOf(eff.at, cfg.timezone, cfg.nightWindow);
    const night = nights.get(key);
    if (night && disturbing.has(eff.kind)) night.undisturbed = false;
  }

  for (const inc of incidents) {
    const key = nightOf(inc.openedAt, cfg.timezone, cfg.nightWindow);
    const night = nights.get(key);
    if (!night) continue;
    night.incidentIds.push(inc.id);
    const t = localTime(inc.openedAt, cfg.timezone);
    const hhmm = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
    switch (inc.outcome) {
      case "RESOLVED_VOICE":
        night.text = `One doorway event at ${hhmm}. The familiar voice message played and activity settled. You were not woken.`;
        break;
      case "RESOLVED_CAREGIVER":
        night.text = `Doorway activity at ${hhmm} continued after the voice message. You were notified and confirmed everything was okay.`;
        break;
      case "ESCALATED":
        night.text = `Doorway activity at ${hhmm} continued and the notification was not acknowledged in time. Escalation contacts were alerted.`;
        break;
      case "FALSE_POSITIVE":
        night.text = `Doorway event at ${hhmm} was marked as expected activity. The baseline will learn from this.`;
        break;
      default:
        night.text = `Doorway event at ${hhmm} is still being watched.`;
    }
  }

  return [...nights.values()].sort((a, b) => (a.nightOf < b.nightOf ? -1 : 1));
}

export function undisturbedStreak(nights: NightSummary[]): number {
  let streak = 0;
  for (let i = nights.length - 1; i >= 0; i--) {
    if (nights[i]!.undisturbed) streak += 1;
    else break;
  }
  return streak;
}
