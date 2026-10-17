import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { issueKey } from "../src/keys";

function night(date: string) {
  // A door opened at 02:40 and nothing else: one unusual night.
  return [{ ts: `${date}T02:40:00Z`, type: "motion_detected" }];
}

describe("API keys", () => {
  it("issues a key with no account", async () => {
    const { app } = buildServer();
    const res = await app.inject({ method: "POST", url: "/v1/keys" });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { key: string }).key).toMatch(/^nl_[A-Za-z0-9_-]{32}$/);
  });

  it("gives a key a household of its own, and leaves the demo household as it was", async () => {
    const { app } = buildServer();
    const key = issueKey();
    const auth = { authorization: `Bearer ${key}` };

    const mineBefore = (await app.inject({ method: "GET", url: "/api/summary", headers: auth })).json() as { nights: unknown[]; simulated: boolean };
    // An empty household still has tonight; nothing more.
    expect(mineBefore.nights.length).toBeLessThanOrEqual(1);

    const replay = await app.inject({ method: "POST", url: "/api/demo/replay", headers: { ...auth, "content-type": "application/json" }, payload: { seed: 7 } });
    expect(replay.statusCode).toBe(200);

    const mine = (await app.inject({ method: "GET", url: "/api/summary", headers: auth })).json() as { nights: unknown[] };
    const demo = (await app.inject({ method: "GET", url: "/api/summary" })).json() as { nights: unknown[] };
    expect(mine.nights.length).toBeGreaterThan(20);
    expect(demo.nights.length).toBeLessThanOrEqual(1);
  });

  it("takes your own events into your own household, and never into the demo", async () => {
    const { app } = buildServer();
    const auth = { authorization: `Bearer ${issueKey()}`, "content-type": "application/json" };
    const events = ["2026-10-01", "2026-10-02", "2026-10-03"].flatMap(night);

    const own = await app.inject({ method: "POST", url: "/api/events", headers: auth, payload: { events } });
    expect(own.statusCode).toBe(200);
    expect((own.json() as { accepted: number }).accepted).toBe(3);

    const summary = (await app.inject({ method: "GET", url: "/api/summary", headers: auth })).json() as { simulated: boolean };
    expect(summary.simulated).toBe(false);

    const open = await app.inject({ method: "POST", url: "/api/events", headers: { "content-type": "application/json" }, payload: { events } });
    expect(open.statusCode).toBe(403);

    const bad = await app.inject({ method: "POST", url: "/api/events", headers: auth, payload: { events: [{ ts: "yesterday", type: "motion_detected" }] } });
    expect(bad.statusCode).toBe(400);
  });

  it("refuses a malformed key rather than treating the caller as the demo", async () => {
    const { app } = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/summary", headers: { authorization: "Bearer nope" } });
    expect(res.statusCode).toBe(401);
  });

  it("answers MCP for the key's own household", async () => {
    const { app } = buildServer();
    const auth = { authorization: `Bearer ${issueKey()}` };
    const init = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", ...auth },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    });
    const sid = String(init.headers["mcp-session-id"]);
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": sid, "mcp-protocol-version": "2025-11-25", ...auth },
      payload: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_household_status", arguments: {} } },
    });
    const data = JSON.parse((res.json() as { result: { content: { text: string }[] } }).result.content[0]!.text) as { household: string; simulated: boolean };
    expect(data.household).toBe("your key's own");
    expect(data.simulated).toBe(false);
  });
});
