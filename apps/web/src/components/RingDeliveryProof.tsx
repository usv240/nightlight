"use client";

import { useState } from "react";
import { InfoButton } from "./InfoButton";

/**
 * The Ring integration, shown rather than claimed.
 *
 * Every other number on this site is checkable. The Ring integration was
 * the exception: the page said webhooks were verified and signed, and a
 * reader had to take that on faith or go and read the source. This panel
 * removes the faith. One press performs three real signed deliveries
 * against the deployed backend and prints what the production route did
 * with each.
 *
 * The two failures are the reason it is worth pressing. A success proves
 * almost nothing; anybody can draw a green tick. What a family is
 * trusting is that a forged delivery cannot play audio into their home at
 * 3am and that a retry cannot play it twice, and those are the rows that
 * say so.
 */

const BACKEND = (
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws"
).replace(/\/$/, "");

interface Delivery {
  label: string;
  request: { method: string; path: string; signatureHeader: string; body: string };
  response: { status: number; body: unknown };
  verdict: "accepted" | "rejected" | "deduplicated";
  explain: string;
}

interface Result {
  deliveries: Delivery[];
  engine: { incidents: number; effect: string | null };
  transport: string;
  sandbox: boolean;
  ms: number;
}

const VERDICT: Record<Delivery["verdict"], { text: string; className: string }> = {
  accepted: { text: "Accepted", className: "bg-success-soft text-[var(--success)]" },
  rejected: { text: "Rejected", className: "bg-danger-soft text-[var(--danger)]" },
  deduplicated: { text: "Ignored as duplicate", className: "bg-accent-soft text-[var(--accent)]" },
};

/** Shorten a signature for the screen without pretending it is shorter. */
function shortSig(hex: string): string {
  return hex.length > 24 ? `${hex.slice(0, 12)}...${hex.slice(-8)}` : hex;
}

/** The envelope, pretty printed, so a viewer can see it really is Ring's shape. */
function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 1);
  } catch {
    return body;
  }
}

export function RingDeliveryProof() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState("running");
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/ring/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`the backend answered ${res.status}`);
      setResult((await res.json()) as Result);
      setState("done");
    } catch (err) {
      // A proof that fails must look like a failure, never like a blank
      // table that a viewer reads as success.
      setError((err as Error).message);
      setState("error");
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-night-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
          Ring Partner API
        </span>
        <h3 className="text-xl font-semibold tracking-tight">
          A signed Ring webhook, delivered live
          <InfoButton id="ring-delivery" />
        </h3>
      </div>

      <p className="mt-4 max-w-[760px] leading-relaxed text-muted">
        Ring signs every webhook it sends with HMAC SHA-256 over the raw
        request body. Press this and Nightlight will sign three deliveries
        the way Ring does and post them to the same{" "}
        <code className="rounded bg-night-soft px-1.5 py-0.5 font-mono text-[13px]">
          /webhooks/ring
        </code>{" "}
        endpoint a real doorbell posts to. The first is genuine. The other
        two are the ones that matter.
      </p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "running"}
        className="mt-6 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-3 text-sm font-medium text-[var(--primary-contrast)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === "running"
          ? "Delivering to the live endpoint..."
          : state === "idle"
            ? "Send three Ring deliveries"
            : "Send them again"}
      </button>

      <div aria-live="polite">
        {state === "error" && (
          <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--danger)] bg-danger-soft p-4 text-sm text-[var(--danger)]">
            The live endpoint could not be reached: {error}. Nothing is being
            shown in its place.
          </p>
        )}

        {state === "done" && result && (
          <>
            <ol className="mt-8 space-y-4">
              {result.deliveries.map((d, i) => (
                <li
                  key={d.label}
                  className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-[640px] font-medium text-ink">
                      <span className="mr-2 font-mono text-sm text-muted">{i + 1}</span>
                      {d.label}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${VERDICT[d.verdict].className}`}
                    >
                      {d.response.status} {VERDICT[d.verdict].text}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{d.explain}</p>
                  <dl className="mt-4 grid gap-2 font-mono text-[12px] leading-relaxed text-muted sm:grid-cols-[92px_1fr]">
                    <dt className="text-ink">POST</dt>
                    <dd className="break-all">{d.request.path}</dd>
                    <dt className="text-ink">X-Signature</dt>
                    <dd className="break-all">{shortSig(d.request.signatureHeader)}</dd>
                    <dt className="text-ink">response</dt>
                    <dd className="break-all">{JSON.stringify(d.response.body)}</dd>
                  </dl>
                  {i === 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-[var(--primary)]">
                        The envelope Ring sends
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded bg-night-soft p-3 font-mono text-[12px] leading-relaxed text-muted">
                        {pretty(d.request.body)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ol>

            <p className="mt-6 text-sm leading-relaxed text-muted">
              <span className="font-medium text-ink">What the engine did: </span>
              {result.engine.effect
                ? `${result.engine.effect}. `
                : "no effect was executed. "}
              Verification is the published{" "}
              <a
                href="https://www.npmjs.com/package/ring-webhook-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--primary)] underline underline-offset-2"
              >
                ring-webhook-kit
              </a>{" "}
              package, the same code the deployed backend runs.
            </p>

            {/*
              Said on the page rather than in a footnote. The proof is worth
              nothing if the one caveat it carries is invisible, and a
              reader who finds out later that the household was a sandbox
              is right to distrust everything else here.
            */}
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Real: the envelope, the signature, the HTTP request, the route,
              the verification and the engine's decision, in {result.ms}ms.
              Sandboxed: the household. These deliveries land in a throwaway
              instance so that pressing this button cannot move the
              thirty-night month published above.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
