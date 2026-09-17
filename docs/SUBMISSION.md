# Devpost Submission: Nightlight

Paste-ready copy for each Devpost field. Keep the first two sentences intact; they carry the measured claim and the inversion that the whole project rests on.

---

## Tagline (one line)

Nightlight learns your household's nights from the Ring doorbell it already has, answers a 3am doorway with a recorded family voice, and wakes the caregiver only when the voice is not enough.

---

## What it does (project description)

**Across 2,936 nights of 34 real homes from the public CASAS research corpus, a standard door alarm wakes the caregiver 14,068 times. Nightlight wakes them 774: a 94.5 percent reduction, with 365 doorway moments settled by a recorded family voice and nobody woken at all.**

Six in ten people living with dementia will wander at least once (Alzheimer's Association), and night-time wandering occurs in roughly 60 percent of cases (Serban et al., *Alzheimer's & Dementia*, 2025). Timing decides the outcome: found within the first 24 hours, 95 percent are found alive; after 24 hours, 77 percent (Koester, International Search and Rescue Incident Database, 183,000+ incidents). Families today get two options: lock the person in, or strap a tracker to a body that will remove it. Both destroy dignity, and neither protects the second patient in the house.

That second patient is the one who decides whether care at home continues. Nearly half of dementia caregivers, 46.84 percent, cannot fall back to sleep after being woken (Osakwe et al., *Frontiers in Aging Neuroscience*, 2022), and 70 percent of caregivers who placed a relative in an institution cited nocturnal problems in that decision, often because their own sleep was disrupted (Pollak and Perlick, *Journal of Geriatric Psychiatry and Neurology*, 1991). What usually ends care at home is the night, not the disease.

