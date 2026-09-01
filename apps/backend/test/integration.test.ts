import { describe, expect, it } from "vitest";
import {
  processTimeline,
  summarizeNights,
  localTime,
} from "@nightlight/engine";
import { generateDemoMonth, toWebhookEnvelope } from "@nightlight/simulator";
import { signBody } from "ring-webhook-kit";
import { buildServer } from "../src/server";

describe("full month through the engine", () => {
  const demo = generateDemoMonth(42);
  const result = processTimeline(demo.events, demo.config);
  const nights = summarizeNights(
    demo.events[0]!.ts,
    demo.events[demo.events.length - 1]!.ts,
    result.incidents,
    result.effects,
    demo.config,
  );

  it("produces exactly the three scripted incidents", () => {
    expect(result.incidents).toHaveLength(3);
  });

  it("no incidents open during the warmup week", () => {
    for (const inc of result.incidents) {
      const date = localTime(inc.openedAt, demo.config.timezone).date;
      expect(date >= "2026-09-08").toBe(true);
    }
  });

  it("the wandering night escalates; the voice nights resolve quietly", () => {
    const outcomes = result.incidents.map((i) => i.outcome).sort();
    expect(outcomes).toEqual(["ESCALATED", "RESOLVED_VOICE", "RESOLVED_VOICE"]);
  });

  it("exactly one night disturbed the caregiver: 29 of 30 undisturbed", () => {
    const disturbed = nights.filter((n) => !n.undisturbed);
    expect(disturbed).toHaveLength(1);
    expect(disturbed[0]!.nightOf).toBe(demo.scripted.escalationNight);
    expect(nights.filter((n) => n.undisturbed).length).toBe(nights.length - 1);
  });

  it("voice plays for every incident, escalation only for the wandering night", () => {
    const kinds = result.effects.map((e) => e.kind);
    expect(kinds.filter((k) => k === "PLAY_VOICE")).toHaveLength(3);
    expect(kinds.filter((k) => k === "ESCALATE")).toHaveLength(1);
    expect(kinds.filter((k) => k === "NOTIFY_CAREGIVER")).toHaveLength(1);
  });

  it("vehicle motion and connectivity blips never open incidents", () => {
    for (const inc of result.incidents) {
      expect(inc.flags).toContain("below_household_baseline");
    }
  });
});

describe("acknowledgement path", () => {
  it("an acked notification closes as RESOLVED_CAREGIVER instead of escalating", () => {
    const demo = generateDemoMonth(42);
    const result = processTimeline(demo.events, demo.config, {
      acks: [{ at: "2026-09-13T07:15:00.000Z" }], // 03:15 local, after notify at 03:09
    });
    const outcomes = result.incidents.map((i) => i.outcome).sort();
    expect(outcomes).toEqual([
      "RESOLVED_CAREGIVER",
      "RESOLVED_VOICE",
      "RESOLVED_VOICE",
    ]);
    expect(result.effects.map((e) => e.kind)).not.toContain("ESCALATE");
  });
});

describe("HTTP intake path", () => {
  it("rejects unsigned webhooks and accepts signed ones exactly once", async () => {
    const { app } = buildServer();
    const demo = generateDemoMonth(42);
    const envelope = JSON.stringify(toWebhookEnvelope(demo.events[0]!));

    const unsigned = await app.inject({
      method: "POST",
      url: "/webhooks/ring",
      headers: { "content-type": "application/json" },
      payload: envelope,
    });
    expect(unsigned.statusCode).toBe(401);

    const signed = await app.inject({
      method: "POST",
      url: "/webhooks/ring",
      headers: {
        "content-type": "application/json",
        "x-signature": signBody(envelope, "nightlight-demo-secret"),
      },
      payload: envelope,
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json().accepted).toBe(true);

    const duplicate = await app.inject({
      method: "POST",
      url: "/webhooks/ring",
      headers: {
        "content-type": "application/json",
        "x-signature": signBody(envelope, "nightlight-demo-secret"),
      },
      payload: envelope,
    });
    expect(duplicate.json().deduplicated).toBe(true);
    await app.close();
  });

  it("replays the whole demo month through the real webhook route", async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/demo/replay",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ seed: 42 }),
    });
    const body = res.json();
    expect(body.simulated).toBe(true);
    expect(body.incidents).toBe(3);
    expect(body.undisturbedNights).toBe(body.totalNights - 1);
    await app.close();
  }, 30_000);
});
