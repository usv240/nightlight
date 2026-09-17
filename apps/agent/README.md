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

---

# The Household View: one family, two independent measurements

`household_view.py` connects to **two Model Context Protocol servers at once**, Nightlight's and [Bellwether's](https://github.com/usv240/bellwether), and writes one note for a family that runs both.

```
nightlight MCP: 5 tools
  acknowledge_incident, get_household_status, get_night_summary,
  list_incidents, list_recent_nights
bellwether MCP: 7 tools
  add_annotation, generate_doctor_report, get_speech_vitals, get_trend,
  list_days, log_check_result, run_check_instructions
```

## Why this exists

Nightlight and Bellwether were built as separate projects. It took until both were deployed to notice they are built for the **same household**: a family caring for someone living with dementia has Nightlight watching the front door at night and Bellwether tracking speech from a wristband worn all day.

Each system is deliberately narrow. Nightlight knows what happened at a door and nothing about language. Bellwether knows how someone has been speaking and nothing about doors. Neither can see what the other sees, and neither should, because the narrowness is what makes each of them safe to run in a home.

An agent can hold both.

## The refusal is the feature

This is the most dangerous code in either project, because two coincident signals in a dementia context invite exactly the inference a family should never draw from consumer software.

So the rule here is stricter than in either product alone: the agent **reports the coincidence and refuses to interpret it.** Verified output against the live servers:

> Over the past four weeks (September 3 to September 30), Nightlight recorded mostly quiet nights, with doorway events settled by the familiar voice message on September 23 and 27. On September 12, a doorway event at 03:05 escalated and you were woken. During the same four weeks, Bellwether moved from stable to watch on September 1, then to discuss on September 3, where it has remained through September 20. Both systems recorded events in early to mid September. **I cannot tell you whether those changes are related.** These are simulated demonstration households. If you have questions about either pattern, please bring both records to your clinician.

Every date and count came from a tool call. It states the temporal overlap as a fact, refuses the inference, labels the data simulated, and suggests the one action actually available.

A product that said "these are related" would have no way to know, and that sentence would be the most harmful thing either system could produce. Declining to say it is not a limitation we are apologising for; it is the design.

## What it demonstrates about the architecture

The correlation is available to **any** agent, not only to ours. Neither server was modified, neither grants privileged access, and the agent has no database path to either. Two products built independently became composable because both expose a standard surface.

That is the argument for MCP as a protocol rather than as a feature, and it is the thing three separate hackathon projects can show that one cannot.

## Run it

```
python apps/agent/household_view.py
python apps/agent/household_view.py --weeks 4 --json
```

Both endpoints are public. If one is unavailable, the agent reports on what it can reach and says which system it could not.
