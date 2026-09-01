# ring-webhook-kit

Verified intake for Ring Partner API webhooks. Zero dependencies, framework agnostic, fully typed.

Ring signs every webhook delivery with HMAC SHA-256 over the raw request body (X-Signature header) and includes meta.request_id for idempotency. Getting this right matters: an unverified webhook is an open door, and a double-processed one plays your 3am doorbell automation twice. This package does the three boring things correctly so you do not have to rediscover them:

1. Timing-safe signature verification against the raw body (hex or base64, with or without the sha256= prefix)
2. Typed parsing for all documented event types, including motion sub_type classification and multi-camera component_ids
3. Bounded, TTL-based deduplication on request_id

## Install

```
npm install ring-webhook-kit
```

## Use (any framework; shown with Fastify)

```ts
import { verifySignature, parseWebhook, Deduper } from "ring-webhook-kit";

const deduper = new Deduper();

app.post("/webhooks/ring", { config: { rawBody: true } }, async (req, reply) => {
  if (!verifySignature(req.rawBody, req.headers["x-signature"], process.env.RING_WEBHOOK_SECRET)) {
    return reply.code(401).send();
  }
  const event = parseWebhook(req.body);
  if (!deduper.firstSeen(event.requestId)) return reply.code(200).send();
  await handle(event); // your logic
  return reply.code(200).send();
});
```

Respond 200 quickly and process asynchronously; Ring retries slow endpoints.

## API

- `verifySignature(rawBody, signatureHeader, secret): boolean`
- `signBody(rawBody, secret): string` (for tests and simulators)
- `parseWebhook(body, receivedAtIso?): ParsedWebhook` (throws WebhookParseError)
- `new Deduper(maxEntries?, ttlMs?, now?)` with `firstSeen(id): boolean`

For multi-instance deployments, replace Deduper with a conditional put on your database keyed by request_id; the call-site shape is identical.

## License

MIT. Built during the Build, Ship, Shape: Amazon Developer Hackathon as part of the Nightlight project.
