# The demo video, built by five scripts

No video editor at any point. Run in order:

```
python beats.py        # the script as data; fails if the plan is over 3:00
python record.py       # Playwright drives and films the live site
python narrate.py      # one Amazon Polly clip per beat
python assemble.py     # audio built against the recording, then dead air cut
python subtitle.py     # cues from the finished cut, burned in
```

Output lands in `build/`: `nightlight-demo-captioned.mp4` is the upload,
`nightlight-demo.srt` ships for anyone who wants the text.

## Why the order is this way

Do not write the audio first and then make the screen keep up. A page load
that takes three seconds on a good run takes nine when the Lambda is cold,
and a video cut to a fixed plan is out of sync by the third beat.

So the video is recorded first and `record.py` logs the wall clock second
every beat truly began. `assemble.py` lays each narration clip at those
logged seconds with generated silence between them. **The two tracks
cannot drift because the audio is built from the video.**

Dead air is then cut from both, and the narration rebuilt against the
shortened timeline, because a timing computed before a cut is wrong after
it. Nothing is ever sped up: a step that took twelve seconds still looks
like twelve seconds, since a screen recording played fast is a lie about
how quick the product is.

## Things that cost a take

**The page has no cursor.** Playwright records the page, and a page
contains no pointer, so buttons change state with nothing touching them
and it reads as a script running rather than a person using a product.
`record.py` injects a ring on DOMContentLoaded, not at document start: an
init script that runs before the real document arrives is discarded with
it.

**Jump scrolling reads as a dropped frame.** Every scroll is eased over
about 26 animation frames.

**Playwright selectors are not DOM selectors.** `document.querySelector`
does not understand `text=`. Resolve through the locator API.

**Subtitles must follow the audio, not the plan.** A narration clip that
runs longer than the gap before the next beat pushes that beat later, so
cues generated from video positions drift from what a viewer hears. The
assembler reports where each clip actually landed and the subtitler uses
that.

**ffmpeg's subtitles filter parses its own argument string**, so a Windows
path with a drive colon breaks the parse. The .srt is copied next to the
video and passed as a bare filename.

**ASS font sizes scale against video height.** 21 looked reasonable in the
file and rendered as a banner across a third of a 1080p frame.

**Do not upload the .srt alongside the captioned mp4.** A viewer enabling
CC would see two stacked sets.

## The bug this found

`record.py` resets demo state before filming, and the recording then
showed "streak: 1 night" and "no incidents recorded" while the narration
said eighteen.

`POST /api/demo/replay` reset the runtime but not the deduper. Every
replayed event carries the same request id as the last replay, which is
exactly what duplicate suppression is for when Ring redelivers a webhook,
so a second call dropped all 204 events. The endpoint is linked from the
README and is the first thing anyone exploring the API presses. Clicking
it twice, which a judge would, broke the live demo.

Fixed, and pinned by `apps/backend/test/replay-idempotent.test.ts`,
including a test that a genuine redelivery of a single event is still
suppressed.
