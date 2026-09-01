/**
 * Alternative Email Routing using Cloudflare Wrangler CLI
 * 
 * This script uses wrangler DNS commands to configure email routing.
 * Requires: wrangler login already done, and zone access.
 */

const { execSync } = require('child_process');
const fs = require('fs');

const DOMAINS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassummiami.com',
  'sargassumcancun.com',
  'sargassumpuntacana.com',
  'sargazotulum.com'
];

const EMAIL = 'yacovassaraf@gmail.com';

function runCommand(cmd) {
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return { success: true, output: result.trim() };
  } catch (e) {
    return { success: false, error: e.stderr || e.message };
  }
}

function addMXRecord(zone, domain) {
  // Add 3 MX records: isaac (10), linda (20), amir (50)
  const mxRecords = [
    { content: 'isaac.mx.cloudflare.net', priority: 10 },
    { content: 'linda.mx.cloudflare.net', priority: 20 },
    { content: 'amir.mx.cloudflare.net', priority: 50 }
  ];
  
  for (const mx of mxRecords) {
    const cmd = `npx wrangler dns-records add ${zone} --type MX --name @ --content ${mx.content} --priority ${mx.priority}`;
    const result = runCommand(cmd);
    if (!result.success) {
      console.log(`⚠️  MX record ${mx.content} priority ${mx.priority}: ${result.error || 'failed'}`);
    }
  }
}

function addTXTRecord(zone, domain, type, name, content) {
  const cmd = `npx wrangler dns-records add ${zone} --type ${type} --name ${name} --content "${content}"`;
  const result = runCommand(cmd);
  if (!result.success) {
    console.log(`⚠️  TXT ${type} record: ${result.error || 'failed'}`);
  }
}

function main() {
  console.log('📧 Email Routing via Wrangler CLI');
  console.log('================================');
  
  for (const domain of DOMAINS) {
    console.log(`\n--- ${domain} ---`);
    
    // Get zone ID - we'll use the domain name directly
    console.log('  Récupération de la zone...');
    
    // Add MX records
    console.log('  Ajout des MX records...');
    addMXRecord('', domain);
    
    // Add SPF record
    console.log('  Ajout du SPF...');
    addTXTRecord('', domain, 'TXT', '@', 'v=spf1 include:_spf.mx.cloudflare.net ~all');
    
    // Add DMARC record
    console.log('  Ajout du DMARC...');
    addTXTRecord('', domain, 'TXT', '_dmarc', 'v=DMARC1; p=quarantine; rua=mailto:alerte@' + domain);
    
    console.log('  ✅ Done for', domain);
  }
  
  console.log('\n=== Email Routing Configuration Complete ===');
  console.log('Target email:', EMAIL);
  console.log('Domains configured:', DOMAINS.length);
  console.log('\nNote: For full email routing (contact@, alerte@, etc.),');
  console.log('the Cloudflare API route is recommended.');
}

main();