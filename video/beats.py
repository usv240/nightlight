"""The demo video as data, not prose.

One record per beat: the pause before it, what the recorder should do, and
the exact line Polly will say. Nothing else in the pipeline may invent a
timecode; every downstream step derives its timing from here, and after
recording, from where each beat actually landed.

Why data rather than a prose script
-----------------------------------
A prose script has to be read and interpreted by three separate programs:
the recorder, the narrator and the subtitler. Each interpretation is a
chance to drift. Here the line that Polly speaks, the cue that appears in
the subtitles, and the action the browser takes are the same record, so
they cannot disagree about what beat four is.

Estimated timings are for planning only. `record.py` logs the wall clock
moment each beat truly began, and `assemble.py` builds the audio against
those logged moments rather than against anything computed here. That is
the whole reason the two tracks cannot drift: the audio is built from the
video, never the other way around.

The hard constraint
-------------------
The hackathon rules give a **three minute** ceiling, not five, and say
judges are not required to watch past it. Every line below is written to
that budget. `python beats.py` prints the estimate and exits non-zero if
the plan is already over, so the script is checked before a single frame
is recorded.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Measured from the September take: Patrick long-form at 95 percent spoke
# 400 words in 164.8 seconds. Used only for the
# pre-flight estimate; real timings come from the recording.
WORDS_PER_MINUTE = 146
CEILING_SECONDS = 180


@dataclass
class Beat:
    key: str
    """Stable id. Used for the audio filename and the timing log."""

    say: str
    """Exactly what Polly speaks. Also the source of the subtitle cues."""

    action: str
    """Which function in record.py drives the screen for this beat."""

    pause_before: float = 0.0
    """Dead seconds held before the line starts, for the shot to settle."""

    min_hold: float = 0.0
    """Floor on the shot's length, over and above the line plus pause."""

    note: str = ""
    """Why this beat exists. Read by a human, never by the pipeline."""

    @property
    def words(self) -> int:
        return len(self.say.split())

    @property
    def speak_seconds(self) -> float:
        return self.words * 60.0 / WORDS_PER_MINUTE

    @property
    def budget(self) -> float:
        return max(self.pause_before + self.speak_seconds, self.min_hold)


BEATS: list[Beat] = [
    Beat(
        key="problem",
        action="landing_problem",
        say=(
            "It's three in the morning. Someone living with dementia opens "
            "the front door. Most door alarms answer the same way: they wake "
            "the person caring for them. Night after night, until they can't "
            "keep going."
        ),
        note=(
            "The problem first, over the live site, address on screen from "
            "the first frame. 'Most', not 'every': the one absolute a judge "
            "could challenge (review round 3)."
        ),
    ),
    Beat(
        key="answer-first",
        action="landing_answer",
        pause_before=0.5,
        say=(
            "Nightlight answers the door first. A recorded family voice asks "
            "them to come back inside. Only if that isn't enough does it wake "
            "the caregiver. It learns each household's normal nights, so a "
            "school run or a late delivery never sets it off. And it runs on "
            "the Ring doorbell the family already has."
        ),
        note=(
            "The line the reviewer named most memorable, then how it knows "
            "3am is unusual, which a judge otherwise has to guess."
        ),
    ),
    Beat(
        key="playground",
        action="ring_playground",
        pause_before=0.5,
        min_hold=14.1,
        say=(
            "Here it is on Ring's own developer Playground. Ring's sandbox "
            "doorbell reports motion."
        ),
        note=(
            "Ring's simulator, answering the track rule directly. The web "
            "take holds here and splice_ring.py lays the console footage "
            "from record_ring.py over exactly this beat."
        ),
    ),
    Beat(
        key="ring-reads",
        action="ring_reads",
        say="And Nightlight reads it straight from the Ring API.",
        note="docs/RING_LIVE.md on GitHub: the client's own calls, answered.",
    ),
    Beat(
        key="signed",
        action="signed",
        pause_before=0.5,
        say=(
            "Every event from Ring is signed. A tampered one is rejected. A "
            "repeat is ignored, so the voice never plays twice."
        ),
        note="Beat 3 proves Ring; this proves it was engineered seriously.",
    ),
    Beat(
        key="month",
        action="demo_month",
        pause_before=0.5,
        say=(
            "Here's a simulated month, on the real engine. At twenty to "
            "three, the door opens. The voice plays, they come back inside, "
            "and nobody is woken."
        ),
        note="Said to be simulated, and labelled so on screen.",
    ),
    Beat(
        key="escalated",
        action="demo_escalated",
        pause_before=0.5,
        say=(
            "And the night it didn't work. The activity kept going, so the "
            "caregiver was woken. If the voice can't play at all, it wakes "
            "them straight away."
        ),
        note="Showing the failure is what makes the successes believable.",
    ),
    Beat(
        key="family-voice",
        action="family_voice",
        pause_before=0.5,
        min_hold=10.0,
        say=(
            "This is the message a family records: Dad, it's night time. "
            "Come back inside. I'll see you in the morning."
        ),
        note=(
            "The most human moment, on its own, with two seconds of quiet "
            "after it. Do not press Record on camera; a real browser raises "
            "a microphone permission dialog."
        ),
    ),
    Beat(
        key="caregiver",
        action="caregiver",
        pause_before=0.5,
        say=(
            "The caregiver sees one number: the nights they slept. Claude on "
            "Amazon Bedrock writes the morning note, but only from facts the "
            "engine computed."
        ),
        note="Bedrock as one clause, inside the product.",
    ),
    Beat(
        key="assistant",
        action="alexa_session",
        pause_before=0.5,
        say=(
            "And in the morning, a caregiver can simply ask an assistant how "
            "the night went. Nightlight answers over the Model Context "
            "Protocol, the way Alexa+ talks to tools."
        ),
        note="The one place the video shows the Alexa+ entry. The cut if time is short.",
    ),
    Beat(
        key="real-homes",
        action="real_homes",
        pause_before=0.6,
        min_hold=16.5,
        say=(
            "On thirty-four real homes from a public research corpus, a "
            "standard door alarm would have woken the caregiver fourteen "
            "thousand times. Nightlight woke them seven hundred and "
            "seventy-four."
        ),
        note="The two numbers own the frame and hold three seconds after the line.",
    ),
    Beat(
        key="restraint",
        action="evidence_cost",
        say=(
            "And when it chose not to wake anyone during a real exit, "
            "twenty-six times out of twenty-seven the person came home "
            "within half an hour."
        ),
        note="Without it, 14,068 to 774 could read as ignoring events.",
    ),
    Beat(
        key="why",
        action="why_privacy",
        pause_before=0.5,
        say=(
            "Seventy percent of caregivers who moved a relative into care "
            "cited the nights. Nightlight needs no new hardware, and it "
            "stores no video, no audio, and nothing that identifies a person."
        ),
        note="Names the mechanism without claiming Nightlight changes it.",
    ),
    Beat(
        key="close",
        action="landing_close",
        pause_before=0.5,
        min_hold=15.5,
        say=(
            "It's not about detecting more. It's about knowing when waking "
            "someone is actually needed. Nightlight. Let the house respond "
            "first."
        ),
        note=(
            "Calls back to 'answers the door first'. Two seconds on the "
            "strip, then the silent end card with the links, then black."
        ),
    ),
]


