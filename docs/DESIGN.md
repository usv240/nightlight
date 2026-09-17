# Design

Why Nightlight looks and reads the way it does. Every principle is either from the shared design system used across all three of our projects in this hackathon, or from the specific constraint of this one: the person reading this screen is exhausted, frightened, and may be reading it at 3am.

## The governing constraint: who is reading, and when

Two audiences, and they never overlap in time.

**The caregiver at 7am**, with coffee, wants one question answered: how was the night. They are tired in a way that is cumulative, not acute. Nearly half of dementia caregivers cannot fall back to sleep once woken ([Osakwe et al., 2022](https://www.frontiersin.org/journals/aging-neuroscience/articles/10.3389/fnagi.2021.734382/full)), so the cost of a wasted minute here is real.

**The caregiver at 3am**, woken by a notification, needs one thing: to know whether to get up. Nothing else on the screen matters, and any decoration is actively harmful.

So the morning note is a single warm paragraph, and the acknowledgement is a single button labelled `I have it`. No dashboard, no chart, no summary, no navigation between them and the decision.

## The metric is the product

The number at the top of the dashboard is **nights the caregiver was not woken**. Not incidents detected, not events processed, not accuracy.

That choice is the entire argument of the project expressed as a design decision. A system optimising for detection would show detections and feel productive while making the family's life worse. The literature already ran that experiment: a nighttime monitor that woke the caregiver reduced injuries and unattended exits, and a controlled trial of 49 caregivers measured by actigraphy found their sleep did not improve on any measure ([Rowe et al., 2009 and 2010](https://pubmed.ncbi.nlm.nih.gov/19751921/)). They felt better and slept the same.

If Nightlight ever displays a growing count of things it caught, it has become the product that already failed.

## Dignity is a design constraint, not a value statement

The person being protected is never the subject of a metric on screen. There is no "wandering score", no risk percentage attached to them, no behavioural chart of a human being.

What is shown is what the **system** did: the door opened, a voice played, nobody needed to be woken. Written that way, the record is something a family can read without feeling they are surveilling someone they love. The same facts framed as a score of a person would be unbearable to read every morning, and would be read by the person themselves sooner or later.

This is why incidents are described in sentences ("the familiar voice settled things without needing you") rather than as a row in a behaviour log.

## Simulated data is labelled everywhere it appears

Every API response carries `simulated: true`. Every surface that renders it carries the label. The demo replay is a real month of events driven through the real, HMAC-verified webhook route, so the engine under demo is the production engine, and saying so is more honest and more impressive than hiding it.

The shared design system states this as a rule: honest UI, simulated data labelled, no fake counters, no invented testimonials. It costs nothing and it is the first thing a skeptical judge checks.

## Progressive disclosure, and never mixing audiences

From the shared design system: the default reading path is entirely non-technical, and technical depth appears in exactly three sanctioned places, which are the "In technical terms" field of an info popover, the developer section, and the documentation. No paragraph addresses both audiences at once.

The landing page can be read start to finish by a family member with no technical background, and the same page satisfies a judge reading for architecture, because the architecture lives one click down rather than in the prose.

## Evidence sits beside every claim

Every statistic in the interface carries an info button with its plain-language explanation and a link to the primary source. This is why the citation block exists on the landing page rather than in a footnote, and why two claims in it were corrected during a pre-submission audit when they did not survive checking (recorded in [EVIDENCE.md](EVIDENCE.md)).

A product making claims about dementia to frightened families should be checkable line by line. The alternative, asking to be trusted, is exactly what this category does badly.

## Provenance is visible in the product, not just the docs

`GET /api/morning-note` returns `source`, `model` and `attempts` alongside the text, and the dashboard says which model wrote the note, or that the deterministic template shipped because every model was unavailable. `GET /api/resilience` reports every degradation path in the deployment.

A caregiver does not need to know which model wrote a sentence. But a system that can be asked, and answers, is a system whose claims can be checked, and this one makes safety claims.

## Colour is never the only carrier of meaning

Incident states carry text labels as well as colour. Light and dark are both real themes with independently checked contrast, driven by tokens rather than a filter, with a three-state toggle applied before first paint so there is no flash. Every interactive control is keyboard reachable with a visible focus ring, and the info buttons are real buttons with accessible names rather than hover-only tooltips.

Verified: 100 on Lighthouse accessibility, best practices and SEO, with the audit and its honest limits in [ACCESSIBILITY.md](ACCESSIBILITY.md).

## What we would change with more time

- **Test with actual caregivers.** Every decision above is reasoned from literature, not observed in a home at 7am. That is the largest gap in this design.
- **A quieter 3am surface.** The acknowledgement flow is one button, which is right, but it has never been used by someone half-awake in the dark. Real conditions would probably change the type size and the contrast.
- **A second language.** The morning note prompt and the interface are English-only, which limits who this can serve.
