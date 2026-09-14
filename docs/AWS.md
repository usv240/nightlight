# AWS Integrations

This file is the documented-integrations record for the AWS Builder mini challenge. Every service below is called from code in this repository, and every design choice is stated with its reason.

## Services used

### Amazon Bedrock (Anthropic Claude)

- Where: `apps/backend/src/summaries.ts`
- What for: phrasing the caregiver's morning note. The engine computes WHAT happened deterministically (tested in `packages/engine`); Claude on Bedrock decides only HOW TO SAY IT warmly.
- Client: the official Anthropic Bedrock SDK (`@anthropic-ai/bedrock-sdk`, classic `AnthropicBedrock` client), region `us-east-1`, model `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (override with `BEDROCK_MODEL_ID`). Sonnet 4.5 is the most capable Claude this account can invoke: current-generation models (Opus 5, Sonnet 5) are allowlist-gated at the account tier even after marketplace agreements are accepted, and the availability APIs do not surface that gate (FRICTION_LOG.md entry 5). `apps/backend/scripts/bedrock-check.mts` probes real invocation per model.
- Guardrails, by design:
  - The prompt forbids adding, removing, or altering any fact, time, count, or outcome.
  - Output is length-checked; anything suspicious falls back.
  - On any error, refusal (`stop_reason: "refusal"`), or empty output, the deterministic template text ships instead. For fact-phrasing, exactly right but plain beats warm but unverified, so the fallback is the template rather than a second model.
  - The detection path (baselines, scoring, incidents) never touches a model. Predictable 3am behavior is a safety requirement.
- Endpoint: `GET /api/morning-note` returns `{ text, source: "bedrock" | "template", factsText }`, so the provenance of every sentence is visible.
- Enabled only when `NIGHTLIGHT_BEDROCK=1` (set in the Lambda environment; never in unit tests, which inject a fake client).

### Amazon DynamoDB

- Where: `apps/backend/src/store.ts` (`DynamoStore`)
- What for: the household event log, the system's source of truth. Incidents, nights, and baselines are deterministic replays of this log, which is why the live webhook path, the demo replay, and the tests can never disagree.
- Layout: one on-demand table; partition key `HOUSEHOLD#{id}`; sort-key prefixes `EVENT#`, `ACK#`, `EXEC#`.
- The `EXEC#` rows implement exactly-once effect execution with a conditional put (`attribute_not_exists`), so two concurrent Lambda instances can never both play the 3am voice prompt.

### AWS Lambda + function URL

- Where: `apps/backend/src/lambda.ts`, deployed by `infra/bin/app.ts`
- What for: hosting the same Fastify app that runs locally. The only difference between local and cloud is which store the server is constructed with; the code path is otherwise identical, which keeps the demo honest.
- Adapter: `@fastify/aws-lambda`. Function URL with CORS for the static site. 512MB, 30s, Node 20, bundled by esbuild as ESM.

### Amazon S3 + CloudFront

- Where: `infra/bin/app.ts`
- What for: hosting the statically exported Next.js site (landing page plus caregiver app). Private bucket with Origin Access Control; a CloudFront function rewrites extensionless paths to their directory index.

### AWS CDK

- Where: `infra/`
- What for: the whole stack as reviewable TypeScript. One command reproduces the deployment.

## Deploy

```
npm install
npx cdk bootstrap aws://ACCOUNT/us-east-1        # once per account
cd infra
npx cdk deploy                                    # first pass: backend + site shell
# take the ApiUrl output, then rebuild the site against it:
cd ../apps/web && NEXT_PUBLIC_BACKEND_URL=<ApiUrl> npx next build
cd ../../infra && npx cdk deploy                  # second pass: publish the site
```

## Cost posture

On-demand DynamoDB, one small Lambda, one CloudFront distribution, and per-call Bedrock usage measured in fractions of a cent per morning note. Comfortably inside the free tier plus the hackathon's promotional credits.

## Known limitations (also filed as product feedback)

- The demo API is unauthenticated by design (single simulated household, resettable). A production deployment adds per-household auth in front of every route; API Gateway usage plans with API keys are the planned path for the public scoring API.
- MCP session state is in-memory per Lambda instance; production would move sessions to the same DynamoDB table.
