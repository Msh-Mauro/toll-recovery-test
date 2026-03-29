// Simple file-based store — production: swap for Vercel Postgres / Neon / Supabase

import fs from 'fs';
import path from 'path';

// Use /tmp on Vercel (serverless), local data/ otherwise
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data');
const TRIPS_FILE = path.join(DATA_DIR, 'trips.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readTrips() {
  try {
    return JSON.parse(fs.readFileSync(TRIPS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeTrips(trips) {
  ensureDir();
  fs.writeFileSync(TRIPS_FILE, JSON.stringify(trips, null, 2));
}

export function saveTrip(trip) {
  const trips = readTrips();
  const exists = trips.findIndex(t => t.trip_key === trip.trip_key);
  if (exists >= 0) {
    trips[exists] = { ...trips[exists], ...trip };
  } else {
    trips.push(trip);
  }
  writeTrips(trips);
}

export function getUnprocessedTrips() {
  return readTrips().filter(t => !t.processed && t.ended_at);
}

export function markTripProcessed(trip_key, tolls) {
  const trips = readTrips();
  const idx = trips.findIndex(t => t.trip_key === trip_key);
  if (idx >= 0) {
    trips[idx].processed = true;
    trips[idx].processed_at = new Date().toISOString();
    trips[idx].tolls = tolls;
  }
  writeTrips(trips);
}

export function getTripsByVehicleAndDateRange(vehicle_key, start, end) {
  return readTrips().filter(t =>
    t.vehicle_key === vehicle_key &&
    t.ended_at >= start &&
    t.ended_at <= end &&
    t.processed
  );
}

export function getAllTrips() {
  return readTrips();
}
