// Daily batch processor — runs at 11:30 PM via Vercel Cron or manual call
// Fetches GPS points for all unprocessed trips → sends to TollGuru → stores results
//
// Protect with: Authorization: Bearer <CRON_SECRET>

import { getUnprocessedTrips, markTripProcessed } from '../../../../lib/db.js';
import { getTripPoints } from '../../../../lib/zubie.js';
import { submitGpsTrace, pollResults, extractTollSummary } from '../../../../lib/tollguru.js';

export async function POST(request) {
  // Auth check
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '0');

  let trips = await getUnprocessedTrips();
  if (limit > 0) trips = trips.slice(0, limit);
  console.log(`[cron] Processing ${trips.length} unprocessed trips`);

  const results = [];

  for (const trip of trips) {
    try {
      // Fetch GPS points from Zubie
      const points = await getTripPoints(trip.trip_key);

      if (points.length < 2) {
        console.log(`[cron] Skipping ${trip.trip_key} — not enough GPS points (${points.length})`);
        markTripProcessed(trip.trip_key, { skipped: true, reason: 'insufficient_points', count: points.length });
        results.push({ trip_key: trip.trip_key, status: 'skipped', reason: 'insufficient_points' });
        continue;
      }

      // Submit to TollGuru
      const requestId = await submitGpsTrace(points);
      console.log(`[cron] TollGuru requestId: ${requestId} for trip ${trip.trip_key}`);

      // Poll for result
      const tollResult = await pollResults(requestId);
      const summary = extractTollSummary(tollResult);

      // Save
      markTripProcessed(trip.trip_key, summary);
      results.push({ trip_key: trip.trip_key, status: 'done', ...summary });

      console.log(`[cron] Trip ${trip.trip_key}: $${summary.total_usd} in tolls (${summary.count} plazas)`);

    } catch (err) {
      console.error(`[cron] Failed trip ${trip.trip_key}:`, err.message);
      results.push({ trip_key: trip.trip_key, status: 'error', error: err.message });
    }
  }

  return Response.json({
    processed: results.filter(r => r.status === 'done').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  });
}
