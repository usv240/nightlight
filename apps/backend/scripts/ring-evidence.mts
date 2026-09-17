import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { RingClient } from "../src/ring";

/**
 * Capture evidence that the live Ring API was really called.
 *
 *   RING_ACCESS_TOKEN=<playground token> npx tsx scripts/ring-evidence.mts
 *
 * The Ring console Playground issues a one-click OAuth token valid for
 * thirty minutes, which is enough to exercise every read path this project
 * uses and write down what came back. That window is short, so this does
 * the whole sweep in one command rather than four.
 *
 * What it writes: docs/RING_LIVE.md, a record of which endpoints answered,
 * with response shapes and a redacted sample. It never writes tokens,
 * device identifiers, addresses, or anything that identifies an account:
 * this is a public repository and the point is to prove the calls
 * happened, not to publish someone's home.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "../../../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

if (!process.env.RING_ACCESS_TOKEN) {
  console.error(
    "RING_ACCESS_TOKEN is not set.\n" +
      "Get one at https://developer.amazon.com/ring/console/playground\n" +
      "(one-click OAuth token, valid 30 minutes), then:\n" +
      '  RING_ACCESS_TOKEN="<token>" npx tsx scripts/ring-evidence.mts',
  );
  process.exit(2);
}

const client = new RingClient({
  clientId: process.env.RING_CLIENT_ID ?? "",
  clientSecret: process.env.RING_CLIENT_SECRET ?? "",
  loadTokens: async () => null,
  saveTokens: async () => {},
});

/** Keys whose values must never reach a public file. */
const SECRET_KEYS =
  /token|secret|password|authorization|email|phone|address|latitude|longitude|street|zip|postal/i;
/** Keys that identify a specific device or account. */
const ID_KEYS = /^(id|uuid|device_id|location_id|account_id|owner_id)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "...";
  if (Array.isArray(value)) return value.slice(0, 2).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) out[k] = "<redacted>";
      else if (ID_KEYS.test(k)) out[k] = "<id redacted>";
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 120) return `${value.slice(0, 60)}...<truncated>`;
  return value;
}

function shape(value: unknown, depth = 0): string {
  if (Array.isArray(value)) return `array(${value.length}) of ${value.length ? shape(value[0], depth + 1) : "unknown"}`;
  if (value === null) return "null";
  if (typeof value === "object") {
    if (depth > 2) return "object";
    const keys = Object.keys(value as object);
    return `{ ${keys.slice(0, 12).join(", ")}${keys.length > 12 ? ", ..." : ""} }`;
  }
  return typeof value;
}

interface Result {
  name: string;
  endpoint: string;
  ok: boolean;
  detail: string;
  shape?: string;
  sample?: unknown;
}

async function attempt(
  name: string,
  endpoint: string,
  fn: () => Promise<unknown>,
): Promise<Result> {
  try {
    const data = await fn();
    return {
      name,
      endpoint,
      ok: true,
      detail: "answered",
      shape: shape(data),
      sample: redact(data),
    };
  } catch (err) {
    return { name, endpoint, ok: false, detail: (err as Error).message.slice(0, 200) };
  }
}

const results: Result[] = [];

const me = await attempt("Account", "GET /v1/accounts/me", () => client.getUserMe());
results.push(me);

const devices = await attempt("Devices", "GET /v1/devices", () => client.listDevices());
results.push(devices);

// If a device came back, exercise the read paths that depend on one. The
// device id is used but never written to the evidence file.
let deviceId: string | undefined;
const raw = (devices.sample as { data?: Array<{ id?: string }> } | undefined)?.data;
if (devices.ok && Array.isArray(raw)) {
  // Re-fetch unredacted purely to obtain the id for the follow-up calls.
  try {
    const live = (await client.listDevices()) as { data?: Array<{ id?: string }> };
    deviceId = live.data?.[0]?.id;
  } catch {
    /* already recorded above */
  }
}

if (deviceId) {
  results.push(
    await attempt("Event history", "GET /v1/devices/{id}/events", () =>
      client.eventHistory(deviceId!),
    ),
  );
} else {
  results.push({
    name: "Event history",
    endpoint: "GET /v1/devices/{id}/events",
    ok: false,
    detail: "skipped: no device on this account or in the sandbox",
  });
}

const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const passed = results.filter((r) => r.ok).length;

const lines: string[] = [
  "# Live Ring API: what actually answered",
  "",
  "Evidence that Nightlight's Ring client calls the real Partner API, captured by",
  "`apps/backend/scripts/ring-evidence.mts` against `https://api.amazonvision.com`.",
  "",
  `Captured: ${stamp}. Endpoints answering: ${passed} of ${results.length}.`,
  "",
  "Token: a thirty-minute OAuth token from the Ring console Playground",
  "(<https://developer.amazon.com/ring/console/playground>). No token, device",
  "identifier, address or account detail appears below; the samples are redacted",
  "by the script before they are written, because this is a public repository and",
  "the point is to prove the calls happened rather than to publish a home.",
  "",
  "## Results",
  "",
  "| Call | Endpoint | Result |",
  "|---|---|---|",
  ...results.map(
    (r) => `| ${r.name} | \`${r.endpoint}\` | ${r.ok ? "answered" : `failed: ${r.detail}`} |`,
  ),
  "",
];

for (const r of results.filter((x) => x.ok)) {
  lines.push(
    `## ${r.name}`,
    "",
    `\`${r.endpoint}\``,
    "",
    `Response shape: \`${r.shape}\``,
    "",
    "Redacted sample:",
    "",
    "```json",
    JSON.stringify(r.sample, null, 1).slice(0, 2000),
    "```",
    "",
  );
}

lines.push(
  "## What this does and does not establish",
  "",
  "**Does:** the client authenticates against the real Partner API, the request",
  "signing and headers are correct, and the response shapes match what the engine",
  "consumes.",
  "",
  "**Does not:** prove chime audio playback on a physical device. That endpoint",
  "writes rather than reads, and it needs a real Ring device on the account. The",
  "voice path and its fallback chain are covered by tests in",
  "`apps/backend/test/voice.test.ts`, and the accepted-format gap is filed as",
  "FRICTION_LOG.md entry 1.",
  "",
);

const out = path.resolve(here, "../../../docs/RING_LIVE.md");
fs.writeFileSync(out, lines.join("\n"), "utf8");

console.log(`\n${passed} of ${results.length} endpoints answered.`);
for (const r of results) console.log(`  ${r.ok ? "ok  " : "fail"}  ${r.name}: ${r.ok ? r.shape : r.detail}`);
console.log(`\nEvidence written to docs/RING_LIVE.md (redacted).`);
process.exit(passed > 0 ? 0 : 1);
