# Nightlight

The Ring doorbell a family already owns, working the night shift for a household living with dementia.

About 60 percent of people living with dementia wander, most dangerously at night. Every door alarm on the market responds the same way: it wakes the caregiver. Nightlight inverts that. It learns the household's normal pattern, and when the front door opens at 3am it responds first with the thing most likely to work and least likely to harm: a recorded message from a family member, played at the door. The caregiver is woken only if the gentle path fails. The metric on the dashboard is the product: nights the caregiver was not woken.

Built for the Build, Ship, Shape: Amazon Developer Hackathon (Ring track, plus the AWS Builder and Open Source mini challenges).

## How it works

1. Verified intake: Ring Partner API webhooks (human motion, doorbell presses, device status), HMAC SHA-256 verified and deduplicated by request id (`packages/ring-webhook-kit`, published as a standalone MIT package)
2. Baseline: a per-household hour-of-week activity baseline with EWMA daily updates and a 7 day shadow-mode warmup (`packages/engine`)
3. Incidents: a pure, unit-tested state machine: voice first, then a gentle caregiver notification, then escalation contacts (`packages/engine`)
4. Adapters: voice delivery (Ring chime audio where the device capability exists, Echo announcement fallback), snapshots, push and SMS (`apps/backend`)
5. Demo household: a deterministic simulated month replayed through the real webhook route, always labeled Simulated (`packages/simulator`)

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
