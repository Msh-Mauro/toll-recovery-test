// Receives Zubie webhook events
// Handles: trip_end (save trip), vehicle_location_update (save ping for crossing interpolation)
// Logs all other event types for diagnostics

import { saveTrip, saveVehiclePing } from '../../../../lib/db.js';
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

  // ── vehicle_location_update ─────────────────────────────────────────────────
  // Real-time location ping during a trip — store for crossing time interpolation
  if (event === 'vehicle_location_update') {
    const loc = body.location || body.vehicle_location || body;
    const vehicle_key = vehicle?.key || body.vehicle_key || null;
    const timestamp = loc.timestamp || loc.time || body.timestamp || null;
    const lat = loc.lat ?? loc.latitude ?? null;
    const lng = loc.lng ?? loc.longitude ?? null;
    const speed_mph = loc.speed_mph ?? loc.speed ?? null;
    const heading = loc.heading ?? null;

    if (vehicle_key && timestamp && lat !== null && lng !== null) {
      try {
        await saveVehiclePing({ vehicle_key, timestamp, lat, lng, speed_mph, heading, raw: body });
        console.log(`[webhook] location_update: vehicle=${vehicle_key} lat=${lat} lng=${lng} speed=${speed_mph}mph`);
      } catch (err) {
        console.error('[webhook] Failed to save ping:', err.message);
      }
    } else {
      // Log the raw payload so we can learn the real field names
      console.log(`[webhook] location_update missing fields — raw:`, JSON.stringify(body).slice(0, 500));
    }

    return Response.json({ received: true, event });
  }

  // ── trip_end ────────────────────────────────────────────────────────────────
  if (event === 'trip_end') {
    if (!trip?.key) {
      return Response.json({ error: 'Missing trip key' }, { status: 400 });
    }

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

  // ── everything else ─────────────────────────────────────────────────────────
  // Log for diagnostics — helps us learn what fields Zubie sends per event type
  console.log(`[webhook] event=${event} raw:`, JSON.stringify(body).slice(0, 300));
  return Response.json({ received: true, event, skipped: true });
}
