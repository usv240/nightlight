import { describe, expect, it } from "vitest";
import { hourOfWeek, inNightWindow, localTime, nightOf } from "../src/time";

const TZ = "America/New_York";
const WINDOW = { start: "22:00", end: "06:00" };

describe("localTime", () => {
  it("converts UTC to household local time", () => {
    // 2026-09-01T07:30:00Z is 03:30 EDT (UTC-4), a Tuesday.
    const t = localTime("2026-09-01T07:30:00Z", TZ);
    expect(t.hour).toBe(3);
    expect(t.minute).toBe(30);
    expect(t.weekday).toBe(2);
    expect(t.date).toBe("2026-09-01");
  });

  it("rejects invalid timestamps", () => {
    expect(() => localTime("not-a-date", TZ)).toThrow();
  });
});

describe("inNightWindow with a midnight-wrapping window", () => {
  it("late evening is inside", () => {
    expect(inNightWindow("2026-09-02T02:30:00Z", TZ, WINDOW)).toBe(true); // 22:30 EDT Sep 1
  });
  it("3am is inside", () => {
    expect(inNightWindow("2026-09-01T07:05:00Z", TZ, WINDOW)).toBe(true); // 03:05 EDT
  });
  it("6am is outside (end exclusive)", () => {
    expect(inNightWindow("2026-09-01T10:00:00Z", TZ, WINDOW)).toBe(false); // 06:00 EDT
  });
  it("mid afternoon is outside", () => {
    expect(inNightWindow("2026-09-01T18:00:00Z", TZ, WINDOW)).toBe(false); // 14:00 EDT
  });
  it("non-wrapping window works too", () => {
    expect(
      inNightWindow("2026-09-01T18:00:00Z", TZ, { start: "13:00", end: "15:00" }),
    ).toBe(true);
  });
});

describe("nightOf attribution", () => {
  it("3am belongs to the previous evening's night", () => {
    expect(nightOf("2026-09-02T07:10:00Z", TZ, WINDOW)).toBe("2026-09-01"); // 03:10 EDT Sep 2
  });
  it("23:00 belongs to its own date", () => {
    expect(nightOf("2026-09-02T03:00:00Z", TZ, WINDOW)).toBe("2026-09-01"); // 23:00 EDT Sep 1
  });
});

describe("hourOfWeek", () => {
  it("is stable and within range", () => {
    const cell = hourOfWeek("2026-09-01T07:30:00Z", TZ); // Tuesday 03:00 EDT
    expect(cell).toBe(2 * 24 + 3);
  });
});
