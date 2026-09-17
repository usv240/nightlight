import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every number this project claims in public, checked against the evidence
 * that produced it.
 *
 * A figure in a README is a claim. A figure a test re-derives from the
 * committed evaluation output is a fact, and it cannot silently drift:
 * change the headline without re-running the evaluation, or re-run the
 * evaluation and get a different answer, and this file fails.
 *
 * The rule this encodes: we do not state a number anywhere a judge can
 * read it unless something here re-derives it from data. Where a claim is
 * not derivable (the literature, the running cost) it is cited or measured
 * elsewhere and is deliberately out of scope here.
 *
 * Reproduce the underlying run: see docs/EVAL.md.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

const casas = JSON.parse(
  fs.readFileSync(path.join(repo, "apps/eval/results/casas-hh.json"), "utf8"),
) as {
  totals: {
    homes: number;
    nightsJudged: number;
    seedDays: number;
    thresholdAlarm: { wakes: number; nightsDisturbed: number };
    nightlight: {
      caregiverWakes: number;
      voiceOnlyResolved: number;
      nightsDisturbed: number;
      incidents: number;
    };
    wakeReductionPercent: number;
  };
  homes: unknown[];
};

/** Files where a public claim could be made, so drift is caught wherever it happens. */
const PUBLIC_TEXT = [
  "README.md",
  "docs/SUBMISSION.md",
  "docs/EVIDENCE.md",
  "docs/EVAL.md",
  "skills/nightlight/SKILL.md",
].flatMap((f) => {
  const p = path.join(repo, f);
  return fs.existsSync(p) ? [{ file: f, text: fs.readFileSync(p, "utf8") }] : [];
});

function statedEverywhere(needle: string): string[] {
  return PUBLIC_TEXT.filter((d) => d.text.includes(needle)).map((d) => d.file);
}

describe("the evaluation output is internally consistent", () => {
  const t = casas.totals;

  it("has the corpus size the claims rest on", () => {
    expect(t.homes).toBe(34);
    expect(t.nightsJudged).toBe(2936);
    expect(casas.homes).toHaveLength(34);
  });

  it("re-derives the 94.5 percent wake reduction from the two wake counts", () => {
    const derived = (1 - t.nightlight.caregiverWakes / t.thresholdAlarm.wakes) * 100;
    // The headline is the rounded value; recompute rather than trust the field.
    expect(Number(derived.toFixed(1))).toBe(94.5);
    expect(t.wakeReductionPercent).toBe(94.5);
  });

  it("wakes fewer times than the baseline it is compared against", () => {
    expect(t.nightlight.caregiverWakes).toBeLessThan(t.thresholdAlarm.wakes);
    expect(t.nightlight.nightsDisturbed).toBeLessThan(t.thresholdAlarm.nightsDisturbed);
  });

  it("voice-only resolutions cannot exceed the incidents that produced them", () => {
    expect(t.nightlight.voiceOnlyResolved).toBeLessThanOrEqual(t.nightlight.incidents);
    expect(t.nightlight.voiceOnlyResolved).toBe(365);
  });

  it("leaves a warmup period out of the judged nights", () => {
    // Nights are only judged after the baseline has something to judge against.
    expect(t.seedDays).toBeGreaterThanOrEqual(7);
  });
});

describe("every public claim matches the evidence", () => {
  const t = casas.totals;

  it("is actually stated somewhere public, so this test is not vacuous", () => {
    expect(PUBLIC_TEXT.length).toBeGreaterThan(2);
    expect(statedEverywhere("94.5 percent").length).toBeGreaterThan(0);
  });

  it.each([
    ["2,936 nights", t.nightsJudged, "2,936"],
    ["34 homes", t.homes, "34"],
    ["14,068 baseline wakes", t.thresholdAlarm.wakes, "14,068"],
    ["774 Nightlight wakes", t.nightlight.caregiverWakes, "774"],
    ["365 voice-settled", t.nightlight.voiceOnlyResolved, "365"],
  ])("%s appears in public text exactly as the data says", (_label, value, formatted) => {
    // If the evidence changes, the formatted string stops matching and this
    // fails, which is the entire point.
    expect(Number(formatted.replace(/,/g, ""))).toBe(value);
    const files = statedEverywhere(formatted);
    expect(files.length).toBeGreaterThan(0);
  });

  it("the per-home figures quoted in EVAL.md are real rows in the results", () => {
    // EVAL.md cites two homes by name to show the aggregate is not carried
    // by a few easy ones. Both are checked here, because a spot figure in
    // prose is exactly the kind of number that rots quietly.
    const homes = casas.homes as Array<Record<string, number | string>>;
    const byName = (n: string) => homes.find((h) => h.home === n)!;

    const hh101 = byName("hh101");
    expect(hh101).toBeDefined();
    const hh101Reduction = (1 - Number(hh101.nlWakes) / Number(hh101.alarmWakes)) * 100;
    expect(Number(hh101Reduction.toFixed(1))).toBe(86.6);
    // "night activity on all 32 judged nights"
    expect(hh101.nightsJudged).toBe(32);
    expect(hh101.alarmNights).toBe(32);

    const tm004 = byName("tm004");
    // "962 alarm wakes and zero Nightlight wakes"
    expect(tm004.alarmWakes).toBe(962);
    expect(tm004.nlWakes).toBe(0);
  });

  it("the aggregate reduction is stated as 94.5 percent and nowhere contradicted", () => {
    // Only the aggregate is constrained. Per-home figures legitimately
    // differ and are verified above by name.
    const contradictions = PUBLIC_TEXT.filter((d) =>
      /(?:overall|aggregate|a )(\d{2}\.\d) percent reduction/i.test(d.text) &&
      !/94\.5 percent reduction/.test(d.text),
    );
    expect(contradictions.map((d) => d.file)).toEqual([]);
    expect(statedEverywhere("94.5 percent").length).toBeGreaterThan(0);
  });
});
