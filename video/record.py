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

from beats import BEATS, Beat, sentence_spans

SITE = "https://d28hskpupjctiz.cloudfront.net"
API = "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws"
OUT = Path(__file__).parent / "build"
# The recording is 4K, and the capture size must equal the viewport.
#
# Playwright's recorder captures at the CSS viewport size, not at the
# compositor surface, which is why `device_scale_factor` alone cannot
# produce a larger file: asking for 3840 with a 1920 viewport returns
# 1920x1080 of product in the corner of a 3840x2160 frame with grey over
# the rest. Measured, twice.
#
# So the viewport really is 3840x2160, and the page is zoomed 2x so the
# layout is the one designed for 1920. Same composition, same type size
# relative to the frame, four times the pixels. Every number below that
# describes a position is therefore in design pixels and multiplied by
# SCALE where it is used, so the shot list stays readable.
#
# The zoom goes on `body`. The page's media queries still see 3840 and
# stay on the desktop layout, which is what is wanted; Tailwind's largest
# breakpoint is far below both widths, so nothing changes.
SCALE = 2
DESIGN_W, DESIGN_H = 1920, 1080

# The old note, kept because the trap is easy to fall back into:
#
# Asking for 2560x1440 does not render more page. Playwright fits the
# viewport into the requested canvas and pads the remainder, so the take
# came back as 1920x1080 of product in the top-left corner of a 2560x1440
# frame and grey over the other third. `assert_full_frame` below fails the
# run rather than letting that reach an upload.
#
# The quality lever that does work is `device_scale_factor`: the page is
# laid out at 1920 CSS pixels and rendered at two device pixels each, so
# every glyph is supersampled before the capture downsamples it. That
# alone took the master from 403 kbps to over 1000 at the same size.
#
# A genuinely larger frame would mean a larger viewport, which shows more
# page at once and makes every word smaller relative to the frame. For a
# judge watching in a browser window that is a worse video, not a better
# one.
WIDTH, HEIGHT = DESIGN_W * SCALE, DESIGN_H * SCALE

# A pointer the page can actually draw. Installed on DOMContentLoaded.
CURSOR_JS = ("""
(() => {
  if (window.__nlCursor) return;
  window.__nlCursor = true;
  const ring = document.createElement('div');
  ring.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'pointer-events:none',
    'width:' + (26*__SCALE__) + 'px', 'height:' + (26*__SCALE__) + 'px', 'margin:' + (-13*__SCALE__) + 'px 0 0 ' + (-13*__SCALE__) + 'px',
    'border:' + (2*__SCALE__) + 'px solid rgba(232,163,61,0.95)', 'border-radius:50%',
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
""".replace("__SCALE__", str(SCALE)))

