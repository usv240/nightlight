"""How long the demo script actually takes to say.

    python scripts/count-narration.py

Counts only the narration, which is the text inside a `> **"..."**` block,
continuation lines included.

This exists because an earlier estimate was wrong by nearly two minutes.
The count was taken with a filter that matched the first line of each
quote and skipped every continuation, so a three line quote counted as
one, and a script advertised as 2:40 was really 5:09. The rules give a
hard three minute ceiling, so the number has to be checkable rather than
asserted.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Page loads, the demo run, and two deliberate pauses.
OVERHEAD_SECONDS = 25


def narration(text: str) -> str:
    words: list[str] = []
    inside = False
    for line in text.splitlines():
        if not line.startswith(">"):
            inside = False
            continue
        body = line.lstrip("> ").rstrip()
        if body.startswith('**"'):
            inside = True
        if inside:
            words.append(re.sub(r'[*"]', " ", body))
        if body.endswith('"**'):
            inside = False
    return " ".join(words)


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/VIDEO_SCRIPT.md")
    words = len(narration(path.read_text(encoding="utf8")).split())
    print(f"{words} spoken words")
    over = False
    for wpm in (130, 150):
        total = round(words * 60 / wpm) + OVERHEAD_SECONDS
        flag = "OVER THE CEILING" if total > 180 else "ok"
        if total > 180:
            over = True
        print(f"  at {wpm} wpm: {total // 60}:{total % 60:02d}  {flag}")
    print("\nReading pace is the only variable nobody can estimate for you.")
    print("Time one read-through out loud before you record.")
    return 1 if over else 0


if __name__ == "__main__":
    raise SystemExit(main())
