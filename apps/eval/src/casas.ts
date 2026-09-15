import type { RingEvent } from "@nightlight/engine";

/**
 * Parser for the CASAS HH smart-home corpus (WSU CASAS project, Zenodo
 * record 15708568, CC-BY-4.0): dozens of real single-resident homes,
 * about two months each, with resident-labeled activities.
 *
 * Line shape (comma separated):
 *   2012-07-20,10:38:54.512364,OutsideDoor,ON,Step_Out="begin"
 *   2012-07-20,10:38:59.541365,OutsideDoor,OFF
 *
 * We consume two things:
 * - Exterior door sensor activations (sensor name containing "Door",
 *   value ON): the honest stand-in for a Ring doorway event. The same
 *   event set feeds BOTH systems under comparison, so the mapping cannot
 *   favor Nightlight over the threshold alarm it is measured against.
 * - Leave_Home / Enter_Home labels: the corpus's own ground truth for
 *   real exits, used to classify what each wake was about.
 *
 * Timestamps are naive local time; we replay them as UTC and run the
 * engine with timezone "UTC", which preserves wall-clock hours exactly
 * and sidesteps DST guessing. Documented in docs/EVAL.md.
 */

export interface CasasParsed {
  doorEvents: RingEvent[];
  leaveHomeAt: string[];
  enterHomeAt: string[];
  sensors: Map<string, number>;
  firstDate: string;
  lastDate: string;
  totalLines: number;
}

function toIso(date: string, time: string): string {
  const t = time.length > 12 ? time.slice(0, 12) : time;
  return `${date}T${t}Z`;
}

const ACTIVITY = /^([A-Za-z_]+)="(begin|end)"/;

export function parseCasas(text: string): CasasParsed {
  const doorEvents: RingEvent[] = [];
  const leaveHomeAt: string[] = [];
  const enterHomeAt: string[] = [];
  const sensors = new Map<string, number>();
  let firstDate = "";
  let lastDate = "";
  let totalLines = 0;
  let seq = 0;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    totalLines++;
    const f = line.split(",");
    if (f.length < 4) continue;
    const [date, time, sensor, value] = f as [string, string, string, string];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!firstDate) firstDate = date;
    lastDate = date;

    const ts = toIso(date, time);

    if (/door/i.test(sensor) && value === "ON") {
      sensors.set(sensor, (sensors.get(sensor) ?? 0) + 1);
      seq++;
      doorEvents.push({
        ts,
        type: "motion_detected",
        subType: "human",
        deviceId: sensor,
        requestId: `casas-${seq}`,
      });
    }

    if (f.length >= 5) {
      const m = ACTIVITY.exec(f[4]!);
      if (m) {
        if (m[1] === "Leave_Home" && m[2] === "begin") leaveHomeAt.push(ts);
        if (m[1] === "Enter_Home" && m[2] === "begin") enterHomeAt.push(ts);
      }
    }
  }

  return { doorEvents, leaveHomeAt, enterHomeAt, sensors, firstDate, lastDate, totalLines };
}
