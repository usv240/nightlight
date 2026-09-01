import type { NightWindow } from "./types";

/**
 * Timezone-aware time helpers built on Intl (no date library dependency).
 * All household reasoning happens in the household's local timezone.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    partsCache.set(timezone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export interface LocalTime {
  weekday: number; // 0 = Sunday
  hour: number; // 0..23
  minute: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
}

export function localTime(tsIso: string, timezone: string): LocalTime {
  const d = new Date(tsIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid timestamp: ${tsIso}`);
  }
  const parts = formatter(timezone).formatToParts(d);
  const get = (type: string): string => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`Missing date part ${type}`);
    return p.value;
  };
  // Intl can emit hour "24" for midnight in some environments; normalize.
  const hour = Number(get("hour")) % 24;
  return {
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    hour,
    minute: Number(get("minute")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Hour-of-week index 0..167 (Sunday 00:00 is 0). */
export function hourOfWeek(tsIso: string, timezone: string): number {
  const t = localTime(tsIso, timezone);
  return t.weekday * 24 + t.hour;
}

function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid HH:MM time: ${s}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) throw new Error(`Invalid HH:MM time: ${s}`);
  return hh * 60 + mm;
}

/** True when the timestamp falls inside the (possibly midnight-wrapping) night window. */
export function inNightWindow(tsIso: string, timezone: string, window: NightWindow): boolean {
  const t = localTime(tsIso, timezone);
  const minutes = t.hour * 60 + t.minute;
  const start = parseHHMM(window.start);
  const end = parseHHMM(window.end);
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

/**
 * The local date a night "belongs to". Hours before the window end (early
 * morning) are attributed to the previous calendar day, so one night is one key.
 */
export function nightOf(tsIso: string, timezone: string, window: NightWindow): string {
  const t = localTime(tsIso, timezone);
  const minutes = t.hour * 60 + t.minute;
  const end = parseHHMM(window.end);
  const start = parseHHMM(window.start);
  const wraps = start > end;
  if (wraps && minutes < end) {
    const d = new Date(`${t.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return t.date;
}

export function addMinutesIso(tsIso: string, minutes: number): string {
  const d = new Date(tsIso);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

export function minutesBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000;
}
