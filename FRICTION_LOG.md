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

<!-- Add new entries above this line as they happen. -->
