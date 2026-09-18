"""Build the audio against the recording, then cut the dead air.

    python assemble.py

Two passes, in this order and not the other one.

**Pass one.** Lay each narration clip at the second its beat actually
began, taken from `timings.json`, with generated silence filling the gaps.
The two tracks cannot drift because the audio is constructed from the
video rather than the video being cut to fit a fixed audio plan. A beat
that ran long because the deployed service was slow is simply a longer
gap.

**Pass two.** Find every stretch where the line has finished and the
screen has already settled, and remove it from both tracks. Each beat
keeps its spoken line plus two seconds of slack; everything past that is
tail. Nothing is ever sped up: a step that genuinely took twelve seconds
still looks like twelve seconds, because a screen recording played fast
reads as a lie about how quick the product is.

Then the narration is rebuilt against the shortened timeline, because
timings computed before a cut are wrong after it.

The output includes `cues.json`: where every beat truly lands in the
finished cut. `subtitle.py` reads that rather than anything planned.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from beats import BEATS

OUT = Path(__file__).parent / "build"
SLACK = 2.0          # seconds a beat may hold after its line ends
TAIL_KEEP = 1.6      # seconds held after the very last word


def run(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"{args[0]} failed:\n{proc.stderr[-1500:]}")


def probe(path: Path) -> float:
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True).stdout.strip())


def silence(seconds: float, dest: Path) -> None:
    run(["ffmpeg", "-y", "-f", "lavfi", "-i",
         "anullsrc=channel_layout=stereo:sample_rate=44100",
         "-t", f"{max(seconds, 0.001):.3f}", "-c:a", "libmp3lame", "-q:a", "4",
         str(dest)])


def concat_audio(parts: list[Path], dest: Path) -> None:
    listing = dest.with_suffix(".txt")
    listing.write_text(
        "".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf8")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-c:a", "libmp3lame", "-q:a", "2", str(dest)])


def build_audio(starts: dict[str, float], narration: dict[str, float],
                total: float, workdir: Path, dest: Path) -> dict[str, float]:
    """Silence up to each beat's true start, then its clip.

    Returns where each clip actually begins in the finished audio, which
    is not always the beat's video position: a clip that runs longer than
    the gap before the next beat pushes that beat later. Subtitles must be
    cut against what a viewer hears, so they use this and not the plan.
    """
    workdir.mkdir(exist_ok=True)
    parts: list[Path] = []
    placed: dict[str, float] = {}
    clock = 0.0
    for i, beat in enumerate(BEATS):
        gap = starts[beat.key] - clock
        if gap > 0.01:
            s = workdir / f"gap{i}.mp3"
            silence(gap, s)
            parts.append(s)
            clock += gap
        placed[beat.key] = clock
        parts.append(OUT / "audio" / f"{beat.key}.mp3")
        clock += narration[beat.key]
    if total - clock > 0.01:
        s = workdir / "gap_end.mp3"
        silence(total - clock, s)
        parts.append(s)
    concat_audio(parts, dest)
    drift = max(abs(placed[b.key] - starts[b.key]) for b in BEATS)
    if drift > 0.5:
        print(f"  narration slips up to {drift:.1f}s behind its beat, "
              f"subtitles follow the audio")
    return placed


def plan_cuts(starts: dict[str, float], narration: dict[str, float],
              total: float) -> list[tuple[float, float]]:
    """Segments of the video worth keeping.

    A beat is allowed its line plus SLACK. Whatever sits between the end of
    that allowance and the start of the next beat is screen that has
    already settled with nothing being said over it.
    """
    keep: list[tuple[float, float]] = []
    cursor = 0.0
    for i, beat in enumerate(BEATS):
        at = starts[beat.key]
        allowed = at + narration[beat.key] + SLACK
        nxt = starts[BEATS[i + 1].key] if i + 1 < len(BEATS) else total
        end = min(allowed, nxt)
        keep.append((cursor, end))
        cursor = nxt
    # The last beat keeps a short hold so the final frame is the product
    # sitting there rather than a hard cut on the last syllable.
    last_start, last_end = keep[-1]
    keep[-1] = (last_start, min(total, last_end + TAIL_KEEP))
    merged: list[tuple[float, float]] = []
    for seg in keep:
        if merged and seg[0] - merged[-1][1] < 0.05:
            merged[-1] = (merged[-1][0], seg[1])
        else:
            merged.append(seg)
    return merged


def cut_video(src: Path, segments: list[tuple[float, float]], dest: Path,
              workdir: Path) -> None:
    pieces = []
    for i, (a, b) in enumerate(segments):
        if b - a < 0.08:
            continue
        piece = workdir / f"seg{i}.mp4"
        run(["ffmpeg", "-y", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}",
             "-i", str(src), "-c:v", "libx264", "-crf", "20",
             "-preset", "medium", "-pix_fmt", "yuv420p", "-an", str(piece)])
        pieces.append(piece)
    listing = workdir / "segments.txt"
    listing.write_text(
        "".join(f"file '{p.as_posix()}'\n" for p in pieces), encoding="utf8")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-c", "copy", str(dest)])


def main() -> int:
    timings = json.loads((OUT / "timings.json").read_text(encoding="utf8"))
    narr = {n["key"]: n["seconds"]
            for n in json.loads((OUT / "narration.json").read_text(encoding="utf8"))}
    starts = {b["key"]: b["at"] for b in timings["beats"]}
    total = timings["video"]
    work = OUT / "work"
    work.mkdir(exist_ok=True)

    # Pass two needs the plan, not pass one's output, so decide the cuts
    # from the recorded timings directly.
    segments = plan_cuts(starts, narr, total)
    removed = total - sum(b - a for a, b in segments)
    print(f"raw {total:.1f}s, cutting {removed:.1f}s of settled screen")

    biggest = max(
        ((BEATS[i].key,
          (starts[BEATS[i + 1].key] if i + 1 < len(BEATS) else total)
          - (starts[b.key] + narr[b.key] + SLACK))
         for i, b in enumerate(BEATS)),
        key=lambda kv: kv[1])
    if biggest[1] > 1:
        print(f"  largest single stall: {biggest[0]}, {biggest[1]:.1f}s")

    cut = OUT / "screen_cut.mp4"
    cut_video(OUT / "screen.mp4", segments, cut, work)
    cut_len = probe(cut)

    # Rebuild the beat starts against the shortened timeline. A beat's new
    # start is its old start minus everything cut before it.
    def shift(t: float) -> float:
        kept = 0.0
        for a, b in segments:
            if t >= b:
                kept += b - a
            elif t > a:
                kept += t - a
                break
            else:
                break
        return kept

    new_starts = {k: shift(v) for k, v in starts.items()}
    placed = build_audio(new_starts, narr, cut_len, work, OUT / "narration.mp3")

    final = OUT / "nightlight-demo.mp4"
    run(["ffmpeg", "-y", "-i", str(cut), "-i", str(OUT / "narration.mp3"),
         "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", str(final)])

    (OUT / "cues.json").write_text(json.dumps(
        {"duration": round(probe(final), 3),
         "beats": [{"key": b.key, "at": round(placed[b.key], 3),
                    "seconds": narr[b.key], "say": b.say} for b in BEATS]},
        indent=1), encoding="utf8")

    dur = probe(final)
    print(f"\nfinal {int(dur // 60)}:{dur % 60:04.1f}  ({dur:.1f}s)")
    print("ceiling 3:00", "ok" if dur <= 180 else "OVER")
    print(f"wrote {final.name} and cues.json")
    return 0 if dur <= 180 else 1


if __name__ == "__main__":
    raise SystemExit(main())
