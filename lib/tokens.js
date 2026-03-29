// Token storage — reads/writes to data/tokens.json
// In production, swap this for a DB or Vercel KV

import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), 'data', 'tokens.json');

export function getTokens() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveTokens(tokens) {
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...tokens, saved_at: Date.now() }, null, 2));
}

export async function getValidAccessToken() {
  const tokens = getTokens();
  if (!tokens) throw new Error('No tokens found. Visit /api/auth/login to authorize.');

  // Refresh if expiring within 5 minutes
  const expiresAt = tokens.saved_at + (tokens.expires_in * 1000);
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
  saveTokens(fresh);
  return fresh.access_token;
}
