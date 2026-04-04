// Batch process: enrich trips with pings → interpolate loc_times → call TollGuru
// GET /api/batch-toll-check?since=<ISO>&limit=20
// Only processes trips that have a polyline and haven't been toll-processed yet

import { neon } from '@neondatabase/serverless';
import { getPingsForTrip } from '../../../lib/db.js';
import { interpolateLocTimes } from '../../../lib/interpolate.js';
import { submitPolyline, extractTollSummary } from '../../../lib/tollguru.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since') || '2026-04-03T20:00:00Z';
  const limit = parseInt(searchParams.get('limit') || '20');

  const db = neon(process.env.DATABASE_URL);

  // Get unprocessed trips with polylines within the ping window
  const trips = await db`
    SELECT * FROM trips
    WHERE encoded_polyline IS NOT NULL
      AND started_at >= ${since}
      AND started_at IS NOT NULL
      AND ended_at IS NOT NULL
      AND (processed = FALSE OR tolls IS NULL)
    ORDER BY started_at ASC
    LIMIT ${limit}
  `;

  const results = [];

  for (const trip of trips) {
    try {
      // Fetch pings for this vehicle during the trip window
      const pings = await getPingsForTrip(trip.vehicle_key, trip.started_at, trip.ended_at);

      // Interpolate loc_times — real pings if available, falls back to uniform distribution
      const locTimes = interpolateLocTimes(
        trip.encoded_polyline,
        trip.started_at,
        trip.ended_at,
        pings
      );

      // Save loc_times regardless of TollGuru result
      await db`
        UPDATE trips SET loc_times = ${JSON.stringify(locTimes)}, loc_times_computed_at = NOW()
        WHERE trip_key = ${trip.trip_key}
      `;

      // Call TollGuru
      const departureTime = new Date(trip.started_at).toISOString();
      const tollResult = await submitPolyline(trip.encoded_polyline, '2AxlesAuto', departureTime, locTimes);
      const summary = extractTollSummary(tollResult, trip.started_at, trip.ended_at);

      // Save toll result
      await db`
        UPDATE trips SET processed = TRUE, processed_at = NOW(), tolls = ${JSON.stringify(summary)}
        WHERE trip_key = ${trip.trip_key}
      `;

      results.push({
        id: trip.id,
        vehicle: trip.vehicle_nickname,
        started_at: trip.started_at,
        ended_at: trip.ended_at,
        pings_used: pings.length,
        loc_times_points: locTimes.length,
        tolls: summary,
      });

    } catch (err) {
      results.push({
        id: trip.id,
        vehicle: trip.vehicle_nickname,
        started_at: trip.started_at,
        status: 'error',
        error: err.message,
      });
    }
  }

  const withTolls = results.filter(r => r.tolls?.count > 0);

  return Response.json({
    processed: results.length,
    with_tolls: withTolls.length,
    results,
  });
}
