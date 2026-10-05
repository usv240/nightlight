"""Cut Ring's console footage to the Playground beat.

    python splice_ring.py <start>:<end> [<start>:<end> ...] [--video take.webm]

record_ring.py films Ring's developer Playground while a person drives
the one step that is theirs (generating the token). This takes the
windows of that recording the beat needs, in order, and writes
build/ring-clip.mp4 at the web take's 3840x2160, which assemble.py lays
over the "playground" beat. The October cut uses two: the Playground's
heading for "Ring's own developer Playground", then the Motion event.

Why every frame is measured
---------------------------
Chrome does not hold one capture scale. The window is 1600x900 CSS
pixels at 2.4x device scale and the recorder canvas is 3840x2160, and
the frames arrive at 1.8x most of the time (2880 wide, grey padding to
the right), at 2.4x now and then (filling the canvas), and occasionally
at other sizes, with black padding instead of grey. Cropping one fixed
rectangle turned that into a picture that zoomed in and out every few
seconds.

The address bar the recorder draws spans the whole window, so on any
frame its row is bar-coloured exactly as far as the page is wide. The
width most frames share is the take's real one; a frame at any other
width is not a rescale of the same picture but a crop of a different
render (the full-canvas frames showed the modal shifted off centre), so
it is replaced by the last good frame. On the October take that was 25
frames of 400. The good frames are cropped to that
width at 16:9 and scaled to 3840x2160.

Nothing is sped up. Each window plays as it happened.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import cv2

OUT = Path(__file__).parent / "build"
W, H = 3840, 2160
FPS = 25


def is_padding(v: int) -> bool:
    return abs(v - 127) <= 2 or v <= 3


def content_width(gray) -> int:
    row = gray[12]
    for x in range(W - 1, 0, -2):
        if not is_padding(int(row[x])):
            return x + 1
    return W


def main() -> int:
    args = sys.argv[1:]
    video = None
    if "--video" in args:
        i = args.index("--video")
        video = args[i + 1]
        del args[i:i + 2]
    if not args:
        raise SystemExit(__doc__)
    windows = [tuple(float(v) for v in a.split(":")) for a in args]
    src = video or json.loads((OUT / "ring-session.json").read_text(encoding="utf8"))["video"]
    dest = OUT / "ring-clip.mp4"
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "16", "-preset", "medium",
         "-tune", "stillimage", "-pix_fmt", "yuv420p", str(dest)],
        stdin=subprocess.PIPE)
    widths: dict[int, int] = {}
    # First pass: the width this take's frames actually share.
    for start, end in windows:
        cap = cv2.VideoCapture(str(src))
        cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
        for _ in range(round((end - start) * FPS)):
            ok, frame = cap.read()
            if not ok:
                break
            w = content_width(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
            widths[w] = widths.get(w, 0) + 1
        cap.release()
    mode = max(widths, key=widths.get)
    total = replaced = 0
    last = None
    for start, end in windows:
        cap = cv2.VideoCapture(str(src))
        cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
        for _ in range(round((end - start) * FPS)):
            ok, frame = cap.read()
            if not ok:
                break
            w = content_width(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
            if abs(w - mode) > 8 and last is not None:
                out = last
                replaced += 1
            else:
                h = round(mode * 9 / 16)
                out = cv2.resize(frame[:h, :mode], (W, H), interpolation=cv2.INTER_LANCZOS4)
                last = out
            enc.stdin.write(out.tobytes())
            total += 1
        cap.release()
    enc.stdin.close()
    enc.wait()
    (OUT / "ring-clip.json").write_text(json.dumps(
        {"source": str(src), "windows": windows, "frames": total, "width": mode,
         "replaced": replaced}, indent=1), encoding="utf8")
    print(f"wrote {dest.name}: {total / FPS:.1f}s from {len(windows)} windows; "
          f"capture width {mode}, {replaced} off-size frames held over")
    return 0


if __name__ == "__main__":
    sys.exit(main())
