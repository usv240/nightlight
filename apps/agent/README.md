# The Week Review agent

A Strands agent that reads a household's week through Nightlight's own MCP server and writes the caregiver a short, honest review.

## Why this exists

The dashboard answers "what happened last night". Nobody has time to answer the question that actually decides whether a family keeps caring at home: **is this getting harder, and are my settings still right?**

That question needs several steps, and the steps depend on each other: check the household's status, pull the week's nights, look at the incidents behind them, notice whether the pattern is drifting, and only then say something. That is an agent's job, not a report template's.

## The closed loop

The agent does not reach into Nightlight's database. It calls the **same MCP server** that Alexa+ and any other agent would use (`apps/backend/src/mcp.ts`, Model Context Protocol spec 2025-11-25 over Streamable HTTP). Five tools: `get_household_status`, `list_recent_nights`, `get_night_summary`, `list_incidents`, `acknowledge_incident`.

So the Alexa+ track surface and the AWS Builder integration are the same surface, proved by a second, independent client consuming it. If the MCP server were wrong, this agent would be wrong too.

## The safety rule, enforced in the prompt and in the design

The agent may **only** report numbers the tools returned. It never estimates, never predicts, and never gives medical or care advice. Nightlight's whole architecture keeps language models off the detection path, and that boundary does not move because the output is a paragraph instead of an alert.

Suggestions are limited to things a caregiver can act on directly: adjusting the night window, re-recording the voice message, or talking to their clinician. The agent names the observation behind any suggestion so the caregiver can disagree with it.

## Run it

```
pip install strands-agents strands-agents-tools
npm run dev          # from the repo root: backend plus MCP server on :8787
python apps/agent/week_review.py
# against the deployed backend instead:
python apps/agent/week_review.py --url https://<function-url>/mcp
```

Model: Claude on Amazon Bedrock (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`, the most capable model this account can invoke; see FRICTION_LOG.md entry 5).
