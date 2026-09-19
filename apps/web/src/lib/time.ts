import { localTime } from "@nightlight/engine";

/**
 * An incident's opening moment, in the household's own timezone.
 *
 * `new Date(openedAt).toUTCString()` was correct and useless: a caregiver
 * in New York reading "Sun, 13 Sep 2026 07:05:00 GMT" has to do the
 * arithmetic themselves to find out that this is the 3am they remember.
 * Recent nights on the same screen already spoke local time, so one night
 * appeared at two different hours depending on which card you read.
 *
 * Found by pulling a still frame out of the demo recording: the narration
 * said "five past three" over a card that said 07:05 GMT.
 */
export function openedLocal(iso: string, timezone: string): string {
  try {
    const t = localTime(iso, timezone);
    const hh = String(t.hour).padStart(2, "0");
    const mm = String(t.minute).padStart(2, "0");
    return `${t.date} at ${hh}:${mm}`;
  } catch {
    // A bad timestamp must not take the card down with it.
    return iso;
  }
}
