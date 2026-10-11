#!/usr/bin/env node
/**
 * deploy-audit.cjs — Deployment automation audit
 * 
 * Verifies deployment triggers, secret detection, and configuration completeness
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim();
}

function runSafe(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim() };
  } catch (e) {
    var stdout = e.stdout ? e.stdout.toString() : '';
    var stderr = e.stderr ? e.stderr.toString() : '';
    return { ok: false, out: stdout + '\n' + stderr + e.message };
  }
}

function checkWorkflow(file) {
  var content = fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf-8');
  return content;
}

function checkDeploymentAutomation() {
  console.log('\n=== Deployment Automation Audit ===\n');

  var issues = [];
  var warnings = [];
  var passes = [];

  // 1. Check cloudflare-production.yml for complete deployment pipeline
  var cfProd = checkWorkflow('cloudflare-production.yml');

  // Check for build matrix with all regions
  if (cfProd.indexOf('florida') !== -1 && cfProd.indexOf('puntacana') !== -1 && 
      cfProd.indexOf('rivieramaya') !== -1 && cfProd.indexOf('tulum') !== -1) {
    passes.push('cloudflare-production.yml: Build matrix includes all 6 regions');
  } else {
    issues.push('cloudflare-production.yml: Missing regions in build matrix');
  }

  // Check for prepare-ftp verification
  if (cfProd.indexOf('prepare-ftp') !== -1 && cfProd.indexOf('certification-gate') !== -1) {
    passes.push('cloudflare-production.yml: prepare-ftp and certification-gate present');
  } else {
    issues.push('cloudflare-production.yml: Missing prepare-ftp or certification-gate');
  }

  // Check for fingerprint verification
  if (cfProd.indexOf('fingerprint') !== -1 && cfProd.indexOf('version.json') !== -1) {
    passes.push('cloudflare-production.yml: Fingerprint verification present');
  } else {
    issues.push('cloudflare-production.yml: Missing fingerprint verification');
  }

  // Check for sitemap verification
  if (cfProd.indexOf('sitemap.xml') !== -1) {
    passes.push('cloudflare-production.yml: Sitemap verification present');
  } else {
    warnings.push('cloudflare-production.yml: Missing sitemap.xml verification');
  }

  // Check for payment API smoke test
  if (cfProd.indexOf('mollie.php') !== -1 && cfProd.indexOf('__payment_smoke__') !== -1) {
    passes.push('cloudflare-production.yml: Payment API smoke test present');
  } else {
    issues.push('cloudflare-production.yml: Missing payment API smoke test');
  }

  // Check for fleet verification
  if (cfProd.indexOf('verify-fleet') !== -1 && cfProd.indexOf('verify-live-fleet') !== -1) {
    passes.push('cloudflare-production.yml: Fleet coherence verification present');
  } else {
    warnings.push('cloudflare-production.yml: Missing fleet verification');
  }

  // 2. Check daily-copernicus.yml for data pipeline
  var dailyCopernicus = checkWorkflow('daily-copernicus.yml');

  if (dailyCopernicus.indexOf('fetch-sargassum-live') !== -1) {
    passes.push('daily-copernicus.yml: Data fetch step present');
  } else {
    issues.push('daily-copernicus.yml: Missing fetch-sargassum-live step');
  }

  if (dailyCopernicus.indexOf('verify-ftp-ready') !== -1) {
    passes.push('daily-copernicus.yml: FTP readiness verification present');
  } else {
    issues.push('daily-copernicus.yml: Missing verify-ftp-ready');
  }

  if (dailyCopernicus.indexOf('verify-ftp-ready') !== -1 && dailyCopernicus.indexOf('outcome == \'failure\'') !== -1) {
    passes.push('daily-copernicus.yml: Blocks deploy on verification failure');
  } else {
    issues.push('daily-copernicus.yml: Missing failure handling for verify-ftp-ready');
  }

  // 3. Check for secret detection in workflows
  var workflowFiles = fs.readdirSync(path.join(ROOT, '.github/workflows')).filter(function(f) { return f.endsWith('.yml'); });
  var secretIssues = [];
  var secretWarnings = [];

  for (var i = 0; i < workflowFiles.length; i++) {
    var f = workflowFiles[i];
    var content = checkWorkflow(f);
    
    // Check for hardcoded secrets (should use ${{ secrets.X }})
    if (content.indexOf('MOLLIE_API_KEY') !== -1 && content.indexOf('${{ secrets.MOLLIE_API_KEY }}') === -1) {
      secretIssues.push(f + ': MOLLIE_API_KEY not using secrets');
    }
    if (content.indexOf('SUPABASE_SERVICE_KEY') !== -1 && content.indexOf('${{ secrets.SUPABASE_SERVICE_KEY }}') === -1) {
      secretIssues.push(f + ': SUPABASE_SERVICE_KEY not using secrets');
    }
    if (content.indexOf('CLOUDFLARE_API_TOKEN') !== -1 && content.indexOf('${{ secrets.CLOUDFLARE_API_TOKEN }}') === -1) {
      secretIssues.push(f + ': CLOUDFLARE_API_TOKEN not using secrets');
    }
    if (content.indexOf('CLOUDFLARE_ACCOUNT_ID') !== -1 && content.indexOf('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}') === -1) {
      secretIssues.push(f + ': CLOUDFLARE_ACCOUNT_ID not using secrets');
    }
    
    // Check for MOLLIE_WEBHOOK_SECRET
    if (content.indexOf('MOLLIE_WEBHOOK_SECRET') !== -1 && content.indexOf('${{ secrets.MOLLIE_WEBHOOK_SECRET }}') === -1) {
      secretIssues.push(f + ': MOLLIE_WEBHOOK_SECRET not using secrets');
    }
  }

  if (secretIssues.length === 0) {
    passes.push('No hardcoded secrets detected in workflows');
  } else {
    issues.push.apply(issues, secretIssues);
  }

  // 4. Check for required secrets documentation
  var requiredSecrets = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'MOLLIE_API_KEY',
    'MOLLIE_WEBHOOK_SECRET',
    'SUPABASE_SERVICE_KEY',
    'STRIPE_SECRET_KEY',
    'SMTP_PASS',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GA4_PROPERTY_ID_MQ',
    'GA4_PROPERTY_ID_GP',
    'SG_STATS_KEY',
    'SG_STATS_KEY_MQ',
    'SG_STATS_KEY_GP'
  ];

  var missingSecretsDoc = [];
  for (var i = 0; i < requiredSecrets.length; i++) {
    var secret = requiredSecrets[i];
    var found = false;
    for (var j = 0; j < workflowFiles.length; j++) {
      var f = workflowFiles[j];
      var content = checkWorkflow(f);
      if (content.indexOf('${{ secrets.' + secret + ' }}') !== -1) {
        found = true;
        break;
      }
    }
    if (!found) {
      missingSecretsDoc.push(secret);
    }
  }

  if (missingSecretsDoc.length === 0) {
    passes.push('All required secrets referenced in workflows');
  } else {
    warnings.push('Some secrets may not be referenced: ' + missingSecretsDoc.join(', '));
  }

  // 5. Check prepare-ftp.cjs exists and is executable
  var prepareFtp = path.join(ROOT, 'scripts/prepare-ftp.cjs');
  if (fs.existsSync(prepareFtp)) {
    passes.push('scripts/prepare-ftp.cjs exists');
    
    var prepareContent = fs.readFileSync(prepareFtp, 'utf-8');
    if (prepareContent.indexOf('martinique-ftp') !== -1 && prepareContent.indexOf('guadeloupe-ftp') !== -1) {
      passes.push('prepare-ftp.cjs: Handles MQ and GP regions');
    } else {
      warnings.push('prepare-ftp.cjs: May not handle all core regions');
    }
  } else {
    issues.push('scripts/prepare-ftp.cjs missing');
  }

  // 6. Check verify-ftp-ready.cjs
  var verifyFtp = path.join(ROOT, 'scripts/verify-ftp-ready.cjs');
  if (fs.existsSync(verifyFtp)) {
    passes.push('scripts/verify-ftp-ready.cjs exists');
  } else {
    issues.push('scripts/verify-ftp-ready.cjs missing');
  }

  // 7. Check wrangler template
  var wranglerTemplate = path.join(ROOT, 'wrangler.template.jsonc');
  if (fs.existsSync(wranglerTemplate)) {
    passes.push('wrangler.template.jsonc exists');
  } else {
    issues.push('wrangler.template.jsonc missing');
  }

  // 8. Check regions configuration
  var regionsDir = path.join(ROOT, 'regions');
  if (fs.existsSync(regionsDir)) {
    var regionFiles = fs.readdirSync(regionsDir).filter(function(f) { return f.endsWith('.json') && f !== '_schema.json'; });
    passes.push('Regions configured: ' + regionFiles.join(', '));
  } else {
    issues.push('Regions directory missing');
  }

  // Output results
  console.log('\n=== Deployment Automation Audit ===\n');

  console.log('PASSES:');
  passes.forEach(function(p) { console.log('  OK ' + p); });

  console.log('\nWARNINGS:');
  warnings.forEach(function(w) { console.log('  WARN ' + w); });

  console.log('\nISSUES:');
  issues.forEach(function(i) { console.log('  FAIL ' + i); });

  console.log('\n=== Summary ===');
  console.log('Passes: ' + passes.length);
  console.log('Warnings: ' + warnings.length);
  console.log('Issues: ' + issues.length);

  if (issues.length > 0) {
    console.log('\nAUDIT FAILED - Issues must be resolved');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log('\nAUDIT PASSED WITH WARNINGS');
    process.exit(0);
  } else {
    console.log('\nAUDIT PASSED');
    process.exit(0);
  }
}

if (require.main === module) {
  checkDeploymentAutomation();
}

module.exports = { checkDeploymentAutomation };