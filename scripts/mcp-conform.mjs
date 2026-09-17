#!/usr/bin/env node
/**
 * A Model Context Protocol conformance probe, run over real HTTP against a
 * deployed server.
 *
 *   node scripts/mcp-conform.mjs                      # our live server
 *   node scripts/mcp-conform.mjs <url> [<url> ...]    # any MCP server
 *   node scripts/mcp-conform.mjs --all                # all three of ours
 *
 * No install, no dependencies, no MCP client library. Node 18 or newer.
 *
 * Why this exists
 * ---------------
 * The conformance tests in this repository check the same protocol rules,
 * but they do it through an in-process test client: no socket, no proxy, no
 * Lambda function URL, no CloudFront. That is the right way to test a
 * handler and the wrong way to believe a claim about a deployed service,
 * because everything between the handler and the internet is exactly what
 * an in-process client skips.
 *
 * This file is byte-identical in all three repositories apart from its
 * default URL, which is the point: one probe, three servers, two frameworks.
 *
 * It is also the only way a reviewer can check the claim. Opening an MCP
 * URL in a browser shows an error, because the protocol is a POST with a
 * session handshake. This turns "the MCP server is live and spec correct"
 * from something you take our word for into one command.
 *
 * It has earned that twice. The first run against the deployed Lambdas
 * found that a malformed body returned HTTP 500 with the framework's own
 * error envelope instead of a JSON-RPC -32700, in two of the three servers.
 * Every injected test passed while the live servers were wrong. The earlier
 * cousin of that bug, a DELETE with a JSON content-type and an empty body,
 * is the shape real clients send on session termination and is checked
 * here too.
 *
 * What it checks, and how honestly
 * --------------------------------
 * Spec revision 2025-11-25, Streamable HTTP transport. Checks are graded:
 *
 *   MUST   the spec requires it; a failure here is a real defect
 *   SHOULD the spec recommends it; a failure is reported, not fatal
 *
 * Only MUST failures set a non-zero exit code. A conformance tool that
 * grades its own preferences as violations is worse than none, because it
 * teaches people to ignore it. Where the spec permits more than one
 * behaviour, such as answering GET with a stream or declining it with 405,
 * the probe accepts either and says which one it saw.
 */

const DEFAULT_URL =
  "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws/mcp";

/**
 * The three servers built for this hackathon. The point of --all is that
 * the same probe holds against two different frameworks: Nightlight and
 * EveryWord are Fastify on Node, Bellwether is FastAPI on Python. A
 * conformance claim that has only ever met one implementation is a claim
 * about that implementation.
 */
const SIBLINGS = [
  "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws/mcp",
  "https://bgvgejdhfhlu2inavg23d5dkj40eggxt.lambda-url.us-east-1.on.aws/mcp",
  "https://bppni6dpuntpbynfydk52gexue0xulzh.lambda-url.us-east-1.on.aws/mcp",
];

const PROTOCOL_VERSION = "2025-11-25";

const args = process.argv.slice(2);
const urls = args.filter((a) => !a.startsWith("--"));
const targets = args.includes("--all")
  ? SIBLINGS
  : urls.length
    ? urls
    : [process.env.MCP_URL || DEFAULT_URL];

