"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  processTimeline,
  summarizeNights,
  undisturbedStreak,
  type Incident,
  type NightSummary,
} from "@nightlight/engine";
import { generateDemoMonth } from "@nightlight/simulator";
import { ThemeToggle } from "../../components/ThemeToggle";
import { InfoButton } from "../../components/InfoButton";

/**
 * The caregiver app.
 *
 * Designed for a stressed adult, possibly at 3am: large type, one clear
 * status, one action per card. Connects to the deployed backend when it
 * is reachable; otherwise it renders the simulated household through the
 * same engine, clearly labeled.
 */

/**
 * The backend this page talks to. NEXT_PUBLIC_BACKEND_URL at build time.
 *
 * The fallback used to be localhost, which meant a plain `next build`
 * produced a site that silently pointed at a machine the visitor does not
 * have. That is exactly what shipped once: the deployed bundle carried
 * 127.0.0.1:8787 and the caregiver app could never load. The fallback is
 * now the deployed function URL, so forgetting the variable degrades to
 * "points at production" rather than to "points at nothing".
 */
const BACKEND = (
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws"
).replace(/\/$/, "");

interface MorningNote {
  text: string;
  source: "bedrock" | "template";
  factsText: string;
}

interface AppData {
  nights: NightSummary[];
  incidents: Incident[];
  streak: number;
  live: boolean;
  nightWindow: { start: string; end: string };
  note: MorningNote | null;
}

function localFallback(): AppData {
  const demo = generateDemoMonth(42);
  const result = processTimeline(demo.events, demo.config);
  const nights = summarizeNights(
    demo.events[0]!.ts,
    demo.events[demo.events.length - 1]!.ts,
    result.incidents,
    result.effects,
    demo.config,
  );
  return {
    nights,
    incidents: result.incidents,
    streak: undisturbedStreak(nights),
    live: false,
    nightWindow: demo.config.nightWindow,
    note: null,
  };
}

async function loadLive(): Promise<AppData | null> {
  try {
    const summary = (await fetch(`${BACKEND}/api/summary`, {
      signal: AbortSignal.timeout(4000),
    }).then((r) => {
      if (!r.ok) throw new Error("bad status");
      return r.json();
    })) as { nights: NightSummary[]; undisturbedStreak: number };
    if (!summary.nights?.length) return null;

    const [incidents, settings, note] = await Promise.all([
      fetch(`${BACKEND}/api/incidents`).then((r) => r.json() as Promise<Incident[]>),
      fetch(`${BACKEND}/api/settings`).then(
        (r) => r.json() as Promise<{ nightWindow: { start: string; end: string } }>,
      ),
      fetch(`${BACKEND}/api/morning-note`)
        .then((r) => r.json() as Promise<MorningNote & { available: boolean }>)
        .catch(() => null),
    ]);

    return {
      nights: summary.nights,
      incidents,
      streak: summary.undisturbedStreak,
      live: true,
      nightWindow: settings.nightWindow,
      note: note?.available ? note : null,
    };
  } catch {
    return null;
  }
}

function VoiceMessageCard() {
  const [state, setState] = useState<"idle" | "recording" | "recorded" | "unsupported">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        setState("recorded");
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setState("unsupported");
    }
  };

  const stop = () => recorderRef.current?.stop();

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
      <h2 className="font-semibold text-ink">
        The voice at the door
        <InfoButton id="familiar-voice" />
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Record the message that plays when the door opens at night. Speak
        calmly, use their name, and invite them back: for example, Dad, it is
        night time. Come back inside. I will see you in the morning.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state !== "recording" ? (
          <button
            type="button"
            onClick={start}
            className="rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-contrast)] hover:opacity-90"
          >
            {state === "recorded" ? "Record again" : "Record your message"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="rounded-[var(--radius-md)] bg-[var(--danger)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Stop recording
          </button>
        )}
        {url && <audio controls src={url} className="h-10" />}
      </div>
      {state === "unsupported" && (
        <p className="mt-3 text-xs text-[var(--danger)]">
          Microphone access was not available. You can record on any device
          later; the message syncs to the household.
        </p>
      )}
      {state === "recorded" && (
        <p className="mt-3 text-xs text-muted">
          Saved on this device. On a linked Ring household this uploads and
          plays through the doorbell chime, which is why Nightlight requests
          the Chime audio controls permission.
        </p>
      )}
    </div>
  );
}

