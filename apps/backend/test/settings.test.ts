import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

/**
 * Night-window settings: because nights are derived by replaying the
 * event log rather than stored, changing the window must retroactively
 * change what counts as a night event, with no migration.
 */
describe("night window settings", () => {
  it("recomputes the whole history under new hours", async () => {
    const { app } = buildServer();
    await app.inject({
      method: "POST",
      url: "/api/demo/replay",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ seed: 42 }),
    });

    const before = (await app.inject({ method: "GET", url: "/api/summary" })).json();
    expect(before.incidentCount).toBe(3);

    // A window that excludes the 2:40am and 3:05am scripted events.
    const res = await app.inject({
      method: "POST",
      url: "/api/settings",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ start: "04:00", end: "05:00" }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nightWindow).toEqual({ start: "04:00", end: "05:00" });

    const after = (await app.inject({ method: "GET", url: "/api/summary" })).json();
    expect(after.incidentCount).toBeLessThan(before.incidentCount);
    await app.close();
  }, 30_000);

  it("rejects malformed or identical times", async () => {
    const { app } = buildServer();
    const bad = await app.inject({
      method: "POST",
      url: "/api/settings",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ start: "25:00", end: "06:00" }),
    });
    expect(bad.statusCode).toBe(400);

    const same = await app.inject({
      method: "POST",
      url: "/api/settings",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ start: "22:00", end: "22:00" }),
    });
    expect(same.statusCode).toBe(400);
    await app.close();
  });

  it("acknowledging an open incident closes it as resolved by caregiver", async () => {
    const { app } = buildServer();
    // Replay only up to the escalation night's notify, then acknowledge.
    await app.inject({
      method: "POST",
      url: "/api/demo/replay",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ seed: 42 }),
    });
    const ack = await app.inject({
      method: "POST",
      url: "/api/incidents/ack",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ at: "2026-09-13T07:12:00.000Z" }),
    });
    expect(ack.json().acknowledged).toBe(true);

    const incidents = (await app.inject({ method: "GET", url: "/api/incidents" })).json();
    const outcomes = incidents.map((i: { outcome?: string }) => i.outcome).sort();
    expect(outcomes).toContain("RESOLVED_CAREGIVER");
    expect(outcomes).not.toContain("ESCALATED");
    await app.close();
  }, 30_000);
});
