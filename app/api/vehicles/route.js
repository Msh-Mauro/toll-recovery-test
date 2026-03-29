import { getValidAccessToken } from '../../../lib/tokens.js';

export async function GET() {
  const token = await getValidAccessToken();

  const res = await fetch('https://api.zubiecar.com/api/v2/zinc/vehicles', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return Response.json({ error: `Zubie error: ${res.status}` }, { status: 500 });
  }

  const data = await res.json();
  const vehicles = (data.vehicles || []).map(v => ({
    key: v.key,
    nickname: v.nickname,
    year: v.year,
    make: v.make,
    model: v.model,
    vin: v.vin,
  }));

  return Response.json({ vehicles });
}
