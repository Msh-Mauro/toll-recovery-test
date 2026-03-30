# Toll Recovery System — Technical Specification
> Paste this into Claude Code as context before implementing.

---

## What This Does

Tracks toll charges incurred during vehicle trips by ingesting GPS route data from **Zubie** (telematics) and calculating toll costs via **TollGuru**. Results are stored in Postgres and queryable by vehicle + date range to generate per-reservation toll reports.

---

## Data Flow

```
1. Vehicle drives → Zubie GPS device records the route
2. Trip ends → Zubie fires a webhook (trip_end event) to our server
3. Webhook handler → immediately calls Zubie API to fetch full trip data (including polyline)
4. Trip + polyline stored in DB (processed = false)
5. Nightly cron (11:30 PM) → sends polyline to TollGuru → stores toll results (processed = true)
6. Dashboard/report queries processed trips by vehicle + date range
```

---

## Zubie Integration

### Auth
OAuth2 Authorization Code flow.

- Authorize URL: `https://login.zubiecar.com/authorize`
- Token URL: `https://login.zubiecar.com/oauth/token`
- Scopes: `trips.read vehicles.read` (standard approval)
- `trippoints.read` requires separate approval from Zubie support — do NOT assume it's available
- Tokens expire in 86400s. Store `access_token`, `refresh_token`, `expires_in`, `saved_at` in DB. Auto-refresh when within 5 minutes of expiry.

### Trips List Endpoint
```
GET https://api.zubiecar.com/api/v2/zinc/trips
Authorization: Bearer <access_token>
Params: size, started_after, started_before, vehicle_key, cursor (for pagination)
```

Key fields returned per trip:
```json
{
  "key": "trip_key_string",
  "encoded_polyline": "google_encoded_polyline_string",
  "gps_distance": 37.3,
  "start_point": {
    "timestamp": "2026-03-29T11:42:49-04:00",
    "point": { "lat": 28.36, "lon": -81.31 }
  },
  "end_point": {
    "timestamp": "2026-03-29T12:49:05-04:00",
    "point": { "lat": 28.44, "lon": -81.55 }
  },
  "vehicle": { "key": "vehicle_key_string", "nickname": "Grand Cherokee" }
}
```

### What is `encoded_polyline`?
Google's polyline encoding format — a compressed string representing the full GPS route the vehicle actually traveled. It's derived from the Zubie device's GPS recording (real route, not predicted). May be slightly downsampled vs. raw GPS points but is accurate enough for toll detection.

### ⚠️ Critical Bug to Avoid
**The `encoded_polyline` field is NOT included in the Zubie webhook payload.** It only comes from the trips list API. If you save the trip directly from the webhook payload without fetching from the API, `encoded_polyline` will be null and TollGuru processing will be skipped entirely.

**Fix:** On every `trip_end` webhook, immediately call the trips list API to fetch the full trip object, then persist the polyline.

---

## TollGuru Integration

Use the **synchronous polyline endpoint** — not the async GPS CSV endpoint. This avoids needing `trippoints.read` scope and returns results in one API call with no polling.

### Request
```
POST https://apis.tollguru.com/toll/v2/complete-polyline-from-mapping-service
x-api-key: <TOLLGURU_API_KEY>
Content-Type: application/json

{
  "mapProvider": "here",
  "polyline": "<encoded_polyline_string>",
  "vehicle": { "type": "2AxlesAuto" }
}
```

### Response
```json
{
  "route": {
    "tolls": [
      {
        "name": "Boggy Creek Mainline Toll Plaza",
        "road": "SR 417 (Central Florida GreeneWay)",
        "state": "FL",
        "licensePlateCost": 3.36,
        "tagCost": 1.25
      }
    ]
  }
}
```

### Cost Field
Use **`licensePlateCost`** — the cash/mail-in rate for drivers without a transponder. This is correct for rental fleet billing. `tagCost` is the SunPass/E-ZPass discounted rate — do not use this.

If a route has no tolls, the `tolls` array is empty and total is $0. This is normal — most local trips return $0.

**Vehicle type:** `2AxlesAuto` for standard passenger vehicles.

**Coverage:** Nationwide, all 50 US states.

---

## Database Schema

