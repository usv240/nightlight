# Product Feedback

Draft of the hackathon submission's product-feedback answer, maintained as we build so it reflects real experience, not end-of-project recollection. Format per the rules: what we used it for, what worked well, what needs work, how onboarding felt, whether we would build with it again.

## Ring Partner API

- Used for: the entire product surface: webhook events (human motion, button presses, device status), event history for baseline seeding, snapshots for incident context, and (pending verification) chime audio playback for the familiar-voice prompt.
- Worked well: the webhook envelope design is clean (request ids for idempotency, HMAC signatures, typed event set); motion sub_type classification is exactly the right primitive for a product that must never act on a passing car.
- Needs work: the chime audio playback endpoint does not document accepted formats or whether arbitrary audio is supported (this decides our core feature; see FRICTION_LOG.md entry 1); the server-to-server CORS constraint deserves a first-page callout (entry 2).
- Onboarding: identity verification is a real gate; docs are thorough on auth flows.
- Build again: yes. The API's shape matched our architecture unusually well.

## Model Context Protocol (spec 2025-11-25, Streamable HTTP)

- Used for: the Alexa+ agent surface (apps/backend/src/mcp.ts), implemented against the spec by hand.
- Worked well: the transport spec is precise enough to implement without an SDK in an afternoon: session issuance, protocol version header, origin validation, and notification semantics are all unambiguous. The 405-on-GET allowance for servers without SSE streams is a pragmatic touch.
- Needs work: examples of minimal-compliant servers (JSON responses, no SSE) would help; most public examples assume the full streaming feature set.
- Build again: yes.

## Amazon Bedrock (Anthropic Claude)

- Used for: phrasing the caregiver's morning note from deterministically computed facts (apps/backend/src/summaries.ts; see docs/AWS.md for the full guardrail design).
- Worked well: the official Anthropic Bedrock SDK made the integration a same-surface swap from the first-party API; IAM-scoped invoke permissions fit the least-privilege stack cleanly.
- Needs work: nothing significant yet at our usage scale.
- Build again: yes.

## AWS Lambda + CDK + DynamoDB + S3/CloudFront

- Used for: hosting the backend (same Fastify app as local, DynamoDB-backed event log with conditional-put exactly-once effects), and the static site.
- Worked well: CDK NodejsFunction with local esbuild made deploys reproducible from one TypeScript file; DynamoDB conditional puts are a perfect fit for at-most-once effect execution.
- Needs work: ESM Lambda bundling still requires the createRequire banner workaround (FRICTION_LOG.md entry 3).
- Onboarding: bootstrap-then-deploy worked first try.
- Build again: yes.

## Sections to complete before submission

- Ring live-device experience (after developer verification clears)
- Vega or Fire TV toolchain (if the cross-track components are built)
- Final word on Bedrock output quality across a month of real morning notes
