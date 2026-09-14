import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store";
import { HouseholdRuntime } from "../src/household";
import { phraseMorningNote } from "../src/summaries";
import { DemoAdapters } from "../src/adapters";
import { generateDemoMonth } from "@nightlight/simulator";
import type { NightSummary } from "@nightlight/engine";

describe("store-backed runtime", () => {
  it("replays identically from the persisted event log", async () => {
    const store = new MemoryStore();
    const adapters = new DemoAdapters();
    const runtime = new HouseholdRuntime(store, adapters, {
      householdId: "demo-house",
    });
    const demo = generateDemoMonth(42);
    await runtime.ingestBatch(demo.events);

    const snap = await runtime.snapshot();
    expect(snap.incidents).toHaveLength(3);
    expect(snap.nights.filter((n) => !n.undisturbed)).toHaveLength(1);

    // A second runtime over the same store sees the same world: this is
    // exactly the Lambda cold-start scenario.
    const runtime2 = new HouseholdRuntime(store, new DemoAdapters(), {
      householdId: "demo-house",
    });
    const snap2 = await runtime2.snapshot();
    expect(snap2.incidents).toEqual(snap.incidents);
    expect(snap2.undisturbedStreak).toBe(snap.undisturbedStreak);
  });

  it("claims each effect exactly once across runtimes sharing a store", async () => {
    const store = new MemoryStore();
    const a = new DemoAdapters();
    const runtimeA = new HouseholdRuntime(store, a, { householdId: "h" });
    const demo = generateDemoMonth(42);
    await runtimeA.ingestBatch(demo.events);
    const journalAfterA = a.journal.length;
    expect(journalAfterA).toBeGreaterThan(0);

    // A second instance replaying the same log must not re-execute anything.
    const b = new DemoAdapters();
    const runtimeB = new HouseholdRuntime(store, b, { householdId: "h" });
    await runtimeB.acknowledge(new Date().toISOString());
    expect(b.journal.length).toBe(0);
    expect((await store.listExecutions("h")).length).toBe(journalAfterA);
  });
});

describe("morning note (Bedrock phrasing with deterministic fallback)", () => {
  const night: NightSummary = {
    nightOf: "2026-09-23",
    incidentIds: ["inc_0002"],
    undisturbed: true,
    text: "One doorway event at 02:40. The familiar voice message played and activity settled. You were not woken.",
  };

  it("falls back to the deterministic template when Bedrock is disabled", async () => {
    const note = await phraseMorningNote(night, 12);
    expect(note.source).toBe("template");
    expect(note.text).toBe(night.text);
  });

  it("uses the model text when the injected client succeeds", async () => {
    const note = await phraseMorningNote(night, 12, {
      createText: async (_system, user) => {
        expect(user).toContain("02:40");
        expect(user).toContain("12 nights");
        return "A calm night. Your loved one stirred at 02:40, and your recorded message settled things while you slept.";
      },
    });
    expect(note.source).toBe("bedrock");
    expect(note.text).toContain("02:40");
  });

  it("falls back when the model errors, refuses, or over-writes", async () => {
    const err = await phraseMorningNote(night, 12, {
      createText: async () => {
        throw new Error("model declined");
      },
    });
    expect(err.source).toBe("template");

    const tooLong = await phraseMorningNote(night, 12, {
      createText: async () => "x".repeat(500),
    });
    expect(tooLong.source).toBe("template");
  });
});
