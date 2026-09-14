"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
 * status, one action per card. Connects to the local backend when it is
 * running; otherwise it renders the simulated household through the same
 * engine, clearly labeled.
 */

const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

interface SummaryData {
  nights: NightSummary[];
  incidents: Incident[];
  streak: number;
  live: boolean;
}

function useSummary(): SummaryData | null {
  const [data, setData] = useState<SummaryData | null>(null);

  const fallback = useMemo(() => {
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
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/api/summary`, {
          signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) throw new Error("backend not ok");
        const body = (await res.json()) as {
          nights: NightSummary[];
          undisturbedStreak: number;
        };
        const inc = await fetch(`${BACKEND}/api/incidents`).then(
          (r) => r.json() as Promise<Incident[]>,
        );
        if (!cancelled && body.nights.length > 0) {
          setData({
            nights: body.nights,
            incidents: inc,
            streak: body.undisturbedStreak,
            live: true,
          });
          return;
        }
        if (!cancelled) setData(fallback);
      } catch {
        if (!cancelled) setData(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fallback]);

  return data;
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
          Saved on this device. Cloud sync to the door adapter ships with the
          AWS deployment.
        </p>
      )}
    </div>
  );
}

export default function CaregiverApp() {
  const data = useSummary();

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
          <Link href="/" className="text-lg font-semibold tracking-tight">
            N<span className="text-[var(--accent)]">i</span>ghtlight
          </Link>
          <div className="flex items-center gap-3">
            {!data.live && (
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                Simulated household
              </span>
            )}
            {data.live && (
              <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-[var(--success)]">
                Connected to backend
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] space-y-6 px-4 py-10 sm:px-6">
        {/* Hero status */}
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-8 text-center">
          <p className="text-sm uppercase tracking-wider text-muted">
            Nights you slept
            <InfoButton id="nights-undisturbed" />
          </p>
          <p className="mt-2 text-6xl font-semibold text-[var(--primary)]">
            {data.streak}
          </p>
          <p className="mt-2 text-muted">
            in a row, and counting
          </p>
          {lastNight && (
            <p className="mx-auto mt-6 max-w-[560px] rounded-[var(--radius-md)] border border-line bg-surface-raised p-4 text-sm leading-relaxed text-muted">
              <span className="font-medium text-ink">Last night: </span>
              {lastNight.text}
            </p>
          )}
        </section>

        <VoiceMessageCard />

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
                    Opened {new Date(inc.openedAt).toUTCString()} · {inc.eventTimestamps.length} event
                    {inc.eventTimestamps.length === 1 ? "" : "s"} · score {inc.score.toFixed(2)}
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
