import { neon } from '@neondatabase/serverless';

function sql() {
  return neon(process.env.DATABASE_URL);
}

export async function saveTokens(tokens) {
  const db = sql();
  // Force id=1 so ON CONFLICT always hits — only ever one row in this table
  await db`
    INSERT INTO tokens (id, access_token, refresh_token, expires_in, saved_at)
    VALUES (1, ${tokens.access_token}, ${tokens.refresh_token || null}, ${tokens.expires_in}, ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, tokens.refresh_token),
      expires_in = EXCLUDED.expires_in,
      saved_at = EXCLUDED.saved_at,
      updated_at = NOW()
  `;
}

export async function getTokens() {
  const db = sql();
  const rows = await db`SELECT * FROM tokens WHERE id = 1`;
  return rows[0] || null;
}

export async function getValidAccessToken() {
  const tokens = await getTokens();
  if (!tokens) throw new Error('No tokens found. Visit /api/auth/login to authorize.');

  const expiresAt = Number(tokens.saved_at) + (tokens.expires_in * 1000);
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000;

  if (!needsRefresh) return tokens.access_token;

  // Refresh
  const res = await fetch('https://login.zubiecar.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: process.env.ZUBIE_CLIENT_ID,
      client_secret: process.env.ZUBIE_CLIENT_SECRET,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const fresh = await res.json();
  await saveTokens(fresh);
  return fresh.access_token;
}
