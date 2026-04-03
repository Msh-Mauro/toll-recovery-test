// Google encoded polyline decoder + locTimes generator
// No external dependencies — pure JS

// Decode Google encoded polyline to array of [lat, lng] pairs
export function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

// Haversine distance in meters between two [lat, lng] points
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Build locTimes array (Unix seconds per point) by interpolating
// timestamps linearly based on cumulative route distance.
// startedAt / endedAt: ISO 8601 strings from the DB.
export function buildLocTimes(points, startedAt, endedAt) {
  if (points.length === 0) return [];

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  const durationMs = endMs - startMs;

  if (points.length === 1) return [Math.round(startMs / 1000)];

  // Cumulative distances along the route
  const cumDist = [0];
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + haversine(points[i - 1], points[i]));
  }
  const totalDist = cumDist[cumDist.length - 1];

  // Interpolate: t_i = start + (cumDist_i / totalDist) * duration
  return cumDist.map(d =>
    Math.round((startMs + (totalDist > 0 ? (d / totalDist) : 0) * durationMs) / 1000)
  );
}
