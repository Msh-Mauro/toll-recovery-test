// Receives trip_end webhooks from Zubie
// Fetches full trip data (including polyline) immediately after receiving webhook

import { saveTrip } from '../../../../lib/db.js';
import { getValidAccessToken } from '../../../../lib/tokens.js';

async function fetchFullTrip(tripKey) {
  try {
    const token = await getValidAccessToken();
    const res = await fetch(`https://api.zubiecar.com/api/v2/zinc/trips?size=1&trip_key=${tripKey}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.trips?.[0] || null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, trip, vehicle } = body;

  // Only care about trip_end
  if (event !== 'trip_end') {
    return Response.json({ received: true, skipped: true });
  }

  if (!trip?.key) {
    return Response.json({ error: 'Missing trip key' }, { status: 400 });
  }

  // Fetch full trip data from Zubie API to get encoded_polyline
  const fullTrip = await fetchFullTrip(trip.key);

  await saveTrip({
    trip_key: trip.key,
    vehicle_key: vehicle?.key || fullTrip?.vehicle?.key || null,
    vehicle_nickname: vehicle?.nickname || fullTrip?.vehicle?.nickname || null,
    started_at: fullTrip?.start_point?.timestamp || trip.started_at || null,
    ended_at: fullTrip?.end_point?.timestamp || trip.ended_at || new Date().toISOString(),
    gps_distance: fullTrip?.gps_distance || trip.gps_distance || null,
    encoded_polyline: fullTrip?.encoded_polyline || null,
  });

  console.log(`[webhook] trip_end: ${trip.key} | vehicle: ${vehicle?.nickname} | polyline: ${fullTrip?.encoded_polyline ? 'yes' : 'no'}`);

  return Response.json({ received: true, trip_key: trip.key, has_polyline: !!fullTrip?.encoded_polyline });
}
