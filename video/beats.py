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

# Polly long-form Gregory at 87 percent lands near this. Used only for the
# pre-flight estimate; real timings come from the recording.
WORDS_PER_MINUTE = 135
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
        key="hello",
        action="landing_hold",
        pause_before=0.0,
        say="Hi everyone, I am Ujwal.",
        note=(
            "A human before an interface. No pause in front of it, so the "
            "video starts with a person rather than with a page."
        ),
    ),
    Beat(
        key="problem",
        action="landing_hold",
        pause_before=0.4,
        say=(
            "It is three in the morning. Someone living with dementia opens "
            "the front door. Every door alarm answers the same way: it wakes "
            "the person caring for them, night after night, until they cannot "
            "do it any more."
        ),
        note=(
            "The problem first, over the live site. Opening on a blank "
            "background read as a video that had not started, and gave up "
            "the one thing a blank screen cannot carry: the real address, "
            "on screen from the first frame."
        ),
    ),
    Beat(
        key="name-it",
        action="landing_hero",
        pause_before=0.6,
        say=(
            "Nightlight tries something gentler first. A familiar recorded "
            "voice, asking them to come back inside. It wakes the caregiver "
            "only if that fails."
        ),
        note="The product, named once, after the problem has landed.",
    ),
    Beat(
        key="strip",
        action="landing_strip",
        pause_before=0.5,
        min_hold=15.0,
        say=(
            "A month of nights. Every mark is one. Amber: the "
            "voice settled it, nobody woken. Red: it did not, and the "
            "caregiver was woken. Twenty-nine of thirty nights slept "
            "through."
        ),
        note=(
            "The visual argument. Held long enough to rest on each legend "
            "swatch, because the whole page depends on two colours."
        ),
    ),
    Beat(
        key="night",
        action="app_open",
        pause_before=0.6,
        say=(
            "Here is one of those nights. "
            "Twenty to three in the morning, the door opened outside this "
            "household's pattern. The voice played, the person came back "
            "inside, nobody woken."
        ),
        note=(
            "The story of a single night, in the order a family lives it. "
            "The sentence that used to claim it was real is gone: the ring "
            "beat now shows it instead."
        ),
    ),
    Beat(
        key="escalate",
        action="app_escalation",
        pause_before=0.5,
        say=(
            "And the night it did not work. Five past three, the activity "
            "kept going, so the caregiver was woken. It never fails silently."
        ),
        note=(
            "The second half of the sentence a judge should remember. "
            "Showing the failure is what makes the successes believable."
        ),
    ),
    Beat(
        key="voice",
        action="app_voice",
        pause_before=0.5,
        say=(
            "This is the message a family records. Dad, it is night time. "
            "Come back inside. I will see you in the morning."
        ),
        note=(
            "The most human line in the project. Do not press Record on "
            "camera; a real browser raises a microphone permission dialog."
        ),
    ),
    Beat(
        key="streak",
        action="app_streak",
        pause_before=0.5,
        say=(
            "Eighteen nights slept "
            "in a row, twenty-nine of the last thirty in total. Not "
            "incidents detected. Nights nobody was woken."
        ),
        note=(
            "Both numbers on one screen, because meeting 29 and 18 on two "
            "pages reads as a contradiction."
        ),
    ),
    Beat(
        key="ring",
        action="ring_proof",
        pause_before=0.5,
        say=(
            "This is the Ring Partner API. Three signed Ring webhooks. A real "
            "3am doorway event, accepted. Tampered in transit, rejected. A "
            "retry, ignored. The voice never plays twice."
        ),
        note=(
            "The rules require the video to show the project working through "
            "Ring, not to say so. Three real deliveries to the live endpoint, "
            "and the two failures are the ones that make the success mean "
            "anything."
        ),
    ),
    Beat(
        key="connect",
        action="ring_connect",
        pause_before=0.5,
        say=(
            "And this is how a family connects their own doorbell. Three of "
            "these four steps are live right now. The fourth is Ring's "
            "certification."
        ),
        note=(
            "The question a family asks before any of the others: how do I "
            "get this. Ending on the step that is not ours is deliberate. A "
            "judge trusts a team that knows exactly where its product stops "
            "more than one that implies it is finished."
        ),
    ),
    Beat(
        key="evidence",
        action="evidence",
        pause_before=0.6,
        say=(
            "Thirty-four real homes we did not collect. A "
            "standard alarm would have woken the caregiver fourteen thousand "
            "times. Nightlight woke them seven hundred and seventy-four."
        ),
        note="Numbers from data we did not author, shown on the page.",
    ),
    Beat(
        key="cost",
        action="evidence_cost",
        pause_before=0.4,
        say=(
            "And what that cost. Of thirty-four labelled "
            "night exits it flagged seven, and twenty-six of the twenty-"
            "seven it missed, the resident came back within half an hour."
        ),
        note=(
            "The uncomfortable number. It is what makes the others "
            "believable rather than merely impressive."
        ),
    ),
    Beat(
        key="depth",
        action="page_depth",
        pause_before=0.5,
        say=(
            "Every claim here has its reasoning under it: the research, the "
            "ladder, the browser demo. Nightlight "
            "never stores video, audio, location, or identity data. The "
            "Ring API offers none, and we want none."
        ),
        note=(
            "The page is deeper than the six shots before this, and a judge "
            "who never scrolls will not know. The first sentence names what "
            "the camera is travelling past, which is the fix for an earlier "
            "cut where the words described the privacy list while the "
            "screen was still three sections above it. It rests on the "
            "things the product refuses to hold, the strongest thing on the "
            "page for something that lives in somebody's home."
        ),
    ),
    Beat(
        key="close",
        action="landing_strip_final",
        pause_before=0.5,
        min_hold=9.0,
        say=(
            "Across two thousand nine hundred and thirty-six real nights, "
            "Nightlight reduced caregiver wake-ups by ninety-four and a half "
            "percent. It is not about detecting more. It is about knowing "
            "when waking someone is actually needed. Nightlight. So that the "
            "nights stop being the reason a family gives up."
        ),
        note=(
            "The headline number, the reframe, then product plus promise, "
            "held on the quiet row. Never on a logo or a terminal."
        ),
    ),
    Beat(
        key="thanks",
        action="hold",
        pause_before=0.4,
        min_hold=2.2,
        say="Thank you.",
        note=(
            "Its own beat. Crowded onto the closing line it gets swallowed. "
            "Nothing follows it."
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
