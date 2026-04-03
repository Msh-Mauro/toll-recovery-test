// Reprocess toll data for a specific trip using the correct departure_time
// This gives TollGuru accurate context to compute real crossing timestamps
// GET /api/reprocess-trip?trip_key=<key>

import { neon } from '@neondatabase/serverless';
import { submitPolyline, extractTollSummary } from '../../../lib/tollguru.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trip_key = searchParams.get('trip_key');

  if (!trip_key) {
    return Response.json({ error: 'Missing trip_key param' }, { status: 400 });
  }

  const db = neon(process.env.DATABASE_URL);

  // Fetch trip from DB
  const rows = await db`SELECT * FROM trips WHERE trip_key = ${trip_key} LIMIT 1`;
  if (!rows.length) {
    return Response.json({ error: 'Trip not found' }, { status: 404 });
  }

  const trip = rows[0];

  if (!trip.encoded_polyline) {
    return Response.json({ error: 'Trip has no encoded_polyline' }, { status: 422 });
  }

  // Use started_at as departure_time for accurate toll crossing timestamps
  const departureTime = trip.started_at ? new Date(trip.started_at).toISOString() : null;

  // Call TollGuru with departure_time
  const result = await submitPolyline(trip.encoded_polyline, '2AxlesAuto', departureTime);
  const summary = extractTollSummary(result);

  // Update DB
  await db`
    UPDATE trips
    SET processed = TRUE,
        processed_at = NOW(),
        tolls = ${JSON.stringify(summary)}
    WHERE trip_key = ${trip_key}
  `;

  return Response.json({
    success: true,
    trip_key,
    started_at: trip.started_at,
    departure_time_sent: departureTime,
    vehicle: trip.vehicle_nickname,
    tolls: summary,
  });
}
