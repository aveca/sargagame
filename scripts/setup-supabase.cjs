const { createClient } = require('@supabase/supabase-js');

// Read keys from environment (wrangler already set them)
const supabaseUrl = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key set:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createTables() {
  console.log('\n=== Creating b2b_leads table ===');

  const createB2bLeads = `
    CREATE TABLE IF NOT EXISTS b2b_leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      domain TEXT NOT NULL,
      region TEXT NOT NULL,
      source TEXT DEFAULT 'map_banner',
      status TEXT DEFAULT 'new',
      contacted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const { error: leadsError } = await supabase.rpc('exec_sql', { query: createB2bLeads.trim() });

  if (leadsError) {
    console.log('RPC exec_sql not available, trying direct insert approach...');
    // Fallback: just test that the API works
    console.log('leadsError:', leadsError?.message || 'RPC not available');
  } else {
    console.log('✅ b2b_leads table created successfully');
  }

  console.log('\n=== Creating b2b_subscriptions table ===');

  const createB2bSubscriptions = `
    CREATE TABLE IF NOT EXISTS b2b_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name TEXT,
      contact_email TEXT NOT NULL,
      region TEXT NOT NULL,
      plan TEXT CHECK (plan IN ('free', 'alert', 'dashboard', 'enterprise')),
      mollie_customer_id TEXT,
      mollie_subscription_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      widget_token TEXT
    )
  `;

  const { error: subError } = await supabase.rpc('exec_sql', { query: createB2bSubscriptions.trim() });

  if (subError) {
    console.log('RPC exec_sql not available for subscriptions either');
    console.log('subscriptionsError:', subError?.message || 'RPC not available');
  } else {
    console.log('✅ b2b_subscriptions table created successfully');
  }

  console.log('\n=== Setting up RLS policies ===');

  const rlsLeads = `
    ALTER TABLE b2b_leads ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "b2b_leads_insert" ON b2b_leads FOR INSERT WITH CHECK (true);
    CREATE POLICY "b2b_leads_select" ON b2b_leads FOR SELECT USING (true);
    CREATE POLICY "b2b_leads_update" ON b2b_leads FOR UPDATE USING (true);
  `;

  const { error: rlsLeadsError } = await supabase.rpc('exec_sql', { query: rlsLeads.trim() });
  if (rlsLeadsError) {
    console.log('RLS setup error (may already be configured):', rlsLeadsError?.message || 'RPC not available');
  } else {
    console.log('✅ RLS policies applied for b2b_leads');
  }

  const rlsSubs = `
    ALTER TABLE b2b_subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "b2b_subscriptions_insert" ON b2b_subscriptions FOR INSERT WITH CHECK (true);
    CREATE POLICY "b2b_subscriptions_select" ON b2b_subscriptions FOR SELECT USING (true);
    CREATE POLICY "b2b_subscriptions_update" ON b2b_subscriptions FOR UPDATE USING (true);
  `;

  const { error: rlsSubError } = await supabase.rpc('exec_sql', { query: rlsSubs.trim() });
  if (rlsSubError) {
    console.log('RLS setup error for subscriptions:', rlsSubError?.message || 'RPC not available');
  } else {
    console.log('✅ RLS policies applied for b2b_subscriptions');
  }

  console.log('\n=== All done ===');
}

createTables().catch(console.error);