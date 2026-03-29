// Query stored trips + toll results
// GET /api/trips — all trips
// GET /api/trips?vehicle_key=X&start=ISO&end=ISO — filter by vehicle + date range

import { getAllTrips, getTripsByVehicleAndDateRange } from '../../../lib/db.js';

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const vehicle_key = searchParams.get('vehicle_key');
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (vehicle_key && start && end) {
    const trips = getTripsByVehicleAndDateRange(vehicle_key, start, end);
    const total = trips.reduce((sum, t) => sum + (t.tolls?.total_usd || 0), 0);
    return Response.json({ trips, total_tolls_usd: parseFloat(total.toFixed(2)) });
  }

  return Response.json({ trips: getAllTrips() });
}
