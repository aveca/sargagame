/**
 * Cloudflare Audit Script for Sargagame
 * Audits DNS, Workers, Pages, APIs, Supabase for all domains
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Domains to audit (6 total including Tulum)
const DOMAINS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassumpuntacana.com',
  'sargassummiami.com',
  'sargassumcancun.com',
  'sargazotulum.com'
];

// Regions mapping
const REGIONS = {
  mq: 'Martinique',
  gp: 'Guadeloupe', 
  cancun: 'Cancún',
  tulum: 'Tulum',
  puntacana: 'Punta Cana',
  miami: 'Miami'
};

// Cloudflare account ID
const ACCOUNT_ID = 'abf2b92cf718313567b4b38eb9dda17f';

// Results container
const results = {
  dns: {},
  workers: {},
  pages: {},
  api: {},
  supabase: {},
  funnel: {}
};

// Helper to run shell commands
function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' });
  } catch (e) {
    return e.stdout || e.stderr || 'Error';
  }
}

// Get zones for each domain
function getZoneId(domain) {
  const output = run(`curl -s "https://api.cloudflare.com/client/v4/zones?name=${domain}" -H "Authorization: Bearer ${process.env.CF_TOKEN || ''}" -H "Content-Type: application/json"`);
  try {
    const data = JSON.parse(output);
    if data.result && data.result[0] && data.result[0].id) {
      return data.result[0].id;
    }
  } catch(e) {}
  return null;
}

// ===== DNS Records =====
async function auditDNS() {
  console.log('🔍 Auditing DNS Records...\n');
  
  for (const domain of DOMAINS) {
    const zoneId = getZoneId(domain);
    if (!zoneId) {
      results.dns[domain] = { error: 'Zone not found' };
      continue;
    }
    
    // Get all DNS records
    const dc = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      headers: { 'Authorization': `Bearer ${process.env.CF_TOKEN || ''}`, 'Content-Type': 'application/json' }
    });
    const dns = await dc.json();
    
    const records = {};
    for (const record of dns.result || []) {
      records[record.type] = records[record.type] || [];
      records[record.type].push({
        name: record.name,
        content: record.content,
        proxied: record.proxied,
        ttl: record.ttl
      });
    }
    
    // Specifically check for MX, TXT (SPF, DKIM, DMARC), Google verification
    const mxRecords = (records.MX || []).map(r => ({ name: r.name, content: r.content, proxied: r.proxied }));
    const txtRecords = (records.TXT || []).map(r => ({
      name: r.name,
      content: r.content?.join(' ') || r.content,
      proxied: r.proxied
    }));
    
    results.dns[domain] = {
      zoneId,
      MX: mxRecords,
      TXT: txtRecords,
      A: records.A || [],
      CNAME: records.CNAME || []
    };
    
    console.log(`  ${domain}: ${mxRecords.length} MX, ${txtRecords.length} TXT records`);
  }
}

// ===== Workers Routes =====
async function auditWorkers() {
  console.log('\n🔧 Auditing Worker Routes...\n');
  
  // Check sg-payments worker
  const sgPaymentsDir = path.join(__dirname, 'workers', 'sg-payments');
  const wc = path.join(sgPaymentsDir, 'wrangler.jsonc');
  
  if (fs.existsSync(wc)) {
    const wcContent = fs.readFileSync(wc, 'utf8');
    // Parse routes from wrangler.jsonc
    const routeMatches = wcContent.match(/\{"pattern": "([^"]+)", "zone_name": "([^"]+)"\}/g);
    results.workers.sg-payments = {};
    
    if (routeMatches) {
      for (const match of routeMatches) {
        const patternMatch = match.match(/"pattern": "([^"]+)"/);
        const zoneMatch = match.match(/"zone_name": "([^"]+)"/);
        if (patternMatch && zoneMatch) {
          const pattern = patternMatch[1];
          const zone = zoneMatch[1];
          // Extract domain from zone
          const domain = zone.replace('.com', '.com');
          results.workers.sg-payments[pattern] = domain;
        }
      }
    }
  }
  
  // Check other workers
  const workersDir = path.join(__dirname, 'workers');
  if (fs.existsSync(workersDir)) {
    const workerDirs = fs.readdirSync(workersDir).filter(d => fs.existsSync(path.join(workersDir, d, 'wrangler.jsonc')));
    for (const wd of workerDirs) {
      const wc = path.join(workersDir, wd, 'wrangler.jsonc');
      const content = fs.readFileSync(wc, 'utf8');
      const routeMatches = content.match(/\{"pattern": "([^"]+)", "zone_name": "([^"]+)"\}/g);
      results.workers[wd] = {};
      
      if (routeMatches) {
        for (const match of routeMatches) {
          const patternMatch = match.match(/"pattern": "([^"]+)"/);
          const zoneMatch = match.match(/"zone_name": "([^"]+)"/);
          if (patternMatch && zoneMatch) {
            results.workers[wd][patternMatch[1]] = zoneMatch[1];
          }
        }
      }
    }
  }
}

// ===== Pages Projects =====
async function auditPages() {
  console.log('\n📄 Auditing Pages Projects...\n');
  
  // Check each domain's Pages status
  for (const domain of DOMAINS) {
    // Try to get Pages project info
    const pc = await fetch(`https://api.cloudflare.com/client_v4/accounts/${ACCOUNT_ID}/pages/projects`, {
      headers: { 'Authorization': `Bearer ${process.env.CF_TOKEN || ''}`, 'Content-Type': 'application/json' }
    });
    const projects = await pc.json();
    
    // Find project for this domain
    const domainProject = projects.result?.find(p => 
      p.custom_domain && p.custom_domain.includes(domain)
    );
    
    results.pages[domain] = {
      project: domainProject ? { id: domainProject.id, name: domainProject.name } : null,
      last_deploy: null,
      custom_domain: domain
    };
    
    console.log(`  ${domain}: ${domainProject ? 'Project found' : 'No project'}`);
  }
}

// ===== API Endpoints =====
async function auditAPIs() {
  console.log('\n🔌 Auditing API Endpoints...\n');
  
  for (const domain of DOMAINS) {
    results.api[domain] = {};
    
    // Test /api/copernicus/forecast
    try {
      const forecastResp = await fetch(`https://${domain}/api/copernicus/forecast?region=martinique&days=1`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      const forecastData = await forecastResp.json();
      results.api[domain].forecast = {
        status: forecastResp.status,
        statusText: forecastResp.statusText,
        preview: JSON.stringify(forecastData).substring(0, 200)
      };
    } catch(e) {
      results.api[domain].forecast = { error: e.message };
    }
    
    // Test /api/mollie-create-payment
    try {
      const mollieResp = await fetch(`https://${domain}/api/mollie-create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: '0.01', description: 'test', plan: 'brief_monthly', region: 'mq', domain })
      });
      results.api[domain].mollieCreate = {
        status: mollieResp.status,
        statusText: mollieResp.statusText
      };
    } catch(e) {
      results.api[domain].mollieCreate = { error: e.message };
    }
    
    // Test /api/mollie-webhook
    try {
      const webhookResp = await fetch(`https://${domain}/api/mollie-webhook`, {
        method: 'GET'
      });
      results.api[domain].mollieWebhook = {
        status: webhookResp.status,
        statusText: webhookResp.statusText
      };
    } catch(e) {
      results.api[domain].mollieWebhook = { error: e.message };
    }
    
    console.log(`  ${domain}: forecast=${results.api[domain].forecast?.status || 'err'}, mollie=${results.api[domain].mollieCreate?.status || 'err'}`);
  }
}

// ===== Supabase =====
async function auditSupabase() {
  console.log('\n📊 Auditing Supabase...\n');
  
  const supabaseUrl = 'https://rswdmjtdzrucqzzukfmd.supabase.co';
  const supaKey = process.env.SUPABASE_SERVICE_KEY || '';
  
  // Count b2b_leads
  try {
    const leadsResp = await fetch(`${supabaseUrl}/rest/v1/b2b_leads?select=count&status=eq.new`, {
      headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` }
    });
    results.supabase.b2b_leads_total = leadsResp.ok ? parseInt(leadsResp.headers.get('x-count') || '0') : 'err';
  } catch(e) {
    results.supabase.b2b_leads_total = 'err';
  }
  
  // Count this week's leads
  try {
    const weekLeadsResp = await fetch(`${supabaseUrl}/rest/v1/b2b_leads?select=*&created_at=gt.2026-08-23T00:00:00Z`, {  // last 7 days
      headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` }
    });
    results.supabase.b2b_leads_week = weekLeadsResp.ok ? weekLeadsResp.json().length : 'err';
  } catch(e) {
    results.supabase.b2b_leads_week = 'err';
  }
  
  // Count active subscriptions
  try {
    const subsResp = await fetch(`${supabaseUrl}/rest/v1/b2b_subscriptions?select=count&status=eq.active`, {
      headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` }
    });
    results.supabase.b2b_subscriptions_active = subsResp.ok ? parseInt(subsResp.headers.get('x-count') || '0') : 'err';
  } catch(e) {
    results.supabase.b2b_subscriptions_active = 'err';
  }
  
  console.log(`  b2b_leads total: ${results.supabase.b2b_leads_total}`);
  console.log(`  b2b_leads this week: ${results.supabase.b2b_leads_week}`);
  console.log(`  b2b_subscriptions active: ${results.supabase.b2b_subscriptions_active}`);
}

// ===== Funnel Events =====
async function auditFunnel() {
  console.log('\n📈 Auditing Funnel Events...\n');
  
  // Check for SG_FUNNEL_EVENTS in code
  const srcDir = path.join(__dirname, 'src');
  if (fs.existsSync(srcDir)) {
    const files = fs.readdirSync(srcDir, { recursive: true }).filter(f => f.endsWith('.jsx') || f.endsWith('.tsx'));
    let totalEvents = 0;
    const eventCounts = {};
    
    for (const file of files.slice(0, 20)) { // Sample first 20 files
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      const eventMatches = content.match(/SG_FUNNEL_EVENTS\s*[\[(][^\]]{3,}[\])]/g) || [];
      for (const match of eventMatches) {
        const eventName = match.match(/(\w+)\s*=/)?.[1] || match.slice(0, 30);
        eventCounts[eventName] = (eventCounts[eventName] || 0) + 1;
        totalEvents++;
      }
    }
    
    results.funnel.eventsInCode = { totalEvents, eventCounts };
  }
  
  // Check Supabase for event counts
  try {
    const eventsResp = await fetch(`https://rswdmjtdzrucqzzukfmd.supabase.co/rest/v1/analytics_events?select=event,count&group=event`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY || '', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY || ''}` }
    });
    const eventsData = await eventsResp.json();
    results.funnel.eventsInDB = eventsData || [];
    console.log(`  Events in DB: ${JSON.stringify(eventsData?.slice(0, 5))}`);
  } catch(e) {
    results.funnel.eventsInDB = 'err';
  }
}

// Run all audits
async function main() {
  console.log('========================================');
  console.log('SARGASGAME CLOUDFLARE INFRASTRUCTURE AUDIT');
  console.log('========================================\n');
  
  await auditDNS();
  await auditWorkers();
  await auditPages();
  await auditAPIs();
  await auditSupabase();
  await auditFunnel();
  
  // Generate report
  console.log('\n========================================');
  console.log('AUDIT REPORT');
  console.log('========================================\n');
  
  // DNS Summary
  console.log('### DNS Records');
  for (const domain of DOMAINS) {
    const d = results.dns[domain];
    if (d?.error) {
      console.log(`| ${domain} | ERROR: ${d.error} |`);
      continue;
    }
    const mxCount = d.MX?.length || 0;
    const txtCount = d.TXT?.length || 0;
    const aCount = d.A?.length || 0;
    console.log(`| ${domain} | A: ${aCount} | MX: ${mxCount} | TXT: ${txtCount} |`);
  }
  
  // Workers Summary
  console.log('\n### Worker Routes');
  for (const [wName, routes] of Object.entries(results.workers)) {
    console.log(`| ${wName} | ${Object.keys(routes).length} routes |`);
  }
  
  // Pages Summary
  console.log('\n### Pages Projects');
  for (const domain of DOMAINS) {
    const p = results.pages[domain];
    console.log(`| ${domain} | ${p.project ? p.project.name : 'none'} |`);
  }
  
  // APIs Summary
  console.log('\n### API Endpoints');
  for (const domain of DOMAINS) {
    const a = results.api[domain];
    const fStatus = a.forecast?.status || 'err';
    const mStatus = a.mollieCreate?.status || 'err';
    console.log(`| ${domain} | forecast: ${fStatus} | mollie: ${mStatus} |`);
  }
  
  // Supabase Summary
  console.log('\n### Supabase');
  console.log(`| b2b_leads total: ${results.supabase.b2b_leads_total} |`);
  console.log(`| b2b_leads this week: ${results.supabase.b2b_leads_week} |`);
  console.log(`| b2b_subscriptions active: ${results.supabase.b2b_subscriptions_active} |`);
  
  // Funnel Summary
  console.log('\n### Funnel Events');
  if (results.funnel.eventsInCode) {
    console.log(`| Events in code: ${results.funnel.eventsInCode.totalEvents} |`);
    console.log(`| Event types: ${JSON.stringify(Object.keys(results.funnel.eventsInCode.eventCounts))} |`);
  }
  if (results.funnel.eventsInDB && Array.isArray(results.funnel.eventsInDB)) {
    console.log(`| Events in DB: ${results.funnel.eventsInDB.length} |`);
  }
  
  console.log('\n========================================');
  console.log('AUDIT COMPLETED');
  console.log('========================================');
  
  // Save results
  fs.writeFileSync(path.join(__dirname, '.ai', 'audit-results.json'), JSON.stringify(results, null, 2));
}

main().catch(console.error);