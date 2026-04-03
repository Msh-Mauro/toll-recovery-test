// Interpolate per-polyline-point timestamps using real vehicle_location_update pings
// Much more accurate than uniform distance interpolation because it uses actual observed positions + times

import { decodePolyline } from './polyline.js';

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

// Build cumulative distances array for a decoded polyline
function buildCumDists(points) {
  const cumDist = [0];
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + haversine(points[i - 1], points[i]));
  }
  return cumDist;
}

// Find the index of the polyline point closest to a given [lat, lng]
function closestPointIndex(points, lat, lng) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversine(points[i], [lat, lng]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// Main function: given a trip's encoded polyline, its start/end times,
// and an array of vehicle_pings rows from the DB, produce a locTimes array
// (Unix seconds per polyline point) using real ping timestamps.
//
// Falls back to uniform interpolation for segments with no ping coverage.
export function interpolateLocTimes(encodedPolyline, startedAt, endedAt, pings) {
  const points = decodePolyline(encodedPolyline);
  if (points.length === 0) return [];

  const cumDist = buildCumDists(points);
  const totalDist = cumDist[cumDist.length - 1];

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();

  // Build anchor list: trip start + real pings + trip end
  // Each anchor: { distM: meters from trip start, timeMs: Unix ms }
  const anchors = [{ distM: 0, timeMs: startMs }];

  for (const ping of pings) {
    const pingLat = parseFloat(ping.lat);
    const pingLng = parseFloat(ping.lng);
    const pingMs = new Date(ping.timestamp).getTime();

    // Skip pings outside the trip window (shouldn't happen but be safe)
    if (pingMs < startMs || pingMs > endMs) continue;

    const idx = closestPointIndex(points, pingLat, pingLng);
    anchors.push({ distM: cumDist[idx], timeMs: pingMs });
  }

  anchors.push({ distM: totalDist, timeMs: endMs });

  // Sort anchors by distance (they should be roughly ordered but pings can snap to same point)
  anchors.sort((a, b) => a.distM - b.distM);

  // Remove duplicate distances (keep later timestamp — more conservative)
  const dedupedAnchors = [anchors[0]];
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].distM > dedupedAnchors[dedupedAnchors.length - 1].distM) {
      dedupedAnchors.push(anchors[i]);
    }
  }

  // For each polyline point, interpolate timestamp between surrounding anchors
  const locTimes = [];
  let anchorIdx = 0;

  for (let i = 0; i < points.length; i++) {
    const d = cumDist[i];

    // Advance anchor window
    while (
      anchorIdx < dedupedAnchors.length - 2 &&
      d > dedupedAnchors[anchorIdx + 1].distM
    ) {
      anchorIdx++;
    }

    const a0 = dedupedAnchors[anchorIdx];
    const a1 = dedupedAnchors[anchorIdx + 1] || a0;

    let t;
    if (a1.distM === a0.distM) {
      t = a0.timeMs;
    } else {
      const ratio = (d - a0.distM) / (a1.distM - a0.distM);
      t = a0.timeMs + ratio * (a1.timeMs - a0.timeMs);
    }

    locTimes.push(Math.round(t / 1000));
  }

  return locTimes;
}
