import { describe, expect, it } from "vitest";
import { VoiceChain, type VoicePath } from "../src/voice";
import { HouseholdRuntime, type Adapters } from "../src/household";
import { MemoryStore } from "../src/store";

/**
 * The voice chain and the fail-safe behind it.
 *
 * These are safety tests, not feature tests. The property under test is that
 * Nightlight never answers a 3am doorway event with silence: if every voice
 * path fails, the caregiver is woken immediately rather than the system
 * waiting to see whether a voice that never played settled things.
 */

const path = (name: string, behaviour: "ok" | "throw"): VoicePath => ({
  name,
  async play(incidentId: string) {
    if (behaviour === "throw") throw new Error(`${name} unavailable`);
    return `${name} played for ${incidentId}`;
  },
});

describe("VoiceChain", () => {
  it("uses the first path that works and does not try the rest", async () => {
    const chain = new VoiceChain([
      path("family-recording", "ok"),
      path("polly", "ok"),
    ]);
    const res = await chain.play("inc-1", "2026-09-20T03:00:00Z");
    expect(res.ok).toBe(true);
    expect(res.path).toBe("family-recording");
    expect(res.attempts).toHaveLength(1);
  });

  it("falls through to Polly when the family recording is unavailable", async () => {
    const chain = new VoiceChain([
      path("family-recording", "throw"),
      path("polly", "ok"),
    ]);
    const res = await chain.play("inc-2", "2026-09-20T03:00:00Z");
    expect(res.ok).toBe(true);
    expect(res.path).toBe("polly");
    // Both attempts are recorded, so a caregiver can see the recording failed.
    expect(res.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(res.attempts[0]!.detail).toContain("unavailable");
  });

  it("reports failure rather than throwing when every path fails", async () => {
    const chain = new VoiceChain([
      path("family-recording", "throw"),
      path("polly", "throw"),
    ]);
    const res = await chain.play("inc-3", "2026-09-20T03:00:00Z");
    // Not throwing is the point: effect dispatch has already claimed this
    // effect exactly-once, so a throw would lose the incident entirely.
    expect(res.ok).toBe(false);
    expect(res.path).toBeNull();
    expect(res.attempts).toHaveLength(2);
  });
});

describe("fail-safe: a voice that does not play must wake the caregiver", () => {
  /** Adapters where the voice always fails, recording what else was called. */
  function brokenVoiceAdapters() {
    const calls: string[] = [];
    const adapters: Adapters = {
      async playVoice() {
        calls.push("playVoice");
        throw new Error("chime offline");
      },
      async fetchSnapshot() {
        calls.push("fetchSnapshot");
        return "snapshot";
      },
      async notifyCaregiver() {
        calls.push("notifyCaregiver");
        return "caregiver notified";
      },
      async escalate() {
        calls.push("escalate");
        return "escalated";
      },
    };
    return { adapters, calls };
  }

  it("notifies the caregiver when the voice throws, and does not rethrow", async () => {
    const { adapters, calls } = brokenVoiceAdapters();
    const runtime = new HouseholdRuntime(new MemoryStore(), adapters, {
      householdId: "test-house",
    });

    // Reach into the private dispatch through the public effect path by
    // invoking it directly: this is the unit under test.
    const result = await (
      runtime as unknown as {
        dispatch(e: {
          kind: string;
          incidentId: string;
          at: string;
        }): Promise<string>;
      }
    ).dispatch({
      kind: "PLAY_VOICE",
      incidentId: "inc-9",
      at: "2026-09-20T03:00:00Z",
    });

    expect(calls).toEqual(["playVoice", "notifyCaregiver"]);
    expect(result).toContain("Voice failed");
    expect(result).toContain("chime offline");
    expect(result).toContain("woke the caregiver immediately");
  });

  it("still returns rather than throwing when the notification also fails", async () => {
    const adapters: Adapters = {
      async playVoice() {
        throw new Error("chime offline");
      },
      async fetchSnapshot() {
        return "snapshot";
      },
      async notifyCaregiver() {
        throw new Error("push service down");
      },
      async escalate() {
        return "escalated";
      },
    };
    const runtime = new HouseholdRuntime(new MemoryStore(), adapters, {
      householdId: "test-house",
    });

    // The effect has already been claimed exactly-once by the time dispatch
    // runs, so throwing here would lose the incident with no retry possible.
    const result = await (
      runtime as unknown as {
        dispatch(e: { kind: string; incidentId: string; at: string }): Promise<string>;
      }
    ).dispatch({
      kind: "PLAY_VOICE",
      incidentId: "inc-10",
      at: "2026-09-20T03:00:00Z",
    });
    expect(result).toContain("Voice failed");
    expect(result).toContain("caregiver notification also failed");
  });

  it("a failed snapshot degrades context but never loses the incident", async () => {
    const adapters: Adapters = {
      async playVoice() {
        return "voice";
      },
      async fetchSnapshot() {
        throw new Error("media endpoint 503");
      },
      async notifyCaregiver() {
        return "notified";
      },
      async escalate() {
        return "escalated";
      },
    };
    const runtime = new HouseholdRuntime(new MemoryStore(), adapters, {
      householdId: "test-house",
    });
    const result = await (
      runtime as unknown as {
        dispatch(e: { kind: string; incidentId: string; at: string }): Promise<string>;
      }
    ).dispatch({
      kind: "FETCH_SNAPSHOT",
      incidentId: "inc-11",
      at: "2026-09-20T03:00:00Z",
    });
    expect(result).toContain("Snapshot unavailable");
    expect(result).toContain("503");
  });
});

/**
 * The Bedrock model ladder.
 *
 * An untested fallback is not a fallback, it is a comment. These prove the
 * ladder actually descends, that a degraded note is still exactly correct,
 * and that the provenance of every note is reportable.
 */
describe("Bedrock model ladder", () => {
  const night = {
    nightOf: "2026-09-30",
    text: "Quiet night. No doorway activity outside the household's normal pattern.",
    undisturbed: true,
    incidentIds: [] as string[],
  };

  it("uses the first model that answers and records the attempt", async () => {
    const { phraseMorningNote } = await import("../src/summaries");
    const seen: string[] = [];
    const note = await phraseMorningNote(night as never, 18, {
      models: ["model-a", "model-b"],
      createText: async (_s, _u, model) => {
        seen.push(model);
        return "Good morning. A quiet night, and your eighteenth in a row.";
      },
    });
    expect(seen).toEqual(["model-a"]);
    expect(note.source).toBe("bedrock");
    expect(note.model).toBe("model-a");
    expect(note.attempts).toEqual([{ model: "model-a", ok: true }]);
  });

  it("descends to the next model when one is gated or throttled", async () => {
    const { phraseMorningNote } = await import("../src/summaries");
    const note = await phraseMorningNote(night as never, 18, {
      models: ["gated", "available"],
      createText: async (_s, _u, model) => {
        if (model === "gated") throw new Error("AccessDeniedException: contact AWS Sales");
        return "Good morning. A quiet night.";
      },
    });
    expect(note.source).toBe("bedrock");
    expect(note.model).toBe("available");
    expect(note.attempts?.[0]).toMatchObject({ model: "gated", ok: false });
    expect(note.attempts?.[0]?.reason).toContain("AccessDenied");
  });

  it("treats a rambling answer as that rung failing, not the ladder", async () => {
    const { phraseMorningNote } = await import("../src/summaries");
    const note = await phraseMorningNote(night as never, 18, {
      models: ["chatty", "concise"],
      createText: async (_s, _u, model) =>
        model === "chatty" ? "x".repeat(500) : "Good morning. A quiet night.",
    });
    expect(note.model).toBe("concise");
    expect(note.attempts?.[0]).toMatchObject({
      model: "chatty",
      ok: false,
      reason: "response too long",
    });
  });

  it("falls back to the deterministic template when every model fails", async () => {
    const { phraseMorningNote } = await import("../src/summaries");
    const note = await phraseMorningNote(night as never, 18, {
      models: ["a", "b", "c"],
      createText: async () => {
        throw new Error("region unavailable");
      },
    });
    // Degraded in warmth, never in accuracy: the template is the night's own
    // deterministic text, so it cannot be wrong.
    expect(note.source).toBe("template");
    expect(note.text).toBe(night.text);
    expect(note.attempts).toHaveLength(3);
    expect(note.attempts?.every((a) => !a.ok)).toBe(true);
  });
});
