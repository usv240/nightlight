"use client";

import { useMemo, useState } from "react";
import {
  processTimeline,
  summarizeNights,
  undisturbedStreak,
  localTime,
  type Incident,
  type NightSummary,
} from "@nightlight/engine";
import { generateDemoMonth } from "@nightlight/simulator";
import { InfoButton } from "./InfoButton";

/**
 * The live demo. This is not a mock: it generates the simulated household's
 * month and runs it through the real Nightlight engine, in your browser.
 * Click a night to see exactly what the engine did and why.
 */

interface NightView extends NightSummary {
  incident?: Incident;
}

interface StoryStep {
  time: string;
  text: string;
  tone: "info" | "voice" | "notify" | "escalate" | "resolve";
}

function hhmm(iso: string, tz: string): string {
  const t = localTime(iso, tz);
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

function storyFor(night: NightView, tz: string): StoryStep[] {
  if (!night.incident) {
    return [
      {
        time: "",
        text: "No doorway activity outside the household's learned pattern. The engine stayed silent and the caregiver slept.",
        tone: "resolve",
      },
    ];
  }
  const inc = night.incident;
  const steps: StoryStep[] = [
    {
      time: hhmm(inc.openedAt, tz),
      text: "The front door camera reports human motion, far outside this household's normal pattern for the hour.",
      tone: "info",
    },
    {
      time: hhmm(inc.openedAt, tz),
      text: "Nightlight fetches a doorway snapshot and plays the family's recorded voice message at the door.",
      tone: "voice",
    },
  ];
  if (inc.outcome === "RESOLVED_VOICE") {
    steps.push({
      time: hhmm(inc.stageTimestamps.RESOLVED ?? inc.openedAt, tz),
      text: "Five quiet minutes follow. The moment settles on its own. Nobody is woken.",
      tone: "resolve",
    });
  } else {
    const notifyAt = inc.stageTimestamps.NOTIFY_CAREGIVER ?? inc.openedAt;
    steps.push({
      time: hhmm(notifyAt, tz),
      text: "Motion continues after the voice message. The caregiver's phone receives a gentle notification with the snapshot and a one-tap response.",
      tone: "notify",
    });
    if (inc.outcome === "ESCALATED") {
      steps.push({
        time: hhmm(inc.stageTimestamps.ESCALATED ?? notifyAt, tz),
        text: "No acknowledgement arrives in ten minutes. Backup contacts are alerted. This is the one night this month the system chose to wake people, and it was right to.",
        tone: "escalate",
      });
    } else {
      steps.push({
        time: hhmm(inc.stageTimestamps.ACKNOWLEDGED ?? notifyAt, tz),
        text: "The caregiver taps I have it. The incident closes as resolved.",
        tone: "resolve",
      });
    }
  }
  return steps;
}

const TONE_STYLES: Record<StoryStep["tone"], string> = {
  info: "border-line bg-surface",
  voice: "border-[var(--accent)] bg-accent-soft",
  notify: "border-[var(--primary)] bg-night-soft",
  escalate: "border-[var(--danger)] bg-danger-soft",
  resolve: "border-[var(--success)] bg-success-soft",
};

export function NightDemo() {
  const data = useMemo(() => {
    const demo = generateDemoMonth(42);
    const result = processTimeline(demo.events, demo.config);
    const nights = summarizeNights(
      demo.events[0]!.ts,
      demo.events[demo.events.length - 1]!.ts,
      result.incidents,
      result.effects,
      demo.config,
    );
    const views: NightView[] = nights.map((n) => {
      const incident = result.incidents.find((i) => n.incidentIds.includes(i.id));
      return incident ? { ...n, incident } : { ...n };
    });
    return {
      views,
      tz: demo.config.timezone,
      streak: undisturbedStreak(nights),
      undisturbed: nights.filter((n) => n.undisturbed).length,
      total: nights.length,
      incidents: result.incidents.length,
      eventCount: demo.events.length,
    };
  }, []);

  const [selected, setSelected] = useState<string>("2026-09-23");
  const night = data.views.find((n) => n.nightOf === selected) ?? data.views[0]!;
  const steps = storyFor(night, data.tz);

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Simulated household
          </span>
          <InfoButton id="simulated" />
        </div>
        <p className="text-xs text-muted">
          {data.eventCount} events, one month, replayed through the real engine in your browser
        </p>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-4">
          <p className="text-3xl font-semibold text-ink">
            {data.undisturbed}
            <span className="text-lg text-muted"> of {data.total}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            nights the caregiver slept
            <InfoButton id="nights-undisturbed" />
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-4">
          <p className="text-3xl font-semibold text-ink">{data.streak}</p>
          <p className="mt-1 text-sm text-muted">night streak, and counting</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-4">
          <p className="text-3xl font-semibold text-ink">{data.incidents}</p>
          <p className="mt-1 text-sm text-muted">
            doorway incidents, two settled by voice alone
            <InfoButton id="familiar-voice" />
          </p>
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-2 text-sm font-medium text-ink">
          One square per night. Choose one.
        </p>
        <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-15">
          {data.views.map((n) => {
            const isSelected = n.nightOf === selected;
            const base = n.undisturbed
              ? n.incidentIds.length > 0
                ? "bg-[var(--accent)]"
                : "bg-[var(--success)] opacity-60"
              : "bg-[var(--danger)]";
            return (
              <button
                key={n.nightOf}
                type="button"
                onClick={() => setSelected(n.nightOf)}
                aria-label={`Night of ${n.nightOf}, ${n.undisturbed ? "caregiver slept" : "caregiver woken"}${n.incidentIds.length > 0 ? ", incident" : ""}`}
                aria-pressed={isSelected}
                className={`h-8 rounded-[4px] transition-transform hover:scale-110 ${base} ${
                  isSelected ? "ring-2 ring-[var(--focus-ring)] ring-offset-2 ring-offset-[var(--surface)]" : ""
                }`}
                title={n.nightOf}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-[var(--success)] opacity-60" /> quiet night
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-[var(--accent)]" /> settled by the voice, caregiver slept
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-[var(--danger)]" /> caregiver woken, rightly
          </span>
        </div>
      </div>

      <div className="mt-8 rounded-[var(--radius-md)] border border-line bg-surface-raised p-5">
        <p className="text-sm font-semibold text-ink">Night of {night.nightOf}</p>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li
              key={i}
              className={`rounded-[var(--radius-sm)] border-l-4 p-3 text-sm leading-relaxed text-ink ${TONE_STYLES[s.tone]}`}
            >
              {s.time && (
                <span className="mr-2 font-mono text-xs font-semibold text-muted">
                  {s.time}
                </span>
              )}
              {s.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
