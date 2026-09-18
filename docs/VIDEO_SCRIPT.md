# Demo video script: Nightlight

**Target 2:31. Hard ceiling 3:00.** Judges are not required to watch past
three minutes, so nothing important lives after 2:00.

**Narration: 316 spoken words**, which is 2:31 to 2:51 once the demo run
and page loads are counted. Recount any time:

```
python scripts/count-narration.py
```

## The one thing a judge should remember

> Door opens at 3am. Nightlight recognises it is unusual. A familiar voice
> responds. The person returns. The caregiver sleeps. If that fails, the
> caregiver is alerted.

Every twenty to thirty seconds of this video reinforces that sentence.
Anything that does not is cut, however true it is. Three statistics, the
MCP conformance number and the npm package were all moved out of the
narration for exactly that reason: they compete with the story rather than
carrying it.

## Criteria, and where each lands

| Criterion | Time | The beat |
|---|---|---|
| Quality of the idea | 0:00 | Gentler first. Wake someone only if that fails. |
| Design | 0:20 | Thirty nights, mostly quiet. The row is the product. |
| Tech implementation | 0:38 | The story happens, then: it went through the real signed pipeline. |
| Potential impact | 1:45 | 2,936 real nights, and the honest cost of the restraint. |

## Before you record

```
npm test                      # 125 passing
npm run demo                  # confirm it prints the month
```

**Size the terminal first.** `npm run demo` prints 63 lines in about a
second. It does not scroll, it arrives. Use at least 65 rows, or the month
scrolls away and you will hunt for dates on camera.

The two lines you point at:

| Line | What it says |
|---|---|
| `2026-09-23` | One doorway event at 02:40, the voice played, you were not woken |
| `2026-09-12` | The only WOKEN night, 03:05, escalation contacts alerted |

**Note on the clock.** The script says twenty to three, not five past
three. In the committed demo month 02:40 is the night the voice settled
and 03:05 is the night it did not. Do not swap them to make the line
rounder; the screen will contradict you.

Tabs, in order:

1. https://d28hskpupjctiz.cloudfront.net
2. https://d28hskpupjctiz.cloudfront.net/app/
3. Terminal, in the repo root
4. https://github.com/usv240/nightlight/blob/main/docs/EVAL.md

Record at 1920x1080, notifications off, browser at 110 percent.

---

## 0:00 to 0:20 The idea

**Point at:** the dark hero band.

> **"When a person living with dementia opens the front door at three in the morning, a normal door alarm wakes the caregiver. Nightlight tries something gentler first: a familiar recorded voice, asking them to come back inside. Only if that fails does it wake the caregiver."**

Pause half a second.

> **"Nightlight answers the door before it wakes anybody."**

No statistics here. They are all true and they all belong later. The idea
has to land first, on its own.

---

## 0:20 to 0:38 Thirty nights

**Point at:** the marks, then the legend.

> **"One mark, one night, from the Ring doorbell a family already owns. Amber: the voice settled it. Red: it did not."**

> **"Twenty-nine nights slept through. That row is the product."**

---

## 0:38 to 1:10 The story, live

**Navigate to:** the terminal. **Run it on camera.**

```
npm run demo
```

**Point at:** the `2026-09-23` line. Tell the story before you explain the
plumbing.

> **"Twenty to three in the morning. The door opens, outside this household's normal pattern. Nightlight plays the family's recorded voice. The person comes back inside, and nobody gets woken."**

Now, and only now, the technical claim, in one sentence:

> **"Not a shortcut built for the demo: it went through the same signed Ring webhook pipeline as a live event."**

**Point at:** the `2026-09-12` line, the only one marked WOKEN.

> **"And the night it did not work. The caregiver was woken. That is the red mark."**

Showing the failure is worth more than hiding it. It is the second half of
the sentence a judge should remember.

---

## 1:10 to 1:30 The caregiver's view

**Navigate to:** the caregiver app. **Point at:** the Live backend badge,
then the big number.

