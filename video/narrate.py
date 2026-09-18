"""Synthesise one narration clip per beat with Amazon Polly.

    python narrate.py

One `synthesize-speech` call per beat rather than one for the whole
script, because the assembler needs to place each line at the second its
beat actually began. A single long clip can only be laid down at the start
and then hoped about.

Voice and engine: Gregory, long-form. The long-form engine is noticeably
better at a paragraph than neural is, and this narration is paragraphs.
The rate is 87 percent because the default pace reads as an advertisement
and this is a video about somebody's exhausted parent.

SSML rather than plain text, so the rate applies to the whole line and
punctuation is respected rather than guessed at.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from beats import BEATS

OUT = Path(__file__).parent / "build"
AUDIO = OUT / "audio"
REGION = "us-east-1"
VOICE = "Gregory"
ENGINE = "long-form"
RATE = "87%"


def ssml(line: str) -> str:
    return f'<speak><prosody rate="{RATE}">{escape(line)}</prosody></speak>'


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return float(out)


def main() -> int:
    if not OUT.exists():
        print("build/ is missing. Run record.py first.", file=sys.stderr)
        return 1
    AUDIO.mkdir(exist_ok=True)

    manifest = []
    for beat in BEATS:
        dest = AUDIO / f"{beat.key}.mp3"
        proc = subprocess.run(
            ["aws", "polly", "synthesize-speech",
             "--region", REGION,
             "--engine", ENGINE,
             "--voice-id", VOICE,
             "--output-format", "mp3",
             "--text-type", "ssml",
             "--text", ssml(beat.say),
             str(dest)],
            capture_output=True, text=True,
        )
        if proc.returncode != 0:
            print(f"polly failed on {beat.key}:\n{proc.stderr[:400]}", file=sys.stderr)
            return 1
        secs = duration(dest)
        manifest.append({"key": beat.key, "file": dest.name,
                         "seconds": round(secs, 3), "say": beat.say})
        # The estimate is only ever a planning number. Print both so a
        # large gap is visible before the assembly rather than after it.
        print(f"  {beat.key:20} {secs:5.2f}s  (planned {beat.speak_seconds:5.2f}s)")

    total = sum(m["seconds"] for m in manifest)
    (OUT / "narration.json").write_text(json.dumps(manifest, indent=1), encoding="utf8")
    print(f"\n{len(manifest)} clips, {total:.1f}s of speech")
    print("wrote narration.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
