const { supabase } = require('../supabase');

(async () => {
  try {
    if (!supabase) {
      console.error('[DEBUG] supabase client not initialized (missing keys in environment)');
      process.exit(2);
    }

    const { data, error, count } = await supabase
      .from('profiles')
      .select('id, full_name, phone, company_name, role', { count: 'exact' })
      .eq('role', 'vendor')
      .or('company_name.is.null,company_name.eq.""')
      .limit(200);

    if (error) {
      console.error('[DEBUG] error querying profiles:', error);
      process.exit(3);
    }

    console.log('[DEBUG] vendors missing company_name (sample up to 200):');
    console.log(JSON.stringify(data || [], null, 2));
    process.exit(0);
  } catch (e) {
    console.error('[DEBUG] exception:', e);
    process.exit(1);
  }
})();