async function probe(url) {
  /** @type {{name: string, grade: "MUST"|"SHOULD", ok: boolean, detail: string}[]} */
  const results = [];

  function record(name, grade, ok, detail) {
    results.push({ name, grade, ok, detail });
    process.stdout.write(`  ${ok ? " ok " : "FAIL"}  ${name}\n        ${detail}\n`);
  }

  async function rpc(body, { headers = {}, method = "POST" } = {}) {
    const res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* some responses are SSE or empty, which is why the text is kept */
    }
    return { res, text, json };
  }

  const initializeBody = (id) => ({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mcp-conform", version: "1.0.0" },
    },
  });

  console.log(`\nTarget: ${url}\n`);

  // -------------------------------------------------------------------------
  // 1. Initialization and session issuance
  // -------------------------------------------------------------------------

  let sessionId = "";
  let serverName = "unknown";

  {
    const { res, json } = await rpc(initializeBody(1));
    const version = json?.result?.protocolVersion;
    sessionId = res.headers.get("mcp-session-id") || "";
    serverName = json?.result?.serverInfo?.name || "unknown";

    record(
      "initialize returns a result",
      "MUST",
      res.status === 200 && !!json?.result,
      res.status === 200 ? `200, serverInfo.name = ${serverName}` : `status ${res.status}`,
    );
    record(
      "initialize reports a protocol version",
      "MUST",
      typeof version === "string" && version.length > 0,
      version ? `protocolVersion = ${version}` : "no protocolVersion in result",
    );
    record(
      "initialize declares a tools capability",
      "SHOULD",
      !!json?.result?.capabilities?.tools,
      json?.result?.capabilities
        ? `capabilities = ${Object.keys(json.result.capabilities).join(", ") || "none"}`
        : "no capabilities object",
    );
    record(
      "initialize issues an MCP-Session-Id",
      "SHOULD",
      sessionId.length > 0,
      sessionId
        ? `session issued, ${sessionId.length} characters`
        : "no MCP-Session-Id header (a stateless server is permitted)",
    );
  }

  const withSession = sessionId
    ? { "mcp-session-id": sessionId, "mcp-protocol-version": PROTOCOL_VERSION }
    : { "mcp-protocol-version": PROTOCOL_VERSION };

  if (!sessionId) {
    console.log("        No session was issued, so the session-scoped checks do not apply.");
  }

  // -------------------------------------------------------------------------
  // 2. Session enforcement
  // -------------------------------------------------------------------------

  if (sessionId) {
    {
      // A request that needs a session but carries none is a client error.
      // Not 404, which means "this session existed and is gone" and would
      // send a client off to start a new one it already has.
      const { res } = await rpc(
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        { headers: { "mcp-protocol-version": PROTOCOL_VERSION } },
      );
      record(
        "a session-scoped request without a session id is rejected",
        "MUST",
        res.status === 400,
        `status ${res.status}${res.status === 404 ? " (404 conflates missing with expired)" : ""}`,
      );
    }
    {
      const { res } = await rpc(
        { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
        { headers: { ...withSession, "mcp-session-id": "definitely-not-a-real-session" } },
      );
      record(
        "an unknown session id is rejected as gone, not as malformed",
        "MUST",
        res.status === 404,
        `status ${res.status}`,
      );
    }
    {
      const { res } = await rpc(
        { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
        { headers: { ...withSession, "mcp-protocol-version": "1999-01-01" } },
      );
      record(
        "an unsupported protocol version is rejected",
        "SHOULD",
        res.status === 400,
        `status ${res.status}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. DNS rebinding protection
  // -------------------------------------------------------------------------

  {
    const { res } = await rpc(initializeBody(5), {
      headers: { origin: "https://attacker.example" },
    });
    const rejected = res.status === 403 || res.status === 400;
    record(
      "a foreign Origin is refused",
      "SHOULD",
      rejected,
      rejected
        ? `status ${res.status}, origin validated`
        : `status ${res.status}. The spec calls for Origin validation on HTTP transports to prevent DNS rebinding`,
    );
  }

  // -------------------------------------------------------------------------
  // 4. Notifications
  // -------------------------------------------------------------------------

  if (sessionId) {
    const { res, text } = await rpc(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { headers: withSession },
    );
    record(
      "a notification is accepted with 202 and no body",
      "MUST",
      res.status === 202 && text.trim() === "",
      `status ${res.status}, body ${text.trim() === "" ? "empty" : `${text.length} bytes`}`,
    );
  }

  // -------------------------------------------------------------------------
  // 5. Tools
  // -------------------------------------------------------------------------

  let firstTool = null;

  if (sessionId) {
    const { res, json } = await rpc(
      { jsonrpc: "2.0", id: 6, method: "tools/list", params: {} },
      { headers: withSession },
    );
    const tools = json?.result?.tools;
    const wellFormed =
      Array.isArray(tools) &&
      tools.length > 0 &&
      tools.every((t) => typeof t.name === "string" && !!t.inputSchema);
    firstTool = wellFormed ? tools[0] : null;

    record(
      "tools/list returns named tools with input schemas",
      "MUST",
      res.status === 200 && wellFormed,
      wellFormed
        ? `${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`
        : `status ${res.status}, ${Array.isArray(tools) ? `${tools.length} tools` : "no tools array"}`,
    );
    record(
      "every tool is described for a human reader",
      "SHOULD",
      wellFormed && tools.every((t) => typeof t.description === "string" && t.description.length > 10),
      wellFormed
        ? `${tools.filter((t) => (t.description || "").length > 10).length} of ${tools.length} carry a description`
        : "not checked",
    );
  }

  if (firstTool) {
    // Call it with no arguments. Either it works, or the server returns a
    // JSON-RPC error. What must not happen is an HTTP 500: a tool that
    // rejects its input is a protocol result, not a transport failure.
    const { res, json } = await rpc(
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: firstTool.name, arguments: {} } },
      { headers: withSession },
    );
    const answered = res.status === 200 && (!!json?.result || !!json?.error);
    record(
      "tools/call answers in the protocol rather than failing the transport",
      "MUST",
      answered,
      answered
        ? `${firstTool.name} returned ${json?.result ? "a result" : `error ${json.error.code}`}`
        : `status ${res.status}`,
    );
  }

  if (sessionId) {
    const { json } = await rpc(
      { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "no_such_tool_exists", arguments: {} } },
      { headers: withSession },
    );
    record(
      "an unknown tool is a JSON-RPC error, not a crash",
      "MUST",
      !!json?.error || json?.result?.isError === true,
      json?.error ? `error ${json.error.code}` : json?.result ? "result with isError" : "neither",
    );

    const unknown = await rpc(
      { jsonrpc: "2.0", id: 9, method: "no/such/method", params: {} },
      { headers: withSession },
    );
    record(
      "an unknown method returns -32601 Method not found",
      "MUST",
      unknown.json?.error?.code === -32601,
      unknown.json?.error ? `error ${unknown.json.error.code}` : "no error object",
    );
  }

  // -------------------------------------------------------------------------
  // 6. GET, which the spec deliberately leaves open
  // -------------------------------------------------------------------------

  {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
    });
    const sse = (res.headers.get("content-type") || "").includes("text/event-stream");
    const declined = res.status === 405;
    record(
      "GET either opens a stream or declines with 405",
      "MUST",
      sse || declined,
      declined
        ? `405, Allow: ${res.headers.get("allow") || "not sent"} (a server with no server-initiated messages may decline)`
        : sse
          ? "an SSE stream"
          : `status ${res.status}, content-type ${res.headers.get("content-type")}`,
    );
    if (declined) {
      record(
        "a 405 names the methods it does allow",
        "SHOULD",
        !!res.headers.get("allow"),
        res.headers.get("allow") ? `Allow: ${res.headers.get("allow")}` : "no Allow header",
      );
    }
    try {
      await res.body?.cancel();
    } catch {
      /* already closed */
    }
  }

  // -------------------------------------------------------------------------
  // 7. Malformed input
  // -------------------------------------------------------------------------

  {
    const { json, res } = await rpc("{ this is not json", { headers: withSession });
    const ok = json?.error?.code === -32700;
    record(
      "malformed JSON returns -32700, not a transport 500",
      "SHOULD",
      ok,
      ok
        ? "error -32700"
        : `status ${res.status}${json?.error ? `, error ${json.error.code}` : ", no JSON-RPC error object"}`,
    );
  }

  // -------------------------------------------------------------------------
  // 8. Session termination, in the shape real clients send
  // -------------------------------------------------------------------------

  if (sessionId) {
    // A real MCP client sends DELETE with a JSON content-type and no body
    // at all. A body parser configured for JSON reads zero bytes and calls
    // that a parse error, which surfaces as a 500 on a request that should
    // be trivially successful.
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "mcp-session-id": sessionId,
        "mcp-protocol-version": PROTOCOL_VERSION,
      },
    });
    const ok = res.status < 300;
    record(
      "DELETE with a JSON content-type and an empty body terminates the session",
      "MUST",
      ok,
      ok
        ? `status ${res.status}`
        : `status ${res.status}. This is the shape real clients send; an empty body with a JSON content-type must not be read as malformed JSON`,
    );

    const after = await rpc(
      { jsonrpc: "2.0", id: 10, method: "tools/list", params: {} },
      { headers: withSession },
    );
    record("the terminated session is gone", "MUST", after.res.status === 404, `status ${after.res.status}`);
  }

  const must = results.filter((r) => r.grade === "MUST");
  const should = results.filter((r) => r.grade === "SHOULD");
  const mustFailed = must.filter((r) => !r.ok);
  const shouldFailed = should.filter((r) => !r.ok);

  console.log(
    `\n${serverName}: ${must.length - mustFailed.length} of ${must.length} MUST, ` +
      `${should.length - shouldFailed.length} of ${should.length} SHOULD.`,
  );
  for (const r of mustFailed) console.log(`  MUST failure: ${r.name}: ${r.detail}`);
  for (const r of shouldFailed) console.log(`  SHOULD failure, not fatal: ${r.name}: ${r.detail}`);

  return { url, serverName, mustFailed: mustFailed.length, shouldFailed: shouldFailed.length };
}

console.log(`\nMCP conformance probe, spec ${PROTOCOL_VERSION}, over real HTTP`);

const all = [];
for (const target of targets) {
  try {
    all.push(await probe(target));
  } catch (err) {
    console.log(`\nTarget: ${target}\n  FAIL  unreachable\n        ${err.message}`);
    all.push({ url: target, serverName: "unreachable", mustFailed: 1, shouldFailed: 0 });
  }
}

if (all.length > 1) {
  console.log("\nSummary");
  for (const r of all) {
    console.log(
      `  ${r.mustFailed || r.shouldFailed ? "FAIL" : " ok "}  ${r.serverName.padEnd(16)} ${r.url}`,
    );
  }
}

process.exit(all.some((r) => r.mustFailed) ? 1 : 0);