# --------------------------------------------------------------------------
# Where inside a line each sentence falls.
#
# Two things need this and they must agree: the subtitler, which puts a cue
# on screen, and the recorder, which moves the cursor to whatever that cue
# is talking about. If they disagree the pointer describes one thing while
# the words describe another, which is worse than not pointing at all.
# --------------------------------------------------------------------------

def sentences(line: str) -> list[str]:
    # Not after "a.m." or "p.m.": a script once read "three a.m. doorbell"
    # and the split put "A real three a.m." on its own cue and moved every
    # cursor cue after it one sentence early. The recorder and the
    # subtitler share this function, so they were wrong together.
    parts = re.split(r"(?<=[.!?])(?<![ap]\.m\.)\s+", line.strip())
    return [p.strip() for p in parts if p.strip()]


def sentence_spans(line: str, seconds: float) -> list[tuple[float, float]]:
    """Start and end of each sentence, in seconds from the line's start.

    Share by character count. Speech is not uniform, but the error inside
    one sentence is tenths of a second, and every boundary is a real
    boundary, which is what a cursor move needs.
    """
    parts = sentences(line)
    total = sum(len(p) for p in parts) or 1
    spans: list[tuple[float, float]] = []
    clock = 0.0
    for part in parts:
        span = seconds * len(part) / total
        spans.append((clock, clock + span))
        clock += span
    return spans


def estimate() -> float:
    return sum(b.budget for b in BEATS)


def main() -> int:
    total = estimate()
    print(f"{len(BEATS)} beats, {sum(b.words for b in BEATS)} spoken words\n")
    clock = 0.0
    for b in BEATS:
        print(
            f"  {int(clock // 60)}:{int(clock % 60):02d}  {b.key:20} "
            f"{b.budget:5.1f}s  {b.action}"
        )
        clock += b.budget
    print(f"\nestimated runtime {int(total // 60)}:{int(total % 60):02d}")
    print(f"ceiling {CEILING_SECONDS // 60}:{CEILING_SECONDS % 60:02d}")
    if total > CEILING_SECONDS:
        print("\nOVER THE CEILING. Cut a beat before recording anything.")
        return 1
    print(f"\n{CEILING_SECONDS - total:.0f}s of headroom for the screen to keep up.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
