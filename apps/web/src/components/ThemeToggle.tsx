"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = {
  system: "Theme: system",
  light: "Theme: light",
  dark: "Theme: dark",
};

/** Three-state theme toggle: System, Light, Dark. Persists; system stamps nothing. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("nl-theme");
      if (stored === "light" || stored === "dark") setMode(stored);
    } catch {
      // storage unavailable; stay on system
    }
  }, []);

  const apply = (next: Mode) => {
    setMode(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      if (next === "system") localStorage.removeItem("nl-theme");
      else localStorage.setItem("nl-theme", next);
    } catch {
      // ignore
    }
  };

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
    apply(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABEL[mode]}. Activate to change.`}
      className="rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary"
    >
      {LABEL[mode]}
    </button>
  );
}
