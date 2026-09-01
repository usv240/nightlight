import {
  processTimeline,
  summarizeNights,
  undisturbedStreak,
  localTime,
} from "@nightlight/engine";
import { generateDemoMonth } from "@nightlight/simulator";

/**
 * CLI demo: one month of the simulated household through the real engine.
 * Run with: npm run demo
 */

const demo = generateDemoMonth(42);
const result = processTimeline(demo.events, demo.config);
const nights = summarizeNights(
  demo.events[0]!.ts,
  demo.events[demo.events.length - 1]!.ts,
  result.incidents,
  result.effects,
  demo.config,
);

const line = (s = ""): void => console.log(s);

line();
line("NIGHTLIGHT  demo household replay  (SIMULATED DATA)");
line("====================================================");
line(`Events processed:        ${demo.events.length}`);
line(`Baseline days observed:  ${result.baseline.daysObserved} (warmup ${result.warmupDays} days, shadow mode)`);
line(`Incidents:               ${result.incidents.length}`);
line();

for (const inc of result.incidents) {
  const t = localTime(inc.openedAt, demo.config.timezone);
  const hhmm = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
  line(`  ${inc.id}  opened ${t.date} ${hhmm} local  score ${inc.score.toFixed(2)}`);
  line(`         outcome: ${inc.outcome ?? inc.state}   events: ${inc.eventTimestamps.length}   flags: ${inc.flags.join(", ")}`);
}

line();
line("Night-by-night:");
for (const n of nights) {
  const mark = n.undisturbed ? "slept " : "WOKEN ";
  line(`  ${n.nightOf}  ${mark} ${n.text}`);
}

const undisturbed = nights.filter((n) => n.undisturbed).length;
line();
line("----------------------------------------------------");
line(`Caregiver undisturbed:   ${undisturbed} of ${nights.length} nights`);
line(`Current streak:          ${undisturbedStreak(nights)} nights`);
line(`Voice-only resolutions:  ${result.incidents.filter((i) => i.outcome === "RESOLVED_VOICE").length}`);
line(`Escalations:             ${result.incidents.filter((i) => i.outcome === "ESCALATED").length}`);
line("====================================================");
line("Every door alarm on the market wakes the caregiver.");
line("Nightlight's product is the nights it does not.");
line();
