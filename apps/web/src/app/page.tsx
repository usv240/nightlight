import Link from "next/link";
import { Nav } from "../components/Nav";
import { NightDemo } from "../components/NightDemo";
import { InfoButton } from "../components/InfoButton";

const STATS = [
  {
    value: "60%",
    text: "of people living with dementia wander, most dangerously at night",
    infoId: "wandering",
  },
  {
    value: "67%",
    text: "of dementia caregivers suffer significant sleep disturbance",
    infoId: "caregiver-sleep",
  },
  {
    value: "63%",
    text: "fewer bedroom falls when care homes replaced night checks with ambient monitoring",
    infoId: "care-home-evidence",
  },
  {
    value: "1st",
    text: "reason families move a parent into care is caregiver exhaustion, not patient decline",
    infoId: "institutionalization",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Learn the household's normal",
    body: "Nightlight builds an hour-by-hour picture of your home's front door: school runs, deliveries, evening comings and goings. For its first week it only watches.",
    infoId: "baseline",
  },
  {
    n: "2",
    title: "Notice the 3am doorway",
    body: "When the door sees human motion at an hour that is quiet for your household, Nightlight opens an incident. Cars, animals, and wind can never trigger anything.",
    infoId: "human-motion",
  },
  {
    n: "3",
    title: "Respond with a familiar voice first",
    body: "A message your family recorded plays at the door. For a person with dementia, a trusted voice asking them to come back inside is often all it takes.",
    infoId: "familiar-voice",
  },
  {
    n: "4",
    title: "Wake the caregiver only if needed",
    body: "If activity continues, the caregiver gets a gentle notification with a snapshot and a one-tap response. Backup contacts are alerted only if that goes unanswered.",
    infoId: "escalation",
  },
];

const CITATIONS = [
  {
    title: "Preventing elopement in dementia",
    source: "Alzheimer's Association guidance",
    finding: "An estimated 60 percent of people living with dementia are prone to wandering.",
    url: "https://www.forumpharmacy.com/education-resources/clinical/preventing-elopement/",
  },
  {
    title: "Sleep and caregiver burden: a scoping review",
    source: "Innovation in Aging, Oxford Academic",
    finding: "Up to 67 percent of dementia caregivers experience sleep disturbance; disturbed nights are linked to earlier nursing home admission.",
    url: "https://academic.oup.com/innovateage/article/8/2/igae005/7607770",
  },
  {
    title: "94,000 night checks replaced",
    source: "Care Home Professional, national report",
    finding: "UK care homes replaced routine physical night checks with ambient monitoring, cutting bedroom falls by 63 percent and improving resident sleep by 50 percent.",
    url: "https://www.carehomeprofessional.com/night-checks-landmark-report/",
  },
  {
    title: "Night-time monitoring in dementia households",
    source: "Peer-reviewed validation study",
    finding: "A door-and-motion algorithm validated across 94 households over 365 nights confirmed 91.2 percent of night-time exit alerts as genuine.",
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12725205/",
  },
  {
    title: "Smart home night wandering intervention",
    source: "Journal of Rehabilitation and Assistive Technologies Engineering",
    finding: "Research systems already use prerecorded audio prompts to redirect people with dementia at night, waking the caregiver only when an exit door opens.",
    url: "https://journals.sagepub.com/doi/10.1177/2055668320938591",
  },
  {
    title: "Respite and caregiver outcomes",
    source: "Gerontological Society of America pilot",
    finding: "As little as three hours of weekly respite measurably reduces pre-death grief and improves neurocognitive function in family caregivers.",
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11690687/",
  },
];

