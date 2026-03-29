'use client';

import { useState, useEffect, useCallback } from 'react';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
};

const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
};

const usd = (n) => `$${(n || 0).toFixed(2)}`;

export default function Dashboard() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [trips, setTrips] = useState([]);
  const [totalTolls, setTotalTolls] = useState(0);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(false);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // Load vehicles on mount
  useEffect(() => {
    fetch('/api/vehicles')
      .then(r => r.json())
      .then(d => setVehicles(d.vehicles || []));
  }, []);

  const loadTrips = useCallback(async () => {
    if (!selectedVehicle) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ vehicle_key: selectedVehicle });
      if (dateStart) params.set('start', new Date(dateStart).toISOString());
      if (dateEnd) {
        const end = new Date(dateEnd);
        end.setHours(23, 59, 59, 999);
        params.set('end', end.toISOString());
      }
      const res = await fetch(`/api/trips?${params}`);
      const data = await res.json();
      const all = data.trips || [];
      const withTolls = all.filter(t => t.processed);
      setTrips(withTolls);
      setTotalTolls(data.total_tolls_usd ?? withTolls.reduce((s, t) => s + (t.tolls?.total_usd || 0), 0));
    } finally {
      setLoading(false);
    }
  }, [selectedVehicle, dateStart, dateEnd]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const tripsWithTolls = trips.filter(t => (t.tolls?.total_usd || 0) > 0);
  const grandTotal = trips.reduce((s, t) => s + (t.tolls?.total_usd || 0), 0);
  const vehicleName = vehicles.find(v => v.key === selectedVehicle)?.nickname || '';

  const styles = {
    page: { fontFamily: "'Inter', system-ui, sans-serif", background: '#0f0f11', minHeight: '100vh', color: '#e2e2e2', padding: '32px 24px' },
    header: { maxWidth: 1100, margin: '0 auto 32px' },
    title: { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 },
    sub: { fontSize: 13, color: '#666', marginTop: 4 },
    controls: { maxWidth: 1100, margin: '0 auto 24px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },
    label: { fontSize: 11, color: '#666', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' },
    select: { background: '#1a1a1f', border: '1px solid #2e2e36', borderRadius: 8, color: '#e2e2e2', padding: '8px 12px', fontSize: 14, minWidth: 200 },
    input: { background: '#1a1a1f', border: '1px solid #2e2e36', borderRadius: 8, color: '#e2e2e2', padding: '8px 12px', fontSize: 14 },
    btn: { background: '#5865f2', border: 'none', borderRadius: 8, color: '#fff', padding: '9px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 600 },
    stats: { maxWidth: 1100, margin: '0 auto 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
    card: { background: '#1a1a1f', borderRadius: 12, padding: '18px 20px', border: '1px solid #2e2e36' },
    cardLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
    cardValue: { fontSize: 26, fontWeight: 700, color: '#fff' },
    cardSub: { fontSize: 12, color: '#555', marginTop: 2 },
    table: { maxWidth: 1100, margin: '0 auto' },
    tableWrap: { background: '#1a1a1f', borderRadius: 12, border: '1px solid #2e2e36', overflow: 'hidden' },
    thead: { background: '#141418' },
    th: { padding: '11px 16px', fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', fontWeight: 600 },
    tr: (hasTolls) => ({ borderTop: '1px solid #23232a', cursor: hasTolls ? 'pointer' : 'default', transition: 'background 0.1s' }),
    td: { padding: '13px 16px', fontSize: 14, verticalAlign: 'middle' },
    badge: (has) => ({
      display: 'inline-block', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600,
      background: has ? '#1a2e1a' : '#1a1a1f', color: has ? '#4caf50' : '#444', border: `1px solid ${has ? '#2e5a2e' : '#2e2e36'}`
    }),
    expand: { background: '#0f0f14', borderTop: '1px solid #1e1e26', padding: '0 0 0 0' },
    tollRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px 10px 48px', borderBottom: '1px solid #1e1e26' },
    tollName: { fontSize: 13, color: '#c0c0c0' },
    tollRoad: { fontSize: 11, color: '#555', marginTop: 2 },
    tollCost: { fontSize: 14, fontWeight: 600, color: '#4caf50' },
    tollTime: { fontSize: 11, color: '#555', marginTop: 2, textAlign: 'right' },
    empty: { textAlign: 'center', padding: '60px 20px', color: '#444', fontSize: 14 },
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={styles.title}>🚗 MSH Rentals — Toll Dashboard</p>
          <a href='/report' style={{ background: '#2e7d32', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>📄 Generate Report</a>
        </div>
        <p style={styles.sub}>GPS-inferred toll tracking via TollGuru · Last processed: {trips.length > 0 ? fmt(trips[0]?.processed_at) : '—'}</p>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div>
          <span style={styles.label}>Vehicle</span>
          <select style={styles.select} value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}>
            <option value=''>Select a vehicle...</option>
            {vehicles.map(v => <option key={v.key} value={v.key}>{v.nickname}</option>)}
          </select>
        </div>
        <div>
          <span style={styles.label}>From</span>
          <input type='date' style={styles.input} value={dateStart} onChange={e => setDateStart(e.target.value)} />
        </div>
        <div>
          <span style={styles.label}>To</span>
          <input type='date' style={styles.input} value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
        </div>
      </div>

      {/* Stats */}
      {selectedVehicle && (
        <div style={styles.stats}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Total Tolls</div>
            <div style={{ ...styles.cardValue, color: grandTotal > 0 ? '#4caf50' : '#fff' }}>{usd(grandTotal)}</div>
            <div style={styles.cardSub}>{vehicleName}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Trips with Tolls</div>
            <div style={styles.cardValue}>{tripsWithTolls.length}</div>
            <div style={styles.cardSub}>of {trips.length} total trips</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Total Plazas</div>
            <div style={styles.cardValue}>{trips.reduce((s, t) => s + (t.tolls?.count || 0), 0)}</div>
            <div style={styles.cardSub}>toll crossings detected</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Avg Per Trip</div>
            <div style={styles.cardValue}>{usd(tripsWithTolls.length ? grandTotal / tripsWithTolls.length : 0)}</div>
            <div style={styles.cardSub}>on tolled trips</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={styles.table}>
        {!selectedVehicle ? (
          <div style={{ ...styles.tableWrap, ...styles.empty }}>Select a vehicle to view trips</div>
        ) : loading ? (
          <div style={{ ...styles.tableWrap, ...styles.empty }}>Loading...</div>
        ) : trips.length === 0 ? (
          <div style={{ ...styles.tableWrap, ...styles.empty }}>No processed trips found</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={styles.thead}>
                <tr>
                  <th style={styles.th}>Started</th>
                  <th style={styles.th}>Ended</th>
                  <th style={styles.th}>Distance</th>
                  <th style={styles.th}>Plazas</th>
                  <th style={styles.th}>Toll Cost</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {trips.map(trip => {
                  const hasTolls = (trip.tolls?.total_usd || 0) > 0;
                  const isOpen = expanded[trip.id];
                  return (
                    <>
                      <tr
                        key={trip.id}
                        style={styles.tr(hasTolls)}
                        onClick={() => hasTolls && toggle(trip.id)}
                      >
                        <td style={styles.td}>{fmt(trip.started_at)}</td>
                        <td style={styles.td}>{fmt(trip.ended_at)}</td>
                        <td style={styles.td}>{trip.gps_distance ? `${parseFloat(trip.gps_distance).toFixed(1)} mi` : '—'}</td>
                        <td style={styles.td}>{trip.tolls?.count ?? 0}</td>
                        <td style={styles.td}>
                          <span style={styles.badge(hasTolls)}>
                            {hasTolls ? usd(trip.tolls.total_usd) : 'No tolls'}
                          </span>
                        </td>
                        <td style={{ ...styles.td, color: '#444', fontSize: 12 }}>
                          {hasTolls ? (isOpen ? '▲' : '▼') : ''}
                        </td>
                      </tr>
                      {isOpen && hasTolls && (
                        <tr key={`${trip.id}-expand`}>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div style={styles.expand}>
                              {trip.tolls.tolls.map((t, i) => (
                                <div key={i} style={{ ...styles.tollRow, borderBottom: i < trip.tolls.tolls.length - 1 ? '1px solid #1e1e26' : 'none' }}>
                                  <div>
                                    <div style={styles.tollName}>{t.name || 'Toll Plaza'}</div>
                                    <div style={styles.tollRoad}>{[t.road, t.state].filter(Boolean).join(' · ')}</div>
                                    <div style={styles.tollTime}>
                                      Trip: {fmt(trip.started_at)} → {fmt(trip.ended_at)}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={styles.tollCost}>{usd(t.cost)}</div>
                                    <div style={styles.tollTime}>license plate rate</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
