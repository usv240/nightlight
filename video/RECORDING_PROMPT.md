# Demo video: recording prompt

Reusable across projects. Everything below that reads like an oddly
specific rule is there because it cost a take.

## Goal

A narrated screen recording of a working web product that pitches the
problem, who it is for and why it matters, then shows the product doing
the thing. No presenter on camera. The address of the live deployment is
on screen the whole time.

## Duration: set by the rules, not by taste

The hackathon rules say **a demo video under 3 minutes**, public, in
English, on YouTube or Vimeo, and that **judges are not required to watch
past the 3-minute mark**.

Treat 3:00 as a hard ceiling and aim at **2:50**. The last ten seconds are
insurance: a re-record that runs long, or duration rounding on the
platform, should not push a compliant video out of compliance. The beats
script exits non-zero if the plan is already over, before a single frame
is recorded, and the audit fails if the finished file is.

"Lead with your best material" is a ranking instruction, not a length one.
The strongest thing goes in the first forty seconds, because that is the
part everybody watches.

Per-track proof also has to be on camera, not in the README:

| Track | What the video must show |
|---|---|
| Ring | The project working through a simulator or a real Ring device |
| Fire TV | The project running on a real Fire TV device or the Fire TV/Vega simulator |
| Bee | Live Bee data doing something for a user; a mention is not enough |
| Alexa+ | The Agent Skill or MCP server in action |

No third-party trademarks, no copyrighted music or footage.

## Toolchain (no video editor at any point)

- Python 3.12, six scripts
- Playwright driving Chromium. It is both the automation and the camera:
  `record_video_dir` on the browser context
- Amazon Polly via the AWS CLI: engine **long-form**, voice **Patrick**,
  SSML `<prosody rate="87%">`, one `synthesize-speech` call per beat
- ffmpeg for every audio and video operation: `anullsrc` for silence, the
  concat demuxer for joining, `-ss`/`-t` for cuts, libx264, and the
  `subtitles` filter with `force_style` for burn-in
- ffprobe for measuring every intermediate duration
- The product deployed and live. Record against production.

Voice note: the long-form engine is better at a paragraph than neural is,
and this narration is paragraphs. The generative engine has other male
voices but ignores `prosody rate`, so choosing it means giving up the
pacing. On a script about a real person's bad night, the pacing is doing
work.

## Pipeline order, and why it is this order

Do NOT write the audio first and then make the screen keep up. A step that
is eight seconds on a good run is twenty-five when the service is cold, so
a video cut to a fixed plan is out of sync by the third beat.

```
python beats.py      # the script as data; fails if the plan is over 3:00
python narrate.py    # one Polly clip per beat
python record.py     # Playwright drives and films the live site
python assemble.py   # audio built against the recording, then dead air cut
python subtitle.py   # cues from the finished cut, burned in
python audit.py      # checks the built file against every instruction
```

1. **Script the beats as data, not prose.** One record per beat: the pause
   before it, which action drives the screen, and the exact line to say.
   Never type a timecode by hand; hand-written ones drift from the words
   they describe.
2. **Narrate before recording.** This is the opposite of the obvious order
   and it is deliberate. The narrator needs nothing but the beats file,
   and once the real length of each line is known, the recorder can time
   every cursor move to the sentence that describes what it is pointing
   at. Recording first means pointing blind.
3. **Record the screen.** Wait for each step to genuinely finish. Log the
   wall-clock moment every beat began.
4. **Assemble the audio against those logged moments**: silence up to each
   beat's true start, then the clip. The two tracks cannot drift, because
   the audio is built from the video.
5. **Cut dead air**, then rebuild the narration against the shortened
   timeline. A timing computed before a cut is wrong after it.
6. **Subtitle from the finished cut**, not from the plan.
7. **Audit the built file.** Not the plan, not the script document.

## Narration rules

- Open with a person, not a product: "Hi everyone, I am <name>." No pause
  in front of it. A judge should hear a human being before an interface.
- Then a cold open on the problem. Establish the moment things go wrong
  for the real person the product is for, before the product exists.
- Only after the problem lands, name the product in one sentence.
- Write the middle in the order a user would live it, not the order the
  system is built in. Beats are scenes, not features.
- Show the failure case. A product that only ever succeeds on camera is
  not believable. Show the one time it did not work and what it did then.
- Keep the uncomfortable number. Whatever your headline metric cost, say
  it out loud in the same breath. A claim a judge can dismantle is worse
  than no claim, and a claim you dismantle yourself is stronger than both.
- Close in two separate beats. First the close: the headline number, the
  reframe, then the product and its promise in one clause. Then a short
  "Thank you." on its own, because a sign-off crowded onto the end of the
  closing line gets swallowed.
- Never end on black, a logo, or a credits card. Hold both closing beats
  on the product in its finished, successful state. The last frame is the
  outcome, not branding.
