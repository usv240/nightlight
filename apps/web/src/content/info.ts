/**
 * Info button dictionary. Every statistic, technical term, and non-obvious
 * feature shown in the UI has an entry here, so any visitor, technical or
 * not, can understand any part of the page without leaving it.
 */

export interface InfoEntry {
  id: string;
  term: string;
  plain: string;
  technical?: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

export const INFO: Record<string, InfoEntry> = {
  wandering: {
    id: "wandering",
    term: "Wandering",
    plain:
      "Many people living with dementia become disoriented and leave home, most often at night. It is common and dangerous, and it is a symptom of the condition, not a failure of care.",
    sourceUrl:
      "https://www.forumpharmacy.com/education-resources/clinical/preventing-elopement/",
    sourceLabel: "Alzheimer's Association via Forum Extended Care",
  },
  "caregiver-sleep": {
    id: "caregiver-sleep",
    term: "Caregiver sleep",
    plain:
      "Up to 67 percent of family members caring for someone with dementia have significant sleep problems, compared with up to 50 percent of the general population. Exhaustion, not the disease itself, is what most often ends care at home.",
    sourceUrl: "https://academic.oup.com/innovateage/article/8/2/igae005/7607770",
    sourceLabel: "Innovation in Aging, scoping review",
  },
  institutionalization: {
    id: "institutionalization",
    term: "Earlier nursing home admission",
    plain:
      "Research links disturbed caregiver nights directly to earlier moves into residential care. Protecting the caregiver's sleep protects the family's ability to stay together.",
    sourceUrl: "https://academic.oup.com/innovateage/article/8/2/igae005/7607770",
    sourceLabel: "Innovation in Aging, scoping review",
  },
  "care-home-evidence": {
    id: "care-home-evidence",
    term: "Proven in care homes",
    plain:
      "UK care homes already replaced routine physical night checks with ambient monitoring: over 94,000 checks replaced, bedroom falls down 63 percent, resident sleep up 50 percent. Nightlight brings the same idea to a family home, using the doorbell that is already installed.",
    sourceUrl: "https://www.carehomeprofessional.com/night-checks-landmark-report/",
    sourceLabel: "Care Home Professional, national report",
  },
  "familiar-voice": {
    id: "familiar-voice",
    term: "The familiar voice",
    plain:
      "Hearing a trusted family member's voice is one of the most effective ways to calm and redirect a person with dementia. Nightlight plays a message your family records themselves, never a synthetic voice.",
    technical:
      "Stage 1 of the intervention ladder. Delivery adapters: Ring chime audio playback where the device capability exists, otherwise an Echo announcement or a companion speaker at the door. The adapter seam keeps the product identical whichever path a household uses.",
  },
  baseline: {
    id: "baseline",
    term: "The household baseline",
    plain:
      "Nightlight learns what is normal for your household, hour by hour, so a late evening for you is not an alarm for your family.",
    technical:
      "A per-household hour-of-week activity model with asymmetric exponential updates: new activity is absorbed slowly, new quiet quickly. A night of wandering cannot teach the system that wandering is normal; a genuine routine change adapts within weeks. Detection is deterministic and fully explainable; no language model sits on the decision path.",
  },
  "nights-undisturbed": {
    id: "nights-undisturbed",
    term: "Nights undisturbed",
    plain:
      "The number we care about most: how many nights the caregiver slept without being woken. An incident the voice message resolved on its own still counts as an undisturbed night, because nobody was woken.",
  },
  "human-motion": {
    id: "human-motion",
    term: "Human motion only",
    plain:
      "Ring classifies what its camera saw. Nightlight only ever acts on human motion and doorbell presses. Cars, animals, and wind can never wake anyone.",
    technical:
      "motion_detected events carry a sub_type classification from the Ring Partner API; the engine treats anything other than human as non-actionable by construction.",
  },
  warmup: {
    id: "warmup",
    term: "The learning week",
    plain:
      "For its first seven days Nightlight only watches and learns. It will never act on a household it does not yet understand.",
  },
  simulated: {
    id: "simulated",
    term: "Simulated household",
    plain:
      "This demo replays a realistic but artificial month of doorbell events through the real Nightlight engine, so you can see exactly how it behaves without owning a Ring device. Nothing in the demo is staged separately from the production code.",
    technical:
      "A deterministic generator produces the month; events are HMAC-signed and pushed through the same webhook route, deduplication, engine, and effect adapters as real Ring traffic.",
  },
  hmac: {
    id: "hmac",
    term: "Verified webhooks",
    plain:
      "Every message from Ring is cryptographically checked before Nightlight trusts it.",
    technical:
      "HMAC SHA-256 over the raw request body against the partner signing key, timing-safe comparison, idempotent deduplication on the delivery id. Published as the open source package ring-webhook-kit.",
  },
  privacy: {
    id: "privacy",
    term: "What Nightlight stores",
    plain:
      "Event times and types, the incident record, and the voice message your family recorded. Never continuous video, never audio from the home, never anyone's identity.",
  },
  escalation: {
    id: "escalation",
    term: "The escalation ladder",
    plain:
      "Voice first. If activity continues, a gentle notification to the caregiver with a snapshot and a one-tap response. Only if that goes unanswered are backup contacts alerted.",
    technical:
      "A pure state machine: OPEN, VOICE_PLAYED, WATCHING, NOTIFY_CAREGIVER, then ACKNOWLEDGED or ESCALATED. Every transition is timestamped and auditable, and the whole machine is unit tested.",
  },
};

export function info(id: string): InfoEntry {
  const entry = INFO[id];
  if (!entry) {
    return { id, term: id, plain: "Details coming soon." };
  }
  return entry;
}