> **"The caregiver's app, live against the deployed API. One number: eighteen nights slept, in a row."**

> **"Not incidents detected. A headline about how much it caught builds what families already have."**

---

## 1:30 to 1:45 The voice

**Scroll to:** "The voice at the door". **Point at:** the example message.

**Do not press Record.** In a real browser that raises a microphone
permission dialog and you lose the take.

Read this slowly.

> **"This is the message a family records. Dad, it is night time. Come back inside. I will see you in the morning."**

---

## 1:45 to 2:15 The evidence

**Navigate to:** EVAL.md. **Point at:** the headline table.

> **"Across thirty-four real homes, a standard alarm would have woken the caregiver fourteen thousand times. Nightlight woke them seven hundred and seventy-four."**

**Point at:** the recall table directly below.

> **"And what that cost, because waking someone less often is easy if you stop noticing. Of thirty-four labelled night exits it flagged seven, and twenty-six of the twenty-seven it missed, the resident came back within half an hour."**

Say it plainly and move on. It is the line that makes every other number
believable.

**Optional, no narration:** cut for two seconds to a terminal already
showing `node scripts/mcp-conform.mjs` output and the npm package page.
Both claims are worth showing and neither is worth spending words on.

---

## 2:15 to 2:35 Close

**Navigate back to:** the landing page, the row of quiet nights.

> **"Across two thousand nine hundred and thirty-six real nights, Nightlight reduced caregiver wake-ups by ninety-four and a half percent. And when the gentle response cannot work, it never fails silently. It wakes the caregiver."**

Pause.

> **"Nightlight is not about detecting more. It is about knowing when intervention is actually needed."**

**Last frame:** the quiet row on screen.

> **"Nightlight. The night shift, handled."**

Three sentences, one idea. Nothing about protocols, packages or care
economics competes with the ending.

---

## What was deliberately moved out of the narration

Not cut from the project, cut from the spoken script, because each one
competed with the story rather than carrying it:

- **Six in ten people with dementia wander.** True, cited in EVIDENCE.md.
  Front-loading it delays the idea by eight seconds.
- **The controlled trial showing alarms do not improve caregiver sleep.**
  The strongest argument in the project and the hardest to say quickly. It
  is the first thing in EVIDENCE.md instead.
- **Seventy percent of families cite the nights when placing a relative.**
  Same reason.
- **MCP, nineteen of nineteen, and the npm package.** Shown on screen, not
  narrated. A judge who cares will check the repo; a judge who does not
  should be hearing about a family instead.
- **6.8 billion hours of unpaid care a year.** It made the ending compete
  with itself. The close is now one idea.

## If you are over three minutes

1. Cut the voice beat at 1:30. Painful but survivable.
2. Cut the second half of the caregiver beat at 1:10.
3. Cut the optional two second MCP cut.

**Never cut:** the live `npm run demo`, the eighteen-nights number, or the
recall figure.

## Upload checklist

- Check the real duration, not your estimate.
- YouTube or Vimeo, **public**, not unlisted.
- English. No third-party music or footage you lack rights to.
- Title and description name the Ring track.
- Paste the link into Devpost and into `docs/SUBMISSION.md`, which
  currently says "add when published".

## Do not say

Do not say it detects wandering. The corpus contains none and the
evaluation says so. Do not say it prevents anything, delays anything, or
replaces supervision. It is a home safety aid and the video should sound
like one.

## Every number spoken here, and where it comes from

| Spoken | Source |
|---|---|
| 2,936 nights, 34 homes | `apps/eval/results/casas-hh.json` |
| 14,000 against 774 | same file, re-derived by `apps/eval/test/claims.test.ts` |
| 94.5 percent | same file, recomputed from the two wake counts |
| 7 of 34 exits, 26 of 27 returned | same file, recall table in `docs/EVAL.md` |
| Eighteen nights slept | live `GET /api/summary` |
