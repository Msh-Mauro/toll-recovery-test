import { getValidAccessToken } from '../../../lib/tokens.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vehicle_key = searchParams.get('vehicle_key');

  const token = await getValidAccessToken();
  const params = new URLSearchParams({ size: '1' });
  if (vehicle_key) params.set('vehicle_key', vehicle_key);

  const res = await fetch(`https://api.zubiecar.com/api/v2/zinc/trips?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  return Response.json(data);
}
