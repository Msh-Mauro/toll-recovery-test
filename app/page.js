export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>Toll Recovery Test</h1>
      <ul>
        <li><a href="/api/auth/login">1. Authorize Zubie →</a></li>
        <li>2. Zubie webhook fires on trip_end → <code>/api/webhooks/zubie</code></li>
        <li>3. Cron runs at 11:30 PM → <code>POST /api/cron/process-tolls</code></li>
        <li><a href="/api/trips">4. View all trips →</a></li>
      </ul>
    </main>
  );
}
