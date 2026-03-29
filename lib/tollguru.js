const BASE = 'https://apis.tollguru.com/toll/v2';

const HEADERS = {
  'x-api-key': process.env.TOLLGURU_API_KEY,
  'Content-Type': 'application/json',
};

// Upload GPS points as CSV, get back a requestId (async)
export async function submitGpsTrace(points, vehicleType = '2AxlesAuto') {
  // Format: timestamp,lat,lng
  const csv = [
    'timestamp,lat,lng',
    ...points.map(p => `${p.timestamp},${p.point.lat},${p.point.lon}`),
  ].join('\n');

  const res = await fetch(`${BASE}/gps-tracks-csv-upload`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      source: 'csv',
      csv,
      vehicleType,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TollGuru upload failed ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.requestId;
}

// Poll for results — retries up to maxAttempts with 3s delay
export async function pollResults(requestId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));

    const res = await fetch(`${BASE}/gps-tracks-csv-upload/async-results`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ requestId }),
    });

    if (!res.ok) continue;
    const data = await res.json();

    if (data.status === 'done' || data.tolls) return data;
    if (data.status === 'error') throw new Error(`TollGuru processing error: ${JSON.stringify(data)}`);
  }

  throw new Error(`TollGuru timed out for requestId: ${requestId}`);
}

// Summarize toll cost from TollGuru response (uses licensePlateCost — no transponder)
export function extractTollSummary(tollGuruResult) {
  const tolls = tollGuruResult.route?.tolls || [];
  const total = tolls.reduce((sum, t) => sum + (t.licensePlateCost || t.tagCost || 0), 0);
  return {
    total_usd: parseFloat(total.toFixed(2)),
    count: tolls.length,
    tolls: tolls.map(t => ({
      name: t.name,
      road: t.road,
      state: t.state,
      cost: t.licensePlateCost || t.tagCost || 0,
    })),
  };
}
