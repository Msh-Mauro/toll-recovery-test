import { neon } from '@neondatabase/serverless';

function sql() {
  return neon(process.env.DATABASE_URL);
}

// Run once to create tables — call GET /api/init
export async function initDb() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS tokens (
      id SERIAL PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_in INTEGER,
      saved_at BIGINT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      trip_key TEXT UNIQUE NOT NULL,
      vehicle_key TEXT,
      vehicle_nickname TEXT,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      gps_distance NUMERIC,
      encoded_polyline TEXT,
      processed BOOLEAN DEFAULT FALSE,
      processed_at TIMESTAMPTZ,
      tolls JSONB,
      received_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  return { ok: true };
}

export async function saveTrip(trip) {
  const db = sql();
  await db`
    INSERT INTO trips (trip_key, vehicle_key, vehicle_nickname, started_at, ended_at, gps_distance, encoded_polyline, received_at)
    VALUES (${trip.trip_key}, ${trip.vehicle_key}, ${trip.vehicle_nickname}, ${trip.started_at}, ${trip.ended_at}, ${trip.gps_distance}, ${trip.encoded_polyline || null}, NOW())
    ON CONFLICT (trip_key) DO UPDATE SET
      vehicle_key = EXCLUDED.vehicle_key,
      ended_at = EXCLUDED.ended_at,
      gps_distance = EXCLUDED.gps_distance,
      encoded_polyline = EXCLUDED.encoded_polyline
  `;
}

export async function getUnprocessedTrips() {
  const db = sql();
  return db`SELECT * FROM trips WHERE processed = FALSE AND ended_at IS NOT NULL`;
}

export async function markTripProcessed(trip_key, tolls) {
  const db = sql();
  await db`
    UPDATE trips SET processed = TRUE, processed_at = NOW(), tolls = ${JSON.stringify(tolls)}
    WHERE trip_key = ${trip_key}
  `;
}

export async function getTripsByVehicleAndDateRange(vehicle_key, start, end) {
  const db = sql();
  return db`
    SELECT * FROM trips
    WHERE vehicle_key = ${vehicle_key}
      AND ended_at >= ${start}
      AND ended_at <= ${end}
      AND processed = TRUE
  `;
}

export async function getAllTrips() {
  const db = sql();
  return db`SELECT * FROM trips ORDER BY received_at DESC`;
}
