"""Check every shot against the live site before spending a take on it.

    python framecheck.py

Drives the real beats in the real order against the deployed site, at the
recording's own frame size, and asserts that what each beat is about is
actually legible: below the address bar, above the burned-in caption
band, and on screen at all.

Why this is a file rather than something run by hand
---------------------------------------------------
Every framing bug in this video was found by pulling a still out of a
finished cut and reading it, which costs a full record, assemble and
caption cycle first. Each one was also predictable from the page's own
geometry: the escalated incident sat under the caption because the page
had run out of page; the connect card's fourth step did the same; the
developers section put a test count on screen that goes stale every time
a test is added.

This runs in about a minute and catches all three classes before a frame
is recorded.

It talks to the deployed site on purpose. A local build would pass while
production disagreed, and production is what gets filmed.
"""

from __future__ import annotations

import json
import sys
import time

from playwright.sync_api import sync_playwright

import record as R
from beats import BEATS

# The burned-in caption band, in the frame's own pixels. ASS sizes scale
# with video height, so the band covers the same fraction of the frame at
# any size and this threshold scales with it.
CAPTION_TOP = 872 * R.SCALE
TOP = R.URL_BAR_HEIGHT + 8

# What must be legible at the end of each beat.
MUST_BE_VISIBLE: dict[str, list[tuple[str, str]]] = {
    "night": [("the 02:40 night row", "li:has-text('02:40')")],
    "escalate": [("the escalated incident", R.ESCALATED_CARD)],
    "voice": [("the voice message card", "text=The voice at the door")],
    "streak": [("the streak headline", "text=in a row, and counting")],
    "ring": [(f"delivery row {i + 1}", f"#ring ol > li >> nth={i}") for i in range(3)],
    "connect": [(f"connect step {i + 1}", f"{R.STEP_BADGE} >> nth={i}") for i in range(4)],
    "depth": [
        ("the privacy refusals", "text=Nightlight never stores"),
        ("the facial data line", "text=Facial or identity data"),
    ],
    "evidence": [(f"stat card {i + 1}", f"#proof div.grid > div >> nth={i}") for i in range(3)],
    "cost": [("the restraint cost sentence", "text=And what that restraint cost")],
}

# What must NOT be on screen. A number that changes whenever a test is
# added does not belong in a recording: the first cut of the depth beat
# showed "147 tests" while the deployed site already said 148.
MUST_BE_ABSENT: dict[str, list[tuple[str, str]]] = {
    "depth": [("the test count", "text=tests across engine")],
}


def main() -> int:
    manifest = R.OUT / "narration.json"
    narration = (
        {n["key"]: n["seconds"] for n in json.loads(manifest.read_text(encoding="utf8"))}
        if manifest.exists()
        else {}
    )
    problems: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--force-color-profile=srgb"])
        context = browser.new_context(
            viewport={"width": R.WIDTH, "height": R.HEIGHT},
            device_scale_factor=1,
            color_scheme="light",
        )
        context.add_init_script(
            "try { localStorage.setItem('nightlight-theme','light'); } catch (e) {}"
        )
        page = context.new_page()
        page.add_init_script(
            "document.addEventListener('DOMContentLoaded', () => {"
            + R.ZOOM_JS + R.NATIVE_SCROLL_OFF_JS + R.CURSOR_JS + R.URL_BAR_JS + "});"
        )
        page.goto(R.SITE, wait_until="networkidle", timeout=90_000)
        page.wait_for_selector(".night-mark", timeout=60_000)
        page.wait_for_timeout(700)
        print(f"{R.WIDTH}x{R.HEIGHT}, captions from y={CAPTION_TOP}, against {R.SITE}\n")

        # Does the drawn cursor actually land where the mouse is?
        #
        # It did not, for three 4K takes. The ring lives in a fixed-position
        # element, body carries the 2x zoom, and zoom scales fixed
        # coordinates too, so the ring sat at roughly double the mouse
        # position and near the foot of a page fell outside the frame. The
        # element existed and held the right inline coordinates the whole
        # time, which is why every other check passed.
        for probe in ((900, 700), (2600, 1500)):
            page.mouse.move(*probe, steps=4)
            page.wait_for_timeout(140)
            centre = page.evaluate(
                """() => {
                     const ring = [...document.documentElement.children]
                       .find(d => d.style && d.style.borderRadius === '50%');
                     if (!ring) return null;
                     const r = ring.getBoundingClientRect();
                     return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
                   }"""
            )
            if centre is None:
                problems.append("the drawn cursor is missing from the page")
                print("       FAIL the cursor ring does not exist")
                break
            off = max(abs(centre[0] - probe[0]), abs(centre[1] - probe[1]))
            ok = off <= 4
            if not ok:
                problems.append(
                    f"the drawn cursor renders at {tuple(centre)} while the mouse "
                    f"is at {probe}, {off}px away"
                )
            print(f"       {'ok  ' if ok else 'FAIL'} cursor follows the mouse   "
                  f"mouse {probe} ring {tuple(centre)}")

        r = R.Recorder(page, time.monotonic(), narration)
        for beat in BEATS:
            steps = R.ACTIONS[beat.action](r)
            if hasattr(steps, "__next__"):
                next(steps, None)
                r.mark(beat)
                for _ in steps:
                    pass
            else:
                r.mark(beat)

            for label, selector in MUST_BE_VISIBLE.get(beat.key, []):
                box = page.locator(selector).first.bounding_box()
                if box is None:
                    problems.append(f"{beat.key}: {label} is not on the page at all")
                    print(f"       MISSING {label}")
                    continue
                top, bottom = round(box["y"]), round(box["y"] + box["height"])
                ok = top >= TOP and bottom <= CAPTION_TOP
                if not ok:
                    problems.append(
                        f"{beat.key}: {label} sits at y {top}..{bottom}, "
                        f"outside the readable band {TOP}..{CAPTION_TOP}"
                    )
                print(f"       {'ok  ' if ok else 'FAIL'} {label:28} y {top}..{bottom}")

            for label, selector in MUST_BE_ABSENT.get(beat.key, []):
                loc = page.locator(selector).first
                box = loc.bounding_box() if loc.count() else None
                on_screen = box is not None and box["y"] < R.HEIGHT and box["y"] + box["height"] > 0
                if on_screen:
                    problems.append(
                        f"{beat.key}: {label} is on screen at y {round(box['y'])} "
                        "and should not be in the recording"
                    )
                print(f"       {'FAIL' if on_screen else 'ok  '} {label:28} "
                      f"{'visible' if on_screen else 'off frame'}")

        browser.close()

    print()
    if problems:
        for p in problems:
            print(f"  {p}")
        print(f"\n{len(problems)} shot(s) would be wrong. Fix before recording.")
        return 1
    print("Every shot is readable and nothing that should be hidden is showing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
