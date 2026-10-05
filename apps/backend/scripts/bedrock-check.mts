import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { MODEL_LADDER } from "../src/summaries.ts";

// Diagnose the silent Bedrock fallback: same call shape as summaries.ts,
// but with the error surfaced instead of swallowed.
//
//   npx tsx scripts/bedrock-check.mts            every rung of the ladder
//   npx tsx scripts/bedrock-check.mts <model>    one model
//
// Run with no argument after any Bedrock announcement. On 2026-10-05 it
// found two of the three rungs then deployed had reached end of life
// (FRICTION_LOG.md entry 8): the ladder was one model deep and nothing
// said so, because the first rung kept answering.
const models = process.argv[2] ? [process.argv[2]] : MODEL_LADDER;
const client = new AnthropicBedrock({ awsRegion: "us-east-1" });

let failed = 0;
for (const model of models) {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 200,
      system: "Reply with exactly one short sentence.",
      messages: [{ role: "user", content: "Say hello to the Nightlight build." }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join(" ")
      .trim();
    console.log("OK  ", model, "->", text);
  } catch (err) {
    failed += 1;
    const e = err as { status?: number; message?: string };
    console.log("FAIL", model, "status:", e.status);
    console.log("     ", (e.message ?? "").slice(0, 300));
  }
}
console.log(`\n${models.length - failed} of ${models.length} answered.`);
process.exitCode = failed ? 1 : 0;
