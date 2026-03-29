# Toll Recovery Test

Test integration: **Zubie → TollGuru** for MSH Rentals toll tracking.

## Flow

```
Zubie trip_end webhook
  → POST /api/webhooks/zubie (stores trip)
  → Cron 11:30 PM (fetches GPS points from Zubie, submits to TollGuru)
  → Results stored in data/trips.json
  → Query via GET /api/trips
```

## Setup

### 1. Install & run locally
```bash
npm install
npm run dev
```

### 2. Authorize Zubie
Visit: http://localhost:3000/api/auth/login
- Logs in via OAuth, saves tokens to data/tokens.json

### 3. Configure Zubie webhook
In your Zubie developer app, set webhook URL to:
- Local: use ngrok → `https://your-ngrok-id.ngrok.io/api/webhooks/zubie`
- Production: `https://toll-recovery-test.vercel.app/api/webhooks/zubie`
- Events: `trip_end`

### 4. Trigger batch processing manually
```bash
curl -X POST http://localhost:3000/api/cron/process-tolls \
  -H "Authorization: Bearer toll-test-secret-123"
```

### 5. Query results
```
GET /api/trips
GET /api/trips?vehicle_key=X&start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z
```

## Environment Variables

See `.env.example`. Copy to `.env.local` and fill in values.

| Variable | Description |
|---|---|
| `ZUBIE_CLIENT_ID` | From Zubie developer app |
| `ZUBIE_CLIENT_SECRET` | From Zubie developer app |
| `ZUBIE_REDIRECT_URI` | OAuth callback URL |
| `TOLLGURU_API_KEY` | From tollguru.com/dashboard |
| `CRON_SECRET` | Random secret to protect cron endpoint |

## Production (Vercel)

1. Push to GitHub
2. Connect repo to Vercel
3. Add env vars in Vercel dashboard
4. Update `ZUBIE_REDIRECT_URI` to your Vercel URL
5. Update redirect URI in Zubie developer app settings
6. Cron runs automatically at 11:30 PM UTC via `vercel.json`

## Data Storage

Currently uses flat JSON files (`data/trips.json`, `data/tokens.json`).  
For production: swap `lib/db.js` for Vercel Postgres / Neon / Supabase.
