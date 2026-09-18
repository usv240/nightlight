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

from dataclasses import dataclass, field

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
        action="blank",
        pause_before=0.0,
        say="Hi everyone, I am Ujwal.",
        note=(
            "A human before an interface. Spoken over a blank screen, no "
            "pause in front of it, so the video starts with a person."
        ),
    ),
    Beat(
        key="problem",
        action="blank",
        pause_before=0.4,
        say=(
            "It is three in the morning. Someone living with dementia opens "
            "the front door. Every door alarm on the market answers that the "
            "same way: it wakes the person caring for them. Night after "
            "night, until they cannot do it any more."
        ),
        note=(
            "Cold open on the problem with nothing on screen. The moment "
            "things go wrong for the person the product is for, before the "
            "product exists."
        ),
    ),
    Beat(
        key="name-it",
        action="landing_hero",
        pause_before=0.6,
        say=(
            "Nightlight tries something gentler first. A familiar recorded "
            "voice, asking them to come back inside. It wakes the caregiver "
            "only if that does not work."
        ),
        note="The product, named once, after the problem has landed.",
    ),
    Beat(
        key="strip",
        action="landing_strip",
        pause_before=0.5,
        min_hold=15.0,
        say=(
            "This is a month in one household. Every mark is a night. Amber "
            "means the voice settled it and nobody was woken. Red means it "
            "did not, and the caregiver was woken. Twenty-nine of thirty "
            "nights slept through."
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
            "Here is one of those nights, from the caregiver's app, running "
            "against the live service. Twenty to three in the morning, the "
            "door opened outside this household's normal pattern. The "
            "recorded voice played at the chime. The person came back "
            "inside, and nobody was woken."
        ),
        note="The story of a single night, in the order a family lives it.",
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
            "And this is the only number on the page. Eighteen nights slept "
            "in a row, twenty-nine of the last thirty in total. Not "
            "incidents detected. Nights nobody was woken."
        ),
        note=(
            "Both numbers on one screen, because meeting 29 and 18 on two "
            "pages reads as a contradiction."
        ),
    ),
    Beat(
        key="evidence",
        action="evidence",
        pause_before=0.6,
        say=(
            "Measured on two thousand nine hundred and thirty-six nights "
            "from thirty-four real homes we did not collect. A standard "
            "alarm would have woken the caregiver fourteen thousand times. "
            "Nightlight woke them seven hundred and seventy-four."
        ),
        note="Numbers from data we did not author, shown on the page.",
    ),
    Beat(
        key="cost",
        action="evidence_cost",
        pause_before=0.4,
        say=(
            "And here is what that cost, because waking someone less often "
            "is easy if you simply stop noticing. Of thirty-four labelled "
            "night exits it flagged seven, and twenty-six of the twenty-"
            "seven it missed, the resident came back within half an hour."
        ),
        note=(
            "The uncomfortable number. It is what makes the others "
            "believable rather than merely impressive."
        ),
    ),
    Beat(
        key="close",
        action="landing_strip_final",
        pause_before=0.5,
        min_hold=6.0,
        say=(
            "Nightlight. So that the nights stop being the reason a family "
            "gives up."
        ),
        note=(
            "Product plus promise in one clause, held on the quiet row. "
            "Never on a logo or a terminal."
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
