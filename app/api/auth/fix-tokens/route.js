// One-time migration: consolidate multiple token rows into id=1
// GET /api/auth/fix-tokens
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const db = neon(process.env.DATABASE_URL);

  // Get the most recently updated token row
  const rows = await db`SELECT * FROM tokens ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`;
  if (!rows.length) {
    return Response.json({ error: 'No tokens found — visit /api/auth/login first' }, { status: 404 });
  }

  const best = rows[0];

  // Delete all rows and re-insert as id=1
  await db`DELETE FROM tokens`;
  await db`
    INSERT INTO tokens (id, access_token, refresh_token, expires_in, saved_at, updated_at)
    VALUES (1, ${best.access_token}, ${best.refresh_token}, ${best.expires_in}, ${best.saved_at}, NOW())
  `;

  return Response.json({
    success: true,
    message: 'Token rows consolidated to id=1',
    has_refresh_token: !!best.refresh_token,
    saved_at: new Date(Number(best.saved_at)).toISOString(),
  });
}
