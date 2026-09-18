# Demo video script: Nightlight

**Target 2:25. Hard ceiling 3:00.** The rules say judges are not required
to watch past three minutes, so nothing important lives after 2:00.

**Narration: 300 spoken words**, which is 2:25 at a brisk pace and 2:43 at a slower one, once the demo run, four page loads and two deliberate pauses are counted at about 25 seconds.

```
python -c "import io,re;s=io.open('docs/VIDEO_SCRIPT.md',encoding='utf8').read();print(len(' '.join(re.sub(r'[*\">]',' ',l) for l in s.splitlines() if l.startswith('>')).split()),'spoken words')"
```

An earlier draft of this script ran 5:09, because the word count was taken
from the first line of each quote instead of the whole quote. Everything
below is cut to fit, so **do not add lines back in**. If something feels
missing it is in the README, where a judge can read it.

## Criteria, and where each one lands

| Criterion | Time | The beat |
|---|---|---|
| Quality of the idea | 0:00 | Every door alarm wakes the caregiver. This one tries a voice first. |
| Tech implementation | 0:40 | A signed Ring webhook drives the real pipeline, live. |
| Design | 1:15 | The headline number is nights you slept, not incidents caught. |
| Potential impact | 1:50 | 2,936 real nights, and the honest cost of the restraint. |

## Before you record

```
npm test                      # 125 passing
npm run demo                  # confirm it prints the month
```

**Size the terminal first.** `npm run demo` prints 63 lines in about a
second. It does not scroll, it arrives. Use at least 65 rows, or the month
scrolls away and you will hunt for dates on camera.

The three lines you point at:

| Line | What it says |
|---|---|
| `2026-09-23` | One doorway event at 02:40, the voice played, you were not woken |
| `2026-09-12` | The only WOKEN night, 03:05, escalation contacts alerted |
| Summary block | 29 of 30 undisturbed, 2 voice-only, 1 escalation |

Tabs, in order:

1. https://d28hskpupjctiz.cloudfront.net
2. https://d28hskpupjctiz.cloudfront.net/app/
3. Terminal, in the repo root
4. https://github.com/usv240/nightlight/blob/main/docs/EVAL.md

Record at 1920x1080, notifications off, browser at 110 percent.

---

## 0:00 to 0:20 The problem

**Point at:** the dark hero band and the row of nights.

> **"Six in ten people with dementia will walk out of the house at least once. Every door alarm answers the same way: it wakes the caregiver."**

**Point at:** the single red mark.

> **"A controlled trial measured whether that helps the caregiver sleep. It does not."**

Pause half a second.

> **"Nightlight answers the door before it wakes anybody."**

---

## 0:20 to 0:40 What it is

**Point at:** the thirty marks, then the legend.

> **"One mark, one night, from the Ring doorbell a family already owns. Amber: a recorded family voice settled it. Red: the voice was not enough."**

> **"Twenty-nine nights slept through. That row is the product."**

---

## 0:40 to 1:15 The live pipeline

**Navigate to:** the terminal. **Run it on camera.**

```
npm run demo
```

**Point at:** the header block at the top.

> **"A month of Ring events through the real intake route, HMAC signed and verified like a live delivery."**

**Point at:** the `2026-09-23` line.

> **"Twenty to three. The door opens, outside this household's pattern. The recorded voice plays at the chime, the person comes back inside. Nobody woken."**

**Point at:** the `2026-09-12` line, the only one marked WOKEN.

> **"And the night it did not work. Five past three, activity continued, so the caregiver was woken. That is the red mark."**

Showing the failure is worth more than hiding it. It proves the escalation
path is real rather than described.

---

## 1:15 to 1:35 The caregiver's view

**Navigate to:** the caregiver app. **Point at:** the Live backend badge,
then the big number.

> **"The caregiver's app, live against the deployed API. One number: eighteen nights slept, in a row."**

> **"Not incidents detected. A headline about how much it caught builds the thing that trial showed does not work."**

---

## 1:35 to 1:50 The voice

**Scroll to:** "The voice at the door". **Point at:** the example message.

**Do not press Record.** In a real browser that raises a microphone
permission dialog and you lose the take.

Read this slowly. It is the most human line in the project.

> **"This is the message a family records. Dad, it is night time. Come back inside. I will see you in the morning."**

> **"That is what it tries first. Not a siren. Someone they know."**

---

## 1:50 to 2:25 The evidence

**Navigate to:** EVAL.md. **Point at:** the headline table.

> **"Two thousand nine hundred and thirty-six nights, thirty-four real homes we did not collect. A standard alarm wakes the caregiver fourteen thousand times. Nightlight, seven hundred and seventy-four."**

**Point at:** the recall table directly below.

> **"And what that cost, because waking someone less often is easy if you stop noticing. Of thirty-four labelled night exits it flagged seven. Twenty-six of the twenty-seven it missed, the resident came back within half an hour."**

Say it plainly and move on. It is the line that tells a judge the other
numbers are real.

---

## 2:25 to 2:50 Close

Say this over the dashboard. **Do not run the conformance check on
camera:** it is eight seconds of dead air and the claim is checkable in
the repo.

**Point back at:** the night strip.

> **"Six point eight billion hours of unpaid care a year. The nights are what ends it."**

**Last frame:** the quiet row on screen.

> **"Nightlight. The night shift, handled."**

---

## If you are still over three minutes

1. Cut the voice beat at 1:35. Painful but survivable.
2. Cut the impact line at 2:25, close on the last line.
3. Shorten the close to the last line only.

**Never cut:** the live `npm run demo`, the eighteen-nights number, or the
recall figure. Those are tech implementation, design and honesty, one
whole criterion each.

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
| 14,068 against 774 | same file, re-derived by `apps/eval/test/claims.test.ts` |
| 7 of 34 exits, 26 of 27 returned | same file, recall table in `docs/EVAL.md` |
| Eighteen nights slept | live `GET /api/summary` |
| Six in ten wander | `docs/EVIDENCE.md`, with citation |
| 6.8 billion care hours | Alzheimer's Association 2026, in `docs/EVIDENCE.md` |
