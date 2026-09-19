import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openedLocal } from "../src/lib/time";

/**
 * The caregiver app must speak the household's clock, everywhere.
 *
 * This suite exists because of a real defect. The incident record rendered
 * `new Date(inc.openedAt).toUTCString()`, so the escalation a caregiver in
 * New York lived at 03:05 was printed as "Sun, 13 Sep 2026 07:05:00 GMT",
 * four hours from the time it happened, on the same screen where Recent
 * nights already said 03:05. It was caught by pulling a frame out of the
 * demo recording and reading the card underneath the narration.
 */
describe("incident times on the caregiver app", () => {
  const ESCALATION = "2026-09-13T07:05:00.000Z";

  it("renders the hour the household actually lived", () => {
    expect(openedLocal(ESCALATION, "America/New_York")).toBe("2026-09-13 at 03:05");
  });

  it("is not UTC dressed up", () => {
    // The mistake being guarded against, stated as the thing it must not be.
    expect(openedLocal(ESCALATION, "America/New_York")).not.toContain("07:05");
    expect(openedLocal(ESCALATION, "America/New_York")).not.toContain("GMT");
  });

  it("follows the household rather than the machine", () => {
    expect(openedLocal(ESCALATION, "Europe/London")).toBe("2026-09-13 at 08:05");
    expect(openedLocal(ESCALATION, "UTC")).toBe("2026-09-13 at 07:05");
  });

  it("crosses midnight into the correct calendar day", () => {
    // 23:50 local on the 27th is 03:50Z on the 28th. A naive UTC render
    // would put this night on the wrong date as well as the wrong hour.
    expect(openedLocal("2026-09-28T03:50:00.000Z", "America/New_York")).toBe(
      "2026-09-27 at 23:50",
    );
  });

  it("survives a timestamp the backend should never have sent", () => {
    expect(openedLocal("not a date", "America/New_York")).toBe("not a date");
  });

  it("is the only thing the incident card uses to print a time", () => {
    const page = readFileSync(
      new URL("../src/app/app/page.tsx", import.meta.url),
      "utf8",
    );
    // Comments are allowed to name the mistake; code is not allowed to
    // make it. Stripping them first is the difference between a test that
    // guards behaviour and one that forbids writing about it.
    const code = page
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("toUTCString");
    expect(code).toContain("openedLocal(inc.openedAt, data.timezone)");
  });
});
