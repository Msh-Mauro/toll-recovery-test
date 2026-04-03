const BASE = 'https://apis.tollguru.com/toll/v2';

const HEADERS = {
  'x-api-key': process.env.TOLLGURU_API_KEY,
  'Content-Type': 'application/json',
};

// Synchronous polyline endpoint — no async polling needed
// Uses Zubie's encoded_polyline directly (Google-encoded format)
// departureTime: ISO 8601 string (e.g. trip's started_at) — required for accurate crossing timestamps
// locTimes: array of Unix seconds per polyline point — enables per-plaza timestamp interpolation
export async function submitPolyline(encodedPolyline, vehicleType = '2AxlesAuto', departureTime = null, locTimes = null) {
  const body = {
    mapProvider: 'here',
    polyline: encodedPolyline,
    vehicle: { type: vehicleType },
  };

  if (departureTime) {
    body.departureTime = departureTime;
  }

  if (locTimes && locTimes.length > 0) {
    body.locTimes = locTimes;
  }

  const res = await fetch(`${BASE}/complete-polyline-from-mapping-service`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TollGuru polyline failed ${res.status}: ${err}`);
  }

  return res.json();
}

// Summarize toll cost from TollGuru response (uses licensePlateCost — no transponder)
// Captures crossing timestamps when departureTime was passed to submitPolyline
export function extractTollSummary(tollGuruResult) {
  const tolls = tollGuruResult.route?.tolls || tollGuruResult.routes?.[0]?.tolls || [];
  const total = tolls.reduce((sum, t) => sum + (t.licensePlateCost || t.tagCost || 0), 0);
  return {
    total_usd: parseFloat(total.toFixed(2)),
    count: tolls.length,
    tolls: tolls.map(t => ({
      name: t.name,
      road: t.road,
      state: t.state,
      cost: t.licensePlateCost || t.tagCost || 0,
      crossed_at: t.timestamp_formatted || t.arrival?.time || null,       // UTC ISO 8601
      crossed_at_local: t.timestamp_localized || null,                     // local timezone ISO 8601
    })),
  };
}
