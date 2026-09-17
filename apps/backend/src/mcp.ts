import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { HouseholdRuntime } from "./household";

/**
 * MCP server for Nightlight, implementing the Model Context Protocol
 * spec revision 2025-11-25 over the Streamable HTTP transport.
 *
 * This is the Alexa+ surface: an agent (Alexa+, Claude, or any MCP client)
 * can ask about the household's nights, check the current status, and
 * acknowledge an incident hands-free. Implemented against the spec by hand
 * rather than through an SDK: the transport requirements (session headers,
 * protocol version header, origin validation) are part of what this
 * hackathon entry demonstrates, and implementing them directly also feeds
 * the friction log with first-hand observations.
 *
 * Transport behavior:
 * - POST /mcp: JSON-RPC 2.0 requests and notifications. Responses are
 *   returned as application/json (the spec allows either JSON or SSE for
 *   request responses; this server chooses JSON).
 * - GET /mcp: 405 Method Not Allowed. The spec permits servers that do not
 *   offer a server-initiated SSE stream to respond exactly this way.
 * - DELETE /mcp: terminates the session (204).
 * - MCP-Session-Id: issued on initialize, required on every later request.
 *   Missing session: 400. Unknown or terminated session: 404, after which
 *   the client must re-initialize.
 * - MCP-Protocol-Version: required to match a supported revision when
 *   present; a request with an unsupported version gets 400.
 * - Origin: when present it must be a loopback origin, otherwise 403,
 *   per the spec's DNS-rebinding guidance. Server binds to 127.0.0.1.
 */

export const MCP_PROTOCOL_VERSION = "2025-11-25";
/** Older revision accepted for header-less backwards compatibility only. */
const FALLBACK_PROTOCOL_VERSION = "2025-03-26";

