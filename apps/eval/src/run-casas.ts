import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_CONFIG,
  inNightWindow,
  minutesBetween,
  nightOf,
  processTimeline,
  type HouseholdConfig,
  type Incident,
} from "@nightlight/engine";
import { parseCasas } from "./casas";

/**
 * The external evaluation (winner pattern: numbers from data we did not
 * author): replay real CASAS HH households through the production
 * Nightlight engine and compare caregiver wakes against the obvious
 * alternative, a threshold door alarm that fires on every night-window
 * doorway event.
 *
 *   npm run casas -w @nightlight/eval -- --input <file-or-directory> [--seed 28]
 *
 * Leakage safety: the first --seed distinct days of each home only seed
 * the baseline, exactly like production onboarding from Ring event
 * history; every judged night comes after them and is seen exactly once.
 * Homes whose data is too short to leave at least 14 judged nights after
 * seeding are skipped and reported as skipped.
 */

function arg(flag: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

interface HomeResult {
  home: string;
  nightsJudged: number;
  doorOpenings: number;
  labeledLeaveHome: number;
  alarmWakes: number;
  alarmNights: number;
  nlIncidents: number;
  nlVoiceOnly: number;
  nlWakes: number;
  nlWakeNights: number;
  nlWakesNearExit: number;
  /** The recall side: the corpus's own labeled night exits, and who caught them. */
  nightExits: number;
  nightExitsAlarmCaught: number;
  nightExitsNoticed: number;
  nightExitsWoke: number;
  nightExitsMissedAndReturned: number;
}

function evalHome(name: string, file: string, seedDays: number): HomeResult | null {
  const cfg: HouseholdConfig = {
    householdId: `casas-${name}`,
    ...DEFAULT_CONFIG,
    timezone: "UTC",
  };
  const parsed = parseCasas(fs.readFileSync(file, "utf8"));
  if (parsed.doorEvents.length === 0) return null;

  const allDates = [...new Set(parsed.doorEvents.map((e) => e.ts.slice(0, 10)))].sort();
  if (allDates.length < seedDays + 14) return null;
  const liveDates = new Set(allDates.slice(seedDays));

  const result = processTimeline(parsed.doorEvents, cfg, { seedDays });

  const alarmEvents = parsed.doorEvents.filter(
    (e) => liveDates.has(e.ts.slice(0, 10)) && inNightWindow(e.ts, cfg.timezone, cfg.nightWindow),
  );
  const alarmNights = new Set(alarmEvents.map((e) => nightOf(e.ts, cfg.timezone, cfg.nightWindow)));

  const wakeEffects = result.effects.filter(
    (e) => e.kind === "NOTIFY_CAREGIVER" || e.kind === "ESCALATE",
  );
  const wakeNights = new Set(wakeEffects.map((e) => nightOf(e.at, cfg.timezone, cfg.nightWindow)));
  const voiceOnly = result.incidents.filter((i: Incident) => i.outcome === "RESOLVED_VOICE");
  const nearExit = (ts: string): boolean =>
    parsed.leaveHomeAt.some((l) => Math.abs(minutesBetween(l, ts)) <= 15) ||
    parsed.enterHomeAt.some((l) => Math.abs(minutesBetween(l, ts)) <= 15);

  /**
   * The recall side, and the reason this evaluation is worth believing.
   *
   * Waking a caregiver less often is trivially achievable by doing nothing,
   * so a reduction figure on its own says very little. The corpus labels
   * its own ground truth: residents marked Leave_Home when they actually
   * left. Restricting those labels to the night window on judged nights
   * gives the set of real night-time exits each system had the chance to
   * catch, and the question becomes what the restraint cost.
   *
   * Three columns, because "caught" is not one thing here.
   *
   *   alarmCaught  a threshold alarm wake within the window. This is the
   *                ceiling: the alarm fires on every night doorway event,
   *                so anything it misses was never visible to either system.
   *   noticed      Nightlight opened an incident and responded at all,
   *                which on the first stage means the recorded voice played.
   *   woke         Nightlight escalated to the caregiver.
   *
   * The gap between noticed and woke is not a failure, it is the design:
   * the voice is tried first and the caregiver is woken only if it does
   * not settle. Reporting them as one number would hide the entire
   * product. Reporting only the reduction would hide the cost.
   *
   * missedAndReturned qualifies the misses: an exit the resident came back
   * from within thirty minutes, by the corpus's own Enter_Home label, is a
   * different kind of miss from one they did not.
   */
  const MATCH_MINUTES = 15;
  const near = (a: string, b: string) => Math.abs(minutesBetween(a, b)) <= MATCH_MINUTES;

  const nightExits = parsed.leaveHomeAt.filter(
    (l) =>
      liveDates.has(l.slice(0, 10)) && inNightWindow(l, cfg.timezone, cfg.nightWindow),
  );
  const incidentOpenAt = result.incidents.map((i: Incident) => i.openedAt);
  const returnedWithin30 = (l: string) =>
    parsed.enterHomeAt.some((e) => {
      const gap = minutesBetween(l, e);
      return gap > 0 && gap <= 30;
    });

  let alarmCaught = 0;
  let noticed = 0;
  let woke = 0;
  let missedAndReturned = 0;
  for (const exit of nightExits) {
    const a = alarmEvents.some((e) => near(e.ts, exit));
    const n = incidentOpenAt.some((t) => near(t, exit));
    const w = wakeEffects.some((e) => near(e.at, exit));
    if (a) alarmCaught++;
    if (n) noticed++;
    if (w) woke++;
    // Only count a miss against Nightlight where the alarm could see it.
    if (a && !n && returnedWithin30(exit)) missedAndReturned++;
  }

  return {
    home: name,
    nightsJudged: liveDates.size,
    doorOpenings: parsed.doorEvents.length,
    labeledLeaveHome: parsed.leaveHomeAt.length,
    alarmWakes: alarmEvents.length,
    alarmNights: alarmNights.size,
    nlIncidents: result.incidents.length,
    nlVoiceOnly: voiceOnly.length,
    nlWakes: wakeEffects.length,
    nlWakeNights: wakeNights.size,
    nlWakesNearExit: wakeEffects.filter((e) => nearExit(e.at)).length,
    nightExits: nightExits.length,
    nightExitsAlarmCaught: alarmCaught,
    nightExitsNoticed: noticed,
    nightExitsWoke: woke,
    nightExitsMissedAndReturned: missedAndReturned,
  };
}

const input = arg("input");
const seedDays = Number(arg("seed", "28"));
if (!input || !fs.existsSync(input)) {
  console.error("Usage: npm run casas -w @nightlight/eval -- --input <file-or-dir> [--seed 28]");
  process.exit(1);
}

const files: Array<[string, string]> = fs.statSync(input).isDirectory()
  ? fs
      .readdirSync(input)
      .filter((f) => f.endsWith(".csv"))
      .sort()
      .map((f) => [path.basename(f, ".csv"), path.join(input, f)])
  : [[path.basename(input).replace(/\.[^.]+$/, ""), input]];

const rows: HomeResult[] = [];
let skipped = 0;
for (const [name, file] of files) {
  const r = evalHome(name, file, seedDays);
  if (r) {
    rows.push(r);
    console.log(
      `${name}: nights=${r.nightsJudged} alarmWakes=${r.alarmWakes} nlWakes=${r.nlWakes} voiceOnly=${r.nlVoiceOnly} nightExits=${r.nightExits} noticed=${r.nightExitsNoticed} woke=${r.nightExitsWoke}`,
    );
  } else {
    skipped++;
  }
}

const sum = (k: keyof HomeResult): number =>
  rows.reduce((n, r) => n + (r[k] as number), 0);

const totals = {
  dataset: "CASAS HH corpus (Zenodo record 15708568, CC-BY-4.0)",
  seedDays,
  homes: rows.length,
  homesSkippedTooShort: skipped,
  nightsJudged: sum("nightsJudged"),
  doorOpenings: sum("doorOpenings"),
  labeledLeaveHome: sum("labeledLeaveHome"),
  thresholdAlarm: { wakes: sum("alarmWakes"), nightsDisturbed: sum("alarmNights") },
  nightlight: {
    incidents: sum("nlIncidents"),
    voiceOnlyResolved: sum("nlVoiceOnly"),
    caregiverWakes: sum("nlWakes"),
    nightsDisturbed: sum("nlWakeNights"),
    wakesNearLabeledExit: sum("nlWakesNearExit"),
  },
  /**
   * Recall against the corpus's own ground truth. `alarmCaught` is the
   * ceiling; percentages below are taken against it rather than against
   * every label, because a label the threshold alarm could not see was
   * never available to Nightlight either.
   */
  labeledNightExits: {
    total: sum("nightExits"),
    visibleToBothSystems: sum("nightExitsAlarmCaught"),
    nightlightNoticed: sum("nightExitsNoticed"),
    nightlightWokeCaregiver: sum("nightExitsWoke"),
    missedByNightlightButResidentReturnedWithin30Min: sum("nightExitsMissedAndReturned"),
    noticedPercentOfVisible:
      sum("nightExitsAlarmCaught") > 0
        ? Math.round((sum("nightExitsNoticed") / sum("nightExitsAlarmCaught")) * 1000) / 10
        : null,
    wokePercentOfVisible:
      sum("nightExitsAlarmCaught") > 0
        ? Math.round((sum("nightExitsWoke") / sum("nightExitsAlarmCaught")) * 1000) / 10
        : null,
  },
  wakeReductionPercent:
    sum("alarmWakes") > 0
      ? Math.round((1 - sum("nlWakes") / sum("alarmWakes")) * 1000) / 10
      : null,
};

console.log("\n=== TOTALS ===");
console.log(JSON.stringify(totals, null, 2));

const outDir = path.resolve(process.cwd(), "results");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "casas-hh.json"),
  JSON.stringify({ totals, homes: rows }, null, 1),
);
console.log(`\nWrote results/casas-hh.json`);
