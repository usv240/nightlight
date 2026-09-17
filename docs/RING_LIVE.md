# Live Ring API: what actually answered

Evidence that Nightlight's Ring client calls the real Partner API, captured by
`apps/backend/scripts/ring-evidence.mts` against `https://api.amazonvision.com`.

Captured: 2026-09-17T17:33:35Z. Endpoints answering: 3 of 3.

Token: a thirty-minute OAuth token from the Ring console Playground
(<https://developer.amazon.com/ring/console/playground>). No token, device
identifier, address or account detail appears below; the samples are redacted
by the script before they are written, because this is a public repository and
the point is to prove the calls happened rather than to publish a home.

## Results

| Call | Endpoint | Result |
|---|---|---|
| Account | `GET /v1/accounts/me` | answered |
| Devices | `GET /v1/devices` | answered |
| Event history | `GET /v1/devices/{id}/events` | answered |

## Account

`GET /v1/accounts/me`

Response shape: `{ data }`

Redacted sample:

```json
{
 "data": {
  "type": "users",
  "id": "<id redacted>",
  "attributes": {
   "first_name": "Playground",
   "last_name": "User",
   "email": "<redacted>"
  }
 }
}
```

## Devices

`GET /v1/devices`

Response shape: `{ data, included, meta }`

Redacted sample:

```json
{
 "data": [
  {
   "type": "devices",
   "id": "<id redacted>",
   "attributes": {
    "name": "Playground Device",
    "image_url": "https://app-content.ring.com/shared/images/devices/square_device_images/DoorbellPro/rvdp_3x.png"
   },
   "relationships": {
    "location": {
     "data": {
      "type": "locations",
      "id": "<id redacted>"
     },
     "links": {
      "related": "/v1/devices/<id redacted>/location"
     }
    },
    "configurations": {
     "data": {
      "type": "device-configurations",
      "id": "<id redacted>"
     },
     "links": {
      "related": "/v1/devices/<id redacted>/configurations"
     }
    },
    "capabilities": {
     "data": {
      "type": "device-capabilities",
      "id": "<id redacted>"
     },
     "links": {
      "related": "/v1/devices/<id redacted>/capabilities"
     }
    },
    "status": {
     "data": {
      "type": "device-status",
      "id": "<id redacted>"
     },
     "links": {
      "related": "/v1/devices/<id redacted>/status"
     }
    }
   }
  }
 ],
 "included": [
  {
   "type": "device-status",
   "id": "<id redacted>",
   "attributes": {
    "online": true,
    "audio": {
     "snooze": {
      "active": null,
      "until": null
     }
    },
    "state": null,
    "reported_at": "2026-09-17T17:30:58Z"
   }
  },
  {
   "type": "device-capabilities",
   "id": "<id redacted>",
   "attributes": {
    "freeze_detection": null,
    "smoke_detection": null,
    "video": {
     "configurations": [
      "resolution_mode"
     ],
     "codecs": [
      "AVC"
     ],
     "ratio": "16:9",
     "max_resolution": 1080,
     "supported_resolutions": [
      1080
     ]
    },
    "tamper_detection": null,
    "image_enhancements": {
     "configurations": [
      "color_night_vision",
      "privacy_zones"
     ]
    },
    "flood_detection": null,
    "motion_detection": {
     "configurations": [
      "enabled",
      "motion_zones"
     ]
    },
    "contact_detection": null,
    "glass_break_detection
```

## Event history

`GET /v1/devices/{id}/events`

Response shape: `{ data }`

Redacted sample:

```json
{
 "data": []
}
```

## What this does and does not establish

**Does:** the client authenticates against the real Partner API, the request
signing and headers are correct, and the response shapes match what the engine
consumes.

**Does not:** prove chime audio playback on a physical device. That endpoint
writes rather than reads, and it needs a real Ring device on the account. The
voice path and its fallback chain are covered by tests in
`apps/backend/test/voice.test.ts`, and the accepted-format gap is filed as
FRICTION_LOG.md entry 1.
