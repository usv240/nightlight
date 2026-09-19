"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "#proof", label: "Proof" },
  { href: "#problem", label: "The problem" },
  { href: "#how", label: "How it works" },
  { href: "#demo", label: "Live demo" },
  { href: "#ring", label: "Ring" },
  { href: "#alexa", label: "Alexa+" },
  { href: "#evidence", label: "Evidence" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Link prefetch={false} href="/" className="text-lg font-semibold tracking-tight text-ink">
          N<span className="text-[var(--accent)]">i</span>ghtlight
        </Link>
        {/*
          Nine links, a theme toggle and a call to action do not fit on one
          line below about 1280px, and md:flex made them try: adding the
          Alexa+ link took the header from one wrapped label to five, on a
          bar that is on screen in almost every shot of the demo video. So
          labels never break, the full row appears only where it fits, and
          below that the links live in the Menu.
        */}
        <nav className="hidden items-center gap-5 xl:flex" aria-label="Main">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="whitespace-nowrap text-sm text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Link prefetch={false}
            href="/app"
            className="whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-contrast)] transition-opacity hover:opacity-90"
          >
            Open the caregiver app
          </Link>
        </div>
        <button
          type="button"
          className="rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm text-ink xl:hidden"
          aria-expanded={open}
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-surface px-4 py-4 xl:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm text-muted"
              >
                {l.label}
              </a>
            ))}
            <Link prefetch={false} href="/app" className="text-sm font-medium text-[var(--primary)]">
              Open the caregiver app
            </Link>
            <div className="pt-2">
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