const FAQ = [
  {
    q: "Does Nightlight record my parent?",
    a: "No. Nightlight stores event times and types, the incident record, and the voice message your family recorded. It never stores continuous video, never audio from inside the home, and never anyone's identity. The doorway snapshot attached to a notification is fetched only when an incident is already open.",
  },
  {
    q: "Why a voice instead of an alarm?",
    a: "Alarms frighten and disorient a person with dementia, and they wake the whole house. Verbal redirection by a familiar, trusted voice is an established dementia care technique: calm, specific, and personal. Nightlight leads with the response most likely to work and least likely to harm.",
  },
  {
    q: "How is this different from a 30 dollar door alarm?",
    a: "A door alarm's entire product is waking you up, every time, for everything. Nightlight's product is the opposite: it learns what is normal for your household, responds at the door first, and counts its success in nights it never had to wake you.",
  },
  {
    q: "What if my parent uses a back door?",
    a: "Nightlight watches whichever Ring cameras the household already has and treats each as a doorway. Homes with one doorbell get protection at the main exit, which research shows is the most common night exit path. Additional cameras extend coverage.",
  },
  {
    q: "What happens if the internet or camera goes down?",
    a: "Device offline events are part of the data Nightlight watches. An offline camera during the night window is surfaced to the caregiver in the morning summary, and an extended outage during an open incident notifies immediately. Nightlight is a safety aid, not a guarantee, and we say so plainly.",
  },
  {
    q: "Is this a medical device?",
    a: "No. Nightlight is a home safety aid. It does not diagnose, treat, or prevent any medical condition, and it does not replace supervision or professional care advice. In an emergency, call your local emergency number.",
  },
  {
    q: "Does it work without a Ring subscription?",
    a: "Nightlight is built on the Ring Partner API's event, snapshot, and device capabilities. Exact plan requirements depend on Ring account features; the caregiver app tells you during setup exactly what your account supports.",
  },
  {
    q: "Who is behind the demo data?",
    a: "Nobody: it is a deterministic simulated month, clearly labeled, replayed through the same production engine, webhook verification, and effect pipeline that real Ring events use. The code is open source, so you can check.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <Nav />

      {/* Hero */}
      <section className="mx-auto max-w-[1120px] px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <div className="max-w-[720px]">
          <p className="mb-4 inline-block rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            Built on Ring, for the people who never sleep
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            The night shift,{" "}
            <span className="text-[var(--accent)]">handled.</span>
          </h1>
          <p className="mt-6 max-w-[640px] text-lg leading-relaxed text-muted">
            Nightlight learns your household&apos;s nights from the Ring
            doorbell it already has, answers a 3am doorway with a recorded
            family voice, and wakes the caregiver only when the voice is not
            enough.
          </p>
          <p className="mt-4 max-w-[640px] rounded-[var(--radius-md)] border border-[var(--accent)] bg-accent-soft p-4 text-sm leading-relaxed text-ink">
            <span className="font-semibold">Measured, not promised:</span>{" "}
            across 2,936 nights of 34 real homes from the public CASAS corpus,
            a standard door alarm wakes the caregiver 14,068 times. Nightlight:
            774. A 94.5 percent reduction, on data we did not author.{" "}
            <a
              href="https://github.com/usv240/nightlight/blob/main/docs/EVAL.md"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--primary)] underline underline-offset-2"
            >
              Method and full results
            </a>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#demo"
              className="rounded-[var(--radius-md)] bg-[var(--primary)] px-6 py-3 text-sm font-medium text-[var(--primary-contrast)] transition-opacity hover:opacity-90"
            >
              Try the live demo
            </a>
            <a
              href="#how"
              className="rounded-[var(--radius-md)] border border-line bg-surface px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-primary"
            >
              See how it works
            </a>
          </div>
          <p className="mt-8 text-xs uppercase tracking-wider text-muted">
            Ring Partner API · AWS · Open source (MIT)
          </p>
        </div>
      </section>

      {/* What / Why / How, for a first-time reader */}
      <section className="mx-auto max-w-[1120px] px-4 pb-4 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              What it is
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A night watchman made from the Ring doorbell a family already
              owns, for households caring for someone with dementia. Nothing to
              install, nothing to wear.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              Why it exists
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              60 percent of people with dementia wander, and every door alarm
              answers by waking the exhausted caregiver. Caregiver exhaustion,
              not the disease, is what usually ends care at home.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              How it works
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              It learns your household&apos;s normal nights, answers a 3am
              doorway with a recorded family voice, and wakes you only if the
              voice is not enough. Escalation contacts are the last resort.
            </p>
          </div>
        </div>
      </section>

      {/* Proof: the measured claim */}
      <section id="proof" className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Tested on 2,936 nights of real homes. Not ours.
        </h2>
        <p className="mt-4 max-w-[720px] leading-relaxed text-muted">
          We replayed 34 real single-resident smart homes from the public CASAS
          corpus (Washington State University, CC-BY-4.0) through the exact
          engine this site runs, seeding each home&apos;s baseline on its first
          28 days and judging every night after, once. The comparison column is
          the product families can buy today: a door alarm that fires on every
          night-time doorway event.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-danger-soft p-6">
            <p className="text-4xl font-semibold text-[var(--danger)]">14,068</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              caregiver wakes from a threshold door alarm, disturbing 1,068 of
              the 2,936 nights
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--success)] bg-success-soft p-6">
            <p className="text-4xl font-semibold text-[var(--success)]">774</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              wakes from Nightlight on the same events: a 94.5 percent
              reduction, with 72 tracking resident-labeled real exits
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--accent)] bg-accent-soft p-6">
            <p className="text-4xl font-semibold text-[var(--accent)]">365</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              doorway moments settled by the familiar-voice stage alone, with
              nobody woken at all
            </p>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted">
          Every number, the per-home spread, the leakage-safe method, and the
          measured limits are in{" "}
          <a
            href="https://github.com/usv240/nightlight/blob/main/docs/EVAL.md"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--primary)] underline underline-offset-2"
          >
            docs/EVAL.md
          </a>
          , reproducible with one command against the public dataset.
        </p>
      </section>

      {/* Problem */}
      <section id="problem" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
          <h2 className="max-w-[720px] text-3xl font-semibold tracking-tight sm:text-4xl">
            The most dangerous door in America is the front door at 3am.
          </h2>
          <p className="mt-4 max-w-[720px] leading-relaxed text-muted">
            When someone with dementia leaves home at night and is not found
            within 24 hours, the outcomes are often fatal. Families are left
            with two bad options: lock the person in, or attach a tracker they
            will remove. Meanwhile the caregiver, the second patient in the
            house, stops sleeping. Every door alarm on the market responds the
            same way: it wakes them up. Nightlight exists to let them sleep.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.infoId}
                className="rounded-[var(--radius-lg)] border border-line bg-surface-raised p-6"
              >
                <p className="text-4xl font-semibold text-[var(--primary)]">
                  {s.value}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {s.text}
                  <InfoButton id={s.infoId} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Voice first. Caregiver second. Alarm never.
        </h2>
        <p className="mt-4 max-w-[720px] leading-relaxed text-muted">
          Four steps, each designed around one question: what is the gentlest
          thing that keeps this person safe right now?
          <InfoButton id="warmup" />
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-[var(--radius-lg)] border border-line bg-surface p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-[var(--accent)]">
                  {s.n}
                </span>
                <h3 className="font-semibold text-ink">
                  {s.title}
                  <InfoButton id={s.infoId} />
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live demo */}
      <section id="demo" className="border-y border-line bg-night-soft">
        <div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            A month of nights, in your browser, on the real engine.
          </h2>
          <p className="mt-4 max-w-[720px] leading-relaxed text-muted">
            This is the actual Nightlight engine running on a simulated
            household's month. Pick the night of September 23 to watch a 2:40am
            doorway moment settle without anyone being woken, and September 12
            to see the one night the system rightly escalated.
          </p>
          <div className="mt-10">
            <NightDemo />
          </div>
        </div>
      </section>

      {/* Evidence */}
      <section id="evidence" className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          We did not invent the idea. We made it installable.
        </h2>
        <p className="mt-4 max-w-[720px] leading-relaxed text-muted">
          Ambient night monitoring is proven at scale in residential care, and
          familiar-voice redirection is established dementia practice. What has
          never existed is a version a family can have without installing
          sensors in every room. The doorbell was already on the door.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CITATIONS.map((c) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-[var(--radius-lg)] border border-line bg-surface p-6 transition-colors hover:border-primary"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {c.source}
              </p>
              <h3 className="mt-2 font-semibold text-ink group-hover:text-[var(--primary)]">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.finding}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Dignity is the design constraint.
            <InfoButton id="privacy" />
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] border border-[var(--success)] bg-success-soft p-6">
              <h3 className="font-semibold text-ink">Nightlight stores</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <li>Event timestamps and types from the doorbell</li>
                <li>The incident record: what happened, what the system did, how it ended</li>
                <li>The voice message your family recorded, until you delete it</li>
                <li>Caregiver and backup contact details you provide</li>
              </ul>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-danger-soft p-6">
              <h3 className="font-semibold text-ink">Nightlight never stores</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <li>Continuous video or any audio from the home</li>
                <li>The location of the person being cared for</li>
                <li>Facial or identity data of any kind: the Ring API offers none, and we want none</li>
                <li>Anything about your neighbors or visitors beyond event times</li>
              </ul>
            </div>
          </div>
          <p className="mt-8 max-w-[720px] rounded-[var(--radius-md)] border border-line bg-surface-raised p-4 text-sm leading-relaxed text-muted">
            Nightlight is a home safety aid. It does not diagnose, treat, or
            prevent any medical condition, and it does not replace supervision
            or professional care advice. In an emergency, call your local
            emergency number.
          </p>
        </div>
      </section>

      {/* Developers and judges */}
      <section id="developers" className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">For developers</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The night-pattern engine is available as an API: send a stream of
              timestamped events and receive baseline, anomaly scores, and
              incident decisions with full explanations. Webhook intake is
              published separately as the open source package{" "}
              <span className="font-mono text-xs">ring-webhook-kit</span>
              <InfoButton id="hmac" />: HMAC verification, typed events, and
              idempotent deduplication for any Ring Partner API project.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface-raised p-4 font-mono text-xs leading-relaxed text-muted">
{`curl -X POST http://127.0.0.1:8787/api/demo/replay \\
  -H "content-type: application/json" -d "{}"

curl http://127.0.0.1:8787/api/summary`}
            </pre>
            <p className="mt-3 text-xs text-muted">
              Hosted keys arrive with the AWS deployment; run it locally today
              from the repository README.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">About this build</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              <li>Ring track entry, Build Ship Shape: Amazon Developer Hackathon</li>
              <li>AWS Builder and Open Source mini challenges</li>
              <li>Deterministic, unit-tested detection: 47 tests across engine, webhook intake, simulator, and the HTTP path</li>
              <li>Every demo runs the production engine; simulated data is always labeled</li>
              <li>A running friction log ships in the repository as feedback to the Ring team</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            The questions a careful family asks.
          </h2>
          <div className="mt-10 max-w-[820px] space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-[var(--radius-md)] border border-line bg-surface-raised p-5"
              >
                <summary className="cursor-pointer list-none font-medium text-ink marker:content-none">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-4 py-12 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">
              Every door alarm on the market wakes the caregiver.{" "}
              <span className="text-ink">Nightlight's product is the nights it does not.</span>
            </p>
            <Link
              href="/app"
              className="text-sm font-medium text-[var(--primary)] underline underline-offset-2"
            >
              Open the caregiver app
            </Link>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted">
            MIT licensed. Built for the Build, Ship, Shape: Amazon Developer
            Hackathon. Nightlight is a home safety aid and not a medical
            device; it does not replace supervision or professional care
            advice. All demo data on this page is simulated and labeled as
            such.
          </p>
        </div>
      </footer>
    </div>
  );
}
