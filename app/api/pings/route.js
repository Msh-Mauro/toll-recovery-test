// Check vehicle_pings table — GET /api/pings?limit=20
import { neon } from '@neondatabase/serverless';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const vehicle_key = searchParams.get('vehicle_key') || null;

  const db = neon(process.env.DATABASE_URL);

  const count = await db`SELECT COUNT(*) as total FROM vehicle_pings`;

  const rows = vehicle_key
    ? await db`SELECT * FROM vehicle_pings WHERE vehicle_key = ${vehicle_key} ORDER BY timestamp DESC LIMIT ${limit}`
    : await db`SELECT * FROM vehicle_pings ORDER BY timestamp DESC LIMIT ${limit}`;

  return Response.json({
    total: parseInt(count[0].total),
    pings: rows,
  });
}
