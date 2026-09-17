# The Week Review agent, hosted on Amazon Bedrock AgentCore

The same Week Review agent that runs locally in [`apps/agent`](../agent), deployed to AgentCore Runtime as an invocable endpoint.

```
Runtime: nightlightweek_weekreview
Region:  us-east-1
Model:   us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

## Why host it rather than leave it a script

The local agent proved the MCP surface was real. It could not be *called* by anything.

On AgentCore Runtime the agent becomes an endpoint with an ARN, its own IAM role, and CloudWatch traces. Anything that can invoke it, including Alexa+, a scheduled job, or another agent, can now ask a household how its week went. That is the difference between demonstrating an agent and deploying one, and it is the gap every one of our three projects had: the MCP servers were live and the agents were not.

## The architecture that matters

The hosted agent has **no database access and no privileged path**. It reaches the household only through Nightlight's own MCP server, spec 2025-11-25 over Streamable HTTP, at the same public endpoint Alexa+ would call:

```
https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws/mcp
```

It is given **no local tools at all**. The scaffold ships a placeholder `add_numbers` tool; it is removed on purpose, so the agent's entire capability surface is the five tools the MCP server exposes. If that surface were wrong, this agent would be wrong too.

## Verified running

```
agentcore invoke --prompt "Review this household's last seven nights and write the caregiver's weekly note."
```

```
Seven quiet nights, September 24 to 30. On the 27th there was one doorway
event at 23:50 that settled with the familiar voice, so you were not woken.
You're now at eighteen nights undisturbed. This is simulated demo data.
```

Every number came from a tool call. It named the date range, the one event and its time, the outcome, and the streak, and it labelled the demo household as simulated, which the system prompt requires.

## Deploy it yourself

```
cd apps/agentcore
cp agentcore/aws-targets.example.json agentcore/aws-targets.json   # set your account id
(cd agentcore/cdk && npm install)
npx @aws/agentcore deploy --yes
npx @aws/agentcore invoke --prompt "How was the week?"
npx @aws/agentcore logs
```

`aws-targets.json` holds your own AWS account and region, so it is gitignored and shipped as an example. `.cli/` and `.env.local` are local state and are ignored too.

## What is in here

| Path | What it is |
|---|---|
| `app/weekreview/main.py` | The entrypoint. Carries the Week Review system prompt verbatim from `apps/agent/week_review.py` |
| `app/weekreview/mcp_client/client.py` | The Streamable HTTP client pointed at Nightlight's MCP server. `NIGHTLIGHT_MCP_URL` overrides it |
| `app/weekreview/model/load.py` | Bedrock model, pinned to the profile this account can actually invoke |
| `agentcore/cdk/` | The CDK project the CLI generates and deploys |

## Two notes for anyone following this path

**The scaffold defaults to a `global.` inference profile.** This account is allowlist-gated out of several current-generation Claude models on Bedrock, and the availability APIs do not surface that gate, so `load.py` pins the `us.` profile verified working from our deployed Lambda. See `FRICTION_LOG.md` entry 5.

**`npm install` in `agentcore/cdk/` is required before the first deploy** if you cloned rather than scaffolded. Without it the CDK TypeScript build fails with `Cannot find module '@aws/agentcore-cdk'`, which looks like a broken template rather than a missing install.