# The address of the thing being recorded, on screen the whole time.
#
# Playwright records the page, not the browser, so a video made this way
# has no address bar and a judge has only the presenter's word that any of
# it is live. The first attempt was a small chip in the bottom corner and
# the reviewer's verdict was that there was no link visible at all, which
# is the only verdict that matters. This is a full width bar where an
# address bar belongs, at a size that survives a phone screen.
#
# It is not a picture of a URL. It reads `location.href` and re-reads it
# four times a second, so it follows a client-side route change and cannot
# display an address the page is not actually at. Nothing else is drawn:
# no fake tabs, no back button, nothing implying an interaction that is
# not happening.
URL_BAR_HEIGHT = 56 * SCALE
URL_BAR_JS = (r"""
(() => {
  if (window.__nlUrlBar) return;
  window.__nlUrlBar = true;
  const H = 56 * __SCALE__;

  // The page's own sticky headers pin themselves to the viewport top,
  // which is now behind this bar, so they are pushed down by its height.
  const style = document.createElement('style');
  style.textContent =
    'body { padding-top: ' + H + 'px !important; }' +
    'header { top: ' + H + 'px !important; }';
  document.documentElement.appendChild(style);

  const bar = document.createElement('div');
  bar.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'height:' + H + 'px',
    'z-index:2147483646', 'pointer-events:none',
    'display:flex', 'align-items:center', 'padding:0 ' + (18 * __SCALE__) + 'px',
    'background:#1f2430', 'border-bottom:1px solid rgba(255,255,255,0.10)',
    'box-shadow:0 2px 10px rgba(0,0,0,0.20)',
  ].join(';');

  const omnibox = document.createElement('div');
  omnibox.style.cssText = [
    'display:flex', 'align-items:center', 'gap:' + (11 * __SCALE__) + 'px', 'flex:1',
    'height:' + (36 * __SCALE__) + 'px', 'padding:0 ' + (18 * __SCALE__) + 'px', 'border-radius:999px',
    'background:#2b313f', 'border:1px solid rgba(255,255,255,0.10)',
    'font:500 ' + (19 * __SCALE__) + 'px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'color:#f2f4f8', 'letter-spacing:0.2px',
  ].join(';');

  const lock = document.createElement('span');
  lock.textContent = '\u{1F512}';
  lock.style.cssText = 'font-size:' + (16 * __SCALE__) + 'px;line-height:1;opacity:0.9';

  const text = document.createElement('span');
  const paint = () => {
    const href = location.href.replace(/\/$/, '');
    if (text.textContent !== href) text.textContent = href;
  };
  paint();
  setInterval(paint, 250);

  omnibox.appendChild(lock);
  omnibox.appendChild(text);
  bar.appendChild(omnibox);
  document.documentElement.appendChild(bar);
})();
""".replace("__SCALE__", str(SCALE)))

# The site sets `scroll-behavior: smooth`, which fights the easing below.
#
# Every frame of our animation calls window.scrollTo, and with smooth
# behaviour the browser treats each of those as a new animated scroll
# rather than a position. The result is a scroll that chases a moving
# target and comes to rest wherever it happens to be: the connect card
# rested 222px short of its offset, which put its last step under the
# burned-in caption.
#
# Turning it off here rather than using Playwright's reduced-motion flag,
# which would also disable the page's own entrance animations. Those are
# part of what the product looks like and belong in the recording.
# The page is laid out for 1920 and the viewport is 3840, so it is zoomed
# to match. On `body` rather than on `documentElement`, because the
# address bar below is appended to the document element and must scale by
# its own multiplier instead of inheriting this one.
ZOOM_JS = f"""
(() => {{ document.body.style.zoom = "{SCALE}"; }})();
"""

