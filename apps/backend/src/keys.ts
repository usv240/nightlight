import { createHash, randomBytes } from "node:crypto";

/**
 * API keys, for anybody who wants their own space on this server.
 *
 * The public endpoint is open on purpose: it serves one labelled,
 * simulated household that anybody can replay and question, which is what
 * lets a judge try the whole thing from a browser in a minute. The cost of
 * open is that there is only one household, and everybody shares it.
 *
 * A key is the answer for anyone who minds. `POST /v1/keys` hands one out,
 * free, with no account, and a caller who sends it as a Bearer token gets
 * a household of their own: replay a month into it, post their own Ring
 * events into it, set its night window, and question it over MCP. A caller who sends nothing
 * gets the open server, exactly as before, so nothing is gated.
 *
 * Nothing about the key is stored. The space is derived from the key's
 * own hash on every request, so there is no key table to leak, no
 * sign-up and no claim to race for. The cost is that a lost key cannot be
 * recovered or revoked, which for a demonstration server is the right
 * trade and is said in the response that issues it.
 */

export const KEY_PREFIX = "nl_";
const KEY_SHAPE = /^nl_[A-Za-z0-9_-]{32}$/;

export function issueKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("base64url");
}

/** The space a key reaches: a prefix of its hash, never the key itself. */
export function spaceOf(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export type Caller = { space: string | null } | { error: string };

/** Who is calling, from the Authorization header. No header is the open server. */
export function callerFrom(header: string | string[] | undefined): Caller {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim() === "") return { space: null };
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  if (!match || !KEY_SHAPE.test(match[1]!)) {
    return { error: "Authorization must be 'Bearer nl_...' with a key from POST /v1/keys" };
  }
  return { space: spaceOf(match[1]!) };
}

/** The household a keyed caller gets. One per key, made on first use. */
export function householdIdFor(space: string): string {
  return `key:${space}`;
}

export function issuedKeyBody(key: string) {
  return {
    key,
    use: "Send it as 'Authorization: Bearer <key>' on /api/* and /mcp. It is your own household.",
    mcpClientConfig: {
      mcpServers: {
        nightlight: { url: "<this server>/mcp", headers: { Authorization: `Bearer ${key}` } },
      },
    },
    yourSpace:
      "This key is a household of its own: empty until you replay a month into it (POST /api/demo/replay) or post your own Ring events (POST /api/events). The demo household and every other key see none of it.",
    keepIt:
      "Nothing about this key is stored. It cannot be recovered if lost, and a new one is a new, empty space.",
  };
}
