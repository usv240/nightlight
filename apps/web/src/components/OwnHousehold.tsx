"use client";

import { useState } from "react";
import { MCP_URL } from "./McpProof";

/**
 * A household of your own, from this page.
 *
 * Everything above runs on one labelled demo household that everybody
 * shares. A key is a household nobody else can see: one press issues one,
 * free and with no account, a second replays a simulated month into it
 * through the real signed-webhook path, and the table puts the result next
 * to the demo household, which the replay did not touch. The curl beneath
 * is how a judge brings their own doorbell's events instead.
 */

const BACKEND = MCP_URL.replace(/\/mcp$/, "");

interface Summary {
  simulated: boolean;
  nights: { undisturbed: boolean }[];
  incidentCount: number;
}

async function summary(key: string | null): Promise<Summary> {
  const res = await fetch(`${BACKEND}/api/summary`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
  if (!res.ok) throw new Error(`summary: HTTP ${res.status}`);
  return (await res.json()) as Summary;
}

export function OwnHousehold() {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ before: Summary; mine: Summary; demo: Summary; seed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/v1/keys`, { method: "POST" });
      setKey(((await res.json()) as { key: string }).key);
      setRows(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const replay = async () => {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const seed = 100 + Math.floor(Math.random() * 900);
      const before = await summary(key);
      const res = await fetch(`${BACKEND}/api/demo/replay`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ seed }),
      });
      if (!res.ok) throw new Error(`replay: HTTP ${res.status}`);
      const [mine, demo] = await Promise.all([summary(key), summary(null)]);
      setRows({ before, mine, demo, seed });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const slept = (s: Summary) => s.nights.filter((n) => n.undisturbed).length;
  const button =
    "rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-3 text-sm font-medium text-[var(--primary-contrast)] transition-opacity hover:opacity-90 disabled:opacity-60";
  const code =
    "mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface-raised p-3 font-mono text-[12px] leading-relaxed text-ink";

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[640px]">
          <span className="rounded-full bg-night-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
            Your own household
          </span>
          <p className="mt-3 leading-relaxed text-muted">
            Everything above is one labelled demo household that everybody shares, and it needs no
            key. Take a key for a household nobody else can see: free, no account. Nothing about
            the key is stored, so keep it.
          </p>
        </div>
        <button type="button" onClick={() => void issue()} disabled={busy} className={button}>
          {busy && !key ? "Issuing…" : key ? "Another key" : "Get an API key"}
        </button>
      </div>

      {key && (
        <>
          <pre className={code}>{key}</pre>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => void replay()} disabled={busy} className={button}>
              {busy ? "Replaying…" : "Replay a month into my household"}
            </button>
            <p className="text-sm text-muted">Every event signed and verified the way Ring's are. The demo household is not touched.</p>
          </div>

          {rows && (
            <>
            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2 font-medium">Household</th>
                  <th className="pb-2 font-medium">Nights</th>
                  <th className="pb-2 font-medium">Caregiver slept</th>
                  <th className="pb-2 font-medium">Incidents</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="py-2 text-ink">Yours, before the replay</td>
                  <td className="py-2 font-mono text-[12px]">{rows.before.nights.length}</td>
                  <td className="py-2 font-mono text-[12px]">{slept(rows.before)}</td>
                  <td className="py-2 font-mono text-[12px]">{rows.before.incidentCount}</td>
                </tr>
                <tr className="border-t border-line">
                  <td className="py-2 text-ink">Yours, after (simulated month, seed {rows.seed})</td>
                  <td className="py-2 font-mono text-[12px]">{rows.mine.nights.length}</td>
                  <td className="py-2 font-mono text-[12px]">{slept(rows.mine)}</td>
                  <td className="py-2 font-mono text-[12px]">{rows.mine.incidentCount}</td>
                </tr>
                <tr className="border-t border-line">
                  <td className="py-2 text-ink">The shared demo, unchanged</td>
                  <td className="py-2 font-mono text-[12px]">{rows.demo.nights.length}</td>
                  <td className="py-2 font-mono text-[12px]">{slept(rows.demo)}</td>
                  <td className="py-2 font-mono text-[12px]">{rows.demo.incidentCount}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">
              The simulated month scripts the same three incidents every time; the seed moves their timings. Your own
              events, below, are what make a household genuinely different.
            </p>
            </>
          )}

          <p className="mt-6 text-sm text-muted">Bring your own doorbell&apos;s events instead, with the same key:</p>
          <pre className={code}>{`curl -X POST ${BACKEND}/api/events \\
  -H "authorization: Bearer ${key}" -H "content-type: application/json" \\
  -d '{"events":[{"ts":"2026-10-14T02:40:00Z","type":"motion_detected"}]}'`}</pre>
          <p className="mt-6 text-sm text-muted">And ask about it from any MCP client:</p>
          <pre className={code}>{JSON.stringify({ mcpServers: { nightlight: { url: MCP_URL, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)}</pre>
        </>
      )}

      {error && (
        <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--danger)] bg-danger-soft p-4 text-sm text-ink">{error}</p>
      )}
    </div>
  );
}