NATIVE_SCROLL_OFF_JS = """
(() => {
  const style = document.createElement('style');
  style.textContent = 'html, body { scroll-behavior: auto !important; }';
  document.documentElement.appendChild(style);
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
    def __init__(self, page: Page, started: float,
                 narration: dict[str, float] | None = None) -> None:
        self.page = page
        self.started = started
        self.timings: list[dict] = []
        # How long Polly actually takes over each line, when narrate.py has
        # already run. With it, a cursor move can be timed to the sentence
        # that describes the thing being pointed at. Without it, the spoken
        # estimate in beats.py is used and the pointing is approximate.
        self.narration = narration or {}
        self._beat: Beat | None = None
        self._beat_at = 0.0

    def mark(self, beat: Beat) -> None:
        """Log the true second this beat began, relative to the video start."""
        at = time.monotonic() - self.started
        self.timings.append({"key": beat.key, "at": round(at, 3)})
        self._beat, self._beat_at = beat, time.monotonic()
        print(f"  {at:6.2f}s  {beat.key}")

    def line_seconds(self) -> float:
        assert self._beat is not None
        return self.narration.get(self._beat.key, self._beat.speak_seconds)

    def on_sentence(self, n: int) -> None:
        """Hold until sentence `n` of the current line starts being spoken.

        This is why the cursor and the words agree. Every action used to
        finish all of its pointing before the narration began, so the ring
        sat on the last thing it touched for the whole beat: on the strip,
        it rested on the red legend swatch while the line said "amber".
        """
        assert self._beat is not None
        spans = sentence_spans(self._beat.say, self.line_seconds())
        if n >= len(spans):
            return
        target = spans[n][0]
        wait = target - (time.monotonic() - self._beat_at)
        if wait > 0.01:
            self.page.wait_for_timeout(int(wait * 1000))

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

    def scroll_to(self, selector: str, offset: int = 176) -> None:
        """Put an element's top below the address bar and sticky header.

        `offset` is in design pixels, the 1920-wide coordinates the site
        was built in, and is scaled here. Every position in the shot list
        is written that way so the frame size can change without a sweep
        through the actions.

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
        # Scroll, then check where it actually landed, then correct.
        #
        # A scroll target computed before the page has finished settling is
        # stale by the time the animation ends: lazy content above the
        # target changes height and takes the target with it. The connect
        # card came to rest 222px short of its offset that way, which put
        # the fourth step under the burned-in caption. One measured nudge
        # afterwards is cheaper than discovering it in a frame.
        for attempt in range(3):
            top = loc.evaluate("el => window.scrollY + el.getBoundingClientRect().top")
            target = max(0, top - offset * SCALE)
            # 26 frames the first time so it reads as a scroll; fewer for a
            # correction, which should be small and must not look like a
            # second journey.
            self.page.evaluate(SMOOTH_SCROLL_JS, [target, 26 if attempt == 0 else 8])
            self.page.wait_for_timeout(180 if attempt == 0 else 90)
            landed = loc.evaluate("el => el.getBoundingClientRect().top")
            if abs(landed - offset * SCALE) <= 4 * SCALE:
                return
            # At the end of the document the offset is simply unreachable,
            # and nudging again would only stutter in place.
            if self.page.evaluate(
                "() => window.scrollY >= document.documentElement.scrollHeight"
                " - window.innerHeight - 1"
            ):
                return
        # Recomputed rather than reusing the loop's last reading, which is
        # taken mid-correction and reports a distance nobody can act on.
        final = loc.evaluate("el => el.getBoundingClientRect().top")
        print(f"          scroll_to({selector}) rested "
              f"{(final - offset * SCALE) / SCALE:+.0f} design px off")

    def click_at(self, selector: str, nth: int = 0, settle: float = 0.45) -> None:
        """Travel to a control and press it where the camera can see it.

        `page.click()` teleports the pointer and fires the event, which on
        a recording looks like the page changed by itself. Every
        navigation in this video is a visible journey: the ring arrives,
        pauses long enough to read what it is about to press, and the
        press animates before anything happens.
        """
        loc = self.page.locator(selector).nth(nth)
        loc.scroll_into_view_if_needed()
        box = loc.bounding_box()
        if not box:
            loc.click()
            return
        self.glide(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2,
                   steps=26)
        self.hold(settle)
        self.page.mouse.down()
        self.page.wait_for_timeout(110)
        self.page.mouse.up()

    def warm(self, url: str) -> float:
        """Make one throwaway request from the page, before the camera cares.

        Lambda cold starts are the difference between a click that answers
        in two seconds and one that answers in seven. The recorder already
        warms the route over urllib before a take, but that warms whatever
        container that connection reached; the browser opens its own TLS
        session and can land on a cold one. Calling it from the page warms
        the path the on-camera click will actually use.

        This runs in a beat's compose phase, which is silent and is cut
        from the finished video, so the wait costs nothing and the click a
        viewer sees is still a real request.
        """
        took = self.page.evaluate(
            """async (u) => {
                 const t = performance.now();
                 try {
                   await (await fetch(u, {method: 'POST',
                     headers: {'content-type': 'application/json'},
                     body: '{}'})).json();
                 } catch (e) {}
                 return Math.round(performance.now() - t);
               }""",
            url,
        )
        print(f"          warmed {url.rsplit('/', 1)[-1]} in {took}ms")
        return took / 1000.0

    def give_scroll_room(self, pixels: int) -> None:
        """Let the page scroll past its own last element.

        The escalated incident is the final card on the caregiver app, so
        at maximum scroll it sits at y=866 of a 1080 frame and the burned
        in caption lands straight across it. No scroll offset can fix that,
        because the document has run out of document. Adding room below the
        footer is the only way to lift the last card into the middle of the
        shot, and it shows as the page simply ending, which it does.
        """
        # Design pixels, scaled: the body is zoomed, so padding set here
        # is multiplied by the zoom as well, and 240 would become 480.
        self.page.evaluate(
            "px => { document.body.style.paddingBottom = px + 'px'; }",
            pixels)
        self.page.wait_for_timeout(120)

    def sweep(self, selector: str, offset: int = 176, frames: int = 20) -> None:
        """One eased scroll, no measuring, no correction.

        `scroll_to` verifies where it landed and nudges, which costs two
        or three extra round trips to the browser. That is right for a
        shot the narration is about to point at, and wrong for a stop the
        camera is only passing through: on a machine busy encoding video
        those round trips are what made a travelling beat arrive after the
        line describing its destination had already been spoken.

        Precision does not matter on the way past. It matters on arrival,
        and arrival still uses `scroll_to`.
        """
        loc = self.page.locator(selector).first
        try:
            loc.wait_for(state="attached", timeout=15_000)
        except Exception:
            return
        top = loc.evaluate("el => window.scrollY + el.getBoundingClientRect().top")
        self.page.evaluate(SMOOTH_SCROLL_JS, [max(0, top - offset * SCALE), frames])

    def hold(self, seconds: float) -> None:
        self.page.wait_for_timeout(int(seconds * 1000))


