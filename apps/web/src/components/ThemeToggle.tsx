"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark";
const LABEL: Record<Mode, string> = {
  light: "Theme: light",
  dark: "Theme: dark",
};

/** Light by default whatever the system says; dark is a choice, remembered. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("nl-theme");
      if (stored === "dark") setMode("dark");
    } catch {
      // storage unavailable; stay light
    }
  }, []);

  const apply = (next: Mode) => {
    setMode(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("nl-theme", next);
    } catch {
      // ignore
    }
  };

  const cycle = () => {
    apply(mode === "dark" ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABEL[mode]}. Activate to change.`}
      className="whitespace-nowrap rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary"
    >
      {LABEL[mode]}
    </button>
  );
}
