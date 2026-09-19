"use client";

import { useState } from "react";

/**
 * How a real family connects their own Ring doorbell.
 *
 * The rest of this page proves Nightlight works. It never answered the
 * question a family actually asks first, which is "how do I connect
 * mine". The flow is built and registered, and it was invisible, and an
 * invisible flow is indistinguishable from an absent one.
 *
 * This section states the four real steps, marks honestly which are live
 * endpoints today and which waits on Ring certification, and makes the
 * security step checkable rather than described. There is deliberately no
 * "Sign in with Ring" button: Ring's account linking is Ring-initiated
 * and begins in the Ring Appstore, so a button here would have nowhere to
 * go, and a dead button on a page whose whole argument is that claims are
 * checkable would be the one dishonest thing on it.
 */

const BACKEND = (
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws"
).replace(/\/$/, "");

interface LinkCheck {
  label: string;
  input: { accountId: string; ageSeconds: number; nonce: string };
  result: { valid: boolean; reason?: string };
  verdict: "accepted" | "rejected";
  explain: string;
}

interface LinkCheckResult {
  checks: LinkCheck[];
  windowSeconds: number;
  demoKey: boolean;
  ms: number;
}

interface Step {
  n: string;
  title: string;
  body: string;
  endpoint?: string;
  state: "live" | "pending";
}

const STEPS: Step[] = [
  {
    n: "1",
    title: "Install Nightlight from the Ring Appstore",
    body:
      "A family finds Nightlight in the Ring Appstore and chooses to connect it. Ring owns this step, and it is the one that waits on certification. Nightlight is built for the elderly-care category the Appstore currently advertises with no apps in it.",
    state: "pending",
  },
  {
    n: "2",
    title: "Ring sends a signed link request",
    body:
      "Ring redirects the browser to Nightlight's registered Account Link URL with a nonce that cryptographically binds the link to one Ring account. Nightlight validates it before anything else happens. That check is the one you can press below.",
    endpoint: "GET /oauth/ring/link",
    state: "live",
  },
  {
    n: "3",
    title: "Nightlight exchanges Ring's code for tokens",
    body:
      "Ring calls Nightlight's registered Token Exchange URL. Nightlight swaps the authorization code for an access token and a refresh token against oauth.ring.com, stores them, and refreshes them before they expire. A household never sees this step.",
    endpoint: "POST /oauth/ring/token",
    state: "live",
  },
  {
    n: "4",
    title: "The doorbell starts reporting, and Nightlight watches",
    body:
      "Nightlight reads the household's devices and event history, then receives verified webhooks for everything that happens at the door. For the first seven nights it only watches, learning what normal looks like for this household before it will act on anything.",
    endpoint: "GET /api/ring/devices",
    state: "live",
  },
];

export function RingConnect() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<LinkCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState("running");
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/ring/link-check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`the backend answered ${res.status}`);
      setResult((await res.json()) as LinkCheckResult);
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  };

  return (
    <div
      id="ring-connect"
      className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8"
    >
      <h3 className="text-xl font-semibold tracking-tight">
        Connecting your own Ring doorbell
      </h3>
      <p className="mt-4 max-w-[760px] leading-relaxed text-muted">
        Nothing to install and nothing to wear: the doorbell is already on
        the door. This is the whole connection, and where it stands today.
      </p>

      <ol id="ring-steps" className="mt-8 space-y-4">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-[640px] font-medium text-ink">
                <span className="mr-2 font-mono text-sm text-muted">{s.n}</span>
                {s.title}
              </p>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  s.state === "live"
                    ? "bg-success-soft text-[var(--success)]"
                    : "bg-accent-soft text-[var(--accent)]"
                }`}
              >
                {s.state === "live" ? "Live endpoint" : "Needs Ring certification"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
            {s.endpoint && (
              <p className="mt-3 font-mono text-[12px] text-muted">{s.endpoint}</p>
            )}
          </li>
        ))}
      </ol>

      {/*
        Stated up front rather than discovered later. A reader who works
        out for themselves that step one is not available yet is right to
        distrust every green badge above it.
      */}
      <p className="mt-6 max-w-[760px] text-sm leading-relaxed text-muted">
        <span className="font-medium text-ink">Where this actually stands: </span>
        steps two, three and four are deployed and answering now. Step one
        is Ring&apos;s: account linking begins in the Ring Appstore, so a
        household cannot connect a real doorbell until Nightlight is
        certified. That is why this page offers no sign-in button it could
        not honour.
      </p>

      <div className="mt-8 border-t border-line pt-6">
        <h4 className="font-semibold">
          The security step, checked rather than described
        </h4>
        <p className="mt-3 max-w-[760px] leading-relaxed text-muted">
          Step two is the one that matters. Ring binds each link request to
          one account with an HMAC over the account id and a timestamp. Get
          it wrong permissively and somebody attaches their doorbell to
          another family&apos;s household, which here means a stranger&apos;s
          camera feeding a dementia alerting system.
        </p>

        <button
          type="button"
          onClick={() => void run()}
          disabled={state === "running"}
          className="mt-6 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-3 text-sm font-medium text-[var(--primary-contrast)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {state === "running"
            ? "Checking..."
            : state === "idle"
              ? "Check three link requests"
              : "Check them again"}
        </button>

        <div aria-live="polite">
          {state === "error" && (
            <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--danger)] bg-danger-soft p-4 text-sm text-[var(--danger)]">
              The live endpoint could not be reached: {error}. Nothing is
              being shown in its place.
            </p>
          )}

          {state === "done" && result && (
            <>
              <ol className="mt-6 space-y-4">
                {result.checks.map((c, i) => (
                  <li
                    key={c.label}
                    className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="max-w-[620px] font-medium text-ink">
                        <span className="mr-2 font-mono text-sm text-muted">{i + 1}</span>
                        {c.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          c.verdict === "accepted"
                            ? "bg-success-soft text-[var(--success)]"
                            : "bg-danger-soft text-[var(--danger)]"
                        }`}
                      >
                        {c.verdict === "accepted" ? "Link allowed" : "Link refused"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted">{c.explain}</p>
                    <dl className="mt-4 grid gap-2 font-mono text-[12px] leading-relaxed text-muted sm:grid-cols-[92px_1fr]">
                      <dt className="text-ink">account</dt>
                      <dd className="break-all">{c.input.accountId}</dd>
                      <dt className="text-ink">nonce</dt>
                      <dd className="break-all">{c.input.nonce}</dd>
                      <dt className="text-ink">age</dt>
                      <dd>{c.input.ageSeconds}s</dd>
                      <dt className="text-ink">result</dt>
                      <dd className="break-all">
                        {c.result.valid ? "valid" : `refused: ${c.result.reason}`}
                      </dd>
                    </dl>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-sm leading-relaxed text-muted">
                Checked by the same function the deployed Account Link URL
                calls, inside Ring&apos;s {result.windowSeconds / 60} minute
                window, in {result.ms}ms. The account id is a placeholder and
                the signing key is the demo key: this shows the algorithm,
                not custody of a secret. The app&apos;s real Ring signature
                key never leaves the server and never signs anything a
                visitor can ask for.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
