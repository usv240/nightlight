"""The Week Review agent.

A Strands agent that reads a household's week through Nightlight's own MCP
server and writes the caregiver a short, honest review.

The point of building it this way: the agent is a second, independent
client of the same Model Context Protocol server that Alexa+ would use
(apps/backend/src/mcp.ts, spec 2025-11-25 over Streamable HTTP). It has no
database access and no privileged path. If the MCP surface were wrong,
this agent would be wrong too, which is the cheapest possible proof that
the surface is real.

Safety boundary, unchanged from the rest of the system: language models
never touch detection. This agent only reads what the deterministic engine
already decided, and it may report only numbers the tools returned.

Usage:
    python week_review.py [--url http://127.0.0.1:8787/mcp] [--json]
"""

from __future__ import annotations

import argparse
import json
import sys

from mcp.client.streamable_http import streamablehttp_client
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient

DEFAULT_MCP_URL = "http://127.0.0.1:8787/mcp"
# The most capable Claude this AWS account can invoke; see FRICTION_LOG.md
# entry 5 for why it is not a current-generation model.
MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

SYSTEM_PROMPT = """You write a weekly review for one family caregiver looking
after someone living with dementia at home. They are tired. They will read
this with their coffee, once.

You have tools that read a monitoring system called Nightlight. It watches
the household's front door at night, answers an unusual night-time doorway
event with a recorded family voice first, and wakes the caregiver only if
that does not settle things.

How to work:
1. Start with get_household_status to learn whether the system is armed or
   still learning, and the current night window.
2. Read the week with list_recent_nights.
3. If any night woke the caregiver or held an incident, look at
   list_incidents to understand what actually happened.
4. Only then write.

Hard rules:
- Report only numbers and facts the tools returned. Never estimate, never
  extrapolate, never invent a trend the data does not show.
- Never give medical or care advice, never suggest a diagnosis, and never
  predict what will happen next.
- If the week was quiet, say so plainly and briefly. A short review is a
  good week, not a failure to find something.
- You may suggest only things the caregiver can act on themselves:
  adjusting the night window, re-recording the voice message, or raising
  something with their own clinician. Always name the observation behind a
  suggestion so they can disagree with it.
- Write four sentences or fewer, in plain warm language, second person.
  No emojis. No dashes of any kind as punctuation: use commas, colons, or
  full stops, and write date ranges as "September 24 to 30".

Output format: the note itself and nothing else. No preamble, no heading,
no horizontal rules, no commentary about the tools or your process. The
caregiver should see only what you would have written on a sticky note.
"""

PROMPT = """Review this household's last seven nights and write the
caregiver's weekly note. Use the tools first, then reply with only the
note."""


def build_client(url: str) -> MCPClient:
    """An MCP client over Streamable HTTP, the transport the server speaks."""
    return MCPClient(lambda: streamablehttp_client(url))


def main() -> int:
    parser = argparse.ArgumentParser(description="Nightlight weekly review agent")
    parser.add_argument("--url", default=DEFAULT_MCP_URL, help="Nightlight MCP endpoint")
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    args = parser.parse_args()

    client = build_client(args.url)
    with client:
        tools = client.list_tools_sync()
        tool_names = sorted(getattr(t, "tool_name", str(t)) for t in tools)
        if not args.json:
            print(f"Connected to {args.url}")
            print(f"Tools discovered: {', '.join(tool_names)}\n")

        agent = Agent(
            model=BedrockModel(model_id=MODEL_ID, region_name="us-east-1"),
            tools=tools,
            system_prompt=SYSTEM_PROMPT,
            name="nightlight-week-review",
            description="Writes a caregiver's weekly review from Nightlight's MCP tools.",
            callback_handler=None if args.json else None,
        )
        result = agent(PROMPT)
        text = str(result).strip()

    if args.json:
        print(json.dumps({"review": text, "tools": tool_names, "model": MODEL_ID}, indent=1))
    else:
        print("=" * 62)
        print("THIS WEEK")
        print("=" * 62)
        print(text)
        print("=" * 62)
        print("Written by a Strands agent from Nightlight's MCP tools only.")
        print("Not medical advice. Nightlight is a home safety aid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
