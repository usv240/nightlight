import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { RingClient, computeLinkNonce, validateLinkNonce, type RingTokens } from "../src/ring";

function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; json?: unknown; text?: string }) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const res = handler(String(url), init);
    const status = res.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => res.json ?? {},
      text: async () => res.text ?? JSON.stringify(res.json ?? {}),
    } as Response;
  });
}

function makeClient(fetchImpl: typeof fetch, tokens: RingTokens | null = null) {
  const saved: { current: RingTokens | null } = { current: tokens };
  const client = new RingClient({
    clientId: "cid",
    clientSecret: "csecret",
    loadTokens: async () => saved.current,
    saveTokens: async (t) => {
      saved.current = t;
    },
    fetchImpl,
  });
  return { client, saved };
}

describe("RingClient OAuth", () => {
  it("exchanges an authorization code with the documented form body", async () => {
    const f = mockFetch((url, init) => {
      expect(url).toBe("https://oauth.ring.com/oauth/token");
      const body = String(init?.body);
      expect(body).toContain("grant_type=authorization_code");
      expect(body).toContain("client_id=cid");
      expect(body).toContain("client_secret=csecret");
      expect(body).toContain("code=abc123");
      return { json: { access_token: "at", refresh_token: "rt", expires_in: 14400 } };
    });
    const { client, saved } = makeClient(f as unknown as typeof fetch);
    const t = await client.exchangeCode("abc123");
    expect(t.accessToken).toBe("at");
    expect(saved.current?.refreshToken).toBe("rt");
    expect(saved.current!.expiresAt).toBeGreaterThan(Date.now() + 14_000_000);
  });

  it("refreshes proactively when inside the expiry margin", async () => {
    const calls: string[] = [];
    const f = mockFetch((url, init) => {
      calls.push(url);
      if (url.includes("oauth/token")) {
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        return { json: { access_token: "fresh", refresh_token: "rt2", expires_in: 14400 } };
      }
      return { json: { data: [] } };
    });
    const stale: RingTokens = {
      accessToken: "stale",
      refreshToken: "rt1",
      expiresAt: Date.now() + 60_000, // inside the 5 minute margin
    };
    const { client } = makeClient(f as unknown as typeof fetch, stale);
    const token = await client.ensureAccessToken();
    expect(token).toBe("fresh");
    expect(calls[0]).toContain("oauth.ring.com");
  });

  it("uses stored tokens untouched when comfortably valid", async () => {
    const f = mockFetch(() => ({ json: {} }));
    const good: RingTokens = {
      accessToken: "good",
      refreshToken: "rt",
      expiresAt: Date.now() + 3 * 3600_000,
    };
    const { client } = makeClient(f as unknown as typeof fetch, good);
    expect(await client.ensureAccessToken()).toBe("good");
    expect(f).not.toHaveBeenCalled();
  });

  it("sends the bearer header on API calls and hits the documented paths", async () => {
    const f = mockFetch((url, init) => {
      if (url.includes("oauth")) return { json: { access_token: "at", refresh_token: "rt", expires_in: 14400 } };
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer at2");
      expect(url).toBe("https://api.amazonvision.com/v1/devices?include=status,capabilities");
      return { json: { data: [{ id: "d1" }] } };
    });
    const tokens: RingTokens = { accessToken: "at2", refreshToken: "rt", expiresAt: Date.now() + 3 * 3600_000 };
    const { client } = makeClient(f as unknown as typeof fetch, tokens);
    const devices = await client.listDevices();
    expect(devices.data?.[0]?.id).toBe("d1");
  });

  it("chime audio playback posts audio_ref to the media endpoint", async () => {
    const f = mockFetch((url, init) => {
      expect(url).toBe("https://api.amazonvision.com/v1/devices/chime-1/media/audio/playback");
      expect(JSON.parse(String(init?.body))).toEqual({ audio_ref: "voice-clip-1" });
      return { json: { ok: true } };
    });
    const tokens: RingTokens = { accessToken: "at", refreshToken: "rt", expiresAt: Date.now() + 3 * 3600_000 };
    const { client } = makeClient(f as unknown as typeof fetch, tokens);
    await client.playChimeAudio("chime-1", "voice-clip-1");
  });
});

describe("account-link nonce", () => {
  const key = "test-hmac-key";

  it("matches an independently computed HMAC-SHA256 urlsafe digest", () => {
    const time = "1771130906289";
    const account = "acct-42";
    const expected = createHmac("sha256", key)
      .update(`${time}:${account}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(computeLinkNonce(time, account, key)).toBe(expected);
  });

  it("validates a fresh, correct nonce", () => {
    const now = Date.now();
    const nonce = computeLinkNonce(now, "acct-1", key);
    expect(validateLinkNonce(nonce, now, "acct-1", key, now + 1000).valid).toBe(true);
  });

  it("rejects a nonce outside the 600 second window", () => {
    const then = Date.now() - 700_000;
    const nonce = computeLinkNonce(then, "acct-1", key);
    const res = validateLinkNonce(nonce, then, "acct-1", key);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("window");
  });

  it("rejects a nonce for a different account", () => {
    const now = Date.now();
    const nonce = computeLinkNonce(now, "acct-1", key);
    expect(validateLinkNonce(nonce, now, "acct-2", key, now).valid).toBe(false);
  });
});
