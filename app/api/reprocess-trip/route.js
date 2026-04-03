// Reprocess toll data for a specific trip using locTimes for accurate per-plaza crossing timestamps
// Decodes the stored polyline, interpolates timestamps by distance, passes to TollGuru
// GET /api/reprocess-trip?trip_key=<key>

import { neon } from '@neondatabase/serverless';
import { submitPolyline, extractTollSummary } from '../../../lib/tollguru.js';
import { decodePolyline, buildLocTimes } from '../../../lib/polyline.js';

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

  if (!trip.started_at || !trip.ended_at) {
    return Response.json({ error: 'Trip missing started_at or ended_at for locTimes' }, { status: 422 });
  }

  // Decode polyline and build per-point timestamps
  const points = decodePolyline(trip.encoded_polyline);
  const locTimes = buildLocTimes(points, trip.started_at, trip.ended_at);

  const departureTime = new Date(trip.started_at).toISOString();

  // Call TollGuru with locTimes for per-plaza timestamp interpolation
  const result = await submitPolyline(trip.encoded_polyline, '2AxlesAuto', departureTime, locTimes);
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
    vehicle: trip.vehicle_nickname,
    started_at: trip.started_at,
    ended_at: trip.ended_at,
    polyline_points: points.length,
    loc_times_count: locTimes.length,
    tolls: summary,
  });
}
