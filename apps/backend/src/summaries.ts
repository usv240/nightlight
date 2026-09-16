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
  /** Which model produced the text, when one did. */
  model?: string;
  /** Models tried and why each failed, so a degraded note is explainable. */
  attempts?: Array<{ model: string; ok: boolean; reason?: string }>;
}

export interface PhraseDeps {
  /** Injectable for tests; defaults to a real Bedrock client. */
  createText?: (system: string, user: string, model: string) => Promise<string>;
  /** Override the model ladder, for tests. */
  models?: string[];
}

/**
 * The model ladder.
 *
 * A single model id is a single point of failure, and on Bedrock the failure
 * modes are real and varied: per-account allowlist gates (FRICTION_LOG entry
 * 5), regional capacity, and throttling under load. A caregiver opening the
 * app at 7am should not get the plain template because one model was busy.
 *
 * Tried in order, most capable first. Every rung is a Claude model on
 * Bedrock, so the safety properties of the prompt hold identically at each
 * one. The final rung is not a model at all: it is the deterministic
 * template, which is always exactly correct and merely plain. That is the
 * right floor for this product, because for fact-phrasing "right but dull"
 * beats "warm but unverified".
 */
export const MODEL_LADDER: string[] = (
  process.env.BEDROCK_MODEL_IDS ??
  process.env.BEDROCK_MODEL_ID ??
  [
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
  ].join(",")
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const REGION = process.env.AWS_REGION ?? "us-east-1";

let cachedClient: AnthropicBedrock | null = null;

async function bedrockCreateText(
  system: string,
  user: string,
  model: string,
): Promise<string> {
  cachedClient ??= new AnthropicBedrock({ awsRegion: REGION });
  const response = await cachedClient.messages.create({
    model,
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

  const create = deps.createText ?? bedrockCreateText;
  const models = deps.models ?? MODEL_LADDER;
  const prompt = `Facts:\n${factsText}\n\nWrite the morning note now.`;
  const attempts: Array<{ model: string; ok: boolean; reason?: string }> = [];

  for (const model of models) {
    try {
      const text = await create(SYSTEM, prompt, model);
      // Guardrail: a phrased note that lost the night's core outcome is worse
      // than the template. A rambling answer is the cheapest signal of that,
      // and it is treated as a failure of this rung rather than of the whole
      // ladder, so the next model still gets its turn.
      if (text.length > 400) {
        attempts.push({ model, ok: false, reason: "response too long" });
        continue;
      }
      attempts.push({ model, ok: true });
      return {
        nightOf: night.nightOf,
        text,
        source: "bedrock",
        factsText,
        model,
        attempts,
      };
    } catch (err) {
      attempts.push({ model, ok: false, reason: (err as Error).message });
    }
  }

  // Every rung failed. The template is always exactly correct, so this
  // degrades the warmth of the note and never its accuracy.
  return { ...fallback, attempts };
}
