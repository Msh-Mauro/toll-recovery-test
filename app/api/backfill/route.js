// Fetch historical trips from Zubie and load into DB
// GET /api/backfill?days=7  (default: last 7 days)
// GET /api/backfill?started_after=2025-01-01T00:00:00Z&started_before=2025-01-31T23:59:59Z

import { getValidAccessToken } from '../../../lib/tokens.js';
import { saveTrip } from '../../../lib/db.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  let started_after = searchParams.get('started_after');
  let started_before = searchParams.get('started_before');

  // Default: last N days
  if (!started_after) {
    const days = parseInt(searchParams.get('days') || '7');
    const from = new Date();
    from.setDate(from.getDate() - days);
    started_after = from.toISOString();
  }

  const token = await getValidAccessToken();
  let imported = 0;
  let cursor = null;

  do {
    const params = new URLSearchParams({ size: '50', started_after });
    if (started_before) params.set('started_before', started_before);
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`https://api.zubiecar.com/api/v2/zinc/trips?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Zubie API error: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const trips = data.trips || [];

    for (const trip of trips) {
      await saveTrip({
        trip_key: trip.key,
        vehicle_key: trip.vehicle?.key || trip.vehicle_key || null,
        vehicle_nickname: trip.vehicle?.nickname || null,
        started_at: trip.start_point?.timestamp || null,
        ended_at: trip.end_point?.timestamp || null,
        gps_distance: trip.gps_distance || null,
      });
      imported++;
    }

    cursor = data.next_cursor || null;
  } while (cursor);

  return Response.json({
    success: true,
    imported,
    since: started_after,
    message: `${imported} trips loaded. Now run POST /api/cron/process-tolls to calculate tolls.`,
  });
}
