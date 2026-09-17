# Friction Log

Format per entry: task attempted, steps taken, expected vs actual, severity (low, medium, high), workaround, actionable suggestion. Entries are written the day they happen. This log is part of the hackathon submission (friction logs earn up to a 10 percent judging bonus) and, more importantly, it is real feedback for the Ring team.

## Entry 1: Chime audio playback capability is under-documented (2026-08-31)

- Task: decide whether the familiar-voice prompt can play through Ring hardware (POST /v1/devices/{device_id}/media/audio/playback, Chime Controls capability).
- Steps: read the Ring API reference and the getting started guide; searched the developer community.
- Expected: documentation stating accepted audio formats, length limits, and whether arbitrary uploaded audio is supported versus preset tones.
- Actual: the endpoint and required capability are listed, but formats, limits, and the preset-versus-arbitrary question are not documented anywhere we could find.
- Severity: high (this selects our primary voice delivery path).
- Workaround: adapter architecture with an Echo announcement fallback; a live verification spike is scheduled for the first day of API access.
- Suggestion: document accepted formats and limits on the endpoint page, and state per device family whether arbitrary audio is supported.

## Entry 2: Server-to-server-only API shapes the whole architecture, but quietly (2026-08-31)

- Task: plan the caregiver web app's data flow.
- Steps: read the API reference; noticed browser-initiated requests are blocked by CORS policy.
- Expected: a prominent callout early in the getting started guide.
- Actual: the constraint is real and correct, but easy to miss until integration time; a developer who starts with a frontend prototype will discover it late.
- Severity: medium.
- Workaround: all Ring calls proxied through our backend from day one.
- Suggestion: add a "before you architect" box on the first page of the docs: all calls are server to server; plan a backend.

## Entry 3: ESM Lambda bundling still needs the createRequire banner (2026-09-01)

- Task: deploy the ESM Fastify backend to Lambda with CDK NodejsFunction.
- Steps: set bundling format to ESM, target node20, first synth.
- Expected: an ESM project bundles and runs without extra configuration.
- Actual: transitive dependencies that call require() inside ESM output crash at runtime unless a createRequire banner is injected; this is a long-standing, widely-documented workaround that still is not a default.
- Severity: low (well-known workaround), but it is the kind of paper cut every ESM Lambda project hits once.
- Workaround: `banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"` in the bundling options.
- Suggestion: NodejsFunction could apply this banner automatically when format is ESM, or at least surface a synth-time hint.

## Entry 4: aws-cdk-lib built-in template validation crashes in WASM on Node 24 Windows (2026-09-01)

- Task: first cdk deploy of the Nightlight stack.
- Steps: cdk bootstrap succeeded; cdk deploy ran esbuild bundling fine, then synth crashed.
- Expected: synth completes, or validation reports findings.
- Actual: the built-in CloudFormation validation plugin's WASM Rego engine (@aws/cloudformation-validate) crashed with RuntimeError: unreachable while constructing WasmRegoEngine, killing the whole synth. Node 24.13, Windows 11.
- Severity: medium (blocks deploy entirely, and the error points at WASM internals rather than at a switch).
- Workaround: CDK_VALIDATION=false environment variable, discovered by reading aws-cdk-lib source (defaultValidationEnabled checks it); it is not surfaced in the error output.
- Suggestion: fail open with a clear warning when the validation engine cannot initialize, and print the CDK_VALIDATION=false escape hatch in the crash message.

## Entry 5: Bedrock model availability signals disagree with reality for gated models (2026-09-14)

- Task: call Claude on Amazon Bedrock for morning-note phrasing (the AWS Builder integration).
- Steps: invoked anthropic.claude-opus-5 via the Anthropic Bedrock SDK; got 403 "not available for this account, contact AWS Sales"; accepted the marketplace agreement programmatically (list-foundation-model-agreement-offers plus create-foundation-model-agreement); waited for agreementAvailability AVAILABLE; retried; repeated the whole cycle for claude-sonnet-5.
- Expected: after the agreement reports AVAILABLE, authorizationStatus AUTHORIZED, entitlementAvailability AVAILABLE, and regionAvailability AVAILABLE, the model can be invoked.
- Actual: every current-generation Claude (Opus 5, Opus 4.8, Opus 4.7, Sonnet 5) still returns 403 contact-sales on both the Messages endpoint and the classic runtime. The account tier is allowlist-gated, but no availability API exposes that: all four signals read as available while invocation is denied. Meanwhile Claude Sonnet 4.5 and Haiku 4.5 invoke fine through inference profiles on the classic runtime, and the same dated model ids return 404 on the Mantle Messages endpoint.
- Severity: high for anyone budgeting a hackathon around a specific model; the failure mode is discovered only at invoke time, after agreements are accepted.
- Workaround: probe actual invocation per candidate model (scripts/bedrock-check.mts), then pin the most capable model that answers: us.anthropic.claude-sonnet-4-5-20250929-v1:0 via the classic AnthropicBedrock client.
- Suggestion: expose account allowlist gating in get-foundation-model-availability (a fifth field, or make authorizationStatus reflect it), and return it from the agreement-offer listing so the agreement is never accepted for a model the account cannot invoke.