- Speak the line, do not narrate the interface. Say what just became true
  for the person, not which tab was clicked.
- No emojis. No em dashes. Anywhere, including the captions.

## Live capture rules

**Record against the live deployed service.** Every button press is a real
call. No fixtures, no mockups, no staged screenshots.

**Put the address on screen.** Playwright films the page, not the browser,
so the recording has no address bar and a judge has only your word that
any of it is live. Inject a full-width bar at the top, dark, with a
padlock and the URL in monospace at about 19px, and push the page's own
sticky headers down by its height so nothing is clipped.

A small chip in a corner is not enough. It was tried and the verdict was
"there is no link visible", which is the only verdict that counts.

The bar must read `location.href` on a short interval, not a string you
baked in. That way it follows a client-side route change and cannot
display an address the page is not actually at. Draw nothing else: no
fake tabs, no back button, nothing implying an interaction that is not
happening.

**Reset state at the start** (POST the reset endpoint), so the run begins
from a clean, reproducible board. Then check that the reset endpoint is
idempotent, because you are about to call it on every take.

**Force the light theme before first paint**, so the recording does not
depend on the machine's OS theme.

## Navigation rules: show the hand, not just the result

**Draw a cursor.** The page contains no pointer, so inject one: a ring
that follows `mousemove` and a circle that expands on `mousedown`. Without
it, buttons change state with nothing touching them, which reads as a
video of a script running rather than a person using the product. Install
it on `DOMContentLoaded`, not at document start, or it is discarded when
the real document arrives.

**Navigate by clicking, not by `goto()`.** A scripted jump to a URL looks
like the page changed by itself. Travel to the control, pause long enough
to read what is about to be pressed, then press it with the pulse
animating. The address bar changing because something was clicked is the
proof that this is one live site and not three screenshots.

**Never jump-scroll.** Ease every scroll over about 26 animation frames.
A teleporting scroll reads as a dropped frame.

**Turn off the page's own `scroll-behavior: smooth` first.** With it on,
every frame of your easing is treated by the browser as a *new* animated
scroll rather than a position, so the scroll chases a moving target and
comes to rest wherever it happens to be. One shot rested 222px short of
its offset and put its last element under the burned-in caption, and it
had been quietly wrong in every earlier take. Inject
`html, body { scroll-behavior: auto !important }` rather than using
Playwright's reduced-motion flag, which would also disable the page's own
entrance animations, and those are part of what the product looks like.

**Then verify where the scroll landed and correct it.** A target computed
before the page has settled is stale by the time the animation ends:
content above it changes height and takes it with it. Measure the
element's viewport position afterwards and nudge once, with fewer frames
so the correction does not read as a second journey.

**Point at the thing while it is being said, not before.** This one is
easy to get wrong and invisible until you check. If an action runs to
completion before its line starts, the cursor sits on whatever it touched
last for the whole beat: on one take it rested on the red legend swatch
for the entire sentence that said "amber".

Make each action a generator. Everything before the `yield` composes the
shot in silence. Everything after runs while the line is spoken. Provide
an `on_sentence(n)` that waits for a sentence boundary, computed by the
same function the subtitler uses to split cues, so the pointer and the
caption cannot disagree about which sentence is playing.

**Wait on the DOM, not on the clock.** Poll for the real finished state.
Detect "finished" and "busy" separately: if every button being disabled is
read as busy, the recorder sits on a static screen until the timeout and
puts two minutes of nothing at the end of the video.

**Scroll a panel's top just below the sticky header and the address bar,
not to centre.** Centring a tall panel leaves half of it off screen. Every
offset is measured from the top of the viewport, so adding the address bar
means adding its height to all of them.

**A page can run out of page.** If the thing you must show is the last
element on the page, at maximum scroll it lands at the bottom of the frame
with the burned-in caption across it, and no offset fixes that, because
the document has ended. Add padding below the footer so the last element
can reach the middle of the shot.

**If the script claims a feature works, show it working on camera** rather
than saying it does.

## Resolution and quality

**1920x1080, and `record_video_size` must equal the viewport.**

Asking for a bigger capture does not render more page. Playwright fits the
viewport into the requested canvas and pads the remainder with flat grey,
so a 2560x1440 request came back as 1080p of product in the top-left
corner with grey over a third of the frame. The file was genuinely 1440p
and genuinely unusable. Assert the recorded dimensions match the viewport
and fail the run, because the grey looks like a deliberate background
until somebody measures it.

The quality lever that does work is **`device_scale_factor=2`**. The page
is laid out at 1920 CSS pixels and rendered at two device pixels each, so
every glyph is supersampled before the capture downsamples it. The layout
is untouched, because CSS pixels are untouched. On one project this alone
took the master from 403 kbps to 968 at the same frame size.