const SERVER_INFO = {
  name: "nightlight-mcp",
  version: "0.1.0",
};

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "get_household_status",
    description:
      "Current status of the Nightlight household: how many days of baseline have been learned, whether the engine is still in its warmup week, the caregiver's undisturbed-nights streak, and the configured night window.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_night_summary",
    description:
      "Plain-language summary of one night. Pass a date (YYYY-MM-DD, the evening the night began) or omit it for the most recent night.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Night date as YYYY-MM-DD; omit for the most recent night",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_recent_nights",
    description:
      "The most recent nights with their outcomes, newest first. Each entry says whether the caregiver was woken and what happened.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 60,
          description: "How many nights to return (default 7)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_incidents",
    description:
      "The household's incident record: when each doorway incident opened, what the system did, and how it ended (resolved by the familiar voice, resolved by the caregiver, or escalated).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "acknowledge_incident",
    description:
      "Acknowledge the currently notifying incident on the caregiver's behalf ('I have it'). Only meaningful while an incident is in the NOTIFY_CAREGIVER state; otherwise reports that there was nothing to acknowledge.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function rpcError(
  id: number | string | null,
  code: number,
  message: string,
): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function rpcResult(
  id: number | string | null,
  result: unknown,
): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function textContent(payload: unknown): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function registerMcp(
  app: FastifyInstance,
  runtime: HouseholdRuntime,
): void {
  const sessions = new Set<string>();

  const checkOrigin = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const origin = req.headers.origin;
    if (origin && !isLoopbackOrigin(origin)) {
      reply.code(403).send(rpcError(null, -32000, "Origin not allowed"));
      return false;
    }
    return true;
  };

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const snap = await runtime.snapshot();
    switch (name) {
      case "get_household_status": {
        const warmup = snap.baselineDays < 7;
        return textContent({
          simulated: true,
          baselineDaysObserved: snap.baselineDays,
          inWarmup: warmup,
          statusText: warmup
            ? "Nightlight is still learning this household and will not act yet."
            : "Nightlight is armed and watching the night window.",
          undisturbedStreak: snap.undisturbedStreak,
          nightWindow: runtime.config.nightWindow,
          timezone: runtime.config.timezone,
          incidentCount: snap.incidents.length,
        });
      }
      case "get_night_summary": {
        const date = typeof args.date === "string" ? args.date : undefined;
        const night = date
          ? snap.nights.find((n) => n.nightOf === date)
          : snap.nights[snap.nights.length - 1];
        if (!night) {
          return textContent({
            found: false,
            message: date
              ? `No record for the night of ${date}.`
              : "No nights recorded yet.",
          });
        }
        return textContent({
          found: true,
          nightOf: night.nightOf,
          caregiverSlept: night.undisturbed,
          summary: night.text,
          incidentIds: night.incidentIds,
        });
      }
      case "list_recent_nights": {
        const limit =
          typeof args.limit === "number" && args.limit >= 1 && args.limit <= 60
            ? Math.floor(args.limit)
            : 7;
        const recent = [...snap.nights].slice(-limit).reverse();
        return textContent(
          recent.map((n) => ({
            nightOf: n.nightOf,
            caregiverSlept: n.undisturbed,
            summary: n.text,
          })),
        );
      }
      case "list_incidents": {
        return textContent(
          snap.incidents.map((i) => ({
            id: i.id,
            openedAt: i.openedAt,
            state: i.state,
            outcome: i.outcome ?? null,
            events: i.eventTimestamps.length,
            flags: i.flags,
          })),
        );
      }
      case "acknowledge_incident": {
        const active = snap.incidents.find(
          (i) => i.state === "NOTIFY_CAREGIVER",
        );
        if (!active) {
          return textContent({
            acknowledged: false,
            message: "No incident is currently waiting for acknowledgement.",
          });
        }
        await runtime.acknowledge(new Date().toISOString());
        return textContent({
          acknowledged: true,
          incidentId: active.id,
          message: "Acknowledged. The incident is closed as resolved by the caregiver.",
        });
      }
      default:
        throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
    }
  };

  app.post("/mcp", async (req, reply) => {
    if (!checkOrigin(req, reply)) return;

    const parsed = req.body as { json?: unknown; parseError?: string } | undefined;
    if (parsed?.parseError) {
      // JSON-RPC is specific here: a body the server cannot parse is -32700,
      // and the HTTP status is a client error rather than a server one.
      return reply.code(400).send(rpcError(null, -32700, "Parse error"));
    }

    const body = parsed?.json;
    if (Array.isArray(body)) {
      return reply
        .code(400)
        .send(rpcError(null, -32600, "Batching is not part of this protocol revision"));
    }
    const msg = body as JsonRpcRequest | undefined;
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return reply.code(400).send(rpcError(null, -32600, "Invalid JSON-RPC request"));
    }

    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    const versionHeader = req.headers["mcp-protocol-version"];
    const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;

    if (
      version !== undefined &&
      version !== MCP_PROTOCOL_VERSION &&
      version !== FALLBACK_PROTOCOL_VERSION
    ) {
      return reply
        .code(400)
        .send(rpcError(msg.id ?? null, -32600, `Unsupported protocol version: ${version}`));
    }

    // Initialization establishes the session.
    if (msg.method === "initialize") {
      const newSession = randomUUID();
      sessions.add(newSession);
      reply.header("MCP-Session-Id", newSession);
      return reply.send(
        rpcResult(msg.id ?? null, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Nightlight watches a household's front door at night and protects the caregiver's sleep. Ask for the household status, a night's summary, or the incident record. All data in this build is a labeled simulated household.",
        }),
      );
    }

    // Every non-initialize message needs an established session.
    if (!sessionId) {
      return reply
        .code(400)
        .send(rpcError(msg.id ?? null, -32600, "Missing MCP-Session-Id header"));
    }
    if (!sessions.has(sessionId)) {
      return reply
        .code(404)
        .send(rpcError(msg.id ?? null, -32001, "Unknown or terminated session"));
    }

    // Notifications get 202 Accepted with no body.
    if (msg.id === undefined || msg.id === null) {
      return reply.code(202).send();
    }

    switch (msg.method) {
      case "ping":
        return reply.send(rpcResult(msg.id, {}));
      case "tools/list":
        return reply.send(rpcResult(msg.id, { tools: TOOLS }));
      case "tools/call": {
        const params = msg.params ?? {};
        const name = typeof params.name === "string" ? params.name : "";
        const args =
          typeof params.arguments === "object" && params.arguments !== null
            ? (params.arguments as Record<string, unknown>)
            : {};
        try {
          const result = await callTool(name, args);
          return reply.send(rpcResult(msg.id, result));
        } catch (err) {
          const code = (err as { code?: number }).code ?? -32603;
          return reply.send(rpcError(msg.id, code, (err as Error).message));
        }
      }
      default:
        return reply.send(rpcError(msg.id, -32601, `Method not found: ${msg.method}`));
    }
  });

  app.get("/mcp", async (_req, reply) => {
    // This server does not offer a server-initiated SSE stream; the spec
    // allows exactly this response for that case.
    return reply.code(405).header("Allow", "POST, DELETE").send();
  });

  app.delete("/mcp", async (req, reply) => {
    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId);
      return reply.code(204).send();
    }
    return reply.code(404).send();
  });
}