## Entry 6: the Playground is the answer to entry 2, and it arrived after we had architected around it (2026-09-17, positive with a note)

- Task: call the live Ring Partner API to prove the client works, rather than only proving our own signed webhooks work.
- Steps: searched the developer portal for a test console or token generation path, then found it in the release notes rather than in the development guide.
- What exists: the **Playground**, released 28 May 2026, at <https://developer.amazon.com/ring/console/playground>. Quoting the release note: "a sandbox to test Ring device, media, and account APIs in real-time without creating an app, completing account linking, or having an active Ring subscription", with "one-click OAuth token generation (valid 30 minutes), an interactive API explorer with curl commands and live JSON responses" and "live view event simulation for Package, Vehicle, and Motion event types".
- Why this is a positive entry: it removes the single hardest barrier to building on Ring. No app registration, no account linking, no subscription, and no physical device, which is exactly the wall a newcomer hits in their first hour. For a hackathon inviting outside developers, it is the most useful thing on the platform.
- Severity of the remaining friction: low, and entirely about discoverability. We found it in the release notes on our second day of looking. It is not in the development guide's Test section, which describes the full "Log in with Ring" authorization flow instead, and it is not on the getting-started page. Someone reading the docs in order will architect around a constraint that the Playground has already lifted, which is what we did.
- Workaround: none needed once found. `apps/backend/scripts/ring-evidence.mts` takes a Playground token and sweeps every read path in one command, because thirty minutes is short.
- Suggestion: link the Playground from the first page of the getting-started guide and from the Test section of the development guide, with the sentence from the release note. "Test the APIs right now, without an app" is the strongest thing the portal can say to a developer who has not committed yet, and at the moment it is only findable by reading release notes.

## Entry 7: our deployed MCP servers answered a malformed body with a 500, and every test passed (2026-09-17, ours not theirs)

- Task: prove the claim "the MCP server is live and spec correct" in a way a reviewer can check, rather than asking them to take our word for it. An MCP URL opened in a browser shows an error, because the protocol is a POST with a session handshake, so there is nothing to click.
- Steps: write a dependency-free probe that speaks the Streamable HTTP transport over real HTTP (`scripts/mcp-conform.mjs`), point it at the deployed Lambda, and grade each check as MUST or SHOULD against spec revision 2025-11-25.
- Expected: the same result as the conformance suite, which passes.
- Actual: eighteen of nineteen. A body the server could not parse came back as HTTP 500 with Fastify's own error envelope, `{"statusCode":500,"error":"Internal Server Error","message":"Expected property name or '}' in JSON at position 2"}`. JSON-RPC is explicit that an unparseable body is a -32700 Parse error, and a 500 tells a client to retry something that can never succeed. The same bug was live in a sibling project's server. Bellwether, which is FastAPI rather than Fastify, was already correct.
- Root cause: the custom content-type parser handed the parse error to Fastify's `done` callback. Fastify's default for a content-type parser error with no `statusCode` is a 500, which is a reasonable default for a body a route needs and the wrong one for a protocol that defines its own parse error.
- What made it expensive: nothing. It cost minutes, because the probe named the rule it was checking. What is worth recording is that it was invisible for weeks: fourteen conformance tests and everything else in the suite passed, because an in-process test client is a function call and cannot reproduce a socket, a proxy, a Lambda function URL or a client that sends something malformed.
- Severity: medium. No agent we control sends malformed JSON, so nothing was broken in practice. It is here because the failure mode is the point, not the bug: a test suite that never leaves the process cannot verify a claim about a deployed service, and we made that claim.
- Workaround: the parser reports a parse failure as data and each route decides what it means. The MCP route returns -32700 with a 400; the Ring webhook route rejects on signature first and then on shape. Pinned by two tests, and the probe re-checks it against the live server.
- Why it is in this log: it is the second time this hackathon that the gap between an injected request and a real one hid a live defect, the first being a DELETE with a JSON content-type and an empty body. Recorded so the pattern is named: any claim about a deployed endpoint needs one check that actually crosses the network.

<!-- Add new entries above this line as they happen. -->