def assert_full_frame(video: Path) -> None:
    """Fail if the recording is letterboxed instead of full of product.

    Playwright pads rather than scales when the capture size and the
    viewport disagree, and the padding is a flat grey that looks like a
    deliberate background until someone measures it. One take shipped with
    a third of the frame grey and the finished file still played, still
    passed every other check, and was still unusable.
    """
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(video)],
        check=True, capture_output=True, text=True).stdout.strip()
    w, h = (int(v) for v in out.split(",")[:2])
    if (w, h) != (WIDTH, HEIGHT):
        raise SystemExit(
            f"recorded {w}x{h} but the viewport is {WIDTH}x{HEIGHT}. "
            "Playwright pads the difference; make the two match."
        )


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

    # Warm the Ring proof before the take, not during it. The first call on
    # a Lambda container pays a cold start plus the one-time seed of the
    # sandbox household; every call after that is a few hundred
    # milliseconds. The on-camera press should be one of the later ones,
    # so the rows arrive while the first sentence is still being spoken
    # rather than after the verdicts have already been read out.
    warm = urllib.request.Request(
        f"{API}/api/ring/simulate",
        data=b"{}",
        headers={"content-type": "application/json"},
        method="POST",
    )
    started = time.monotonic()
    with urllib.request.urlopen(warm, timeout=120) as r:
        r.read()
    print(f"ring proof warmed in {time.monotonic() - started:.1f}s")


# --------------------------------------------------------------------------
# One function per beat action. Each returns once its shot is composed; the
# caller holds it for as long as the spoken line needs.
# --------------------------------------------------------------------------

def act_landing_hold(r: Recorder) -> None:
    """The opening beats, over the real site rather than a blank screen.

    The first cut opened on an empty background so the problem could land
    before the product did. On review that read as a video that had not
    started yet, and it wasted the one thing a blank screen cannot show:
    the address, live, from the first frame.
    """


def act_landing_hero(r: Recorder) -> None:
    r.glide(520 * SCALE, 430 * SCALE, steps=30)


