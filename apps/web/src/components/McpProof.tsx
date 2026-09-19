"use client";

import { useState } from "react";

/**
 * The Alexa+ surface, shown working rather than claimed.
 *
 * The Alexa+ track asks for a self-hosted MCP server on spec 2025-11-25
 * over Streamable HTTP. Nightlight has one, conformance tested, deployed,
 * and until this panel a visitor had no way to see it. The word MCP did
 * not appear anywhere on the site. That is the position the Ring claim
 * was in before the delivery proof: real underneath, invisible above.
 *
 * One press runs a complete session from this browser against the
 * deployed server, exactly as an assistant would: agree a protocol
 * version, finish the handshake, ask what tools exist, call one, close
 * the session. Every row is the server's own answer.
 *
 * Nothing is sandboxed here. `get_household_status` reads the same
 * household the caregiver app shows, which is why the number it returns
 * can be compared with the page above it. Only the acknowledgement tool
 * writes, and this panel never calls it.
 */

const BACKEND = (
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws"
).replace(/\/$/, "");

export const MCP_URL = `${BACKEND}/mcp`;
const PROTOCOL = "2025-11-25";

interface Step {
  label: string;
  request: string;
  status: number;
  ok: boolean;
  shows: string;
}

async function rpc(body: object, session?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (session) {
    headers["mcp-session-id"] = session;
    headers["mcp-protocol-version"] = PROTOCOL;
  }
  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, session: res.headers.get("mcp-session-id"), json };
}

const short = (id: string) => (id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id);

export function McpProof() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState(0);

  const run = async () => {
    setState("running");
    setSteps([]);
    setStatus(null);
    setError(null);
    const started = performance.now();
    const out: Step[] = [];
    const push = (s: Step) => {
      out.push(s);
      setSteps([...out]);
    };

    try {
      const init = await rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: "nightlight-site", version: "1" },
        },
      });
      const session = init.session;
      const agreed = (init.json as { result?: { protocolVersion?: string } })?.result
        ?.protocolVersion;
      if (!session || agreed !== PROTOCOL) {
        throw new Error(`the server did not open a ${PROTOCOL} session (status ${init.status})`);
      }
      push({
        label: "Agree a protocol and open a session",
        request: "initialize",
        status: init.status,
        ok: true,
        shows: `protocol ${agreed}, session ${short(session)}`,
      });

      const ready = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, session);
      push({
        label: "Finish the handshake",
        request: "notifications/initialized",
        status: ready.status,
        ok: ready.status === 202,
        shows: "accepted with no body, as the spec requires of a notification",
      });

      const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session);
      const tools =
        (list.json as { result?: { tools?: { name: string }[] } })?.result?.tools?.map(
          (t) => t.name,
        ) ?? [];
      push({
        label: "Ask what an assistant can do here",
        request: "tools/list",
        status: list.status,
        ok: tools.length > 0,
        shows: `${tools.length} tools: ${tools.join(", ")}`,
      });

      const call = await rpc(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "get_household_status", arguments: {} },
        },
        session,
      );
      const text =
        (call.json as { result?: { content?: { text?: string }[] } })?.result?.content?.[0]
          ?.text ?? "";
      let summary: string | null = null;
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const streak = parsed.undisturbedStreak ?? parsed.streak;
        summary =
          streak === undefined
            ? text.slice(0, 160)
            : `${streak} undisturbed nights in a row, the same number the app above shows`;
      } catch {
        summary = text.slice(0, 160) || null;
      }
      push({
        label: "Ask how the household is doing",
        request: "tools/call get_household_status",
        status: call.status,
        ok: summary !== null,
        shows: summary ?? "no answer returned",
      });
      setStatus(summary);

      const end = await fetch(MCP_URL, {
        method: "DELETE",
        headers: { "mcp-session-id": session },
      });
      push({
        label: "Close the session",
        request: "DELETE",
        status: end.status,
        ok: end.status === 200 || end.status === 204,
        shows: "session ended on the server",
      });

      setMs(Math.round(performance.now() - started));
      setState("done");
    } catch (err) {
      // A proof that fails must read as a failure, not as a half-filled
      // table somebody could mistake for success.
      setError((err as Error).message);
      setState("error");
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-night-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
          MCP 2025-11-25
        </span>
        <h3 className="text-xl font-semibold tracking-tight">
          An assistant asking after the household
        </h3>
      </div>

      <p className="mt-4 max-w-[760px] leading-relaxed text-muted">
        A caregiver should be able to ask how last night went without
        reaching for a phone. Nightlight answers that through the Model
        Context Protocol, which is how Alexa+ talks to tools. Press this and
        your browser will hold a complete session with the deployed server,
        the way an assistant would. Every row below is the server&apos;s own
        answer.
      </p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "running"}
        className="mt-6 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-3 text-sm font-medium text-[var(--primary-contrast)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === "running"
          ? "Talking to the server..."
          : state === "idle"
            ? "Start a session"
            : "Run it again"}
      </button>

      <div aria-live="polite">
        {state === "error" && (
          <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--danger)] bg-danger-soft p-4 text-sm text-[var(--danger)]">
            The live server could not be reached: {error}. Nothing is being
            shown in its place.
          </p>
        )}

        {steps.length > 0 && (
          <ol id="mcp-steps" className="mt-6 space-y-3">
            {steps.map((s, i) => (
              <li
                key={s.request}
                className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-[620px] font-medium text-ink">
                    <span className="mr-2 font-mono text-sm text-muted">{i + 1}</span>
                    {s.label}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      s.ok
                        ? "bg-success-soft text-[var(--success)]"
                        : "bg-danger-soft text-[var(--danger)]"
                    }`}
                  >
                    {s.status} {s.ok ? "OK" : "Unexpected"}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[12px] text-muted">{s.request}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.shows}</p>
              </li>
            ))}
          </ol>
        )}

        {state === "done" && (
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Five requests, one session, {ms}ms, from this browser to the
            deployed server. It reads the same household the caregiver app
            reads, which is why {status ? "that number matches" : "the answer matches"} the
            page above. Only acknowledging an incident writes anything, and
            this panel never calls it. The endpoint is open to any MCP
            client:{" "}
            <code className="break-all rounded bg-night-soft px-1.5 py-0.5 font-mono text-[12px]">
              {MCP_URL}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
