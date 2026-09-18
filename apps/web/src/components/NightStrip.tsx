"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Thirty nights, as the caregiver experiences them.
 *
 * The product's output is not an event feed, it is a run of nights nobody
 * was woken for. That is impossible to feel from a sentence and obvious
 * from a row of marks, which is the argument for small multiples: one
 * glyph per night, identical treatment, so the eye finds the exceptions
 * without being told where to look.
 *
 * The hierarchy question a dashboard has to answer is what, then why, then
 * so what. Here the "what" is the shape of the row: mostly quiet. The
 * "why" is the two kinds of mark that are not quiet. The "so what" is the
 * count underneath.
 *
 * Colour is a signal and never decoration, which is the rule the health
 * dashboard literature is firmest about: a caregiver should never have to
 * ask what a hue is doing. Exactly one mark type is warm, and it means the
 * family's recorded voice played. Exactly one is red, and it means someone
 * was woken. Everything else is the quiet of an ordinary night.
 *
 * The data is the committed demo month from the simulator, the same month
 * the live API replays, not a decorative pattern.
 */

type Night = "quiet" | "voice" | "woken";

/**
 * The demo month. Two doorway events settled by the recorded voice with
 * nobody woken, and one night where it did not settle and the caregiver
 * was woken, which is the case the product exists to handle honestly.
 */
const NIGHTS: Night[] = [
  "quiet", "quiet", "quiet", "quiet", "quiet", "quiet", "voice",
  "quiet", "quiet", "quiet", "quiet", "woken", "quiet", "quiet",
  "quiet", "quiet", "quiet", "voice", "quiet", "quiet", "quiet",
  "quiet", "quiet", "quiet", "quiet", "quiet", "quiet", "quiet",
  "quiet", "quiet",
];

const LABEL: Record<Night, string> = {
  quiet: "Quiet night. Nobody was woken.",
  voice: "A doorway event at night. The recorded family voice settled it, and nobody was woken.",
  woken: "A doorway event that did not settle. The caregiver was woken.",
};

export function NightStrip() {
  const [lit, setLit] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    // The row fills in a night at a time, which reads as time passing
    // rather than as an animation for its own sake. Anyone who has asked
    // for reduced motion gets the finished row immediately.
    if (reduced) {
      setLit(NIGHTS.length);
      return;
    }
    setLit(0);
    timer.current = setInterval(() => {
      setLit((n) => {
        if (n >= NIGHTS.length) {
          if (timer.current) clearInterval(timer.current);
          return n;
        }
        return n + 1;
      });
    }, 70);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced]);

  const woken = NIGHTS.filter((n) => n === "woken").length;
  const voice = NIGHTS.filter((n) => n === "voice").length;
  const slept = NIGHTS.length - woken;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Thirty nights of the demonstration household. {slept} nights the
        caregiver slept through, {voice} doorway events settled by the
        recorded family voice, {woken} night the caregiver was woken.
      </figcaption>

      <div
        className="grid gap-[6px]"
        style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
        aria-hidden="true"
      >
        {NIGHTS.map((kind, i) => (
          <span
            key={i}
            title={LABEL[kind]}
            data-kind={kind}
            className="night-mark"
            style={{ opacity: i < lit ? 1 : 0 }}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
        <span className="flex items-center gap-2">
          <span className="night-mark night-mark--legend" data-kind="quiet" />
          <span className="night-legend-text">
            <strong className="font-semibold">
              {slept} of {NIGHTS.length}
            </strong>{" "}
            nights slept through
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="night-mark night-mark--legend" data-kind="voice" />
          <span className="night-legend-text">
            <strong className="font-semibold">{voice}</strong> the voice
            settled it, nobody woken
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="night-mark night-mark--legend" data-kind="woken" />
          <span className="night-legend-text">
            <strong className="font-semibold">{woken}</strong> the voice was
            not enough, you were woken
          </span>
        </span>
      </div>
    </figure>
  );
}
