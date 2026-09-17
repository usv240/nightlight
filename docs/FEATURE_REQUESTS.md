# Feature requests

What we would want built, why it matters, and how urgent it is. Each comes from something we actually hit while building Nightlight, and each is cross-referenced to the friction log entry that produced it.

Urgency uses the hackathon's scale: **critical**, **important**, **nice-to-have**.

---

## Ring

### 1. Document the chime audio playback contract properly

**Critical, for this class of product.**

`POST /v1/devices/{id}/media/audio/playback` is the endpoint Nightlight's entire premise rests on: a familiar recorded voice plays at the door before anyone is woken. The capability is listed, but the accepted audio formats, the size and duration limits, the latency envelope, and which device families support arbitrary audio versus a fixed chime library are not stated on the endpoint page.

That gap is expensive in a specific way. We could not know from the documentation whether a family's own thirty-second recording is playable at all, so we designed a fallback chain (family recording, then an Amazon Polly synthesis, then escalate) partly as engineering and partly as insurance against a contract we could not read. A product whose safety story depends on an endpoint should be able to learn that endpoint's limits without a device in hand.

Please document: accepted container and codec, maximum duration and bytes, whether the audio is fetched by URL or uploaded, expected end-to-end latency, and a per-device-family support matrix.

Friction log entry 1.

### 2. Put "all calls are server to server" on the first page of the docs

**Important.**

The API is server-to-server only and browser calls are blocked by CORS. This is a correct and defensible design, and it determines the entire architecture of anything built on Ring: you need a backend, a webhook receiver, a token store, and a deployment before you can render a single thing.

We learned it partway in. Someone prototyping a front end first will learn it later and more painfully. A short "before you architect" box at the top of the getting-started page, stating the constraint and the shape it implies, would cost one paragraph and save people a day.

Friction log entry 2.

### 3. A webhook replay or test-delivery console

**Important.**

Ring webhooks are HMAC-signed, and verifying that signature correctly is the single highest-risk piece of integration code anyone will write against the platform: get it wrong in the permissive direction and you accept forged events, get it wrong in the strict direction and you silently drop real ones.

We built our own signed replay harness to test it (and open-sourced the verification as `ring-webhook-kit`), but every integrator will build that harness again. A console button that sends a real signed test delivery of each event type to a registered endpoint, and a page showing recent deliveries with their signatures and response codes, would let people verify the riskiest code against the real thing rather than against their own assumptions.

### 4. State the `motion_detected` sub-type vocabulary

**Nice-to-have.**

Our engine branches on `sub_type` to tell a doorway event from other motion. The values we handle come from observation and inference rather than from an enumerated list in the documentation. An explicit vocabulary, with the guarantee of how it may change, would let integrators branch confidently instead of defensively.

---

## Amazon Bedrock

### 5. Make account-level model gating visible before invocation

**Critical.**

Current-generation Claude models return "not available for this account, contact AWS Sales" on this account tier, even after the marketplace agreement is accepted programmatically, and even when every availability signal reads `AVAILABLE`. We wrote a probe script that invokes each model in turn because that is the only way to learn the truth.

Concretely: expose the allowlist gate in `get-foundation-model-availability`, either as a fifth field or by making `authorizationStatus` reflect it, and return it from the agreement-offer listing so an agreement is never accepted for a model the account cannot invoke. Today an account can complete every documented step for a model it will never be able to call, and discover that only at runtime.

This is the single most expensive AWS surprise across all three of our projects this hackathon, and it shaped a design decision: our morning note runs a three-model ladder partly because we cannot trust that any one model is reachable.

Friction log entry 5.

### 6. Warn when a Lambda function URL's CORS collides with the handler's own

**Critical.**

A function URL configured with CORS reflects the origin. A FastAPI, Express or Flask app with CORS middleware, which is what every tutorial for those frameworks tells you to add, sets it too. The response then carries two `Access-Control-Allow-Origin` values and every browser rejects it.

What makes it costly is that nothing on the command line sees it: `curl` does not enforce CORS, test clients do not either, so the test suite and every manual probe pass while the live site is broken. Strip the conflicting header, log a warning when both are configured, or at minimum add one line to the function URL CORS documentation: *do not also set CORS headers in your handler.*

Found in a sibling project in this hackathon (Bellwether, friction entry 6); recorded here because it applies to any Lambda function URL.

---

## AWS CDK

### 7. Fail open, with the escape hatch in the message, when template validation cannot initialize

**Important.**

`aws-cdk-lib`'s built-in template validator crashes with `RuntimeError: unreachable` in its WASM engine on Node 24 under Windows. The crash happens during synth, produces no actionable message, and silently left our `cdk bootstrap` incomplete, which then failed later in a way that pointed nowhere near the real cause.

The fix on our side was `CDK_VALIDATION=false`, which we found by reading `aws-cdk-lib` source. That escape hatch should appear in the crash message itself, and a validator that cannot start should warn and continue rather than take the deploy down. Validation is a safety net, not a precondition.

Friction log entry 4.

### 8. Apply the `createRequire` banner automatically for ESM Lambda bundles

**Nice-to-have.**

`NodejsFunction` with `format: OutputFormat.ESM` produces a bundle where transitive dependencies still call `require()`, which fails at runtime. The fix is a one-line banner injecting `createRequire`, which is well known to people who have hit it and invisible to everyone else.

Since the construct knows the output format, it could apply the banner itself, or emit a synth-time hint. It is a small change that removes a runtime-only failure.

Friction log entry 3.

---

## Model Context Protocol

### 9. Say in the transport section that real clients send `DELETE` with a JSON content-type and an empty body

**Important.**

The spec is precise about the things that are easy to get wrong, which is why our fourteen conformance tests came almost directly from reading it. This one is not in the text, and it cost two of our three projects a 500 error each.

A naive body parser treats an empty body with `Content-Type: application/json` as a parse failure. A test suite built on an injection helper never produces that shape, so it passes while real clients fail. We found it only by pointing an actual Strands agent at our own server, which is also the best argument for doing that.

One sentence in the session-termination section prevents it.

---

## What we are not asking for

Worth stating, because a list of requests reads better with a boundary.

We are not asking Ring to relax the server-to-server constraint. It is the right default for a device API that can unlock doors and play audio into homes, and a product that wants browser access should be built with a backend, which is what we did. We would rather the platform stayed strict here and documented the consequence louder.
