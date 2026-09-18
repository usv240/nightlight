# Demo video script: Nightlight

Two minutes forty. Hard ceiling three minutes, and the rules say judges are
not required to watch past it, so nothing important lives after 2:00.

## What this script is built to do

Four judging criteria, each with a beat that lands before the judge can
get bored. If a beat is cut for time, cut from the bottom of its section,
never the top.

| Criterion | Where it lands | The beat |
|---|---|---|
| Quality of the idea | 0:00 to 0:20 | Every door alarm wakes the caregiver. This one tries a voice first. |
| Tech implementation | 0:40 to 1:35 | A signed Ring webhook drives the real pipeline, live, on screen. |
| Design | 1:00 to 1:50 | The dashboard's headline number is nights you slept, not incidents detected. |
| Potential impact | 1:50 to 2:40 | 2,936 real nights, and the honest cost of the restraint. |

## Before you record

```
npm test                              # 125 passing, have this on screen if asked
npm run demo                          # confirm the replay prints the night story
node scripts/mcp-conform.mjs          # 19 of 19, live
```

Open these tabs in this order so you never hunt during a take:

1. https://d28hskpupjctiz.cloudfront.net
2. https://d28hskpupjctiz.cloudfront.net/app/
3. A terminal in the repo root
4. https://github.com/usv240/nightlight/blob/main/docs/EVAL.md

Record at 1920x1080. Turn off notifications. Zoom the browser to 110 percent
so a judge on a laptop can read it.

---

## 0:00 to 0:20 The problem

**Point at:** the landing page hero, the dark band with the row of nights.

> **"Six in ten people living with dementia will walk out of the house at
> least once. Every door alarm on the market answers that the same way: it
> wakes the caregiver."**

**Point at:** the one red mark in the row.

> **"A controlled trial measured whether that helps the caregiver sleep. It
> does not. And seventy percent of families who move a relative into care
> say the nights are why."**

Pause half a second before the next line. It is the whole pitch.

> **"Nightlight answers the door before it wakes anybody."**

---

## 0:20 to 0:40 What it is

**Point at:** the thirty marks, then the legend.

> **"One mark is one night, from the Ring doorbell a family already owns.
> Amber means the door opened and a recorded family voice settled it.
> Red means the voice was not enough and the caregiver was woken."**

**Point at:** the amber marks specifically.

> **"Twenty-nine nights slept through. That row is the product."**

---

## 0:40 to 1:10 The live pipeline

**Navigate to:** the terminal. Run it on camera, do not pre-run it.

```
npm run demo
```

**Point at:** the scrolling night-by-night output as it prints.

> **"This is a month of Ring events replayed through the real intake route,
> HMAC signed and verified exactly as a live delivery would be. No test
> hook, no bypass."**

**Point at:** the line for **2026-09-23**, which reads "One doorway event at
02:40. The familiar voice message played and activity settled. You were not
woken."

> **"Twenty to three in the morning. The door opens. That is outside this
> household's normal pattern, so an incident opens, the recorded voice
> plays at the chime, and the person comes back inside. Nobody was woken."**

**Point at:** the line for **2026-09-12**, the only one marked WOKEN, which
reads "Doorway activity at 03:05 continued and the notification was not
acknowledged in time."

> **"And here is the night it did not work. Five past three, the activity
> continued, the voice was not enough. So the caregiver was woken, and then
> the escalation contacts. That is the red mark you saw on the first
> screen."**

Showing the failure is worth more than hiding it. It is the same night the
strip already told them about, and it proves the escalation path is real
rather than described.

**Point at:** the summary block the demo prints last.

> **"Twenty-nine of thirty nights undisturbed. Two settled by the voice.
> One escalation."**

---

## 1:10 to 1:35 The caregiver's view

**Navigate to:** https://d28hskpupjctiz.cloudfront.net/app/

**Point at:** the **Live backend** badge at the top, for one second.

> **"This page is talking to the deployed API right now, not to a fixture."**

**Point at:** the big number.

> **"Here is the caregiver's app, and here is the only number on it.
> Eighteen nights slept, in a row."**

> **"Not incidents detected. Not events processed. If the headline were
> how much the system caught, we would have built a monitor that wakes
> someone every night, and the trial already showed that does not work."**

**Point at:** the morning note.

> **"The morning note is written by Amazon Bedrock from facts the engine
> computed. If every model is unavailable it falls to the engine's own
> sentence, so it degrades in warmth and never in accuracy."**

