"""Film Ring's developer Playground while a person drives it.

    python record_ring.py

Beat 3 is Ring's own simulator, and the Playground will not do anything
until somebody generates a token, which is the account holder's step and
never this script's. So this opens the Playground in the Chrome profile
the console is signed in with, starts recording, and lets the person
click: Generate token, then Motion under "Simulate live view event". It
films whatever they do. `splice_ring.py` later cuts the seconds the beat
needs out of this file and lays them over beat 3 of the web take.

What keeps the token out of the video
-------------------------------------
Every text node, input and code block on the page is checked as the DOM
changes, and anything that looks like a credential (a run of 24 or more
token characters, or a line carrying "Bearer") is blurred before the
next paint. A MutationObserver callback runs before rendering, so there
is no frame in which the value is legible. The same pass blurs device
and account identifiers, which this public video should not show either.
The person can still copy the token with the page's own button; blur is
paint, not removal.

The screenshot this writes every two seconds, for whoever is guiding the
person, is taken of the same blurred page.

Framing
-------
A 1600x900 window at 2.4x device scale, the framing Earshot and
EveryWord used for Amazon's console. Chrome caps the capture at 2x, so the
file holds 3200x1800 in the corner of a 3840x2160 canvas; the splice
crops that and scales it 1.2x to fill the 4K frame. The address bar is
drawn at a size that lands at the web take's height after that scale.

Commands, one per line in build/ring-cmd.txt:
    mark <label>     log the recording second, for the splice
    quit             stop and write build/ring-session.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

import record as web

HERE = Path(__file__).parent
OUT = HERE / "build"
PROFILE = HERE.parent.parent / "earshot" / "video" / "build" / "qc-profile"
PLAYGROUND = "https://developer.amazon.com/ring/console/playground"
RAW = OUT / "ring-raw"
CMD, SHOT, LOG = OUT / "ring-cmd.txt", OUT / "ring-state.png", OUT / "ring-drive.log"

# 56 design pixels at 2x in the web take is 112 frame pixels. Here one CSS
# pixel is 2 frame pixels in the capture and 2.4 after the 1.2x scale, so
# the bar is drawn at 112 / 2.4 / 56 of the web take's design size.
BAR_SCALE = round(112 / 2.4 / 56, 3)

SCRUB_JS = r"""
(() => {
  if (window.__nlScrub) return;
  window.__nlScrub = true;
  const RX = /[A-Za-z0-9_\-.~+\/=]{24,}/;
  const blur = (el) => { if (el && el.style && el.style.filter !== 'blur(9px)') el.style.filter = 'blur(9px)'; };
  const scrub = (root) => {
    const walk = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = n.nodeValue || '';
      if (RX.test(t) || /bearer/i.test(t)) blur(n.parentElement);
    }
    document.querySelectorAll('input, textarea').forEach((el) => {
      if ((el.value || '').length >= 20 || RX.test(el.value || '')) blur(el);
    });
    document.querySelectorAll('pre, code').forEach((el) => {
      if (/bearer|authorization/i.test(el.textContent || '')) blur(el);
    });
  };
  new MutationObserver(() => scrub()).observe(document.documentElement,
    {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['value']});
  document.addEventListener('input', () => scrub(), true);
  scrub();
})();
"""


def log(msg: str) -> None:
    with LOG.open("a", encoding="utf8") as fh:
        fh.write(msg + "\n")
    print(msg, flush=True)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    LOG.write_text("", encoding="utf8")
    CMD.unlink(missing_ok=True)
    for stale in RAW.glob("*.webm") if RAW.exists() else []:
        stale.unlink(missing_ok=True)
    marks: list[dict] = []
    bar = web.URL_BAR_JS.replace(f"56 * {web.SCALE}", f"56 * {BAR_SCALE}")
    for k in ("18", "36", "11", "19", "16"):
        bar = bar.replace(f"({k} * {web.SCALE})", f"({k} * {BAR_SCALE})")
    cursor = web.CURSOR_JS.replace(f"*{web.SCALE})", f"*{BAR_SCALE})")
    with sync_playwright() as pw:
        kwargs = dict(headless=False, viewport={"width": 1600, "height": 900}, device_scale_factor=2.4,
                      ignore_default_args=["--enable-automation"],
                      record_video_dir=str(RAW), record_video_size={"width": 3840, "height": 2160})
        try:
            ctx = pw.chromium.launch_persistent_context(str(PROFILE), channel="chrome", **kwargs)
        except Exception:  # noqa: BLE001
            ctx = pw.chromium.launch_persistent_context(str(PROFILE), **kwargs)
        ctx.add_init_script("document.addEventListener('DOMContentLoaded', () => {"
                            + SCRUB_JS + bar + cursor + "});")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        started = time.monotonic()
        page.goto(PLAYGROUND, wait_until="domcontentloaded", timeout=120_000)
        log("ready: the Playground is open and recording")
        last_shot = 0.0
        while True:
            time.sleep(0.5)
            if page.is_closed():
                log("window closed")
                break
            if time.monotonic() - last_shot > 2.0:
                try:
                    page.screenshot(path=str(SHOT))
                except Exception:  # noqa: BLE001
                    pass
                last_shot = time.monotonic()
            if not CMD.exists():
                continue
            line = CMD.read_text(encoding="utf8").strip()
            CMD.unlink()
            verb, _, rest = line.partition(" ")
            at = round(time.monotonic() - started, 2)
            try:
                if verb == "mark":
                    marks.append({"label": rest, "at": at})
                    log(f"mark {rest} at {at}s")
                elif verb == "click":
                    # A visible journey, like the web take: glide, then press.
                    box = page.get_by_text(rest, exact=True).first.bounding_box()
                    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=28)
                    page.wait_for_timeout(450)
                    page.mouse.down()
                    page.wait_for_timeout(110)
                    page.mouse.up()
                    marks.append({"label": f"click {rest}", "at": at})
                    log(f"clicked {rest!r} at {at}s")
                elif verb == "glide":
                    x, y = (float(v) for v in rest.split())
                    page.mouse.move(x, y, steps=28)
                    log(f"glided to {x},{y} at {at}s")
                elif verb == "scrollto":
                    page.get_by_text(rest, exact=True).first.evaluate(
                        "el => el.scrollIntoView({behavior: 'smooth', block: 'start'})")
                    log(f"scrolled to {rest!r} at {at}s")
                elif verb == "scroll":
                    page.mouse.wheel(0, int(rest))
                    log(f"scrolled {rest} at {at}s")
                elif verb == "buttons":
                    names = page.evaluate("""() => Array.from(document.querySelectorAll('button, [role=button], [role=tab], a'))
                        .filter(e => e.offsetParent && e.getBoundingClientRect().width > 0)
                        .map(e => (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40))
                        .filter(t => t && t.length < 40)""")
                    log("buttons: " + " | ".join(dict.fromkeys(names)))
                elif verb == "quit":
                    break
            except Exception as err:  # noqa: BLE001
                log(f"failed: {line}: {str(err)[:160]}")
            try:
                page.screenshot(path=str(SHOT))
            except Exception:  # noqa: BLE001
                pass
        video = page.video.path() if page.video else None
        ctx.close()
    (OUT / "ring-session.json").write_text(json.dumps(
        {"video": str(video) if video else None, "marks": marks,
         "url": PLAYGROUND, "recorded": time.strftime("%Y-%m-%d")}, indent=1), encoding="utf8")
    log(f"wrote ring-session.json ({video})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
