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
- **An MCP server** (Model Context Protocol, spec 2025-11-25, Streamable HTTP) exposes the household to agents: session issuance and enforcement, protocol-version validation, loopback origin checks, five tools including hands-free acknowledgement. Thirteen conformance tests.

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

## Product feedback (required field)

See PRODUCT_FEEDBACK.md in the repository for the full version. Summary: the Ring Partner API's shape matched our architecture unusually well (webhook envelopes with request ids and HMAC signatures, motion sub-type classification as a first-class primitive), and we would build on it again. Two things need work: the chime audio playback endpoint does not document accepted formats or arbitrary-audio support, and the server-to-server CORS constraint deserves a first-page callout because it determines a developer's whole architecture. On AWS we used Bedrock (morning note phrasing, with guardrails), DynamoDB (event log plus conditional-put exactly-once effects), Lambda and function URLs (the backend), S3 and CloudFront (the site), and CDK (the stack); details and reasoning are in docs/AWS.md. Bedrock's model-availability APIs misreport allowlist gating, which is our single strongest piece of AWS feedback.

---

## Friction log (optional, judged bonus)

Five entries in FRICTION_LOG.md, each with task, steps, expected versus actual, severity, workaround, and an actionable suggestion: chime audio documentation gaps, the server-to-server CORS constraint, ESM Lambda bundling's createRequire banner, aws-cdk-lib's WASM template validator crashing on Node 24 Windows, and Bedrock's misleading model-availability signals.

---

## Tracks and mini challenges

Ring (primary) and Alexa+. AWS Builder and Open Source mini challenges.

The rules cap winnings, not entries: "each project can only win one track prize and one mini challenge prize." Nightlight qualifies for Alexa+ on its own terms, not as a stretch. The Alexa+ track asks for a self-hosted MCP server implementing spec 2025-11-25 over Streamable HTTP, and `apps/backend/src/mcp.ts` is exactly that: session issuance and enforcement, protocol version validation, origin validation, and five household tools, with fourteen transport conformance tests against the spec revision. The proof that the surface is real rather than declared is that a second, independent client consumes it: the Strands agent in `apps/agent` has no database access and reaches the household only through those five tools. The Ring track surface and the Alexa+ track surface are the same surface.

---

## Links

- Live site and demo: https://d28hskpupjctiz.cloudfront.net
- Repository (MIT): https://github.com/usv240/nightlight
- Evaluation: https://github.com/usv240/nightlight/blob/main/docs/EVAL.md
- AWS integrations: https://github.com/usv240/nightlight/blob/main/docs/AWS.md
- Evidence for every impact claim: https://github.com/usv240/nightlight/blob/main/docs/EVIDENCE.md
- Accessibility audit (100 accessibility, 100 best practices, 100 SEO): https://github.com/usv240/nightlight/blob/main/docs/ACCESSIBILITY.md
- API: https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws
