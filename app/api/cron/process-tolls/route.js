// Daily batch processor — runs at 11:30 PM via Vercel Cron or manual call
// Uses encoded_polyline from Zubie trip → synchronous TollGuru call → stores results
//
// Protect with: Authorization: Bearer <CRON_SECRET>

import { getUnprocessedTrips, markTripProcessed } from '../../../../lib/db.js';
import { submitPolyline, extractTollSummary } from '../../../../lib/tollguru.js';

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
      if (!trip.encoded_polyline) {
        console.log(`[cron] Skipping ${trip.trip_key} — no polyline`);
        await markTripProcessed(trip.trip_key, { skipped: true, reason: 'no_polyline' });
        results.push({ trip_key: trip.trip_key, status: 'skipped', reason: 'no_polyline' });
        continue;
      }

      // Send polyline to TollGuru — synchronous, no polling needed
      const tollResult = await submitPolyline(trip.encoded_polyline);
      const summary = extractTollSummary(tollResult);

      await markTripProcessed(trip.trip_key, summary);
      results.push({ trip_key: trip.trip_key, status: 'done', ...summary });

      console.log(`[cron] Trip ${trip.trip_key}: $${summary.total_usd} (${summary.count} tolls)`);

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