The literature has already tested the obvious answer. A nighttime monitoring system that detected bed exits and woke the caregiver significantly reduced injuries and unattended exits (Rowe et al., *Alzheimer's & Dementia*, 2009). Its companion controlled trial then measured what it did to the caregivers: across 49 caregivers followed for a year with actigraphy, sleep did not improve on any measure, though caregivers reported the system was "of great help" (Rowe et al., *Journal of Nursing Scholarship*, 2010). They felt better and slept the same, because the system's only response was to wake them. The 2025 state of the art is still detect-and-alert.

Nightlight is the response layer that literature is missing, and every figure above is sourced in [EVIDENCE.md](EVIDENCE.md), including two numbers from our own earlier drafts that did not survive checking and were corrected.

Every door alarm on the market answers a night-time door opening the same way: it wakes the caregiver. Nightlight inverts that.

1. **It learns the household.** A per-household hour-of-week baseline is built from Ring event history and live webhooks. Learning is deliberately asymmetric: new activity is absorbed ten times slower than new quiet, so a night of wandering can never teach the system that wandering is normal, while a genuine routine change still normalizes within weeks. For its first seven days it only watches.
2. **It notices the 3am doorway.** Only human-classified motion and doorbell presses can open an incident, so cars, animals, and wind can never wake anyone.
3. **It answers with a familiar voice first.** A message the family recorded plays at the door through the Ring chime: "Dad, it is night time. Come back inside. I will see you in the morning." Verbal redirection by a trusted voice is established dementia care practice, and it is the response most likely to work and least likely to harm.
4. **It wakes the caregiver only if that fails.** Continued activity brings a notification with a doorway snapshot and a one-tap "I have it". Backup contacts are alerted only if that goes unanswered.

The number on the dashboard is the product: nights the caregiver was not woken.

This is not a hypothesis. UK care homes already replaced 94,000 routine night checks with ambient monitoring, cutting bedroom falls 63 percent and improving resident sleep 50 percent. That approach has never been available to a family at home, because it required installing sensors in every room. The doorbell was already on the door.

Two more facts shaped this project. Amazon discontinued Alexa Together in May 2025, removing the activity-awareness feature families say they miss. And the Ring Appstore currently advertises an "Elderly care monitoring" category with no apps in it.

---

## How we built it

**The engine is deterministic and explainable end to end.** Baselines, scoring, and the incident state machine are pure, unit-tested functions; a language model never sits on the detection path, because predictable 3am behavior is a safety requirement. The event log is the source of truth and every read model (incidents, nights, baseline, the undisturbed streak) is a deterministic replay of it, which is why the live webhook path, the demo replay, and the tests can never disagree.

- **Ring Partner API, called for real.** OAuth authorization-code exchange and proactive refresh against oauth.ring.com; device list with status and capabilities, event history, snapshot download, and chime audio playback against api.amazonvision.com. The registered Token Exchange and Account Link URLs are live endpoints on our Lambda, and one-way link nonces are validated exactly per spec: HMAC-SHA256 over `time:accountId`, URL-safe base64 unpadded, 600 second window, with test vectors.
- **Verified webhook intake,** published as a standalone open source package (`ring-webhook-kit`): timing-safe HMAC SHA-256 verification against the raw body, typed payloads for every documented event type, and TTL-bounded idempotent deduplication, because processing a 3am doorway event twice would play the voice prompt twice.
- **AWS:** DynamoDB holds the event log with conditional-put effect claiming, so two concurrent Lambda instances can never both play the voice; Lambda runs the same Fastify app that runs locally; Bedrock (Claude) words the caregiver's morning note from computed facts under a hard no-fact-changes prompt with a deterministic fallback; S3 and CloudFront serve the site. One CDK stack reproduces all of it.
- **An MCP server** (Model Context Protocol, spec 2025-11-25, Streamable HTTP) exposes the household to agents: session issuance and enforcement, protocol-version validation, loopback origin checks, five tools including hands-free acknowledgement. Fourteen conformance tests, the fourteenth added after a real MCP client found a bug the first thirteen missed.
- **Nothing fails into silence.** The voice is a chain, not a call: the family's own recording on the Ring chime, then an Amazon Polly synthesis for households that have not recorded one yet, and if both fail the caregiver is woken immediately, because the state machine would otherwise wait for a calm that was never attempted. The morning note runs a three-model Bedrock ladder and falls to the deterministic template, degrading in warmth and never in accuracy. Every response carries its provenance, and `GET /api/resilience` reports every degradation path. The fail-safe was a real bug found during this work and is pinned by ten tests. 107 tests total.

**The evaluation is the part we are proudest of.** We replayed 34 real single-resident homes from the CASAS HH corpus (Zenodo 15708568, CC-BY-4.0) through the production engine. The first 28 days of each home seed the baseline exactly as production onboarding does; every night after is judged once. The comparison column is the product families can buy today. Method, ground-truth join, and measured limits are in docs/EVAL.md, and one command reproduces the run.

---

## Challenges we ran into

Our own test suite caught a safety bug on its first run: a single wandering night could partially normalize that hour's baseline. The fix became a designed property (asymmetric learning) with tests proving both directions.

Ring's chime audio playback endpoint documents neither accepted formats nor whether arbitrary audio is supported, which is the decision that selects our core feature's delivery path; we built an adapter seam with an Echo announcement fallback and filed it as friction log entry 1. Bedrock was worse: every current-generation Claude is allowlist-gated at this account tier and returns "contact AWS Sales" even after marketplace agreements are accepted, while all four availability APIs report the model as available. We wrote a probe script, pinned the most capable model the account can actually invoke, and filed the whole thing as entry 5.

---

## What we learned

Refusal is a product. The hardest engineering in Nightlight is not detecting a door opening; it is being trustworthy enough to stay silent, which is why the headline number is a count of the wakes that did not happen.

---

## What's next

Ring certification into that empty elderly-care category, multi-door households, and a caregiver-sleep outcome study with a dementia care organization.

---

## Potential impact (the economics)

**The economics are the argument, and they are not close.** US dementia care costs $409 billion in 2026 before counting the 6.8 billion hours of unpaid family care worth $237 billion; lifetime cost per person is $405,262, about 70 percent borne by families (Alzheimer's Association, 2026). The alternative to home is $315 a day for a semi-private nursing home room (CareScout, 2025).

The decisive study is one nobody cites in this context. A randomized trial of 206 spouse-caregivers delayed nursing home placement by a **median of 329 days**, and it did so by supporting the caregiver rather than treating the patient (Mittelman et al., *JAMA*, 1996). Read that beside Pollak and Perlick: **70 percent of caregivers cited nocturnal problems in the decision to institutionalize, often because their own sleep was disrupted.** What ends care at home is the night, and what extends it is protecting the person awake for it.

Nightlight costs **under twenty cents per household per month** to run, measured on the live deployment, with no new hardware because the doorbell is already there. One day of that nursing home room pays for more than a century of it.

We do **not** claim Nightlight delays placement; that needs a trial over years. What is measured is a 94.5 percent reduction in night wakings across 2,936 nights of real homes. What is inferred is that it targets the mechanism the 329-day trial targeted. The boundary between the two is marked explicitly in [EVIDENCE.md](EVIDENCE.md) section 7.

## One more thing: the Household View

Nightlight and Bellwether were built as separate entries in this hackathon. It took until both were deployed to notice they are built for the **same household**: the front door at night, and the speech of the person inside it.

`apps/agent/household_view.py` holds **both MCP servers at once**, twelve tools across two products that share no data and were not designed with each other in mind, and writes one note for the family.

The interesting part is what it refuses to do. Two coincident signals in a dementia context invite exactly the inference nobody should draw from consumer software, so the agent states the overlap as timing and stops:

> Nightlight recorded mostly quiet nights, with doorway events settled by the familiar voice on September 23 and 27. On September 12 a doorway event at 03:05 escalated and you were woken. During the same four weeks Bellwether moved from stable to watch on September 1, then to discuss on September 3. Both systems recorded events in early to mid September. **I cannot tell you whether those changes are related.**

Every date came from a tool call. A product that said those changes *were* related would have no way to know, and that sentence would be the most harmful thing either system could produce.

The correlation needed no privileged access and no change to either server. Two independently built products became composable because both expose a standard surface, which is the case for MCP as a protocol rather than a feature.

## Product feedback (required field)

See PRODUCT_FEEDBACK.md in the repository for the full version. Summary: the Ring Partner API's shape matched our architecture unusually well (webhook envelopes with request ids and HMAC signatures, motion sub-type classification as a first-class primitive), and we would build on it again. Two things need work: the chime audio playback endpoint does not document accepted formats or arbitrary-audio support, and the server-to-server CORS constraint deserves a first-page callout because it determines a developer's whole architecture. On AWS we used Bedrock (morning note phrasing, with guardrails), DynamoDB (event log plus conditional-put exactly-once effects), Lambda and function URLs (the backend), S3 and CloudFront (the site), and CDK (the stack); details and reasoning are in docs/AWS.md. Bedrock's model-availability APIs misreport allowlist gating, which is our single strongest piece of AWS feedback.

---

## Friction log (optional, judged bonus)

Five entries in FRICTION_LOG.md, each with task, steps, expected versus actual, severity, workaround, and an actionable suggestion: chime audio documentation gaps, the server-to-server CORS constraint, ESM Lambda bundling's createRequire banner, aws-cdk-lib's WASM template validator crashing on Node 24 Windows, and Bedrock's misleading model-availability signals.

---

## The live Ring API, actually called

`docs/RING_LIVE.md` records a sweep against `https://api.amazonvision.com` on 17 September 2026: **three of three read endpoints answered.** `GET /v1/accounts/me`, `GET /v1/devices`, and `GET /v1/devices/{id}/events`, with the response shapes recorded and every identifier, email and token redacted by the capture script before it wrote the file.

It also states what it does not establish: chime audio playback needs a physical device and a write scope, so the voice path is covered by tests and the documentation gap is filed as friction entry 1. Reproduce it with a thirty-minute Playground token:

```
RING_ACCESS_TOKEN="<token>" npx tsx apps/backend/scripts/ring-evidence.mts
```

## Tracks and mini challenges

Ring (primary) and Alexa+. AWS Builder and Open Source mini challenges.

The rules cap winnings, not entries: "each project can only win one track prize and one mini challenge prize." Nightlight qualifies for Alexa+ on its own terms, not as a stretch. The Alexa+ track asks for a self-hosted MCP server implementing spec 2025-11-25 over Streamable HTTP, and `apps/backend/src/mcp.ts` is exactly that: session issuance and enforcement, protocol version validation, origin validation, and five household tools, with fourteen transport conformance tests against the spec revision. The proof that the surface is real rather than declared is that a second, independent client consumes it: the Strands agent in `apps/agent` has no database access and reaches the household only through those five tools. The Ring track surface and the Alexa+ track surface are the same surface.

---

## Links

- Demo video (under 3 minutes): YouTube link, add when published. Shot list with pre-flight commands: docs/VIDEO_SCRIPT.md
- Live site and demo: https://d28hskpupjctiz.cloudfront.net
- Repository (MIT): https://github.com/usv240/nightlight
- Evaluation: https://github.com/usv240/nightlight/blob/main/docs/EVAL.md
- AWS integrations: https://github.com/usv240/nightlight/blob/main/docs/AWS.md
- Evidence for every impact claim: https://github.com/usv240/nightlight/blob/main/docs/EVIDENCE.md
- Design reasoning: https://github.com/usv240/nightlight/blob/main/docs/DESIGN.md
- Feature requests (optional field): https://github.com/usv240/nightlight/blob/main/docs/FEATURE_REQUESTS.md
- Accessibility audit (100 accessibility, 100 best practices, 100 SEO): https://github.com/usv240/nightlight/blob/main/docs/ACCESSIBILITY.md
- API: https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws
