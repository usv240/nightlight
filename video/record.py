"""Record the screen against the live service, and log when each beat began.

    python record.py

Playwright is both the browser automation and the camera here: a context
opened with `record_video_dir` writes a webm of exactly what the page did,
so there is no separate capture tool and no window manager in the way.

The output that matters is not only the video. `timings.json` records the
wall clock second at which each beat actually started, and every later
step builds against that rather than against the plan. A beat that took
nineteen seconds because the deployed API was slow is still nineteen
seconds in the audio, because the audio is assembled from this log.

Traps this file exists to avoid
-------------------------------
**No cursor.** Playwright records the page, and a page contains no
pointer. Without drawing one, buttons change state with nothing touching
them, which reads as a video of a script running rather than a person
using a product. The ring is installed on DOMContentLoaded rather than at
document start, because an init script that runs before the real document
arrives is discarded with it.

**Jump scrolling.** A scroll that teleports reads as a dropped frame.
Every scroll here is eased over roughly 26 animation frames.

**Waiting on the clock.** Sleeping a fixed number of seconds and hoping
the page caught up produces a video that is correct on a fast day. Every
wait polls the DOM for the state it actually needs.

**Theme drift.** The recording must not depend on whatever the machine's
OS theme happens to be, so light is forced before first paint.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

from beats import BEATS

SITE = "https://d28hskpupjctiz.cloudfront.net"
API = "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws"
OUT = Path(__file__).parent / "build"
WIDTH, HEIGHT = 1920, 1080

# A pointer the page can actually draw. Installed on DOMContentLoaded.
CURSOR_JS = """
(() => {
  if (window.__nlCursor) return;
  window.__nlCursor = true;
  const ring = document.createElement('div');
  ring.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'pointer-events:none',
    'width:26px', 'height:26px', 'margin:-13px 0 0 -13px',
    'border:2px solid rgba(232,163,61,0.95)', 'border-radius:50%',
    'background:rgba(232,163,61,0.16)',
    'box-shadow:0 0 0 1px rgba(0,0,0,0.25)',
    'transition:transform 90ms ease-out', 'left:-100px', 'top:-100px',
  ].join(';');
  document.body.appendChild(ring);
  addEventListener('mousemove', (e) => {
    ring.style.left = e.clientX + 'px';
    ring.style.top = e.clientY + 'px';
  }, true);
  addEventListener('mousedown', () => {
    ring.style.transform = 'scale(1.75)';
    const pulse = document.createElement('div');
    pulse.style.cssText = ring.style.cssText
      .replace('left:-100px', 'left:' + ring.style.left)
      .replace('top:-100px', 'top:' + ring.style.top)
      + ';transition:transform 420ms ease-out,opacity 420ms ease-out';
    document.body.appendChild(pulse);
    requestAnimationFrame(() => {
      pulse.style.transform = 'scale(2.6)';
      pulse.style.opacity = '0';
    });
    setTimeout(() => pulse.remove(), 460);
  }, true);
  addEventListener('mouseup', () => { ring.style.transform = 'scale(1)'; }, true);
})();
"""

# Ease a scroll rather than teleporting. Resolves when it has settled.
SMOOTH_SCROLL_JS = """
([targetY, frames]) => new Promise((resolve) => {
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) return resolve();
  let i = 0;
  const step = () => {
    i += 1;
    const t = i / frames;
    // easeInOutCubic: no sudden start, no sudden stop.
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    window.scrollTo(0, startY + delta * e);
    if (i < frames) requestAnimationFrame(step);
    else resolve();
  };
  requestAnimationFrame(step);
});
"""


class Recorder:
    def __init__(self, page: Page, started: float) -> None:
        self.page = page
        self.started = started
        self.timings: list[dict] = []

    def mark(self, key: str) -> None:
        """Log the true second this beat began, relative to the video start."""
        at = time.monotonic() - self.started
        self.timings.append({"key": key, "at": round(at, 3)})
        print(f"  {at:6.2f}s  {key}")

    def glide(self, x: float, y: float, steps: int = 22) -> None:
        """Move the drawn cursor there, slowly enough to be followable."""
        self.page.mouse.move(x, y, steps=steps)
        self.page.wait_for_timeout(120)

    def point_at(self, selector: str, nth: int = 0) -> None:
        loc = self.page.locator(selector).nth(nth)
        loc.scroll_into_view_if_needed()
        box = loc.bounding_box()
        if box:
            self.glide(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)

    def scroll_to(self, selector: str, offset: int = 120) -> None:
        """Put an element's top just below the sticky header, not centred.

        Centring a tall panel leaves half of it off screen, which is how a
        tab strip ends up perfectly placed and the content under it
        invisible.
        """
        # Resolve through the locator API rather than querySelector: the
        # engine-prefixed selectors this file uses, text= among them, are
        # Playwright's and the DOM knows nothing about them.
        loc = self.page.locator(selector).first
        try:
            loc.wait_for(state="attached", timeout=15_000)
        except Exception:
            return
        top = loc.evaluate(
            "el => window.scrollY + el.getBoundingClientRect().top"
        )
        self.page.evaluate(SMOOTH_SCROLL_JS, [max(0, top - offset), 26])
        self.page.wait_for_timeout(180)

    def hold(self, seconds: float) -> None:
        self.page.wait_for_timeout(int(seconds * 1000))


def reset_demo() -> None:
    """Begin from a clean, reproducible board on the live service."""
    import urllib.request

    req = urllib.request.Request(
        f"{API}/api/demo/replay",
        data=b"{}",
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        r.read()
    print("demo state reset on the live service")


# --------------------------------------------------------------------------
# One function per beat action. Each returns once its shot is composed; the
# caller holds it for as long as the spoken line needs.
# --------------------------------------------------------------------------

def act_blank(r: Recorder) -> None:
    pass


def act_landing_hero(r: Recorder) -> None:
    r.page.goto(SITE, wait_until="networkidle", timeout=90_000)
    r.page.wait_for_selector(".night-mark", timeout=60_000)
    r.glide(520, 430)


def act_landing_strip(r: Recorder) -> None:
    r.point_at(".night-mark[data-kind='voice']")
    r.hold(1.6)
    r.point_at(".night-mark[data-kind='woken']")
    r.hold(1.6)
    # Rest on each legend swatch. The page's whole argument is two colours.
    for i in range(3):
        r.point_at(".night-mark--legend", nth=i)
        r.hold(1.3)


def act_app_open(r: Recorder) -> None:
    r.page.goto(f"{SITE}/app/", wait_until="networkidle", timeout=90_000)
    # Wait for real data, not for a spinner to look done.
    r.page.wait_for_function(
        "() => /\\d+/.test(document.body.innerText) && "
        "document.body.innerText.includes('in a row')",
        timeout=60_000,
    )
    r.scroll_to("text=Recent nights", offset=140)
    r.hold(0.8)


def act_app_voice(r: Recorder) -> None:
    r.scroll_to("text=The voice at the door", offset=140)
    r.hold(0.6)
    r.point_at("text=Dad, it is night time")


def act_app_streak(r: Recorder) -> None:
    r.page.evaluate(SMOOTH_SCROLL_JS, [0, 26])
    r.page.wait_for_timeout(200)
    r.point_at("text=in a row, and counting")
    r.hold(1.0)
    r.point_at("text=undisturbed in total")


def act_evidence(r: Recorder) -> None:
    r.page.goto(SITE, wait_until="networkidle", timeout=90_000)
    r.scroll_to("text=Measured, not promised", offset=200)
    r.point_at("text=Measured, not promised")


def act_evidence_cost(r: Recorder) -> None:
    r.point_at("text=And what that restraint cost")


def act_landing_strip_final(r: Recorder) -> None:
    r.page.evaluate(SMOOTH_SCROLL_JS, [0, 26])
    r.page.wait_for_timeout(240)
    # End on the product in its finished state: the quiet row, full frame.
    r.glide(960, 380)


def act_hold(r: Recorder) -> None:
    pass


ACTIONS = {
    "blank": act_blank,
    "landing_hero": act_landing_hero,
    "landing_strip": act_landing_strip,
    "app_open": act_app_open,
    "app_voice": act_app_voice,
    "app_streak": act_app_streak,
    "evidence": act_evidence,
    "evidence_cost": act_evidence_cost,
    "landing_strip_final": act_landing_strip_final,
    "hold": act_hold,
}


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    video_dir = OUT / "raw"
    video_dir.mkdir()

    reset_demo()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--force-color-profile=srgb"])
        context = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            record_video_dir=str(video_dir),
            record_video_size={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
            color_scheme="light",
        )
        # Force light before first paint, so the recording never depends on
        # the machine's OS theme.
        context.add_init_script(
            "try { localStorage.setItem('nightlight-theme','light'); } catch (e) {}"
        )
        page = context.new_page()
        page.add_init_script(
            "document.addEventListener('DOMContentLoaded', () => {" + CURSOR_JS + "});"
        )

        # A blank page the opening beats play over. Not black: black reads
        # as a missing frame. This is the product's own background colour.
        page.goto("data:text/html,<body style='background:%23fafaf8'></body>")
        page.wait_for_timeout(400)

        started = time.monotonic()
        r = Recorder(page, started)
        print("recording:")
        for beat in BEATS:
            if beat.pause_before:
                r.hold(beat.pause_before)
            ACTIONS[beat.action](r)
            r.mark(beat.key)
            r.hold(beat.budget - beat.pause_before)

        total = time.monotonic() - started
        context.close()
        browser.close()

    raw = next(video_dir.glob("*.webm"))
    mp4 = OUT / "screen.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(raw), "-c:v", "libx264", "-crf", "20",
         "-preset", "medium", "-pix_fmt", "yuv420p", "-an", str(mp4)],
        check=True, capture_output=True,
    )
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(mp4)],
        check=True, capture_output=True, text=True).stdout.strip())

    (OUT / "timings.json").write_text(
        json.dumps({"beats": r.timings, "wall": round(total, 3),
                    "video": round(dur, 3)}, indent=1),
        encoding="utf8",
    )
    print(f"\nwall clock {total:.1f}s, encoded video {dur:.1f}s")
    print(f"wrote {mp4.name} and timings.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
