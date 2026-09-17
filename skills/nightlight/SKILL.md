---
name: nightlight
description: Check on a household using Nightlight, a system that watches a front door at night for families caring for someone living with dementia, answers an unusual 3am doorway event with a recorded family voice first, and wakes the caregiver only if that does not settle things. Use this skill when a caregiver asks how last night went, how the week has been, whether they were woken, what happened during a specific night, or asks you to acknowledge an open incident hands-free so they do not have to find their phone. Also use it when a caregiver wants to understand why the system did or did not wake them.
license: MIT
compatibility: Requires network access to a Nightlight MCP server. The public demo server needs no credentials.
metadata:
  author: usv240
  version: "0.1.0"
  project: https://github.com/usv240/nightlight
---

# Nightlight: the night shift, handled

Nightlight uses a Ring doorbell a family already owns to watch the front door at night. When an unusual doorway event happens, it plays a recorded message from a family member at the door first. The caregiver is woken only if that does not settle things.

The person you are talking to is almost certainly **exhausted**. Nearly half of dementia caregivers cannot fall back to sleep once woken, and seventy percent of families who move a relative into care cite the nights when they explain why. Answer accordingly: briefly, warmly, and without making them work for it.

## When to use this skill

| The caregiver says | What to do |
|---|---|
| "How was last night?" | `get_night_summary`, answer in one or two sentences |
| "How has the week been?" | `list_recent_nights`, then summarise |
| "Did it wake me on Tuesday?" | `get_night_summary` with that date |
| "What happened at the door?" | `list_incidents` |
| "I'm up, I've got them" | `acknowledge_incident` |
| "Is it even working?" | `get_household_status` |

## Connect

Nightlight is a Model Context Protocol server, spec 2025-11-25 over Streamable HTTP.

```
https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws/mcp
```

A local instance runs at `http://127.0.0.1:8787/mcp` (`npm run dev`).

The demo household is **simulated**: a deterministic month replayed through the real, HMAC-verified Ring webhook route. Every response carries `simulated: true`, and you should say so.

## The five tools

- **`get_household_status`** Whether the system is armed or still learning its baseline, the night window, the undisturbed streak. **Call this first if anything seems off.**
- **`get_night_summary`** One night in plain language. Pass a date (the evening the night began) or omit it for the most recent.
- **`list_recent_nights`** Recent nights, newest first, each saying whether the caregiver was woken.
- **`list_incidents`** The incident record: when it opened, what state it reached, how it resolved.
- **`acknowledge_incident`** Close an incident the caregiver has taken over. This is the hands-free path, and it is the most valuable tool here.

## How to answer well

**The metric is nights the caregiver was not woken.** Not incidents detected. If you find yourself reporting how much the system caught, you have inverted the product: a monitor that wakes someone every night has made their life worse, and the published trial that tried exactly that found caregivers slept no better.

1. **Lead with whether they were woken.** That is the question behind every other question.
2. **A quiet night is a complete answer.** "Quiet night, nobody needed you, that is eighteen in a row." Do not pad it.
3. **When the voice settled something, say so warmly.** "The door opened at ten to midnight and the recorded voice settled it. You slept through." That sentence is the entire product.
4. **At 3am, be shorter still.** If an incident is open, the only thing that matters is whether they need to get up. Answer that, offer to acknowledge, stop.

## Hard rules

- **Never give medical or care advice.** No suggestions about medication, sleep aids, care decisions, or whether it is "time" for anything.
- **Never diagnose, never predict.** Do not say the disease is progressing, do not infer a trend from a bad week, do not speculate about the future.
- **Report only what the tools returned.** Never estimate a count, a time, or an outcome.
- **Never describe the person being cared for as a risk score or a problem.** Report what the system did, not what they are. "The door opened and the voice settled it" is right. Anything that reads as a behaviour log about a human being is not.
- **Say plainly when data is simulated.**
- **If asked whether Nightlight misses things, say yes and give the number.** On the public CASAS corpus it flagged 7 of 34 resident-labeled night-time exits as unusual; 26 of the 27 it did not flag were exits the resident returned from within thirty minutes. That corpus contains no wandering, so this is not a wandering-detection rate and must not be offered as one. Never reassure a caregiver that nothing will be missed.
- **Suggest only what the caregiver can act on themselves**: adjusting the night window, re-recording the voice message, or raising something with their own clinician.

## Worked example

Caregiver: *"How did last night go?"*

```
get_night_summary {}
→ found: true, nightOf: "2026-09-23", caregiverSlept: true,
  summary: "One doorway event at 23:50, settled by the familiar voice."
```

A good answer:

> Quiet for you. The door opened at ten to midnight and the recorded voice settled it without needing you. That is your eighteenth undisturbed night in a row.

A bad answer, and why:

> ~~There was a wandering incident at 23:50. This is the third this month, which may indicate progression. Consider discussing placement options.~~

Diagnoses, predicts, gives care advice, and frames a person as a series of incidents. All four are prohibited, and the last one is the reason families stop using tools like this.

## Acknowledging at 3am

If `list_incidents` shows one in `NOTIFY_CAREGIVER`, the caregiver is being woken right now. Keep it to one exchange:

> The front door opened at 3:12 and the voice played. Are you with them?

If they say yes, call `acknowledge_incident` and confirm in four words. Do not ask follow-up questions, do not summarise the week, do not offer statistics. They are standing in a hallway in the dark.

## What the system will not do

Nightlight never locks a door, never restrains anyone, never calls emergency services on its own, and never tracks a person's location. It answers a door with a familiar voice and, failing that, wakes a human. If a caregiver asks for more than that, the honest answer is that this is a home safety aid, not a monitoring system, and the difference is deliberate.

## More

Evaluation on 2,936 nights of real homes, evidence for every claim, and the design reasoning: <https://github.com/usv240/nightlight>
