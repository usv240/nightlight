# Nightlight demo video: shot list

Target length 2:45. Hard limit 3:00; judges are not required to watch past it, so the best material is in the first 45 seconds. Everything on screen is the live deployment, not a local build, so nothing in the video can differ from what a judge clicks.

Rules this video must satisfy, and where it does:

- Ring: "show your project working through a simulator or an actual Ring device." Shot 5 replays a labelled simulated household through the real, HMAC-verified webhook route.
- Alexa+: "show your MCP server (spec 2025-11-25+, Streamable HTTP) in action." Shots 7 and 8.
- No third-party trademarks, music, or footage. Narration only. No background track.
- English, public on YouTube.

## Before you press record

Do all of this first so every output is warm and known. Cold starts on camera look like bugs.

```
# 1. Terminal, large font (18pt+), dark theme, window sized to 1280x720.
export API=https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws

# 2. Warm the household and confirm the numbers you will read aloud.
curl -s -X POST $API/api/demo/replay -H "content-type: application/json" -d '{"seed":42}'
#    expect: simulated:true, incidents:3, undisturbedNights:27, totalNights:30

# 3. Warm the morning note (first call may take a few seconds).
curl -s $API/api/morning-note | python -m json.tool
#    expect: "source": "bedrock", a "model" field, and an "attempts" array

# 4. Warm the resilience report.
curl -s $API/api/resilience | python -m json.tool

# 5. Warm the MCP server and the agent. Run the agent once now; run it again on camera.
cd apps/agent && python week_review.py --url $API/mcp
```

Browser: https://d28hskpupjctiz.cloudfront.net at 125 percent zoom, light theme to start. Open https://d28hskpupjctiz.cloudfront.net/app in a second tab. Close every other tab. Hide bookmarks bar.

Record at 1080p, 30fps. Speak slowly. Pause half a second before each click so the cut is clean.

## Shot list

### Shot 1: the problem (0:00 to 0:15)

Screen: landing page hero. Do not scroll yet.

Say: "Six in ten people living with dementia will wander, most dangerously at night. Every door alarm on the market answers the same way: it wakes the exhausted caregiver. Seventy percent of families who move a relative into care cite the nights."

### Shot 2: the insight (0:15 to 0:40)

Screen: scroll slowly to the evidence citations. Let the Rowe 2010 card be readable for two seconds.

Say: "That answer has already been tested. A 2009 monitor that woke the caregiver cut injuries and unattended exits. Its companion trial then measured the caregivers for a year: their sleep did not improve on any measure. They felt better and slept the same, because waking them was the only response available. Nightlight changes what happens in the seconds after detection."

### Shot 3: the product (0:40 to 1:05)

Screen: switch to the /app tab. Dashboard loads. Point with the cursor, do not click yet.

Say: "This is the caregiver's dashboard, on a labelled simulated household, running on the real engine. Thirty nights. Twenty-seven undisturbed. The metric at the top is the product: nights the caregiver was not woken. Not incidents detected."

Screen: scroll to Recent nights. Hover the night marked as settled by the voice.

Say: "On this night the front door opened at ten to midnight. A recorded family voice played at the door. Nobody was woken. That is the whole idea: voice first, caregiver second, alarm never."

### Shot 4: the caregiver's controls (1:05 to 1:25)

Screen: scroll to the night window inputs. Change "Night starts" by one hour, click "Save hours". Watch the recomputed counts change.

Say: "The night window is the family's own hours. Change it, and every night in the history is recomputed from the same event log, because nights are computed, never stored."

Screen: scroll to "Record your message". Click it, say four words into the mic, click "Stop recording". Do not play it back on camera; time is tight.

Say: "This is the voice that plays. A family member records it once, in their browser."

### Shot 5: the Ring contract, for real (1:25 to 1:45)

Screen: terminal. Run the replay command from the pre-flight. Show the JSON response.

Say: "Under the hood, that month is a simulated household replayed through the real Ring webhook route. Every event is HMAC-signed, verified with a timing-safe compare, and deduplicated, exactly as a real Ring delivery would be. The label says simulated because it is; the contract is Ring's."

### Shot 6: the morning note, with provenance (1:45 to 2:00)

Screen: terminal. Run the morning-note curl. Point the cursor at "source": "bedrock" and the "model" field.

Say: "The morning note is phrased by Claude on Amazon Bedrock, from facts the engine computed. The model may not add or alter a single fact, and every note says which model wrote it. If every model fails, the deterministic template ships instead: plainer, never wrong."

### Shot 7: the MCP server (2:00 to 2:12)

Screen: terminal. Run:

```
curl -s -D- -o /dev/null -X POST $API/mcp -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"demo","version":"1"}}}' \
  | grep -i mcp-session-id
```

Point at the MCP-Session-Id header.

Say: "The same household is an MCP server: spec 2025-11-25 over Streamable HTTP, session issued on initialize. This is the Alexa+ surface."

### Shot 8: an agent proves the surface (2:12 to 2:35)

Screen: terminal. Run the Week Review agent against the live endpoint. Let the tool list print, then the note.

```
python apps/agent/week_review.py --url $API/mcp
```

Say: "This is a Strands agent on Bedrock. It has no database access. It reaches the household only through those MCP tools, and it writes the caregiver's week from what the tools return. It also found a bug our own conformance tests had missed, which is the best argument for it."

### Shot 9: nothing fails into silence (2:35 to 2:45)

Screen: terminal. Run the resilience curl. Scroll to the voice section so "onTotalFailure" is visible.

Say: "The voice is a chain: family recording, then Polly synthesis, and if both fail the caregiver is woken immediately, because degrading to silence is the one thing this system must never do."

### Shot 10: close (2:45 to 2:55)

Screen: back to the landing page, scrolled to the evaluation line and the repo link.

Say: "Across 2,936 nights of 34 real homes from the public CASAS corpus, a standard door alarm wakes the caregiver 14,068 times. Nightlight wakes them 774. Open source, MIT, live at the link."

Hold on the URL for two seconds. Cut.

## Do not say

- Anything that implies diagnosis, prediction, or medical advice.
- "Prevents wandering." It responds to it.
- Any number not on the landing page or in docs/EVIDENCE.md.
- "Production ready." Say "live" and "tested."

## After recording

- Export 1080p, H.264. No music.
- YouTube: title "Nightlight: the Ring doorbell works the night shift", visibility Public, not Unlisted. Description: one paragraph, then the site URL, the repo URL, and "Simulated household; real Ring webhook contract."
- Paste the link into docs/SUBMISSION.md under Links, and into the Devpost form.
