"""The Household View: one family, two independent measurements.

    "Two things moved in the same fortnight. From September 1st her speech
     has been outside her usual range, and on September 12th the door
     opened at night for the first time in eleven days. Those are separate
     systems that do not talk to each other, and neither can tell you
     whether they are related. Both dates are on the report."

Why this exists
---------------
Nightlight and Bellwether were built as separate projects for the same
hackathon, and it took until they were both deployed to notice that they
are built for the *same household*. A family caring for someone living
with dementia has Nightlight watching the front door at night and, if they
use it, Bellwether tracking speech from a wristband worn all day.

Each system is deliberately narrow. Nightlight knows what happened at a
door and nothing about language. Bellwether knows how someone has been
speaking and nothing about doors. Neither can see what the other sees, and
neither should: the narrowness is what makes each of them safe.

An agent can hold both, and that is genuinely new. It is also the single
most dangerous thing in either codebase, because two coincident signals in
a dementia context invite exactly the inference a person should never draw
from a consumer product.

So the rule here is stricter than in either project alone: this agent
**reports the coincidence and refuses to interpret it.** It states both
timelines with dates, says plainly that the systems are independent and
that temporal overlap is not evidence of a relationship, and recommends the
one action that is actually available: take both records to a clinician.

That refusal is the feature. A product that would say "these are related"
has no way to know, and saying it would be the most harmful sentence
either system could produce.

Architecture
------------
Two Model Context Protocol servers, spec 2025-11-25 over Streamable HTTP,
both public, both the same surfaces Alexa+ would call:

    Nightlight   five tools: nights, incidents, status, acknowledgement
    Bellwether   seven tools: speech tiers, trend, days, report, check

The agent has no database access to either. It reads what each product
chooses to expose and nothing more, which means this correlation is
available to any agent, not only to us.

Usage:
    python household_view.py
    python household_view.py --weeks 4 --json
"""

from __future__ import annotations

import argparse
import contextlib
import io as _io
import json
import sys
import warnings

warnings.filterwarnings(
    "ignore",
    message=r"coroutine 'MCPClient\.stop.*' was never awaited",
    category=RuntimeWarning,
)

from mcp.client.streamable_http import streamablehttp_client
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient

NIGHTLIGHT_MCP = "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws/mcp"
BELLWETHER_MCP = "https://bppni6dpuntpbynfydk52gexue0xulzh.lambda-url.us-east-1.on.aws/mcp"
MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

SYSTEM_PROMPT = """You are writing one short note for a family caring for
someone living with dementia at home. You can see two independent systems.

Nightlight watches the household's front door at night. It answers an
unusual night-time doorway event with a recorded family voice first and
wakes the caregiver only if that does not settle things. Its tools report
nights, whether the caregiver was woken, and incidents.

Bellwether keeps a personal baseline of how one person normally speaks,
from language features only and never the words, and reports when that
changes against their own past. Its tools report a tier (learning, stable,
watch, discuss), a trend, and the measures behind any change.

These systems are separate. They do not share data, they measure different
things, and neither was designed with the other in mind.

How to work:
1. Read the recent nights from Nightlight and the recent trend from
   Bellwether. Note the date range each one covers.
2. Identify the overlapping period, and describe what each system saw in
   it, with dates.
3. If something moved in both during the same period, say so as a plain
   statement of timing, and immediately say that you cannot tell whether
   they are related.

Hard rules, and these are the reason this note is safe to write:
- Report only dates, counts and tiers the tools returned. Never estimate.
- NEVER say or imply that a change in speech and a change at the door are
  related, caused by each other, or evidence of anything. You have no way
  to know, two systems moving in the same fortnight is often coincidence,
  and this is exactly the inference a family should not draw from software.
- NEVER diagnose, never name a condition, never say anything is
  progressing, worsening, advancing or declining, and never predict.
- Never give medical or care advice. The only action you may suggest is
  taking both records to a clinician, who can interpret them and you
  cannot.
- Do not reassure either. "Probably nothing" is as unfounded as the
  opposite, and just as harmful.
- Say plainly that both households shown here are simulated demonstration
  data.
- Describe the person only through what the systems did. Never as a risk,
  a score, or a set of incidents.
- Six sentences or fewer, plain and warm, second person. No emojis. No
  dashes of any kind as punctuation.

Output format: the note itself and nothing else. No preamble, no heading.
"""

PROMPT = """Look at the last few weeks across both systems and write the
family's note. Use the tools first, then reply with only the note."""


@contextlib.contextmanager
def _quiet_stderr():
    saved = sys.stderr
    sys.stderr = _io.StringIO()
    try:
        yield
    finally:
        sys.stderr = saved


def client(url: str) -> MCPClient:
    return MCPClient(lambda: streamablehttp_client(url))


def tool_name(t) -> str:
    return getattr(t, "tool_name", str(t))


def main() -> int:
    ap = argparse.ArgumentParser(description="Household view across Nightlight and Bellwether")
    ap.add_argument("--nightlight-url", default=NIGHTLIGHT_MCP)
    ap.add_argument("--bellwether-url", default=BELLWETHER_MCP)
    ap.add_argument("--weeks", type=int, default=4)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    nightlight = client(args.nightlight_url)
    bellwether = client(args.bellwether_url)
    tools: list = []
    sources: dict[str, list[str]] = {}

    with nightlight, bellwether:
        for label, c in (("nightlight", nightlight), ("bellwether", bellwether)):
            try:
                with _quiet_stderr():
                    got = c.list_tools_sync()
                tools.extend(got)
                sources[label] = sorted(tool_name(t) for t in got)
            except Exception as err:  # noqa: BLE001
                sources[label] = []
                if not args.json:
                    print(f"{label}: unavailable ({str(err).splitlines()[0][:60]})")

        if not args.json:
            for label, names in sources.items():
                print(f"{label} MCP: {len(names)} tools")
                if names:
                    print(f"  {', '.join(names)}")
            print()

        if len(tools) == 0:
            print("Neither MCP server answered. Nothing to report.", file=sys.stderr)
            return 1

        agent = Agent(
            model=BedrockModel(model_id=MODEL_ID, region_name="us-east-1"),
            tools=tools,
            system_prompt=SYSTEM_PROMPT,
            name="household-view",
            description="Reports what two independent household systems saw, and refuses to relate them.",
            callback_handler=None,
        )
        text = str(agent(f"{PROMPT} Cover about {args.weeks} weeks.")).strip()

    if args.json:
        print(json.dumps({"note": text, "sources": sources, "model": MODEL_ID}, indent=1))
    else:
        print("=" * 64)
        print("THIS FORTNIGHT, ACROSS BOTH SYSTEMS")
        print("=" * 64)
        print(text)
        print("=" * 64)
        print("Two independent Model Context Protocol servers. Neither system")
        print("shares data with the other, and this note does not claim the two")
        print("are related, because nothing here could know that. Not a")
        print("diagnosis. Simulated demonstration households.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
