-- Supabase Schema for b2b_leads and b2b_subscriptions
-- Run this in Supabase Dashboard → SQL Editor

-- Create b2b_leads table
CREATE TABLE IF NOT EXISTS b2b_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  domain TEXT NOT NULL,
  region TEXT NOT NULL,
  source TEXT DEFAULT 'map_banner',
  status TEXT DEFAULT 'new',
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create b2b_subscriptions table
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
);

-- ── B2C alerts (SPRINT #15) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2c_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  region TEXT NOT NULL,
  domain TEXT NOT NULL,
  beaches TEXT[],
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribe_token TEXT DEFAULT gen_random_uuid()::text
);
ALTER TABLE b2c_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b2c_alerts_insert" ON b2c_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "b2c_alerts_select" ON b2c_alerts FOR SELECT USING (true);
CREATE POLICY "b2c_alerts_update" ON b2c_alerts FOR UPDATE USING (true);

-- Enable Row Level Security
ALTER TABLE b2b_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for b2b_leads
CREATE POLICY "b2b_leads_insert" ON b2b_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "b2b_leads_select" ON b2b_leads FOR SELECT USING (true);
CREATE POLICY "b2b_leads_update" ON b2b_leads FOR UPDATE USING (true);

-- Create permissive policies for b2b_subscriptions
CREATE POLICY "b2b_subscriptions_insert" ON b2b_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "b2b_subscriptions_select" ON b2b_subscriptions FOR SELECT USING (true);
CREATE POLICY "b2b_subscriptions_update" ON b2b_subscriptions FOR UPDATE USING (true);