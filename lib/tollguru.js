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
// Computes per-plaza crossing timestamps from arrival.distance + trip start/end.
// startedAt / endedAt: ISO 8601 strings from DB (optional — improves timestamp accuracy).
export function extractTollSummary(tollGuruResult, startedAt = null, endedAt = null) {
  const route = tollGuruResult.route || tollGuruResult.routes?.[0] || {};
  const tolls = route.tolls || [];
  const total = tolls.reduce((sum, t) => sum + (t.licensePlateCost || t.tagCost || 0), 0);

  // Total route distance from TollGuru (meters)
  const totalDistM = route.distance?.value || null;

  // Trip duration in ms — used to interpolate crossing time per plaza
  const startMs = startedAt ? new Date(startedAt).getTime() : null;
  const endMs = endedAt ? new Date(endedAt).getTime() : null;
  const durationMs = (startMs && endMs) ? endMs - startMs : null;

  return {
    total_usd: parseFloat(total.toFixed(2)),
    count: tolls.length,
    tolls: tolls.map(t => {
      const arrivalDistM = t.arrival?.distance ?? null;

      let crossed_at = null;
      let crossed_at_local = null;

      if (startMs && durationMs && totalDistM && arrivalDistM !== null) {
        // Interpolate: crossing_time = start + (plaza_dist / total_dist) * duration
        const crossingMs = startMs + (arrivalDistM / totalDistM) * durationMs;
        crossed_at = new Date(crossingMs).toISOString().replace('.000Z', 'Z');

        // Local time: derive offset from localized timestamp if available, else use UTC
        if (t.timestamp_localized) {
          const match = t.timestamp_localized.match(/([-+]\d{2}:\d{2})$/);
          if (match) {
            const offsetStr = match[1];
            const [h, m] = offsetStr.split(':').map(Number);
            const offsetMs = (h * 60 + (h < 0 ? -m : m)) * 60 * 1000;
            const localMs = crossingMs + offsetMs;
            const localISO = new Date(localMs).toISOString().replace('Z', offsetStr);
            crossed_at_local = localISO.replace('.000', '');
          }
        }
      }

      return {
        name: t.name,
        road: t.road,
        state: t.state,
        cost: t.licensePlateCost || t.tagCost || 0,
        crossed_at,
        crossed_at_local,
      };
    }),
  };
}
