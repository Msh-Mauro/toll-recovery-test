import { getAllTrips, getTripsByVehicleAndDateRange } from '../../../lib/db.js';

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

  const trips = await getAllTrips();
  return Response.json({ trips });
}