Encode for screen content, not for film: **crf 16, preset slow,
`-tune stillimage`** for the master and for every segment cut from it.
`stillimage` is x264's mode for large flat areas and hard edges, which is
what a screen recording is; the default deblocking softens type. Use the
same settings for the segments, or each generation takes another bite.
crf 18 for the final caption burn. Audio out at 192k aac, though Polly
tops out at 24 kHz mono for mp3, so that is the real ceiling.

A genuinely larger frame would need a larger viewport, which shows more
page at once and makes every word smaller relative to the frame. For a
judge watching in a browser window, that is a worse video.

## Cutting rules

- Allow each beat its line plus a little over a second of slack, and cut
  the tail past that.
- **Never speed anything up.** A step that genuinely took twelve seconds
  must still look like twelve seconds. A screen recording played fast is a
  lie about how quick the product is. What gets cut is only the tail where
  the screen has already settled and the line is already over.
- Expect one beat to dominate the cuts. Print the largest single stall so
  it is visible before the assembly rather than after it.

## Subtitle rules

- Generate cues from **where beats really landed in the finished cut**,
  not from planned timecodes. A narration clip that runs longer than the
  gap before the next beat pushes that beat later, so cues built from
  video positions drift from what a viewer hears. The assembler must
  report where each clip actually landed and the subtitler must use that.
- Subtitle the opening and the sign-off too. A muted viewer should get the
  introduction and the thank you, not just the middle.
- Split at sentence boundaries and share the beat's speaking time between
  cues in proportion to their length. Frame-accurate word alignment is not
  needed: every cue starts and ends on a real sentence boundary and the
  error inside a sentence is tenths of a second.
- **One line per cue, never two, at most 58 characters.** A second line is
  a second thing to find with your eyes while something is happening on
  screen. Split a long sentence on a clause boundary, and only on
  whitespace if it has no commas to give.
- **Background black at 80 percent opacity.** In ASS the alpha byte runs
  backwards: `&HAABBGGRR` where `00` is fully opaque and `FF` fully
  transparent, so 80 percent opaque is `0x33`. Use `&H33000000` with
  `BorderStyle=3`. `C0` was tried and left the text unreadable over the
  one shot where the numbers matter most; `14` was effectively solid and
  sat on the page like a bar of tape.
- **ASS font sizes scale against video height.** libass measures against
  `PlayResY`, which defaults to 288, so a size of 21 rendered as a banner
  across a third of a 1080p frame. 15 is about right at 1080p.
- Burn the captions in and also ship the .srt in the repo. Uploaded
  captions are off by default, and a video that argues for accessibility
  should not need a menu dive to be readable.
- **Do not upload the .srt alongside a video with burned-in captions**, or
  a viewer who enables CC sees two stacked sets.

## Audit rules

Write an audit script and run it before every upload. It is not optional
and it is not ceremony.

It exists because of a specific failure: feedback was applied carefully to
the prose script document, the video was then built from the beats file, a
different file, and five of the asks were silently lost. **A prose script
and a built video cannot be compared by reading them.**

Check the shipped artefacts, never the intent:

- the text Polly was actually given, for every phrase that was promised
- the beat records, for what the camera was pointed at
- the caption style string burned into the frames
- the encoded file's own duration, resolution and bitrate
- the finished file's **pixels**, for a flat grey band at the edge; the
  resolution check cannot see letterboxing, because the file really is the
  size it claims

One line per ask, `ok` or `MISS`, and a non-zero exit if anything missed.

When a check reads a source file, strip comments first. A test that
forbids the string `toUTCString` anywhere also forbids the comment
explaining why `toUTCString` was wrong, which is a check that bans writing
about the past rather than one that guards behaviour.

## Gotchas

**ffmpeg's subtitles filter parses its own argument string**, so a Windows
path containing a drive colon breaks the parse. Copy the .srt into the
working directory and pass the bare filename.

**Playwright selectors are not DOM selectors.** `document.querySelector`
does not understand `text=`. Resolve through the locator API.

**`text=` matches ancestors too.** `text=774` matched a paragraph that
says "Nightlight: 774." in prose as well as the card showing 774 at
display size, and the first in document order was the wrong one. Pin shot
selectors to ids and structure, not to words that appear twice.

**Do not put anything you want to keep in the build directory.** The
recorder wipes it. That is how a set of voice samples was generated,
handed over, and deleted before anybody could listen to them.

**Leaving the process is what finds the bug.** Both real defects on the
last project were invisible from inside the code and were caught by
recording: the demo reset endpoint was not idempotent, so the live demo
broke on a second click, and the app printed UTC under narration that said
"five past three". Pull still frames out of the finished cut and read
them. Every time.

**"a.m." is a sentence boundary to a naive splitter.** The sentence
splitter is shared by the recorder and the subtitler so they cannot
disagree, which also means they were wrong together: "three a.m. doorbell"
became two sentences, one cue read "A real three a.m." on its own, and
every cursor move after it fired a sentence early. Write "three in the
morning", and keep the splitter's guard against a.m. and p.m.
