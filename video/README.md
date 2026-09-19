# The demo video, built by six scripts

No video editor at any point. Run in order:

```
python beats.py        # the script as data; fails if the plan is over 3:00
python record.py       # Playwright drives and films the live site
python narrate.py      # one Amazon Polly clip per beat
python assemble.py     # audio built against the recording, then dead air cut
python subtitle.py     # cues from the finished cut, burned in
python audit.py        # checks the built file against every instruction
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

**A page can run out of page.** The escalated incident is the last card on
the caregiver app, so at maximum scroll it sits at y=866 of a 1080 frame
and the burned-in caption lands across it. No offset fixes that, because
the document has ended. `give_scroll_room` adds space below the footer so
the last card can reach the middle of the shot.

**`text=` matches ancestors too.** `text=774` also matches the proof
banner, which says "Nightlight: 774." in prose, so the cursor pointed at a
paragraph instead of the card it was describing. Shot selectors are
pinned to ids and structure.

**A recording has no address bar.** Playwright films the page, not the
browser, so a judge has only the presenter's word that any of it is live.
`URL_CHIP_JS` renders `location.href` and re-reads it four times a second,
which means it follows a route change and cannot display an address the
page is not actually at.

## Why audit.py exists

Feedback was applied carefully to `docs/VIDEO_SCRIPT.md`, then the video
was built from `beats.py`, a different file, and five of the asks were
silently lost. A prose script and a built video cannot be compared by
reading them. `audit.py` reads the shipped artefacts instead: the text
Polly was given, the beats the recorder ran, the caption style burned into
the frames, and the encoded file's own duration and bitrate.

## The bugs this found

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

A still frame pulled from the finished cut showed the incident record
printing `Opened Sun, 13 Sep 2026 07:05:00 GMT` underneath narration that
said "five past three", on the same screen where Recent nights already
said `02:40`. The caregiver app was rendering UTC. Fixed in
`apps/web/src/lib/time.ts` and pinned by
`apps/web/test/opened-local.test.ts`.

Neither bug is visible from inside the process. One needed the demo reset
before filming; the other needed somebody to read a frame.
