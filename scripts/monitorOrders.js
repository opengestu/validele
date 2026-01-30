// monitoring.js - basic orders visibility monitor
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL = process.env.SUPABASE_URL;
if (!SERVICE_KEY || !URL) {
  console.error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL missing in environment');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function monitorOrdersVisibility() {
  console.log('\n=== MONITORING ORDERS VISIBILITY ===');
  console.log('Time:', new Date().toISOString());

  try {
    const { data, error } = await admin
      .from('orders')
      .select('status, id');
    if (error) {
      console.error('Error fetching orders:', error);
      return;
    }
    const counts = (data || []).reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
    console.log('Counts by status:', counts);
  } catch (err) {
    console.error('Monitoring error:', err);
  }
}

(async () => {
  await monitorOrdersVisibility();
  // Run every 15 minutes by default
  const interval = parseInt(process.env.MONITOR_INTERVAL_MINUTES || '15', 10) * 60 * 1000;
  setInterval(monitorOrdersVisibility, interval);
})();