```sql
CREATE TABLE tokens (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_in INTEGER,
  saved_at BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Single row, upsert pattern — only one active token set at a time

CREATE TABLE trips (
  id SERIAL PRIMARY KEY,
  trip_key TEXT UNIQUE NOT NULL,
  vehicle_key TEXT,
  vehicle_nickname TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  gps_distance NUMERIC,
  encoded_polyline TEXT,       -- From Zubie trips API (NOT webhook payload)
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  tolls JSONB,                 -- See structure below
  received_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tolls JSONB Structure
```json
{
  "total_usd": 8.82,
  "count": 3,
  "tolls": [
    { "name": "288 - Leesburg Plaza", "road": "Northern Coin System", "state": "FL", "cost": 3.46 },
    { "name": "254 - Orlando South",  "road": "Northern Coin System", "state": "FL", "cost": 1.16 },
    { "name": "6 - Mainline Plaza",   "road": "Beachline Expy",       "state": "FL", "cost": 4.20 }
  ]
}
```

---

## Webhook Handler

```
POST /api/webhooks/zubie
```

### Zubie Webhook Payload
```json
{
  "event": "trip_end",
  "trip": { "key": "...", "gps_distance": 37.3 },
  "vehicle": { "key": "...", "nickname": "Grand Cherokee" }
}
```

### Handler Logic
1. Check `event === "trip_end"`, ignore all other events
2. Extract `trip.key`
3. **Immediately call** `GET https://api.zubiecar.com/api/v2/zinc/trips?size=1&trip_key=<key>` with valid OAuth token
4. Extract `encoded_polyline` from API response
5. Save to DB with polyline

If the Zubie API call fails, save the trip anyway with `encoded_polyline = null` — the cron will skip it but won't crash.

---

## Nightly Cron

Schedule: `30 23 * * *` (11:30 PM UTC via Vercel Cron)
Endpoint: `POST /api/cron/process-tolls`
Auth: `Authorization: Bearer <CRON_SECRET>`

### Logic
```
1. Fetch all trips WHERE processed = false AND ended_at IS NOT NULL
2. For each trip:
   a. If encoded_polyline is null → skip, log it
   b. POST polyline to TollGuru endpoint
   c. Extract toll summary (total_usd, count, tolls array using licensePlateCost)
   d. UPDATE trip SET processed = true, processed_at = NOW(), tolls = <summary>
```

---

## Toll Report Query

To generate a toll report for a reservation:
```sql
SELECT * FROM trips
WHERE vehicle_key = $1
  AND started_at >= $2    -- reservation start datetime
  AND ended_at   <= $3    -- reservation end datetime
  AND processed  = TRUE
ORDER BY started_at ASC;
```

Sum `tolls->>'total_usd'` across matched trips for the total bill.

---

## Environment Variables

```
ZUBIE_CLIENT_ID
ZUBIE_CLIENT_SECRET
ZUBIE_REDIRECT_URI
TOLLGURU_API_KEY        # API key prefix is tt_
CRON_SECRET
DATABASE_URL            # Neon Postgres pooled connection string
```

---

## Multi-Tenant Notes (SaaS)

Current test implementation is single-tenant. For production SaaS:

- Add `host_id` to all tables (`trips`, `tokens`, `vehicles`, `reservations`)
- Each host has their own Zubie OAuth token stored separately
- All queries must be scoped to `host_id` of the authenticated user
- Webhook endpoint must identify which host a trip belongs to (by matching `vehicle_key` to a host's registered fleet)
- Billing/subscription gating per host

---

## Known Limitations

1. **No per-plaza crossing timestamps** with the polyline approach. TollGuru infers which plazas were crossed but not exactly when. Timestamps require `trippoints.read` scope from Zubie + TollGuru's async GPS CSV endpoint.

2. **Some Zubie devices don't return `encoded_polyline`**. Older units may omit it. Those trips are stored but never processed. Long-term fix: request `trippoints.read` from Zubie support.

3. **Webhook reliability**: If server is down when Zubie fires, the trip is lost. Mitigation: daily reconciliation job that fetches all trips from Zubie for past 48h and upserts any missing ones.

4. **TollGuru accuracy**: GPS inference is not 100%. False negatives possible on routes with parallel toll/free roads. Flag charges under $1.50 for manual review.
