import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type { NightSummary } from "@nightlight/engine";

/**
 * Morning note: the one message a caregiver reads with their coffee.
 *
 * Division of labor, stated plainly because it is a design principle:
 * the engine decides WHAT happened (deterministic, tested); Claude on
 * Amazon Bedrock decides only HOW TO SAY IT warmly. The model receives
 * the computed facts and a hard instruction not to add, remove, or alter
 * any of them. On any failure, refusal, or suspicious output, we fall
 * back to the deterministic template text, which is always correct.
 * That deterministic fallback is deliberately preferred over a fallback
 * model: for fact-phrasing, "exactly right but plain" beats "warm but
 * unverified" every time.
 *
 * Enabled by NIGHTLIGHT_BEDROCK=1 (never in unit tests). Model default is
 * Claude Sonnet 4.5 via a Bedrock inference profile
 * ("us.anthropic.claude-sonnet-4-5-20250929-v1:0"), overridable via
 * BEDROCK_MODEL_ID. This is an availability-forced substitution, not a
 * choice: this AWS account's tier is allowlist-gated out of every
 * current-generation Claude on Bedrock (Opus 5, Opus 4.8/4.7, Sonnet 5
 * all return "not available for this account, contact AWS Sales" even
 * after marketplace agreements are accepted; see FRICTION_LOG.md entry 5).
 * Sonnet 4.5 is the most capable model this account can invoke, and it
 * requires the classic AnthropicBedrock client (InvokeModel path) rather
 * than the Mantle Messages endpoint, and no output_config.effort
 * parameter (unsupported before Claude 4.6). Documented for the AWS
 * Builder mini challenge in docs/AWS.md.
 */

export interface MorningNote {
  nightOf: string;
  text: string;
  source: "bedrock" | "template";
  factsText: string;
}

export interface PhraseDeps {
  /** Injectable for tests; defaults to a real Bedrock Mantle client. */
  createText?: (system: string, user: string) => Promise<string>;
}

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const REGION = process.env.AWS_REGION ?? "us-east-1";

let cachedClient: AnthropicBedrock | null = null;

async function bedrockCreateText(system: string, user: string): Promise<string> {
  cachedClient ??= new AnthropicBedrock({ awsRegion: REGION });
  const response = await cachedClient.messages.create({
    model: MODEL_ID,
    max_tokens: 500,
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("model declined");
  }
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join(" ")
    .trim();
  if (!text) throw new Error("empty response");
  return text;
}

const SYSTEM = [
  "You phrase a one-paragraph morning note for a family caregiver of a person living with dementia, based on facts computed by a monitoring system.",
  "Rules, all mandatory:",
  "1. Use only the facts given. Never add events, times, causes, or reassurances about things not stated.",
  "2. Never alter a time, a count, or an outcome.",
  "3. Two sentences maximum. Warm, calm, plain language. No emojis. No em dashes.",
  "4. Do not give medical advice or predictions.",
  "5. Address the caregiver as you; refer to their family member as your loved one.",
].join("\n");

export async function phraseMorningNote(
  night: NightSummary,
  undisturbedStreak: number,
  deps: PhraseDeps = {},
): Promise<MorningNote> {
  const factsText = `Night of ${night.nightOf}. ${night.text} Caregiver undisturbed streak: ${undisturbedStreak} nights.`;
  const fallback: MorningNote = {
    nightOf: night.nightOf,
    text: night.text,
    source: "template",
    factsText,
  };

  if (process.env.NIGHTLIGHT_BEDROCK !== "1" && !deps.createText) {
    return fallback;
  }

  try {
    const create = deps.createText ?? bedrockCreateText;
    const text = await create(SYSTEM, `Facts:\n${factsText}\n\nWrite the morning note now.`);
    // Guardrail: a phrased note that lost the night's core outcome is worse
    // than the template. Cheap sanity checks, then ship or fall back.
    if (text.length > 400) return fallback;
    return { nightOf: night.nightOf, text, source: "bedrock", factsText };
  } catch {
    return fallback;
  }
}
