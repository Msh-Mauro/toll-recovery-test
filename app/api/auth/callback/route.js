// Step 2 of OAuth — Zubie redirects here with ?code=...
// Exchanges code for access_token + refresh_token, saves to data/tokens.json

import { saveTokens } from '../../../../lib/tokens.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  if (!code) {
    return Response.json({ error: 'No code returned from Zubie' }, { status: 400 });
  }

  const res = await fetch('https://login.zubiecar.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.ZUBIE_REDIRECT_URI,
      client_id: process.env.ZUBIE_CLIENT_ID,
      client_secret: process.env.ZUBIE_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: `Token exchange failed: ${err}` }, { status: 500 });
  }

  const tokens = await res.json();
  saveTokens(tokens);

  return Response.json({
    success: true,
    message: 'Zubie authorized! Tokens saved. Webhook is ready to receive trips.',
    expires_in: tokens.expires_in,
  });
}
