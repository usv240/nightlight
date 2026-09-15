import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { RingClient } from "../src/ring";

/**
 * Live Ring API spike, the week-1 gate finally runnable:
 *
 *   npx tsx scripts/ring-check.mts me
 *   npx tsx scripts/ring-check.mts devices
 *   npx tsx scripts/ring-check.mts history <deviceId>
 *   npx tsx scripts/ring-check.mts chime <deviceId> <audioRef>
 *
 * Auth: RING_ACCESS_TOKEN env (a short-lived token from the Ring console
 * playground) or previously stored tokens. Credentials load from the
 * repo's gitignored .env if the variables are not already set.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "../../../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

const tokensPath = path.resolve(here, "../.ring-tokens.json");
const client = new RingClient({
  clientId: process.env.RING_CLIENT_ID ?? "",
  clientSecret: process.env.RING_CLIENT_SECRET ?? "",
  loadTokens: async () =>
    fs.existsSync(tokensPath) ? JSON.parse(fs.readFileSync(tokensPath, "utf8")) : null,
  saveTokens: async (t) => fs.writeFileSync(tokensPath, JSON.stringify(t, null, 1)),
});

const [cmd, a1, a2] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (cmd) {
    case "me":
      console.log(JSON.stringify(await client.getUserMe(), null, 2));
      break;
    case "devices":
      console.log(JSON.stringify(await client.listDevices(), null, 2));
      break;
    case "history":
      if (!a1) throw new Error("history <deviceId>");
      console.log(JSON.stringify(await client.eventHistory(a1), null, 2));
      break;
    case "chime":
      if (!a1 || !a2) throw new Error("chime <deviceId> <audioRef>");
      console.log(JSON.stringify(await client.playChimeAudio(a1, a2), null, 2));
      break;
    case "code":
      if (!a1) throw new Error("code <authorizationCode>");
      console.log(JSON.stringify(await client.exchangeCode(a1), null, 2));
      break;
    default:
      console.log("Commands: me | devices | history <id> | chime <id> <audioRef> | code <authCode>");
  }
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