def act_landing_strip(r: Recorder):
    """The visual argument, pointed at in time with the words.

    Everything before the `yield` composes the shot and happens in
    silence. Everything after runs while the line is being spoken, so the
    ring is on the amber swatch during "amber" and the red one during
    "red". The page's whole argument is two colours; the cursor has to
    agree with the narration about which one is being discussed.
    """
    r.point_at(".night-mark[data-kind='voice']")
    yield
    r.on_sentence(2)                              # "Amber means..."
    r.point_at(".night-mark--legend", nth=1)
    r.hold(0.9)
    r.point_at(".night-mark[data-kind='voice']")
    r.on_sentence(3)                              # "Red means it did not..."
    r.point_at(".night-mark--legend", nth=2)
    r.hold(0.9)
    r.point_at(".night-mark[data-kind='woken']")
    r.on_sentence(4)                              # "Twenty-nine of thirty..."
    r.point_at(".night-mark--legend", nth=0)


def act_app_open(r: Recorder):
    # Navigate the way a caregiver would, by pressing the button, so the
    # address in the chip changes because something was clicked.
    r.page.evaluate(SMOOTH_SCROLL_JS, [0, 20])
    r.page.wait_for_timeout(160)
    # By href, not by text. `text=` matches every ancestor containing the
    # words, and the first of those in document order is the header itself,
    # so a text selector here presses the middle of the navigation bar.
    r.click_at("header a[href='/app/']")
    # Wait for real data, not for a spinner to look done.
    r.page.wait_for_function(
        "() => /\\d+/.test(document.body.innerText) && "
        "document.body.innerText.includes('in a row')",
        timeout=60_000,
    )
    r.scroll_to("text=Recent nights", offset=190)
    r.hold(0.8)
    yield
    # "Twenty to three in the morning, the door opened outside this
    # household's pattern." The row that says so, while it is being said,
    # rather than a cursor parked in a corner and a judge left to hunt.
    r.on_sentence(1)
    r.point_at("li:has-text('02:40')")


# The escalated incident, not the section it lives in. Framing the heading
# put the one card that matters at the very bottom of the shot, where the
# burned-in caption band covers it.
ESCALATED_CARD = 'li:has-text("ESCALATED")'


def act_app_escalation(r: Recorder) -> None:
    """The night the voice was not enough.

    The reviewer's sentence has two halves and the first cut of this video
    only showed the first. This is the second: the incident record, where
    the escalation is written down.

    The offset is chosen against the caption, not against the page. A
    caption burned in at MarginV 34 occupies roughly the bottom 200px of a
    1080p frame, so the card is parked near the middle of the shot.
    """
    # 240px of room, then park the card at y=700. Measured against the
    # live page rather than guessed: without the room the highest the card
    # can reach is y=866, and the caption band begins at roughly y=880.
    r.give_scroll_room(240)
    r.scroll_to(ESCALATED_CARD, offset=700)
    r.hold(0.6)
    r.point_at(ESCALATED_CARD)


def act_app_voice(r: Recorder) -> None:
    r.scroll_to("text=The voice at the door", offset=196)
    r.hold(0.6)
    r.point_at("text=Dad, it is night time")


def act_app_streak(r: Recorder):
    r.page.evaluate(SMOOTH_SCROLL_JS, [0, 26])
    r.page.wait_for_timeout(200)
    r.point_at("text=in a row, and counting")
    yield
    # The 18 and the 29 are the pair a reviewer flagged as confusing, so
    # the cursor visits each as its own half of the sentence is spoken.
    r.on_sentence(1)
    r.point_at("text=in a row, and counting")
    r.hold(2.2)
    r.point_at("text=undisturbed in total")


# The send button by its text, not by `#ring button`. The heading holds an
# InfoButton, which is also a button and comes first in document order, so
# the bare selector pointed at the tooltip and the deliveries were never
# sent. Both labels the real button can carry start with "Send"; the info
# control never does.
RING_SEND = '#ring button:has-text("Send")'

# The status pill on each connect step: three read "Live endpoint", the
# first reads "Needs Ring certification".
STEP_BADGE = "#ring-steps > li span.rounded-full"


