import { createHmac } from "node:crypto";

/**
 * Ring Partner API client.
 *
 * This is the track's required technology, called for real: OAuth code
 * exchange and refresh against https://oauth.ring.com/oauth/token, and
 * the data-plane endpoints on https://api.amazonvision.com (devices,
 * status, event history, snapshots, and chime audio playback, the
 * familiar-voice path, granted to this app as the Chimes Audio controls
 * scope).
 *
 * Credentials come from the environment (RING_CLIENT_ID,
 * RING_CLIENT_SECRET, RING_WEBHOOK_SECRET); they are never committed.
 * Access tokens live about 4 hours and refresh tokens about 30 days, so
 * the client refreshes proactively and persists tokens through the
 * injected store hooks (DynamoDB in production).
 *
 * fetch is injectable for tests; every request shape below mirrors the
 * published API reference.
 */

export interface RingTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  scope?: string;
}

export interface RingClientOptions {
  clientId: string;
  clientSecret: string;
  loadTokens: () => Promise<RingTokens | null>;
  saveTokens: (t: RingTokens) => Promise<void>;
  fetchImpl?: typeof fetch;
  oauthBase?: string;
  apiBase?: string;
}

export interface RingDevice {
  id: string;
  type?: string;
  name?: string;
  [k: string]: unknown;
}

const OAUTH_BASE = "https://oauth.ring.com";
const API_BASE = "https://api.amazonvision.com";
/** Refresh when less than this many ms of access-token life remain. */
const REFRESH_MARGIN_MS = 5 * 60_000;

export class RingClient {
  private readonly f: typeof fetch;
  private readonly oauthBase: string;
  private readonly apiBase: string;

  constructor(private readonly opts: RingClientOptions) {
    this.f = opts.fetchImpl ?? fetch;
    this.oauthBase = opts.oauthBase ?? OAUTH_BASE;
    this.apiBase = opts.apiBase ?? API_BASE;
  }

  private async tokenRequest(body: Record<string, string>): Promise<RingTokens> {
    const res = await this.f(`${this.oauthBase}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
      throw new Error(`Ring token endpoint HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };
    const tokens: RingTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    if (json.scope !== undefined) tokens.scope = json.scope;
    await this.opts.saveTokens(tokens);
    return tokens;
  }

  /** Exchange an authorization code delivered to our Token Exchange URL. */
  exchangeCode(code: string): Promise<RingTokens> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      code,
    });
  }

  /** Refresh using the stored refresh token. */
  private refresh(refreshToken: string): Promise<RingTokens> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      refresh_token: refreshToken,
    });
  }

  /**
   * A valid bearer token: the RING_ACCESS_TOKEN env override (console
   * playground tokens, about 30 minutes) wins, then stored tokens with
   * proactive refresh inside the expiry margin.
   */
  async ensureAccessToken(): Promise<string> {
    const override = process.env.RING_ACCESS_TOKEN;
    if (override) return override;
    const stored = await this.opts.loadTokens();
    if (!stored) throw new Error("No Ring tokens: complete account linking or set RING_ACCESS_TOKEN");
    if (Date.now() < stored.expiresAt - REFRESH_MARGIN_MS) return stored.accessToken;
    const fresh = await this.refresh(stored.refreshToken);
    return fresh.accessToken;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.ensureAccessToken();
    const res = await this.f(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Ring API ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  listDevices(): Promise<{ data?: RingDevice[] } & Record<string, unknown>> {
    return this.api("/v1/devices?include=status,capabilities");
  }

  getUserMe(): Promise<Record<string, unknown>> {
    return this.api("/v1/users/me");
  }

  eventHistory(deviceId: string): Promise<Record<string, unknown>> {
    return this.api(`/v1/history/devices/${encodeURIComponent(deviceId)}/events`);
  }

  downloadSnapshot(deviceId: string): Promise<Record<string, unknown>> {
    return this.api(`/v1/devices/${encodeURIComponent(deviceId)}/media/image/download`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  /** The familiar-voice path: play audio on a chime (Audio controls scope). */
  playChimeAudio(deviceId: string, audioRef: string): Promise<Record<string, unknown>> {
    return this.api(`/v1/devices/${encodeURIComponent(deviceId)}/media/audio/playback`, {
      method: "POST",
      body: JSON.stringify({ audio_ref: audioRef }),
    });
  }
}

/**
 * One-way account-link nonce: HMAC-SHA256 over "{timestamp_ms}:{account_id}"
 * with the app's HMAC Signature Key, URL-safe base64 without padding.
 * Ring's redirect nonce must match this recomputation within 600 seconds.
 */
export function computeLinkNonce(
  timeMs: string | number,
  accountId: string,
  hmacKey: string,
): string {
  return createHmac("sha256", hmacKey)
    .update(`${timeMs}:${accountId}`)
    .digest("base64url");
}

export function validateLinkNonce(
  nonce: string,
  timeMs: string | number,
  accountId: string,
  hmacKey: string,
  nowMs: number = Date.now(),
): { valid: boolean; reason?: string } {
  const age = nowMs - Number(timeMs);
  if (!Number.isFinite(age) || age < 0 || age > 600_000) {
    return { valid: false, reason: "timestamp outside the 600 second window" };
  }
  const expected = computeLinkNonce(timeMs, accountId, hmacKey);
  if (expected !== nonce) return { valid: false, reason: "nonce mismatch" };
  return { valid: true };
}
