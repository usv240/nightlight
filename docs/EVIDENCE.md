# Evidence

Every impact claim Nightlight makes, with its source, stated precisely enough to check.

This file exists because the claims in a README are worth exactly as much as their citations. Every figure below was re-checked against its primary source during a pre-submission audit. Four things needed correcting, including one case where a claim we had been about to drop turned out to be right and one where we had credited the wrong paper. All four are recorded at the bottom rather than quietly fixed.

## 1. The behaviour is common, and it happens at night

**Six in ten people living with dementia will wander at least once, and many do so repeatedly.**
Alzheimer's Association, [Wandering](https://www.alz.org/help-support/caregiving/stages-behaviors/wandering). Quoted verbatim from the page.

**Night-time wandering specifically occurs in approximately 60 percent of cases.**
Serban AI, Horrocks S, Walsh C, et al. Monitoring night-time safety in households with dementia using ambient sensing technologies: a rule-based decision algorithm. *Alzheimer's & Dementia*. 2025;21(Suppl 9):e110614. [PMC12725205](https://pmc.ncbi.nlm.nih.gov/articles/PMC12725205/)

## 2. Time matters, and the first day is the cliff

**Found within the first 24 hours, 95 percent of missing people with dementia are found alive. After 24 hours, that falls to 77 percent.**
Robert Koester, creator of the International Search and Rescue Incident Database and author of *Lost Person Behavior: A Search and Rescue Guide on Where to Look* (2008). Figures drawn from analysis of more than 183,000 search-and-rescue incidents, reported by [University of Virginia](https://news.virginia.edu/content/meet-worlds-preeminent-expert-lost-person-behavior-double-hoo).

**Of people with dementia who died after becoming lost, 87 percent were found in natural, secluded, unpopulated areas: woods, fields, ditches, and bodies of water.**
Rowe MA, Bennett V. A look at deaths occurring in persons with dementia lost in the community. *American Journal of Alzheimer's Disease and Other Dementias*. 2003;18(6):343-348. [PMC10833970](https://pmc.ncbi.nlm.nih.gov/articles/PMC10833970/)

This is why minutes matter, and why a response that begins at the door beats one that begins with a phone call.

## 3. The caregiver is the second patient, and the night is what breaks them

**Up to 67 percent of dementia caregivers experience sleep disturbances, compared with up to 50 percent of the general population.**
Mattos MK, Bernacchi V, Shaffer KM, et al. Sleep and Caregiver Burden Among Caregivers of Persons Living With Dementia: A Scoping Review. *Innovation in Aging*. 2024;8(2):igae005. [Full text](https://academic.oup.com/innovateage/article/8/2/igae005/7607770)

The comparison matters as much as the figure. Caregivers are not simply part of a population that sleeps badly; they are well above it.

**Nearly half of dementia caregivers, 46.84 percent, report trouble falling back to sleep on some nights, most nights, or every night in the past month.**
Osakwe ZT, et al. Sleep Disturbance and Strain Among Caregivers of Persons Living With Dementia. *Frontiers in Aging Neuroscience*. 2022;13:734382. [Full text](https://www.frontiersin.org/journals/aging-neuroscience/articles/10.3389/fnagi.2021.734382/full)

This is the statistic Nightlight is designed around, and it is more specific than a general claim that caregivers sleep badly. The damage is not only the waking. It is that nearly half of those woken cannot get back to sleep afterwards. That is what makes each avoided waking worth more than one interruption, and it is why the product's headline metric is nights the caregiver was not woken rather than incidents detected.

**Seventy percent of caregivers cited nocturnal problems in their decision to institutionalize their relative, often because their own sleep was disrupted.**
Pollak CP, Perlick D. Sleep problems and institutionalization of the elderly. *Journal of Geriatric Psychiatry and Neurology*. 1991;4(4):204-210. [DOI](https://doi.org/10.1177/089198879100400405)

This is the load-bearing citation for the whole product. What ends care at home is usually not the disease crossing some threshold. It is the night, and specifically the caregiver's own broken sleep. A system that protects the person but exhausts the caregiver has not solved the problem that actually decides the outcome.

## 4. The published state of the art detects and alerts, and that has already been tested

This is the part of the evidence base that shaped the design, so it is stated plainly rather than buried.

**The intervention works on the safety side.** A nighttime monitoring system that detected when a person left the bed during night hours and woke the in-home caregiver to guide them back produced a significant reduction in unsafe episodes, including injuries and unattended home exits, across 53 subjects measured at nine points over 12 months.
Rowe MA, Kelly A, Horne C, et al. Reducing dangerous nighttime events in persons with dementia by using a nighttime monitoring system. *Alzheimer's & Dementia*. 2009;5(5):419-426. [PubMed 19751921](https://pubmed.ncbi.nlm.nih.gov/19751921/)

**It did not work on the caregiver side.** The companion controlled clinical trial followed 49 dementia caregivers for up to a year, measuring sleep by actigraphy and sleep diary at nine points in time. Caregivers reported the system was "of great help" in relieving worry. Their measured sleep did not improve: multilevel models found no group differences in total sleep time, time awake after sleep onset, or sleep quality.
Rowe MA, et al. Sleep in Dementia Caregivers and the Effect of a Nighttime Monitoring System. *Journal of Nursing Scholarship*. 2010;42(3):338-347. [Abstract](https://sigmapubs.onlinelibrary.wiley.com/doi/abs/10.1111/j.1547-5069.2010.01337.x)

Read together, these two papers are the strongest argument for Nightlight's design that exists, and neither of them is ours. The field already ran the experiment on detect-and-alert. It made the person safer and left the caregiver just as tired, because the system's only available response was to wake them. Caregivers felt better and slept the same.

**The current state of the art is still detect-and-alert.** The 2025 ambient-sensing study above monitored 94 households over 365 nights and 297,297 hours, and validated that 91.2 percent of its alerts correctly identified a night-time going-out event, while 14.9 percent were routine activity. It is a careful, modern system, and its output is an alert.

Nightlight's contribution is not a better detector. Detection is the part the literature has already done well. Nightlight changes what happens in the seconds after detection: a recorded family voice plays at the door first, and the caregiver is woken only if that does not settle things. The caregiver alert becomes the escalation path rather than the response.

That is a claim we can measure, and we do. Across 2,936 nights of 34 real homes from the public CASAS corpus, a standard door alarm wakes the caregiver 14,068 times and Nightlight wakes them 774, a 94.5 percent reduction, with 365 doorway moments settled by the recorded voice alone. On the same data, the cost of that restraint is measured too: of 34 resident-labeled night-time exits, Nightlight flagged 7, and 26 of the 27 it did not flag were exits the resident returned from within thirty minutes. Method, limits, and the reproduction command are in [EVAL.md](EVAL.md).

## 5. Why the voice is the right first response

The engine never guesses at a medical state, and Nightlight makes no therapeutic claim. The design rests on something narrower and better supported: a familiar voice is the least invasive intervention available at a door, and it is the only one that can be tried before waking anyone.

The alternatives families are offered today are a lock, which removes autonomy, or a body-worn tracker, which is routinely removed by the person wearing it. A voice at the door costs nothing if it fails, and when it works nobody is woken and nobody is restrained. The asymmetry is the point: the downside of trying the voice first is a few seconds of delay before the caregiver alert that would otherwise have fired immediately.

The 365 voice-settled events in the CASAS evaluation are the measured version of that argument. Each is a moment where the deterministic engine judged the doorway event unusual, the voice played, and no further doorway activity followed inside the watch window.

## 6. Scale, and why this can leave the hackathon

Ring is already installed on the door this has to work at. That is the deployment argument: Nightlight needs no new hardware in the home, no body-worn device, and no professional installation. It is software behind a doorbell that millions of households already own, and the webhook contract it consumes is Ring's documented public one.

The constraint on care at home is the supply of rested caregivers, and every citation above points at the same conclusion: the night is where that supply is spent. Dementia prevalence rises with an ageing population, six in ten of those people will wander, and 70 percent of the families who give up cite the night when they explain why.

## 7. The economics, and what a night is worth

This section exists because "this would help families" is not an argument until someone puts a number on it. Every figure is sourced, and the boundary between what is measured and what is inferred is marked explicitly.

### What dementia care costs now

**US health and long-term care costs for people living with Alzheimer's and other dementias are projected at $409 billion in 2026**, before counting unpaid care. Families and friends provide **6.8 billion hours of unpaid care, valued at $237 billion**. Lifetime cost of care per person is **$405,262**, and **about 70 percent of it is borne by families** as unpaid caregiving and out-of-pocket spending.
Alzheimer's Association. 2026 Alzheimer's Disease Facts and Figures. *Alzheimer's & Dementia*. 2026. [DOI](https://alz-journals.onlinelibrary.wiley.com/doi/10.1002/alz.71345)

### What the alternative to home costs, per day

**A semi-private nursing home room has a median cost of $114,975 a year, which is $315 a day. Assisted living is $74,400 a year. A home health aide is $80,080 a year** at 44 hours a week.
CareScout (Genworth) Cost of Care Survey, 2025. [Source](https://investor.genworth.com/news-events/press-releases/detail/1054/carescout-releases-2025-cost-of-care-survey-results)

**$315 a day is the unit that matters for this product**, because the decision Nightlight is trying to postpone is the move into that room.

### What delaying that decision is worth, and what actually achieves it

**A caregiver-support intervention delayed nursing home placement by a median of 329 days** in a randomized controlled trial of 206 spouse-caregivers.
Mittelman MS, Ferris SH, Shulman E, Steinberg G, Levin B. A family intervention to delay nursing home placement of patients with Alzheimer's disease: a randomized controlled trial. *JAMA*. 1996;276(21):1725-1731. [PubMed](https://pubmed.ncbi.nlm.nih.gov/8940320/)

The mechanism is the part worth reading twice. That trial did not treat the patient. **It supported the caregiver**, and the patient stayed home nearly a year longer as a result. A later analysis estimated the intervention saved about $6,600 per household against usual care, with the largest component being reduced family nursing home spending ([Health Affairs, 2014](https://www.healthaffairs.org/doi/10.1377/hlthaff.2013.1257)).

Read that alongside section 3: **70 percent of caregivers cited nocturnal problems in their decision to institutionalize, often because their own sleep was disrupted** (Pollak and Perlick, 1991). The thing that ends care at home is the night, and the thing that extends it is supporting the person who is awake for it.

### What Nightlight measures, and what it does not

**Measured.** Across 2,936 nights of 34 real homes from the public CASAS corpus, a standard door alarm wakes the caregiver 14,068 times and Nightlight wakes them 774: a **94.5 percent reduction**, with 365 doorway moments settled by the recorded voice alone. On the same data, the cost of that restraint is measured too: of 34 resident-labeled night-time exits, Nightlight flagged 7, and 26 of the 27 it did not flag were exits the resident returned from within thirty minutes. The corpus contains no wandering, so that flag rate is not a wandering-detection rate and is not offered as one. Method and limits in [EVAL.md](EVAL.md).

**Not measured, and we will not claim it.** Whether that reduction produces a delay in placement comparable to Mittelman's 329 days is unknown. It would take a trial with real households over years, and no amount of corpus evaluation substitutes. What we can say honestly is that Nightlight targets the specific mechanism that trial targeted, and that the mechanism is the one 70 percent of families name when they explain why they stopped.

### What Nightlight costs to run

Measured from AWS Cost Explorer on the live deployment: **under twenty cents per household per month**. One Bedrock call a day for the morning note, a few hundred DynamoDB operations, Lambda invocations inside the free tier. There is no new hardware, because the doorbell is already on the door.

The comparison is not close, and that is the point:

| | Cost |
|---|---|
| One day in a semi-private nursing home | **$315** |
| Running Nightlight for one household, one month | **under $0.20** |
| One day of that room buys Nightlight for | **more than a century** |

A single night's delay pays for the software many times over. That is not a claim that Nightlight delays anything; it is the observation that at this price the intervention does not have to work often to be worth running.

### Where the money would actually go

Nightlight is not a billing product. If it worked at scale, the savings land with families first (70 percent of the lifetime $405,262), then with Medicaid, which pays for a large share of long-term care. That is a reason a payer might fund it and a reason it should stay cheap, and it is also why the product's headline metric is nights the caregiver was not woken rather than anything that could be invoiced.

## Corrections made during this audit

Two claims in our earlier drafts did not survive checking.

1. We wrote that "40 percent of those not found within 24 hours are found dead." That figure is not on the Alzheimer's Association wandering page, and we could not source it to primary literature. The widely repeated variant, "up to half suffer serious injury or death," traces to secondary sources rather than a study. Both are replaced by Koester's ISRID figures, which are specific, attributable, and derived from a named database of more than 183,000 incidents.

2. We wrote that "30 to 40 percent [of dementia caregivers] are clinically depressed." We could not source that to a study we could verify, so it is gone. The neighbouring claim of "up to 67 percent with significant sleep disturbance" was checked during this audit and **is** correct, sourced to Mattos et al. 2024 above. It had been carried in the site's citation list but not in the written case, which is why it initially looked unsupported. It is now cited in both.

3. The landing page attributed two separate claims to one source, stating that the Mattos scoping review showed both the 67 percent figure and that disturbed nights are linked to earlier nursing home admission. The review supports the first and not the second. The institutionalization link is Pollak and Perlick 1991, and the two are now cited separately.

4. The wandering figure was linked to a pharmacy education page rather than to the Alzheimer's Association itself. It now points at the primary source.

A claim we cannot source is a claim a judge can dismantle, and a product that argues from wrong numbers deserves to lose.