def act_ring_proof(r: Recorder):
    """The Ring integration, shown rather than claimed.

    The rules require the video to show the project working through a
    Ring simulator or device. Everything before this beat asserted it. This
    presses the button on the site that performs three real signed
    deliveries to the live endpoint, waits for the production route's three
    verdicts to arrive, and points at each as its sentence is spoken.
    """
    # Back to the landing page by pressing the wordmark, not by a scripted
    # jump to a URL. The address bar follows the route back. The caregiver
    # app renders its header only after it has data, so this is the
    # wordmark by position: it is the header's only link.
    r.page.evaluate(SMOOTH_SCROLL_JS, [0, 20])
    r.page.wait_for_timeout(160)
    r.click_at("header a")
    r.page.wait_for_selector(".night-mark", timeout=60_000)
    r.scroll_to("#ring h2", offset=190)
    # Warm the route from the page before the line starts. Still silent,
    # still cut; the press a viewer sees is a real one against a warm
    # container rather than a real one against a cold one.
    r.warm(f"{API}/api/ring/simulate")
    r.hold(0.3)
    r.point_at(RING_SEND)
    yield
    # The press happens under the line, not before it. On Lambda the three
    # deliveries take close to five seconds, because the sandbox replays a
    # month of events on a small CPU before it can judge 3am. Pressed before
    # the beat mark, that wait sat between two lines and the assembler cut
    # it as dead air, leaving a click that produced three rows instantly,
    # which is a jump cut in the middle of the one action the beat exists
    # to show. Pressed here, the wait plays under "This is the Ring Partner
    # API. Three signed Ring webhooks." and the rows arrive as the first
    # verdict is spoken. Nothing is sped up; the wait is simply narrated.
    r.click_at(RING_SEND, settle=0.3)
    # Wait for the third verdict, not for the spinner to look done. Race it
    # against the panel's own error state, so a failed delivery fails the
    # take in a second with a reason, rather than sitting on a spinner for
    # a minute and then failing without one.
    rows = r.page.locator("#ring ol > li:nth-child(3)")
    failed = r.page.locator("#ring p:has-text('could not be reached')")
    rows.or_(failed).first.wait_for(state="visible", timeout=60_000)
    if failed.count():
        raise SystemExit(f"Ring proof failed on the live site: {failed.first.inner_text()}")
    r.page.wait_for_timeout(250)
    # Rows sit below the heading; bring the first into the upper half. At
    # 230 the third row's bottom edge landed five pixels above the caption
    # band, which is not a margin, it is luck.
    r.scroll_to("#ring ol", offset=200)
    r.on_sentence(2)                 # "A real doorbell event at three in the morning, accepted."
    r.point_at("#ring ol > li", nth=0)
    r.on_sentence(3)                 # "Tampered in transit, rejected."
    r.point_at("#ring ol > li", nth=1)
    r.on_sentence(4)                 # "Ring retrying the first, ignored."
    r.point_at("#ring ol > li", nth=2)


def act_ring_connect(r: Recorder):
    """How a family connects their own doorbell.

    The badges are the shot. Three say "Live endpoint" and one says "Needs
    Ring certification", and the beat ends on that one, because a judge
    trusts a team that knows where its product stops more than one that
    implies it is finished.

    Pointing at the badges rather than at the list items: a step card is
    tall enough that `scroll_into_view_if_needed` would scroll the page
    mid-sentence to centre it, and a shot that moves while a line is being
    spoken reads as a mistake.
    """
    r.scroll_to("#ring-connect h3", offset=110)
    r.hold(0.3)
    yield
    r.on_sentence(1)                 # "Three of these four steps are live right now."
    r.point_at(STEP_BADGE, nth=1)
    r.hold(1.1)
    r.point_at(STEP_BADGE, nth=3)
    r.on_sentence(2)                 # "The fourth is Ring's certification."
    r.point_at(STEP_BADGE, nth=0)


