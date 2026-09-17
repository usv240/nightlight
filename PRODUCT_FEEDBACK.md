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

## Strands Agents SDK

- Used for: the Week Review agent (`apps/agent/week_review.py`), which reads a household's week and writes the caregiver a short review. It is a second, independent client of our own MCP server rather than a privileged path into the database.
- Worked well: connecting an agent to an MCP server over Streamable HTTP is about five lines, and `MCPClient` plus `list_tools_sync` gave the agent our five household tools with no adapter code and no schema duplication. Pointing it at a different deployment is a URL change. The design it encourages, where the agent's only capabilities are the tools you already expose, is the right default for anything touching vulnerable-person data.
- The thing worth reporting: building this found a real bug that our own thirteen MCP conformance tests missed. A real client terminates a session with `DELETE` carrying a JSON content-type and an empty body, which our server answered with a 500. Fastify's `inject()` sends no content-type unless asked, so the test suite never produced that shape. An outside consumer found it in one run. That is the strongest argument we can make for the SDK: it exercised our surface the way the world will, not the way we imagined.
- Needs work: the failure mode when a tool call errors is a long Python traceback rather than a structured result, which is hard to reason about mid-agent-loop. Documentation for the non-AgentCore path, running an agent as a plain local process against a remote MCP server, is thinner than the hosted story and is what most people will try first.
- Onboarding: `pip install strands-agents` and a `BedrockModel` was genuinely the whole setup, with no project scaffolding step.
- Build again: yes. It earned its place by finding a defect rather than by adding a feature.

## Amazon Polly

- Used for: the second rung of the voice chain, a synthesised prompt at the door for households that have not recorded a family message yet, or whose recording is unavailable.
- Worked well: one synthesis call, one S3 put, done. The neural voices read a short calm sentence well, and a fixed sentence means the cost is one synthesis per household ever.
- Needs work: the same limit EveryWord hit. The generative engine, the best sounding one, refuses word speech marks, which we do not need here but which shapes which engine we can standardise on across both projects. A clear engine capability matrix on the voice list page would save a round trip.
- Onboarding: immediate.
- Build again: yes. It turned a first-night gap into a covered case.

## Amazon Bedrock AgentCore

- Used for: hosting the Week Review agent as an invocable endpoint (`apps/agentcore/`), deployed with the AgentCore CLI (`@aws/agentcore` 0.30.0).
- Worked well: genuinely impressive. `agentcore create` scaffolded a working Strands project with a Streamable HTTP MCP client already wired, which is exactly the shape our agent already had, and `agentcore deploy` produced a runtime with its own IAM role in under two minutes without us writing any infrastructure. CodeZip build meant no Docker. The first `invoke` after deploy returned a correct answer built from live MCP tool calls.
- Needs work, two things, both first-run experience: the scaffold pins a `global.` Bedrock inference profile, which an allowlist-gated account cannot invoke, and the resulting failure points at the model rather than at the gate (see our Bedrock entry). And a project that is cloned rather than scaffolded fails its first deploy with `Cannot find module '@aws/agentcore-cdk'` because `agentcore/cdk/node_modules` is gitignored, which reads like a broken template rather than a missing `npm install`. The `deploy` step reports "Sync CDK dependencies" as succeeded immediately before the build fails on missing dependencies, which is the confusing part.
- Onboarding: `npx @aws/agentcore create` with the right flags, then `deploy`, then `invoke`. Three commands from nothing to a hosted agent.
- Build again: yes. It closed the gap between demonstrating an agent and deploying one.

## Still to record

- Ring live-device experience, once developer verification clears and a playground access token is available.
- Final word on Bedrock output quality across a month of real morning notes.