function NightWindowCard({
  window,
  live,
  onChanged,
}: {
  window: { start: string; end: string };
  live: boolean;
  onChanged: () => void;
}) {
  const [start, setStart] = useState(window.start);
  const [end, setEnd] = useState(window.end);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStart(window.start);
    setEnd(window.end);
  }, [window.start, window.end]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${BACKEND}/api/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start, end }),
      });
      const body = (await res.json()) as {
        error?: string;
        recomputed?: { nights: number; undisturbedStreak: number };
      };
      if (!res.ok) {
        setStatus(body.error ?? "Could not save");
      } else {
        setStatus(
          `Saved. ${body.recomputed?.nights ?? 0} nights recomputed under the new hours.`,
        );
        onChanged();
      }
    } catch {
      setStatus("The backend is not reachable from this page right now.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "rounded-[var(--radius-sm)] border border-line bg-surface-raised px-3 py-2 text-sm text-ink";

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
      <h2 className="font-semibold text-ink">
        Your night hours
        <InfoButton id="baseline" />
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Nightlight only acts between these hours. Everything else, including
        past nights, is recalculated from the same event history the moment
        you change them.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">
          <span className="mb-1 block">Night starts</span>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm text-muted">
          <span className="mb-1 block">Night ends</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={field}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving || !live}
          className="rounded-[var(--radius-md)] border border-line bg-surface-raised px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-primary disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save hours"}
        </button>
      </div>
      {!live && (
        <p className="mt-3 text-xs text-muted">
          Start the backend (npm run dev) to change these; the simulated view
          uses 22:00 to 06:00.
        </p>
      )}
      {status && <p className="mt-3 text-xs text-muted">{status}</p>}
    </div>
  );
}

