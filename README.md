# Nightlight

The Ring doorbell a family already owns, working the night shift for a household living with dementia.

Across 2,936 nights of 34 real homes from the public CASAS corpus, a standard door alarm wakes the caregiver 14,068 times; Nightlight wakes them 774, a 94.5 percent reduction, with 365 doorway moments settled by a recorded family voice alone (docs/EVAL.md). Six in ten people living with dementia will wander at least once, and every door alarm on the market responds the same way: it wakes the caregiver. That response has been tested. It reduces injuries and unattended exits, and a controlled trial of 49 caregivers measured by actigraphy found their sleep did not improve on any measure (Rowe et al., 2009 and 2010). Meanwhile 70 percent of families who place a relative in care cite the nights in that decision (Pollak and Perlick, 1991). Sources for every claim here are in [docs/EVIDENCE.md](docs/EVIDENCE.md). Nothing in the system fails into silence: if the voice cannot play, the caregiver is woken immediately, and `GET /api/resilience` on the live API reports every degradation path. Nightlight inverts that. It learns the household's normal pattern, and when the front door opens at 3am it responds first with the thing most likely to work and least likely to harm: a recorded message from a family member, played at the door. The caregiver is woken only if the gentle path fails. The metric on the dashboard is the product: nights the caregiver was not woken.

Built for the Build, Ship, Shape: Amazon Developer Hackathon (Ring track, plus the AWS Builder and Open Source mini challenges).

## Live

- Site: https://d28hskpupjctiz.cloudfront.net
- API: https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws (try `/api/summary`, `/api/morning-note`, or the MCP endpoint at `/mcp`)
- Running on AWS: Lambda, DynamoDB, Bedrock (Claude), S3 and CloudFront, deployed by the CDK stack in `infra/`. Integration details in `docs/AWS.md`.

## How it works

1. Verified intake: Ring Partner API webhooks (human motion, doorbell presses, device status), HMAC SHA-256 verified and deduplicated by request id (`packages/ring-webhook-kit`, published as a standalone MIT package)
2. Baseline: a per-household hour-of-week activity baseline with EWMA daily updates and a 7 day shadow-mode warmup (`packages/engine`)
3. Incidents: a pure, unit-tested state machine: voice first, then a gentle caregiver notification, then escalation contacts (`packages/engine`)
4. Adapters: voice delivery (Ring chime audio where the device capability exists, Echo announcement fallback), snapshots, push and SMS (`apps/backend`)
5. Demo household: a deterministic simulated month replayed through the real webhook route, always labeled Simulated (`packages/simulator`)
6. Agent surface: an MCP server (Model Context Protocol spec 2025-11-25, Streamable HTTP) at `/mcp`, so Alexa+ or any MCP client can ask about the household's nights, check status, and acknowledge an incident hands-free (`apps/backend/src/mcp.ts`, conformance-tested: sessions, protocol version header, origin validation)

Detection is deterministic and explainable end to end. Language models are used only to phrase summaries, never to decide.

## Run it

```
npm install
npm test          # engine, webhook kit, simulator, and HTTP integration tests
npm run demo      # replay the simulated month; prints the night-by-night story
npm run dev       # start the backend on http://127.0.0.1:8787
```

Try the API:

```
curl -X POST http://127.0.0.1:8787/api/demo/replay -H "content-type: application/json" -d "{}"
curl http://127.0.0.1:8787/api/summary
```

Talk to it as an agent (MCP over Streamable HTTP):

```
curl -i -X POST http://127.0.0.1:8787/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
# take the MCP-Session-Id response header, then:
curl -X POST http://127.0.0.1:8787/mcp \
  -H "content-type: application/json" \
  -H "mcp-session-id: <SESSION-ID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_night_summary","arguments":{"date":"2026-09-23"}}}'
```

## Repository layout

```
packages/engine            night engine: time, baseline, scoring, incident FSM, replay
packages/ring-webhook-kit  open source Ring webhook intake (HMAC, types, dedupe)
packages/simulator         deterministic demo household
apps/backend               Fastify service: webhook intake, effects, caregiver API
```

## Honest labels

All demo data is simulated and marked as such in every response and UI. Nightlight is a home safety aid: it does not diagnose, treat, or prevent any medical condition, and it does not replace supervision or professional care advice. In an emergency, call your local emergency number.

## License

MIT. See LICENSE.

## Documentation

[SUBMISSION.md](docs/SUBMISSION.md) · [EVIDENCE.md](docs/EVIDENCE.md) · [DESIGN.md](docs/DESIGN.md) · [EVAL.md](docs/EVAL.md) · [AWS.md](docs/AWS.md) · [ACCESSIBILITY.md](docs/ACCESSIBILITY.md) · [FEATURE_REQUESTS.md](docs/FEATURE_REQUESTS.md) · [VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md) · [FRICTION_LOG.md](FRICTION_LOG.md) · [PRODUCT_FEEDBACK.md](PRODUCT_FEEDBACK.md)
