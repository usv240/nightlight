import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

/**
 * Replaying the demo twice must produce the same month.
 *
 * It did not. Every replayed event carries the same request id as the last
 * replay, which is precisely what the deduper exists to suppress when Ring
 * redelivers a webhook. The replay route reset the runtime but not the
 * deduper, so a second call dropped all 204 events and left one night on
 * the board.
 *
 * That endpoint is linked from the README and is the first thing anyone
 * exploring the API presses. Clicking it twice, which a judge would, broke
 * the live demo into "no incidents recorded" while every claim on the
 * page said otherwise. Found while recording a demo video, because the
 * recorder resets state before it starts and the screen then contradicted
 * the narration.
 */
describe("the demo replay is idempotent", () => {
  const replay = async (app: ReturnType<typeof buildServer>["app"]) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/demo/replay",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      events: number;
      incidents: number;
      totalNights: number;
      undisturbedNights: number;
      undisturbedStreak: number;
    };
  };

  it("gives the same month every time it is called", async () => {
    const { app } = buildServer();
    const first = await replay(app);
    const second = await replay(app);
    const third = await replay(app);

    expect(first.totalNights).toBeGreaterThan(20);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    await app.close();
  });

  it("does not collapse to a single night on the second call", async () => {
    // The exact failure: 204 events processed, every one suppressed as a
    // duplicate, one night left on the board.
    const { app } = buildServer();
    await replay(app);
    const again = await replay(app);
    expect(again.totalNights).not.toBe(1);
    expect(again.incidents).toBeGreaterThan(0);
    await app.close();
  });

  it("still suppresses a genuine redelivery of one event", async () => {
    // The fix must not turn duplicate suppression off. A replay is a new
    // run; the same webhook arriving twice inside a run is still a
    // duplicate and must not be processed twice.
    const { app } = buildServer();
    await replay(app);
    const before = await app.inject({ method: "GET", url: "/api/summary" });
    const beforeCount = (before.json() as { nights: unknown[] }).nights.length;

    const { createHmac } = await import("node:crypto");
    const envelope = JSON.stringify({
      meta: { request_id: "replayed-once", timestamp: "2026-09-12T03:05:00Z" },
      event: {
        event_type: "motion_detected",
        sub_type: "human",
        device_id: "demo-door",
        created_at: "2026-09-12T03:05:00Z",
      },
    });
    const sign = (body: string) =>
      createHmac("sha256", "nightlight-demo-secret").update(body).digest("hex");

    const first = await app.inject({
      method: "POST",
      url: "/webhooks/ring",
      headers: { "content-type": "application/json", "x-signature": sign(envelope) },
      payload: envelope,
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/webhooks/ring",
      headers: { "content-type": "application/json", "x-signature": sign(envelope) },
      payload: envelope,
    });

    expect(first.statusCode).toBeLessThan(300);
    expect(duplicate.statusCode).toBeLessThan(300);
    expect(JSON.stringify(duplicate.json())).toMatch(/duplicate|suppress|ignored/i);

    const after = await app.inject({ method: "GET", url: "/api/summary" });
    expect((after.json() as { nights: unknown[] }).nights.length).toBe(beforeCount);
    await app.close();
  });
});