---

## 1:35 to 1:55 The voice, and what happens when it fails

**Scroll to:** "The voice at the door". **Point at:** the example message.
**Do not press Record.** In a real browser that raises a microphone
permission dialog and you will lose the take.

Read the example out loud, slowly. It is the most human line in the
project and the whole product is built around it.

> **"This is the message a family records. Dad, it is night time. Come back
> inside. I will see you in the morning."**

> **"That is the thing the system tries before it tries anything else. Not
> a siren. Not a notification. The voice of someone they know."**

**Click:** the info button beside it, let the explainer open.

> **"Every explanation on this page is one click away, because a caregiver
> at three in the morning should not have to go and read documentation."**

> **"And if the voice cannot play at all, the caregiver is woken
> immediately. Degrading to waking someone is always safe. Degrading to
> silence never is."**

---

## 1:55 to 2:20 The evidence

**Navigate to:** docs/EVAL.md on GitHub. **Point at:** the headline table.

> **"We measured this on data we did not author. Two thousand nine hundred
> and thirty-six nights across thirty-four real homes, from a public
> research corpus. A standard door alarm wakes the caregiver fourteen
> thousand and sixty-eight times. Nightlight wakes them seven hundred and
> seventy-four."**

**Point at:** the recall table, directly below.

> **"And here is what that restraint cost, because a reduction on its own
> means nothing. Waking someone less often is easy if you stop noticing
> things."**

> **"Of thirty-four labelled night-time exits, Nightlight flagged seven.
> Twenty-six of the twenty-seven it missed were exits the resident came
> back from within half an hour."**

That number is not a weakness in the video. Say it plainly and move on. It
is the line that tells a judge the rest of the numbers are real.

---

## 2:20 to 2:40 Close

**Point at:** the terminal, run this live if you have the seconds:

```
node scripts/mcp-conform.mjs
```

The output prints `12 of 12 MUST, 7 of 7 SHOULD`. That is the nineteen.
Know that before you are on camera so you do not hesitate reading it.

> **"The same household is an Alexa+ surface too: a Model Context Protocol
> server that passes nineteen of nineteen spec checks over real HTTP. The
> Ring integration is open source on npm as ring-webhook-kit."**

**Point back at:** the night strip.

> **"Six point eight billion hours of unpaid care a year in the United
> States alone, and the nights are what ends it. Nightlight gives back the
> one thing nobody can buy more of."**

**Last frame:** the landing page, the row of quiet nights on screen.

> **"Nightlight. The night shift, handled."**

---

## If you are over three minutes

Cut in this order and stop as soon as you are under:

1. The info button beat at 1:35
2. The MCP conformance run at 2:20, say the sentence over the dashboard
3. The Bedrock fallback sentence at 1:10

Never cut: the live `npm run demo`, the eighteen-nights number, or the
recall figure. Those three are tech implementation, design and honesty,
and each one is a whole criterion.

## Upload checklist

- Under three minutes. Check the real duration, not your estimate.
- YouTube or Vimeo, **public**, not unlisted.
- English.
- No third-party music or footage you do not have rights to.
- Title and description name the Ring track.
- Paste the link into the Devpost submission and into `docs/SUBMISSION.md`,
  which currently says "add when published".

## Every number spoken here, and where it comes from

Live or committed as of recording. If anything changes before you shoot,
re-check it rather than trusting this table.

| Spoken | Source |
|---|---|
| 2,936 nights, 34 homes | `apps/eval/results/casas-hh.json` |
| 14,068 against 774, 94.5 percent | same file, re-derived by `apps/eval/test/claims.test.ts` |
| 7 of 34 exits, 26 of 27 returned | same file, recall table in `docs/EVAL.md` |
| Eighteen nights slept | live `GET /api/summary` |
| 19 of 19 spec checks | `node scripts/mcp-conform.mjs` |
| Six in ten wander | `docs/EVIDENCE.md`, with citation |
| Seventy percent cite the nights | Pollak and Perlick 1991, in `docs/EVIDENCE.md` |
| 6.8 billion care hours | Alzheimer's Association 2026, in `docs/EVIDENCE.md` |

## Things not to say

Do not say it detects wandering. The corpus contains no wandering and the
evaluation says so. Do not say it prevents anything, delays anything, or
replaces supervision. The product is a home safety aid and the video
should sound like one.
