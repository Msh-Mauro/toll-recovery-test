import { getValidAccessToken } from './tokens.js';

const BASE = 'https://api.zubiecar.com/api/v2/zinc';

async function zubieGet(path) {
  const token = await getValidAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Zubie API error ${res.status}: ${path}`);
  return res.json();
}

export async function getTripPoints(trip_key) {
  const points = [];
  let cursor = null;

  do {
    const url = `/trip/${trip_key}/points?size=200${cursor ? `&cursor=${cursor}` : ''}`;
    const data = await zubieGet(url);
    points.push(...(data.trip_points || []));
    cursor = data.next_cursor || null;
  } while (cursor);

  return points;
}

export async function getTrip(trip_key) {
  return zubieGet(`/trip/${trip_key}`);
}
