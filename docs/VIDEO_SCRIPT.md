# Demo video script: Nightlight

**The beats are data, in [`video/beats.py`](../video/beats.py).** That file
is what the pipeline reads: the exact line spoken, which shot it goes over,
and how long it holds. This document is the argument for why those beats
are in that order. If the two disagree, the code is right and this is stale.

**Built 2026-10-05: 2:55.5, 3840x2160, captions burned in, fade to black.**
`python video/audit.py` checks the shipped file against all 28 asks below
and the recording rules; it reads the file, not this page.

Recount the spoken words any time:

```
python scripts/count-narration.py
```

## The five ideas a judge should leave with

1. Most door alarms answer a 3am doorway the same way: they wake the caregiver, night after night.
2. **Nightlight answers the door first**, with a family voice, and wakes someone only when that is not enough.
3. It runs on Ring, shown working through Ring's own developer Playground.
4. On real homes it would have woken caregivers 774 times instead of 14,068.
5. It needs no new hardware: the doorbell is already on the door.

## The beats

| # | Shot | Narration |
|---|---|---|
| 1 | The live site: the thirty-night strip, the one red night | > **"It's three in the morning. Someone living with dementia opens the front door. Most door alarms answer the same way: they wake the person caring for them. Night after night, until they can't keep going."** |
| 2 | The headline, then the four steps of "How it works" | > **"Nightlight answers the door first. A recorded family voice asks them to come back inside. Only if that isn't enough does it wake the caregiver. It learns each household's normal nights, so a school run or a late delivery never sets it off. And it runs on the Ring doorbell the family already has."** |
| 3 | **Ring's developer Playground** at developer.amazon.com: the sandbox doorbell, a simulated Motion event and its live stream | > **"Here it is on Ring's own developer Playground. Ring's sandbox doorbell reports motion."** |
| 4 | docs/RING_LIVE.md on GitHub: Nightlight's own client calls, answered | > **"And Nightlight reads it straight from the Ring API."** |
| 5 | The site's Ring section: three signed deliveries pressed live, accepted, rejected, ignored | > **"Every event from Ring is signed. A tampered one is rejected. A repeat is ignored, so the voice never plays twice."** |
| 6 | The live demo, "Simulated household" in frame, September 23 | > **"Here's a simulated month, on the real engine. At twenty to three, the door opens. The voice plays, they come back inside, and nobody is woken."** |
| 7 | The live demo, September 12, the red night | > **"And the night it didn't work. The activity kept going, so the caregiver was woken. If the voice can't play at all, it wakes them straight away."** |
| 8 | The caregiver app, the voice card | > **"This is the message a family records: Dad, it's night time. Come back inside. I'll see you in the morning."** |
| 9 | The caregiver app, the eighteen-night count and the morning note | > **"The caregiver sees one number: the nights they slept. Claude on Amazon Bedrock writes the morning note, but only from facts the engine computed."** |
| 10 | "Ask Alexa how the night went": a session with the deployed MCP server | > **"And in the morning, a caregiver can simply ask an assistant how the night went. Nightlight answers over the Model Context Protocol, the way Alexa+ talks to tools."** |
| 11 | "Tested on 2,936 nights of real homes. Not ours.": 14,068 and 774, held | > **"On thirty-four real homes from a public research corpus, a standard door alarm would have woken the caregiver fourteen thousand times. Nightlight woke them seven hundred and seventy-four."** |
| 12 | The measured box: what that restraint cost | > **"And when it chose not to wake anyone during a real exit, twenty-six times out of twenty-seven the person came home within half an hour."** |
| 13 | The 70 percent card, then the privacy section | > **"Seventy percent of caregivers who moved a relative into care cited the nights. Nightlight needs no new hardware, and it stores no video, no audio, and nothing that identifies a person."** |
| 14 | The strip, then an end card with the live site, the repository and ring-webhook-kit, then black | > **"It's not about detecting more. It's about knowing when waking someone is actually needed. Nightlight. Let the house respond first."** |

## Wording that was changed on purpose

The script went through four review rounds. The changes that matter for
honesty:

- **"Most door alarms"**, not "every". The one absolute in the opening, and
  the one a judge could challenge.
- **"A simulated month"** is said out loud. The September cut said "here is
  one of those nights" over the simulated household; the label was on
  screen, but a viewer should not have to read it to know.
- **The restraint sentence stays.** Without it, 14,068 to 774 could read as
  Nightlight ignoring events.
- **The 70 percent names the mechanism and claims nothing.** It is Pollak
  and Perlick's finding about why families move a relative into care.
  Nightlight does not claim to delay that, and the close no longer implies
  it: "so the nights stop being the reason a family gives up" became "Let
  the house respond first".
- **No real people.** Every household on screen is simulated and labelled;
  every outcome number is from the public CASAS corpus.

## The footage

Beat 3 is Ring's own console, filmed by `video/record_ring.py` in the
signed-in Chrome profile, with the address bar drawn in and every
credential-shaped string (the token, the curl command, the WHEP session,
device identifiers) blurred before it is painted. Generating the token was
a person's click; everything after it, invoking the device list and
simulating Motion, was driven on camera. `video/splice_ring.py` cuts three
windows from that take (the Playground heading, the Motion press, the
stream) and normalises Chrome's frame-to-frame capture scale; the wait
while Ring connects the stream is cut, not sped up.

The stream in Ring's sandbox is Ring's sample clip, "Birds on Feeders" by
Vimeo user Michael Black under CC BY 4.0, and Ring's attribution line is
in frame while it plays.

Everything else is the deployed site and caregiver app in a real browser
at 3840x2160, with the live address on screen from the first frame.
`video/README.md` has the pipeline and the traps.
