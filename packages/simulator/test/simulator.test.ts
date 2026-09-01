import { describe, expect, it } from "vitest";
import { generateDemoMonth } from "../src/index";

describe("demo month generator", () => {
  it("is deterministic for a given seed", () => {
    const a = generateDemoMonth(42);
    const b = generateDemoMonth(42);
    expect(a.events).toEqual(b.events);
  });

  it("differs across seeds", () => {
    const a = generateDemoMonth(42);
    const b = generateDemoMonth(7);
    expect(a.events).not.toEqual(b.events);
  });

  it("assigns unique request ids to every event", () => {
    const { events } = generateDemoMonth();
    const ids = new Set(events.map((e) => e.requestId));
    expect(ids.size).toBe(events.length);
  });

  it("contains the three scripted night moments", () => {
    const { events } = generateDemoMonth();
    const nightHuman = events.filter(
      (e) =>
        e.type === "motion_detected" &&
        e.subType === "human" &&
        (e.ts.includes("2026-09-13T07:05") ||
          e.ts.includes("2026-09-24T06:40") ||
          e.ts.includes("2026-09-28T03:50")),
    );
    expect(nightHuman.length).toBe(3);
  });

  it("is sorted chronologically", () => {
    const { events } = generateDemoMonth();
    const sorted = [...events].sort((a, b) => (a.ts < b.ts ? -1 : 1));
    expect(events).toEqual(sorted);
  });
});
