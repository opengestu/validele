// Simple smoke test for payout batch flow
// Usage: ADMIN_TOKEN=... node payout-batch-flow.js

const API = process.env.API_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_PROFILE_ID = process.env.ADMIN_PROFILE_ID;
const ADMIN_PIN = process.env.ADMIN_PIN;

async function getAdminToken() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  if (!ADMIN_PROFILE_ID || !ADMIN_PIN) throw new Error('Provide ADMIN_TOKEN or ADMIN_PROFILE_ID+ADMIN_PIN');
  const res = await fetch(`${API}/api/admin/login-local`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: ADMIN_PROFILE_ID, pin: ADMIN_PIN }) });
  const json = await res.json();
  if (!res.ok) throw new Error('login-local failed: ' + JSON.stringify(json));
  return json.token;
}

(async () => {
  try {
    const token = await getAdminToken();
    console.log('Admin token obtained');

    // Create batch
    console.log('Creating payout batch...');
    let res = await fetch(`${API}/api/admin/payout-batches/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ notes: 'Smoke test batch' }) });
    let json = await res.json();
    console.log('create result:', res.status, json);
    if (!res.ok) return process.exit(1);

    // List batches
    res = await fetch(`${API}/api/admin/payout-batches`, { headers: { Authorization: `Bearer ${token}` } });
    json = await res.json();
    console.log('batches:', json.batches?.length || 0);
    const batch = json.batches && json.batches[0];
    if (!batch) {
      console.log('No batch found to process');
      return;
    }

    // Process batch
    console.log('Processing batch', batch.id);
    res = await fetch(`${API}/api/admin/payout-batches/${batch.id}/process`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    json = await res.json();
    console.log('process result:', res.status, json);

    // Also test process-scheduled endpoint (ensure at least one batch scheduled_at <= now)
    console.log('Processing scheduled batches (admin trigger)...');
    res = await fetch(`${API}/api/admin/payout-batches/process-scheduled`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    json = await res.json();
    console.log('process-scheduled result:', res.status, json);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();