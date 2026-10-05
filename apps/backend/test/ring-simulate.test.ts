import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

/**
 * The Ring delivery proof has to be a proof, not a prop.
 *
 * The rules require the demo video to show the project working through a
 * Ring simulator or device. A panel that always draws three green rows
 * would satisfy a viewer and nobody else, so these tests assert the three
 * outcomes are genuinely different and genuinely produced by the
 * production route: accepted, rejected on a single changed byte, and
 * deduplicated on a byte-identical retry.
 */
describe("the Ring delivery proof", () => {
  it("accepts a correctly signed 3am doorway event", async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/ring/simulate",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.deliveries).toHaveLength(3);
    expect(body.deliveries[0].verdict).toBe("accepted");
    expect(body.deliveries[0].response.status).toBe(200);
    // Ring's own header format: "sha256=" and a 64-character hex digest.
    expect(body.deliveries[0].request.signatureHeader).toMatch(/^sha256=[0-9a-f]{64}$/);
    await app.close();
  }, 60_000);

  it("rejects the same delivery when one byte changed in transit", async () => {
    const { app } = buildServer();
    const body = (await app.inject({
      method: "POST", url: "/api/ring/simulate",
      headers: { "content-type": "application/json" }, payload: "{}",
    })).json();
    const tampered = body.deliveries[1];
    expect(tampered.verdict).toBe("rejected");
    expect(tampered.response.status).toBe(401);
    // The signature sent is the one computed for the untampered body, which
    // is what makes this a man-in-the-middle and not a missing secret.
    expect(tampered.request.signatureHeader).toBe(body.deliveries[0].request.signatureHeader);
    expect(tampered.request.body).not.toBe(body.deliveries[0].request.body);
    await app.close();
  }, 60_000);

  it("deduplicates a byte-identical redelivery instead of acting twice", async () => {
    const { app } = buildServer();
    const body = (await app.inject({
      method: "POST", url: "/api/ring/simulate",
      headers: { "content-type": "application/json" }, payload: "{}",
    })).json();
    const retry = body.deliveries[2];
    expect(retry.verdict).toBe("deduplicated");
    expect(retry.response.status).toBe(200);
    expect(retry.response.body.deduplicated).toBe(true);
    expect(retry.request.body).toBe(body.deliveries[0].request.body);
    await app.close();
  }, 60_000);

  it("leaves the published household untouched", async () => {
    // The whole reason the proof runs in a sandbox. If pressing the button
    // on the marketing page could move the thirty-night strip, the strip
    // would stop being a claim anyone could check.
    const { app } = buildServer();
    await app.inject({
      method: "POST", url: "/api/demo/replay",
      headers: { "content-type": "application/json" }, payload: "{}",
    });
    const before = (await app.inject({ method: "GET", url: "/api/summary" })).json();
    await app.inject({
      method: "POST", url: "/api/ring/simulate",
      headers: { "content-type": "application/json" }, payload: "{}",
    });
    const after = (await app.inject({ method: "GET", url: "/api/summary" })).json();
    expect(after.nights.length).toBe(before.nights.length);
    expect(after.undisturbedStreak).toBe(before.undisturbedStreak);
    expect(after.incidentCount).toBe(before.incidentCount);
    await app.close();
  }, 60_000);

  it("says plainly that the household is a sandbox", async () => {
    // A proof that overstates itself is worse than no proof. The response
    // carries its own provenance so the UI cannot imply more than happened.
    const { app } = buildServer();
    const body = (await app.inject({
      method: "POST", url: "/api/ring/simulate",
      headers: { "content-type": "application/json" }, payload: "{}",
    })).json();
    expect(body.sandbox).toBe(true);
    expect(body.transport).toBe("http");
    await app.close();
  }, 60_000);
});
