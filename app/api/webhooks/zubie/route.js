// Receives trip_end webhooks from Zubie
// Stores trip metadata — GPS trace is fetched later during batch processing

import { saveTrip } from '../../../../lib/db.js';

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

  // Store trip for batch processing tonight
  saveTrip({
    trip_key: trip.key,
    vehicle_key: vehicle?.key || null,
    vehicle_nickname: vehicle?.nickname || null,
    started_at: trip.started_at || null,
    ended_at: trip.ended_at || new Date().toISOString(),
    gps_distance: trip.gps_distance || null,
    processed: false,
    received_at: new Date().toISOString(),
  });

  console.log(`[webhook] trip_end received: ${trip.key} | vehicle: ${vehicle?.nickname}`);

  return Response.json({ received: true, trip_key: trip.key });
}