def act_evidence(r: Recorder):
    # Already on the landing page after the Ring beat; the proof section
    # sits above it, so this is one eased scroll upward.
    # The comparison cards, not the proof banner. The banner states 94.5
    # percent in running text, which on a 1080p frame is small print with a
    # caption across it; these are the same three numbers at display size,
    # with the reduction written underneath the middle one. Parking the
    # heading at y=150 puts all three cards between y=340 and y=540, clear
    # of the caption band by a wide margin.
    #
    # By id and structure, not by text. `text=774` also matches the proof
    # banner, which says "Nightlight: 774." in running prose, so a text
    # selector here points at the paragraph instead of the card.
    r.scroll_to("#proof h2", offset=206)
    r.hold(0.5)
    yield
    r.on_sentence(1)          # "A standard alarm would have woken..."
    r.point_at("#proof div.grid > div", nth=0)
    r.on_sentence(2)          # "Nightlight woke them seven hundred..."
    r.point_at("#proof div.grid > div", nth=1)


def act_evidence_cost(r: Recorder) -> None:
    # Back up to the proof banner, the only place the cost is written out:
    # 34 labelled exits, 7 flagged, 26 of the 27 returned. The move is
    # upward and deliberate, landing on the words "and what that cost".
    r.scroll_to("text=Measured, not promised", offset=286)
    r.hold(0.4)
    r.point_at("text=And what that restraint cost")


def act_page_depth(r: Recorder):
    """Travel through the page a judge would otherwise never see.

    Six shots before this one all live in three sections. The page has
    nine, and the ones that are skipped carry the research, the response
    ladder, a month anyone can replay in their own browser, and the list
    of things the product refuses to store. A judge who does not scroll
    has no way to know any of it is there.

    So this scrolls rather than cuts, and rests twice on the way down, at
    roughly reading pace. The destination is the privacy list, because for
    a product that lives in somebody's home the refusals are a stronger
    argument than any of the features above them.
    """
    r.scroll_to("text=The most dangerous door", offset=190)
    r.hold(0.3)
    yield
    # Three stops on the way past, then the destination.
    #
    # The timings are deliberately short. During a real take the machine
    # is encoding 4K while this runs, and the first version of this beat
    # was still on the browser demo when the line about privacy was being
    # spoken. Everything here has to finish with room to spare on a busy
    # machine, not just on an idle one.
    r.hold(1.0)
    r.sweep("text=Voice first. Caregiver second", offset=190)
    r.hold(0.8)
    r.sweep("text=A month of nights", offset=190)
    r.hold(0.8)
    # Arrival is measured, because the narration points at it.
    r.scroll_to("text=Nightlight never stores", offset=210)
    r.point_at("text=Nightlight never stores")
    r.on_sentence(2)                 # "The Ring API offers none..."
    r.point_at("text=Facial or identity data")


def act_landing_strip_final(r: Recorder) -> None:
    r.page.evaluate(SMOOTH_SCROLL_JS, [0, 26])
    r.page.wait_for_timeout(240)
    # End on the product in its finished state: the quiet row, full frame.
    r.glide(960 * SCALE, 380 * SCALE)


def act_hold(r: Recorder) -> None:
    pass


ACTIONS = {
    "landing_hold": act_landing_hold,
    "landing_hero": act_landing_hero,
    "landing_strip": act_landing_strip,
    "app_open": act_app_open,
    "app_escalation": act_app_escalation,
    "app_voice": act_app_voice,
    "app_streak": act_app_streak,
    "ring_proof": act_ring_proof,
    "ring_connect": act_ring_connect,
    "evidence": act_evidence,
    "evidence_cost": act_evidence_cost,
    "page_depth": act_page_depth,
    "landing_strip_final": act_landing_strip_final,
    "hold": act_hold,
}


