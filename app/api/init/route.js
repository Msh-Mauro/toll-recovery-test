// Run once to create DB tables
// GET /api/init

import { initDb } from '../../../lib/db.js';

export async function GET() {
  try {
    const result = await initDb();
    return Response.json({ success: true, message: 'Tables created (or already exist)', ...result });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
