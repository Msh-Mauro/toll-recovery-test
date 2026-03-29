import { getAllTrips, getTripsByVehicleAndDateRange } from '../../../lib/db.js';
import { neon } from '@neondatabase/serverless';

async function getTripsByVehicle(vehicle_key) {
  const db = neon(process.env.DATABASE_URL);
  return db`
    SELECT * FROM trips
    WHERE vehicle_key = ${vehicle_key}
      AND processed = TRUE
    ORDER BY started_at DESC
  `;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vehicle_key = searchParams.get('vehicle_key');
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (vehicle_key && start && end) {
    const trips = await getTripsByVehicleAndDateRange(vehicle_key, start, end);
    const total = trips.reduce((sum, t) => sum + (t.tolls?.total_usd || 0), 0);
    return Response.json({ trips, total_tolls_usd: parseFloat(total.toFixed(2)) });
  }

  if (vehicle_key) {
    const trips = await getTripsByVehicle(vehicle_key);
    const total = trips.reduce((sum, t) => sum + (t.tolls?.total_usd || 0), 0);
    return Response.json({ trips, total_tolls_usd: parseFloat(total.toFixed(2)) });
  }

  const trips = await getAllTrips();
  return Response.json({ trips });
}