def main() -> int:
    # Clear the picture, keep the voice. `narrate.py` only needs beats.py,
    # so running it first lets the recorder time each cursor move against
    # the real length of the line instead of an estimate. Wiping the whole
    # build directory here would throw that away, and did: it also took
    # the voice samples with it.
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in ("raw", "work", "frames"):
        shutil.rmtree(OUT / stale, ignore_errors=True)
    # Remove the previous take before starting this one.
    #
    # A recording that dies partway used to leave the old screen.mp4 and
    # timings.json sitting there, and the next `assemble.py` paired them
    # with the new narration without complaint. That produced a finished,
    # playable, entirely wrong video: audio from one script over pictures
    # from another. Deleting them first means a crash leaves nothing to
    # assemble rather than something misleading.
    for stale_file in ("screen.mp4", "timings.json", "cues.json"):
        (OUT / stale_file).unlink(missing_ok=True)

    narration = {}
    manifest = OUT / "narration.json"
    if manifest.exists():
        narration = {n["key"]: n["seconds"]
                     for n in json.loads(manifest.read_text(encoding="utf8"))}
        print(f"timing the cursor against {len(narration)} recorded lines")
    else:
        print("no narration yet; cursor moves use the estimate in beats.py")
    video_dir = OUT / "raw"
    video_dir.mkdir()

    reset_demo()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--force-color-profile=srgb"])
        context = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            record_video_dir=str(video_dir),
            record_video_size={"width": WIDTH, "height": HEIGHT},
            # Render at two device pixels per CSS pixel and let the capture
            # downsample. The layout is unchanged, because CSS pixels are
            # unchanged, but every glyph is supersampled rather than
            # rasterised once at 1x. On a video that is mostly small text
            # on white, this is the single biggest quality lever available.
            device_scale_factor=2,
            color_scheme="light",
        )
        # Force light before first paint, so the recording never depends on
        # the machine's OS theme.
        context.add_init_script(
            "try { localStorage.setItem('nightlight-theme','light'); } catch (e) {}"
        )
        page = context.new_page()
        # On DOMContentLoaded rather than at document start: an init script
        # that runs before the real document arrives is discarded with it.
        page.add_init_script(
            "document.addEventListener('DOMContentLoaded', () => {"
            + ZOOM_JS + NATIVE_SCROLL_OFF_JS + CURSOR_JS + URL_BAR_JS + "});"
        )

        # Open the live site before the clock starts, so the first frame of
        # the video is the product at its real address rather than a page
        # still loading. Loading is not part of the story.
        page.goto(SITE, wait_until="networkidle", timeout=90_000)
        page.wait_for_selector(".night-mark", timeout=60_000)
        page.wait_for_timeout(600)

        started = time.monotonic()
        r = Recorder(page, started, narration)
        print("recording:")
        for beat in BEATS:
            if beat.pause_before:
                r.hold(beat.pause_before)
            # Hold for the line Polly actually produced, not the estimate.
            # The estimate ran two seconds short on the Ring beat, so the
            # picture scrolled away to the evidence while "the voice never
            # plays twice" was still being said. The real lengths are on
            # disk from narrate.py; the recorder was already using them to
            # time the cursor and then ignoring them to time the shot.
            line = narration.get(beat.key, beat.speak_seconds)
            budget = max(beat.pause_before + line, beat.min_hold)
            steps = ACTIONS[beat.action](r)
            if hasattr(steps, "__next__"):
                # Compose the shot in silence, mark the beat, then let the
                # remaining steps run while the line is spoken over them.
                next(steps, None)
                r.mark(beat)
                spent = time.monotonic()
                for _ in steps:
                    pass
                spent = time.monotonic() - spent
            else:
                r.mark(beat)
                spent = 0.0
            r.hold(max(0.0, budget - beat.pause_before - spent))

        total = time.monotonic() - started
        context.close()
        browser.close()

    raw = next(video_dir.glob("*.webm"))
    assert_full_frame(raw)
    mp4 = OUT / "screen.mp4"
    # The master everything else is cut from, so it is encoded well above
    # the quality of the final file. crf 20 on a screen recording produced
    # a 400 kbps master; text survived, but every later generation, the
    # segment cuts and the caption burn, took another bite out of it.
    # `tune stillimage` is x264's mode for exactly this content: large flat
    # areas and hard edges, where the default deblocking softens type.
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(raw),
         "-vf", f"scale={WIDTH}:{HEIGHT}:flags=lanczos",
         "-c:v", "libx264", "-crf", "18", "-preset", "medium",
         "-tune", "stillimage", "-pix_fmt", "yuv420p", "-an", str(mp4)],
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