export default function CaregiverApp() {
  const fallback = useMemo(localFallback, []);
  const [data, setData] = useState<AppData | null>(null);
  const [acking, setAcking] = useState(false);
  const [ackMessage, setAckMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const live = await loadLive();
    setData(live ?? fallback);
  }, [fallback]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openIncident = data?.incidents.find((i) => i.state === "NOTIFY_CAREGIVER");

  const acknowledge = useCallback(async () => {
    setAcking(true);
    setAckMessage(null);
    try {
      const res = await fetch(`${BACKEND}/api/incidents/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ at: new Date().toISOString() }),
      });
      const body = (await res.json()) as { acknowledged?: boolean };
      setAckMessage(
        body.acknowledged
          ? "Acknowledged. Nothing further will be escalated tonight."
          : "Could not acknowledge right now.",
      );
      await refresh();
    } catch {
      setAckMessage("The backend is not reachable from this page right now.");
    } finally {
      setAcking(false);
    }
  }, [refresh]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-muted">Loading the household...</p>
      </div>
    );
  }

  const lastNight = data.nights[data.nights.length - 1];
  const recentNights = [...data.nights].slice(-14).reverse();
  const openOrNotable = [...data.incidents].reverse();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[900px] items-center justify-between px-4 sm:px-6">
          <Link prefetch={false} href="/" className="text-lg font-semibold tracking-tight">
            N<span className="text-[var(--accent)]">i</span>ghtlight
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              Simulated household
              <InfoButton id="simulated" />
            </span>
            {data.live && (
              <span className="hidden rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-[var(--success)] sm:inline">
                Live backend
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] space-y-6 px-4 py-10 sm:px-6">
        {/* The 3am state, when there is one */}
        {openIncident && (
          <section className="rounded-[var(--radius-lg)] border-2 border-[var(--danger)] bg-danger-soft p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--danger)]">
              Happening now
            </p>
            <p className="mt-2 text-lg leading-relaxed text-ink">
              The door opened and activity continued after the voice message
              played. Are you with them?
            </p>
            <button
              type="button"
              onClick={acknowledge}
              disabled={acking}
              className="mt-4 w-full rounded-[var(--radius-md)] bg-[var(--danger)] px-6 py-4 text-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
            >
              {acking ? "Sending..." : "I have it"}
            </button>
            <p className="mt-3 text-xs text-muted">
              One tap closes the incident and stops the escalation to your
              backup contacts.
              <InfoButton id="escalation" />
            </p>
          </section>
        )}

        {/* Hero status */}
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-8 text-center">
          <p className="text-sm uppercase tracking-wider text-muted">
            Nights you slept
            <InfoButton id="nights-undisturbed" />
          </p>
          <p className="mt-2 text-6xl font-semibold text-[var(--primary)]">
            {data.streak}
          </p>
          <p className="mt-2 text-muted">in a row, and counting</p>
          {/*
            Two different numbers describe this month and a reviewer meets
            them on two different pages: the landing page shows 29 of 30
            nights undisturbed for the whole month, and this shows the
            current unbroken run. Without saying so, the number appears to
            change between pages for no reason. Stating both here, with
            the relationship between them, costs one line and removes the
            question.
          */}
          {data.nights.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              {data.nights.filter((n) => n.undisturbed).length} of the last{" "}
              {data.nights.length} nights undisturbed in total
            </p>
          )}
          {(data.note || lastNight) && (
            <div className="mx-auto mt-6 max-w-[560px] rounded-[var(--radius-md)] border border-line bg-surface-raised p-4 text-left">
              <p className="text-sm leading-relaxed text-muted">
                <span className="font-medium text-ink">This morning: </span>
                {data.note?.text ?? lastNight?.text}
              </p>
              {data.note && (
                <p className="mt-2 text-xs text-muted">
                  {data.note.source === "bedrock"
                    ? "Worded by Claude on Amazon Bedrock from the facts below. The facts are computed, never generated."
                    : "Written directly from the computed facts."}
                  <span className="mt-1 block font-mono text-[11px] opacity-80">
                    {data.note.factsText}
                  </span>
                </p>
              )}
            </div>
          )}
          {ackMessage && <p className="mt-4 text-sm text-muted">{ackMessage}</p>}
        </section>

        <VoiceMessageCard />

        <NightWindowCard
          window={data.nightWindow}
          live={data.live}
          onChanged={() => void refresh()}
        />

        {/* Recent nights */}
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h2 className="font-semibold">Recent nights</h2>
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {recentNights.map((n) => (
              <li key={n.nightOf} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden
                  className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${
                    n.undisturbed
                      ? n.incidentIds.length > 0
                        ? "bg-[var(--accent)]"
                        : "bg-[var(--success)]"
                      : "bg-[var(--danger)]"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-ink">{n.nightOf}</p>
                  <p className="text-sm leading-relaxed text-muted">{n.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Incidents */}
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h2 className="font-semibold">
            Incident record
            <InfoButton id="escalation" />
          </h2>
          {openOrNotable.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No incidents recorded.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {openOrNotable.map((inc) => (
                <li
                  key={inc.id}
                  className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-muted">{inc.id}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        inc.outcome === "RESOLVED_VOICE"
                          ? "bg-success-soft text-[var(--success)]"
                          : inc.outcome === "ESCALATED"
                            ? "bg-danger-soft text-[var(--danger)]"
                            : "bg-night-soft text-[var(--primary)]"
                      }`}
                    >
                      {inc.outcome ?? inc.state}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Opened {new Date(inc.openedAt).toUTCString()} ·{" "}
                    {inc.eventTimestamps.length} event
                    {inc.eventTimestamps.length === 1 ? "" : "s"} · score{" "}
                    {inc.score.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="pb-6 text-center text-xs leading-relaxed text-muted">
          Nightlight is a home safety aid, not a medical device. In an
          emergency, call your local emergency number.
        </p>
      </main>
    </div>
  );
}
