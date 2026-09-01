/**
 * Typed payloads for the eleven documented Ring Partner API webhook events.
 * Payloads follow the JSON:API-style envelope with meta.request_id for
 * idempotency and meta.account_id for user correlation.
 */

export type RingWebhookEventType =
  | "motion_detected"
  | "button_press"
  | "device_added"
  | "device_removed"
  | "device_online"
  | "device_offline"
  | "app_integration_added"
  | "app_integration_removed"
  | "subscription_activated"
  | "subscription_deactivated"
  | "unknown";

export interface RingWebhookMeta {
  request_id: string;
  account_id?: string;
  timestamp?: string;
}

export interface RingWebhookEnvelope {
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
  meta?: RingWebhookMeta;
}

export interface ParsedWebhook {
  eventType: RingWebhookEventType;
  requestId: string;
  accountId?: string;
  deviceId?: string;
  /** ISO timestamp of the event; falls back to receive time when absent. */
  ts: string;
  /** Motion classification such as "human", when provided. */
  subType?: string;
  /** Multi-camera devices report which camera modules saw motion. */
  componentIds?: number[];
  raw: RingWebhookEnvelope;
}

export class WebhookParseError extends Error {}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Parse a verified webhook body into a typed event. Throws WebhookParseError. */
export function parseWebhook(
  body: unknown,
  receivedAtIso: string = new Date().toISOString(),
): ParsedWebhook {
  if (typeof body !== "object" || body === null) {
    throw new WebhookParseError("Webhook body is not an object");
  }
  const env = body as RingWebhookEnvelope;
  const requestId = env.meta?.request_id;
  if (!requestId) {
    throw new WebhookParseError("Missing meta.request_id");
  }
  const rawType = env.data?.type ?? "unknown";
  const known: RingWebhookEventType[] = [
    "motion_detected",
    "button_press",
    "device_added",
    "device_removed",
    "device_online",
    "device_offline",
    "app_integration_added",
    "app_integration_removed",
    "subscription_activated",
    "subscription_deactivated",
  ];
  const eventType = (known as string[]).includes(rawType)
    ? (rawType as RingWebhookEventType)
    : "unknown";

  const attrs = env.data?.attributes ?? {};
  const componentIdsRaw = (attrs as Record<string, unknown>)["component_ids"];
  const componentIds = Array.isArray(componentIdsRaw)
    ? componentIdsRaw.filter((x): x is number => typeof x === "number")
    : undefined;

  const parsed: ParsedWebhook = {
    eventType,
    requestId,
    ts: asString(env.meta?.timestamp) ?? asString((attrs as Record<string, unknown>)["timestamp"]) ?? receivedAtIso,
    raw: env,
  };
  const accountId = env.meta?.account_id;
  if (accountId) parsed.accountId = accountId;
  const deviceId = env.data?.id;
  if (deviceId) parsed.deviceId = deviceId;
  const subType = asString((attrs as Record<string, unknown>)["sub_type"]);
  if (subType) parsed.subType = subType;
  if (componentIds && componentIds.length > 0) parsed.componentIds = componentIds;
  return parsed;
}
