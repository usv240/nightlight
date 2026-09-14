import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";

// Diagnose the silent Bedrock fallback: same call shape as summaries.ts,
// but with the error surfaced instead of swallowed.
const model = process.argv[2] ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const client = new AnthropicBedrock({ awsRegion: "us-east-1" });

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
  console.log("OK", model, "->", text);
} catch (err) {
  const e = err as { status?: number; name?: string; message?: string };
  console.log("FAIL", model, "status:", e.status, "name:", e.name);
  console.log((e.message ?? "").slice(0, 400));
}
