import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { MCP_PROTOCOL_VERSION } from "../src/mcp";

/**
 * MCP transport conformance tests against spec revision 2025-11-25:
 * initialization and session issuance, session enforcement, protocol
 * version validation, origin validation, notifications, tool listing,
 * tool calls, GET behavior, and session termination.
 */

type Injected = Awaited<ReturnType<ReturnType<typeof buildServer>["app"]["inject"]>>;

describe("MCP server (Streamable HTTP, 2025-11-25)", () => {
  const { app } = buildServer();

  const post = (
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<Injected> =>
    app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      payload: JSON.stringify(body),
    });

  let sessionId = "";

  beforeAll(async () => {
    // Seed the runtime through the public demo replay path.
    await app.inject({
      method: "POST",
      url: "/api/demo/replay",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ seed: 42 }),
    });
  });

  it("initialize returns the protocol version, server info, and a session id", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.0.1" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(body.result.serverInfo.name).toBe("nightlight-mcp");
    expect(body.result.capabilities.tools).toBeDefined();
    sessionId = res.headers["mcp-session-id"] as string;
    expect(sessionId).toMatch(/[0-9a-f-]{36}/);
  });

  it("rejects non-initialize requests without a session", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects unknown sessions with 404", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 3, method: "tools/list" },
      { "mcp-session-id": "00000000-0000-0000-0000-000000000000" },
    );
    expect(res.statusCode).toBe(404);
  });

  it("rejects unsupported protocol versions with 400", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
      { "mcp-session-id": sessionId, "mcp-protocol-version": "1999-01-01" },
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects non-loopback origins with 403", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 5, method: "tools/list" },
      { "mcp-session-id": sessionId, origin: "https://evil.example.com" },
    );
    expect(res.statusCode).toBe(403);
  });

  it("accepts notifications with 202 and no body", async () => {
    const res = await post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { "mcp-session-id": sessionId },
    );
    expect(res.statusCode).toBe(202);
    expect(res.body).toBe("");
  });

  it("lists the five household tools", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 6, method: "tools/list" },
      {
        "mcp-session-id": sessionId,
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      },
    );
    const tools = res.json().result.tools as Array<{ name: string }>;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "acknowledge_incident",
      "get_household_status",
      "get_night_summary",
      "list_incidents",
      "list_recent_nights",
    ]);
  });

  it("calls get_household_status and reports the armed state", async () => {
    const res = await post(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "get_household_status", arguments: {} },
      },
      { "mcp-session-id": sessionId },
    );
    const content = res.json().result.content[0];
    expect(content.type).toBe("text");
    const status = JSON.parse(content.text);
    expect(status.simulated).toBe(true);
    expect(status.inWarmup).toBe(false);
    expect(status.incidentCount).toBe(3);
  });

  it("summarizes the voice-resolved night of 2026-09-23", async () => {
    const res = await post(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "get_night_summary", arguments: { date: "2026-09-23" } },
      },
      { "mcp-session-id": sessionId },
    );
    const night = JSON.parse(res.json().result.content[0].text);
    expect(night.found).toBe(true);
    expect(night.caregiverSlept).toBe(true);
    expect(night.summary).toContain("familiar voice");
  });

  it("acknowledge_incident reports nothing to acknowledge when all incidents are closed", async () => {
    const res = await post(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "acknowledge_incident", arguments: {} },
      },
      { "mcp-session-id": sessionId },
    );
    const out = JSON.parse(res.json().result.content[0].text);
    expect(out.acknowledged).toBe(false);
  });

  it("returns a JSON-RPC error for unknown tools and unknown methods", async () => {
    const badTool = await post(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "does_not_exist", arguments: {} },
      },
      { "mcp-session-id": sessionId },
    );
    expect(badTool.json().error.code).toBe(-32602);

    const badMethod = await post(
      { jsonrpc: "2.0", id: 11, method: "resources/list" },
      { "mcp-session-id": sessionId },
    );
    expect(badMethod.json().error.code).toBe(-32601);
  });

  it("GET /mcp responds 405 with an Allow header", async () => {
    const res = await app.inject({ method: "GET", url: "/mcp" });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toContain("POST");
  });

  it("DELETE terminates the session; later requests get 404", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: "/mcp",
      headers: { "mcp-session-id": sessionId },
    });
    expect(del.statusCode).toBe(204);
    const after = await post(
      { jsonrpc: "2.0", id: 12, method: "tools/list" },
      { "mcp-session-id": sessionId },
    );
    expect(after.statusCode).toBe(404);
  });
});

/**
 * Regression: a real MCP client (the Strands agent in apps/agent) sends
 * DELETE with a JSON content-type and an empty body when terminating a
 * session. That produced a 500 until the content-type parser accepted an
 * empty payload. The original conformance test missed it because inject()
 * sends no content-type unless asked.
 */
describe("MCP session termination from a real client", () => {
  it("accepts DELETE carrying a JSON content-type and an empty body", async () => {
    const { app } = buildServer();
    const init = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "c", version: "1" } },
      }),
    });
    const sessionId = init.headers["mcp-session-id"] as string;

    const del = await app.inject({
      method: "DELETE",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": sessionId },
      payload: "",
    });
    expect(del.statusCode).toBe(204);
    await app.close();
  });

  it("answers a malformed body with -32700 rather than a transport 500", async () => {
    // JSON-RPC is specific: a body the server cannot parse is a Parse error
    // in the protocol, not a server failure. A 500 tells a client to retry
    // something that will never succeed, and leaks the framework's error
    // envelope besides. Found by scripts/mcp-conform.mjs against the live
    // Lambda, where it returned Fastify's own 500 body.
    const { app } = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: "{ this is not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe(-32700);
    await app.close();
  });

  it("a malformed webhook body is rejected on its signature first, then its shape", async () => {
    // The same parser serves the Ring webhook route, so the fix has to leave
    // that route refusing an unsigned request before it says anything at all
    // about the contents.
    const { app } = buildServer();
    const unsigned = await app.inject({
      method: "POST",
      url: "/webhooks/ring",
      headers: { "content-type": "application/json" },
      payload: "{ this is not json",
    });
    expect(unsigned.statusCode).toBe(401);

    const secret = "nightlight-demo-secret";
    const body = "{ this is not json";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const signed = await app.inject({
      method: "POST",
      url: "/webhooks/ring",
      headers: { "content-type": "application/json", "x-signature": signature },
      payload: body,
    });
    expect(signed.statusCode).toBe(400);
    await app.close();
  });
});
