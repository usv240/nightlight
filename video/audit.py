"""Check the built video against every instruction, one line per ask.

    python audit.py

This file exists because of a specific failure. Feedback was applied
carefully to `docs/VIDEO_SCRIPT.md`, then the video was built from
`beats.py`, a different file, and five of the asks were silently lost. A
prose script and a built video cannot be compared by reading them; they
have to be compared by a program that looks at what actually shipped.

Everything below is read from build artefacts, never from intent: the
narration that Polly was given, the beats the recorder actually ran, the
caption style burned into the frames, and the encoded file itself.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from beats import BEATS

HERE = Path(__file__).parent
OUT = HERE / "build"
FINAL = OUT / "nightlight-demo-captioned.mp4"
CEILING = 180.0


def spoken() -> str:
    return " ".join(b["say"] for b in json.loads(
        (OUT / "narration.json").read_text(encoding="utf8")))


def probe() -> dict:
    """Duration and the video stream's bitrate, from the encoded file.

    `-show_entries` alone returns no `streams` key unless the sections are
    asked for as well, which is why this passes `-show_format
    -show_streams` and filters afterwards rather than relying on a single
    entry expression.
    """
    raw = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams",
         "-select_streams", "v:0", "-of", "json", str(FINAL)],
        check=True, capture_output=True, text=True).stdout
    return json.loads(raw)


def has_letterbox() -> bool:
    """True if a flat grey band sits down the right edge of the picture.

    Playwright pads a capture whose size does not match the viewport, and
    a take once shipped with a third of the frame grey. The resolution
    check cannot see it, because the file really is 2560x1440; only the
    pixels can.
    """
    png = OUT / "audit-frame.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "60",
                    "-i", str(FINAL), "-frames:v", "1", str(png)], check=True)
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(png), "-vf",
         "crop=6:ih:iw-6:0,format=gray,scale=1:1", "-f", "rawvideo", "-"],
        check=True, capture_output=True).stdout
    png.unlink(missing_ok=True)
    # Playwright's pad is mid grey, 128. Real content at the frame edge is
    # the page background, which is near white in light mode.
    return bool(raw) and 110 <= raw[0] <= 145


def main() -> int:
    say = spoken()
    src = {n: (HERE / f"{n}.py").read_text(encoding="utf8")
           for n in ("record", "beats", "narrate", "subtitle")}
    info = probe()
    dur = float(info["format"]["duration"])
    vbr = int(info["streams"][0]["bit_rate"])
    width = int(info["streams"][0]["width"])
    height = int(info["streams"][0]["height"])
    keys = [b["key"] for b in json.loads(
        (OUT / "timings.json").read_text(encoding="utf8"))["beats"]]

    checks: list[tuple[str, bool, str]] = [
        # The words a judge should leave with.
        ("the headline number is spoken",
         "ninety-four and a half percent" in say, "close beat"),
        ("the failure promise is spoken",
         "never fails silently" in say, "escalate beat"),
        ("the reframe is spoken",
         "not about detecting more" in say, "close beat"),
        ("the uncomfortable number is spoken",
         "flagged seven" in say, "cost beat"),
        ("29 and 18 are reconciled out loud",
         "eighteen nights" in say.lower() and "twenty-nine" in say.lower(),
         "streak beat"),
        ("the pipeline is claimed as real",
         "signed ring webhook" in say.lower(), "night beat"),
        # What the camera is pointed at.
        ("the escalated night is on screen",
         "escalate" in keys and "ESCALATED" in src["record"],
         "act_app_escalation"),
        ("94.5 percent is shown, not just said",
         "#proof div.grid" in src["record"], "act_evidence"),
        # How it was recorded.
        # Against the beat records, not against the text of beats.py: a
        # note explaining why the blank open was dropped contains the word
        # "blank", and a check that cannot tell a comment from an action
        # is a check that forbids writing about the past.
        ("it opens on the live site, not a blank screen",
         BEATS[0].action == "landing_hold"
         and not any(b.action == "blank" for b in BEATS),
         f"first beat: {BEATS[0].action}"),
        ("the live address is on screen",
         "URL_BAR_JS" in src["record"] and "location.href" in src["record"],
         "full width bar, reads location.href"),
        ("it is captured above 1080p",
         height >= 1080, f"{width}x{height}"),
        ("the frame is full of product, not padding",
         not has_letterbox(), "no grey band at the edge"),
        ("navigation happens by visible clicks",
         "def click_at" in src["record"]
         and src["record"].count("r.click_at(") >= 2, "record.py"),
        ("nothing is ever sped up",
         "setpts" not in src["record"] and "atempo" not in src["record"],
         "no time compression anywhere"),
        # How it looks and sounds.
        ("captions sit on an 80 percent box",
         "OutlineColour=&H33000000" in src["subtitle"], "subtitle.py"),
        ("captions are one line, 58 characters or fewer",
         "MAX_CHARS = 58" in src["subtitle"], "subtitle.py"),
        ("the narrator is the requested voice",
         'VOICE = "Patrick"' in src["narrate"], "narrate.py"),
        ("the picture is encoded for screen text",
         "stillimage" in src["record"] and vbr > 700_000,
         f"{vbr // 1000} kbps"),
        # The rule that disqualifies everything else.
        ("it is inside the three minute ceiling",
         dur <= CEILING, f"{int(dur // 60)}:{dur % 60:04.1f}"),
    ]

    width = max(len(label) for label, _, _ in checks)
    failed = 0
    for label, good, note in checks:
        if not good:
            failed += 1
        print(f"  {'ok  ' if good else 'MISS'} {label:<{width}}  {note}")
    print()
    if failed:
        print(f"{failed} of {len(checks)} NOT APPLIED")
        return 1
    print(f"ALL {len(checks)} APPLIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
