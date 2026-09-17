# External Evaluation: 34 Real Homes, 2,936 Real Nights

Nightlight's central claim is a refusal: every door alarm on the market wakes the caregiver, and Nightlight's job is to not. This document puts a number on that refusal using data we did not author, with a method a judge can rerun from the repository.

## Headline result

| | Threshold door alarm | Nightlight |
|---|---|---|
| Caregiver wakes | **14,068** | **774** |
| Nights disturbed (of 2,936) | 1,068 | 319 |
| Doorway events settled by the familiar voice alone | n/a | 365 |

**Wake reduction: 94.5 percent**, measured across 34 real single-resident smart homes and 2,936 judged nights.

## What the refusal cost, measured on the same data

A reduction figure on its own is worth very little, because waking a caregiver less often is trivially achievable by doing nothing. The corpus carries its own ground truth: residents labeled `Leave_Home` when they actually left. Restricting those labels to the night window on judged nights gives every real night-time exit both systems had the chance to see, and the question becomes what the restraint cost.

| | Count |
|---|---|
| Labeled night exits on judged nights | **34** |
| Visible to the threshold alarm (the ceiling) | 34 |
| Flagged by Nightlight as unusual | **7** |
| Escalated to the caregiver | 6 |

**Nightlight flagged 7 of 34, or 20.6 percent.** Stated plainly, because it is the number a reader should have before the 94.5 percent means anything.

Two things make it interpretable, and both are in the same data.

**Of the 27 exits Nightlight did not flag, 26 were exits the resident returned from within thirty minutes**, by the corpus's own `Enter_Home` label. One was not. These are ordinary round trips, which is what a night exit usually is in a household of healthy adults.

**The misses are concentrated where night activity is normal**, which is the personal baseline behaving as designed:

| Home | Judged nights | Night door events per night | Labeled night exits | Flagged |
|---|---|---|---|---|
| hh113 | 465 | 0.3 | 1 | 1 |
| tm002 | 72 | 1.3 | 2 | 2 |
| hh115 | 275 | 1.4 | 3 | 3 |
| hh108 | 31 | 4.6 | 1 | 0 |
| hh109 | 33 | 5.4 | 2 | 0 |
| hh104 | 33 | 6.5 | 2 | 0 |
| ihs09 | 39 | 23.5 | 1 | 0 |
| hh117 | 219 | 29.9 | 22 | 1 |

In the three homes where the door rarely opens at night, Nightlight flagged 6 of 7. In the five where it opens constantly, 1 of 27, and 22 of those 27 come from a single household whose door opens roughly thirty times a night. A household like that has established night activity as its normal, and a system that woke the caregiver for all of it would be the threshold alarm.

That split is the product working. It is also **a cut drawn after looking at the data**, on eight homes and 34 exits, and it is far too small a sample to carry a rate. It is reported as a description of what happened, not as a measured sensitivity, and the whole per-home table is above so a reader can disagree with the reading.

## The data (not ours)

The CASAS HH corpus from Washington State University's CASAS project: real single-resident homes instrumented with motion and exterior door sensors for roughly two months each, with resident-labeled activities including Leave_Home and Enter_Home. Published on Zenodo, record 15708568, licensed CC-BY-4.0. Citation: D. Cook et al., CASAS smart home datasets, Washington State University.

Every doorway event fed to Nightlight is an exterior door activation from the corpus, and the identical event set feeds the baseline it is compared against, so the mapping cannot favor either side.

## The baseline being beaten

A threshold door alarm: the commodity product families can buy today, which alerts on every night-window (22:00 to 06:00) doorway event. Its column above is simply a count of those events on judged nights. That is not a strawman; alerting on every event is the entire design of the devices sold for this purpose.

## Method, leakage-safe

1. For each home, the first 28 distinct days of data only seed the per-household baseline, exactly as production onboarding seeds from Ring event history. No incident can open during seeding.
2. Every night after seeding is judged exactly once, replayed chronologically through the production engine (`processTimeline`, the same code path the deployed Lambda runs): baseline update, scoring, incident state machine, effect emission.
3. A caregiver wake is a NOTIFY_CAREGIVER or ESCALATE effect. Voice-stage resolutions wake nobody and are counted separately.
4. Homes with fewer than 14 judged nights after seeding are skipped: 47 of 81 files, disclosed here, mostly short collections.
5. Ground-truth join: 72 of Nightlight's 774 wakes fall within 15 minutes of a resident-labeled Leave_Home or Enter_Home, that is, real night exits the system was right to surface.

Reproduce it:

```
# data: Zenodo record 15708568, file labeled_data.zip (CC-BY-4.0)
npm run casas -w @nightlight/eval -- --input <extracted labeled/ directory>
```

Per-home rows and totals are written to `apps/eval/results/casas-hh.json`; the committed copy is the run reported here.

## Measured limits, stated plainly

- These residents are healthy adults. On this population, nearly every wake is arguably unnecessary, which is exactly why it is the right corpus for measuring restraint: the threshold alarm disturbs 1,068 nights of healthy people; Nightlight disturbs 319, and the labeled-exit join shows 72 of its wakes tracked real exits.
- **The corpus contains no wandering, so 20.6 percent is not a wandering-detection rate and must not be read as one.** A labeled `Leave_Home` by a healthy adult is a person going out. Whether Nightlight would flag a person living with dementia leaving at 3am is a different question, and this corpus cannot answer it. What it can answer, and does, is whether the restraint that produces the 94.5 percent also suppresses real exits, and the answer is that it does so where night activity is already normal for that household and largely does not where it is not.
- **34 night exits is a small number** for the recall table, drawn from 8 of the 34 homes. The other 26 homes recorded no labeled night exit on a judged night at all. Every figure in that table should be read as an order of magnitude, not a rate.
- The detection side (an anomalous 3am exit opens an incident, the voice plays, escalation follows if activity continues) is exercised by the engine's unit and integration tests and by the simulated household, and its per-night behavior on real homes is visible in the incident log the eval prints.
- Door-contact activations stand in for Ring's human-classified camera motion. Ring's sub_type filter would remove pet and wind events that a contact sensor cannot, so this proxy, if anything, understates Nightlight's real-world advantage.
- Timestamps are naive local time replayed as UTC with the engine's timezone set to UTC, preserving wall-clock hours exactly. Daylight-saving transitions inside a collection are therefore not modeled.
- Homes differ wildly: one (tm004) produced 962 alarm wakes and zero Nightlight wakes; another (hh101) had night activity on all 32 judged nights and still saw an 86.6 percent reduction. The per-home table in the results file shows the spread; the aggregate is not carried by a few easy homes.
