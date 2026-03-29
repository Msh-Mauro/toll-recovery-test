'use client';

import { useState, useRef } from 'react';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
};

const usd = (n) => `$${(n || 0).toFixed(2)}`;

export default function ReportPage() {
  const [vehicles, setVehicles] = useState(null);
  const [vehicleKey, setVehicleKey] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('23:59');
  const [trips, setTrips] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef(null);

  const loadVehicles = async () => {
    const res = await fetch('/api/vehicles');
    const d = await res.json();
    setVehicles(d.vehicles || []);
  };

  if (!vehicles) {
    loadVehicles();
    return null;
  }

  const vehicleName = vehicles.find(v => v.key === vehicleKey)?.nickname || '';

  const generate = async () => {
    if (!vehicleKey || !startDate || !endDate) return;
    setLoading(true);
    try {
      const start = new Date(`${startDate}T${startTime}:00`).toISOString();
      const end = new Date(`${endDate}T${endTime}:59`).toISOString();
      const params = new URLSearchParams({ vehicle_key: vehicleKey, start, end });
      const res = await fetch(`/api/trips?${params}`);
      const data = await res.json();
      setTrips({ list: data.trips || [], total: data.total_tolls_usd || 0, start, end });
    } finally {
      setLoading(false);
    }
  };

  const downloadJpeg = async () => {
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `toll-report-${startDate}-to-${endDate}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  const allTolls = trips?.list.flatMap(trip =>
    (trip.tolls?.tolls || []).map(t => ({
      ...t,
      trip_started: trip.started_at,
      trip_ended: trip.ended_at,
      trip_distance: trip.gps_distance,
    }))
  ) || [];

  const s = {
    page: { fontFamily: 'system-ui, sans-serif', background: '#111', minHeight: '100vh', padding: '32px 24px', color: '#eee' },
    controls: { maxWidth: 760, margin: '0 auto 28px', background: '#1a1a1f', borderRadius: 12, padding: 24, border: '1px solid #2e2e36' },
    heading: { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 20 },
    row: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' },
    field: { display: 'flex', flexDirection: 'column', gap: 4 },
    label: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' },
    input: { background: '#0f0f14', border: '1px solid #2e2e36', borderRadius: 8, color: '#eee', padding: '8px 12px', fontSize: 14 },
    select: { background: '#0f0f14', border: '1px solid #2e2e36', borderRadius: 8, color: '#eee', padding: '8px 12px', fontSize: 14, minWidth: 200 },
    btn: (disabled) => ({ background: disabled ? '#333' : '#5865f2', border: 'none', borderRadius: 8, color: '#fff', padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }),
    btnGreen: (disabled) => ({ background: disabled ? '#333' : '#2e7d32', border: 'none', borderRadius: 8, color: '#fff', padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }),
    // Report styles (white for export)
    report: { maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 12, padding: '48px 52px', color: '#111' },
    rHeader: { borderBottom: '2px solid #111', paddingBottom: 20, marginBottom: 28 },
    rTitle: { fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#111' },
    rSub: { fontSize: 13, color: '#555', margin: 0 },
    rMeta: { display: 'flex', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 8 },
    rMetaItem: { fontSize: 12, color: '#444' },
    rMetaVal: { fontWeight: 600, color: '#111' },
    table: { width: '100%', borderCollapse: 'collapse', marginBottom: 28 },
    tHead: { background: '#f5f5f5' },
    th: { padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', textAlign: 'left', borderBottom: '1px solid #ddd', fontWeight: 600 },
    td: { padding: '12px 12px', fontSize: 13, borderBottom: '1px solid #eee', color: '#333', verticalAlign: 'top' },
    tdBold: { padding: '12px 12px', fontSize: 13, borderBottom: '1px solid #eee', color: '#111', fontWeight: 600, verticalAlign: 'top' },
    tdGreen: { padding: '12px 12px', fontSize: 13, borderBottom: '1px solid #eee', color: '#1b5e20', fontWeight: 700, verticalAlign: 'top' },
    totalRow: { background: '#f9f9f9' },
    totalLabel: { padding: '14px 12px', fontSize: 14, fontWeight: 700, color: '#111', borderTop: '2px solid #111' },
    totalVal: { padding: '14px 12px', fontSize: 16, fontWeight: 700, color: '#1b5e20', borderTop: '2px solid #111' },
    footer: { borderTop: '1px solid #ddd', paddingTop: 16, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    footerText: { fontSize: 11, color: '#aaa' },
  };

  return (
    <div style={s.page}>
      {/* Controls */}
      <div style={s.controls}>
        <div style={s.heading}>📄 Generate Toll Report</div>
        <div style={s.row}>
          <div style={s.field}>
            <span style={s.label}>Vehicle</span>
            <select style={s.select} value={vehicleKey} onChange={e => setVehicleKey(e.target.value)}>
              <option value=''>Select vehicle...</option>
              {vehicles.map(v => <option key={v.key} value={v.key}>{v.nickname}</option>)}
            </select>
          </div>
        </div>
        <div style={s.row}>
          <div style={s.field}>
            <span style={s.label}>Start Date</span>
            <input type='date' style={s.input} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div style={s.field}>
            <span style={s.label}>Start Time</span>
            <input type='time' style={s.input} value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div style={s.field}>
            <span style={s.label}>End Date</span>
            <input type='date' style={s.input} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div style={s.field}>
            <span style={s.label}>End Time</span>
            <input type='time' style={s.input} value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <button style={s.btn(!vehicleKey || !startDate || !endDate || loading)} onClick={generate} disabled={!vehicleKey || !startDate || !endDate || loading}>
            {loading ? 'Loading...' : 'Generate'}
          </button>
          {trips && (
            <button style={s.btnGreen(downloading)} onClick={downloadJpeg} disabled={downloading}>
              {downloading ? 'Exporting...' : '⬇ Download JPEG'}
            </button>
          )}
        </div>
      </div>

      {/* Report Preview */}
      {trips && (
        <div ref={reportRef} style={s.report}>
          {/* Header */}
          <div style={s.rHeader}>
            <p style={s.rTitle}>MSH Rentals — Toll Report</p>
            <p style={s.rSub}>GPS-inferred toll tracking · License plate rate</p>
            <div style={s.rMeta}>
              <div style={s.rMetaItem}>Vehicle: <span style={s.rMetaVal}>{vehicleName}</span></div>
              <div style={s.rMetaItem}>Period: <span style={s.rMetaVal}>{fmt(trips.start)}</span> → <span style={s.rMetaVal}>{fmt(trips.end)}</span></div>
              <div style={s.rMetaItem}>Generated: <span style={s.rMetaVal}>{fmt(new Date().toISOString())}</span></div>
            </div>
          </div>

          {/* Table */}
          {allTolls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 14 }}>
              No toll transactions found for this period.
            </div>
          ) : (
            <table style={s.table}>
              <thead style={s.tHead}>
                <tr>
                  <th style={s.th}>#</th>
                  <th style={s.th}>Trip Window</th>
                  <th style={s.th}>Plaza</th>
                  <th style={s.th}>Road</th>
                  <th style={s.th}>State</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {allTolls.map((t, i) => (
                  <tr key={i} style={i % 2 === 1 ? { background: '#fafafa' } : {}}>
                    <td style={s.td}>{i + 1}</td>
                    <td style={s.td}>
                      <div>{fmt(t.trip_started)}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>→ {fmt(t.trip_ended)}</div>
                      {t.trip_distance && <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{parseFloat(t.trip_distance).toFixed(1)} mi</div>}
                    </td>
                    <td style={s.tdBold}>{t.name || 'Toll Plaza'}</td>
                    <td style={s.td}>{t.road || '—'}</td>
                    <td style={s.td}>{t.state || '—'}</td>
                    <td style={{ ...s.tdGreen, textAlign: 'right' }}>{usd(t.cost)}</td>
                  </tr>
                ))}
                <tr style={s.totalRow}>
                  <td colSpan={5} style={s.totalLabel}>Total</td>
                  <td style={{ ...s.totalVal, textAlign: 'right' }}>{usd(trips.total)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Footer */}
          <div style={s.footer}>
            <span style={s.footerText}>MSH Rentals · Toll Recovery System</span>
            <span style={s.footerText}>Powered by TollGuru · {allTolls.length} transaction{allTolls.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
