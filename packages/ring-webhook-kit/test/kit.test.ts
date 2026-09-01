import { describe, expect, it } from "vitest";
import { Deduper, parseWebhook, signBody, verifySignature } from "../src/index";

describe("verifySignature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ hello: "world" });

  it("accepts a valid hex signature", () => {
    const sig = signBody(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("accepts a sha256= prefixed signature", () => {
    const sig = `sha256=${signBody(body, secret)}`;
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("accepts a base64 signature", () => {
    const hex = signBody(body, secret);
    const b64 = Buffer.from(hex, "hex").toString("base64");
    expect(verifySignature(body, b64, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signBody(body, secret);
    expect(verifySignature(body + "x", sig, secret)).toBe(false);
  });

  it("rejects the wrong secret, a missing header, and an empty secret", () => {
    const sig = signBody(body, "other");
    expect(verifySignature(body, sig, secret)).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, sig, "")).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("parses a human motion event", () => {
    const parsed = parseWebhook({
      data: {
        type: "motion_detected",
        id: "device-123",
        attributes: { sub_type: "human", component_ids: [1] },
      },
      meta: {
        request_id: "req-1",
        account_id: "acct-1",
        timestamp: "2026-09-13T07:05:00Z",
      },
    });
    expect(parsed.eventType).toBe("motion_detected");
    expect(parsed.subType).toBe("human");
    expect(parsed.deviceId).toBe("device-123");
    expect(parsed.componentIds).toEqual([1]);
    expect(parsed.ts).toBe("2026-09-13T07:05:00Z");
  });

  it("throws on a missing request id", () => {
    expect(() => parseWebhook({ data: { type: "button_press" } })).toThrow(
      /request_id/,
    );
  });

  it("maps unrecognized types to unknown instead of throwing", () => {
    const parsed = parseWebhook({
      data: { type: "future_event" },
      meta: { request_id: "req-2" },
    });
    expect(parsed.eventType).toBe("unknown");
  });
});

describe("Deduper", () => {
  it("sees an id only once", () => {
    const d = new Deduper();
    expect(d.firstSeen("a")).toBe(true);
    expect(d.firstSeen("a")).toBe(false);
    expect(d.firstSeen("b")).toBe(true);
  });

  it("expires ids after the ttl", () => {
    let t = 0;
    const d = new Deduper(100, 1000, () => t);
    expect(d.firstSeen("a")).toBe(true);
    t = 500;
    expect(d.firstSeen("a")).toBe(false);
    t = 1600;
    expect(d.firstSeen("a")).toBe(true);
  });

  it("evicts oldest entries beyond capacity", () => {
    const d = new Deduper(3, 60_000);
    d.firstSeen("a");
    d.firstSeen("b");
    d.firstSeen("c");
    d.firstSeen("d");
    expect(d.size).toBeLessThanOrEqual(3);
    // "a" was evicted, so it reads as first-seen again.
    expect(d.firstSeen("a")).toBe(true);
  });
});
