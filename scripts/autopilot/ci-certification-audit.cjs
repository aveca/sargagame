#!/usr/bin/env node
/**
 * ci-certification-audit.cjs — CI/Certification gate audit
 * Verifies CI triggers, certification gate integration, and mock detection
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

/**
 * Extrait la liste `needs:` d'un job d'un workflow (sans dépendance YAML).
 *
 * ROBUSTESSE : on compare l'APPARTENANCE (`certification-gate` ∈ needs) et non
 * une chaîne fige. Une égalité de chaîne (`needs: [build, certification-gate]`)
 * casse dès que le graphe évolue (ajout de `scope`) — c'est exactement ce qui
 * est arrivé : l'audit signalait « deploy does not depend on certification-gate »
 * alors que la dépendance est intacte. L'intention de l'audit (le déploiement
 * dépend bien de la porte de certification) est ici faithfully vérifiée.
 *
 * Gère les deux formes YAML : liste en ligne `[a, b]` et liste bloc `- a`.
 */
function jobNeeds(content, jobName) {
  var lines = content.split(/\r?\n/);
  var jobIndent = -1;
  var out = [];
  var i = 0;

  // Localise l'en-tête du job.
  for (; i < lines.length; i++) {
    var m = lines[i].match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*$/);
    if (m && m[2] === jobName) { jobIndent = m[1].length; break; }
  }
  if (jobIndent === -1) return out;

  // Parcourt le corps du job jusqu'au job suivant (indent <= jobIndent).
  for (i = i + 1; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    if (trimmed === '' || trimmed.charAt(0) === '#') continue;
    var indent = line.match(/^\s*/)[0].length;
    if (indent <= jobIndent) break;

    var nm = line.match(/^\s*needs\s*:\s*(.*)$/);
    if (!nm || indent !== jobIndent + 2) continue;

    var raw = nm[1].trim();
    if (raw !== '') {
      if (raw.charAt(0) === '[' && raw.charAt(raw.length - 1) === ']') raw = raw.slice(1, -1);
      raw.split(',').forEach(function (s) {
        s = s.trim().replace(/^["']|["']$/g, '');
        if (s) out.push(s);
      });
      continue;
    }
    // Forme bloc : needs:\n  - a\n  - b
    for (var j = i + 1; j < lines.length; j++) {
      var l2 = lines[j];
      var t2 = l2.trim();
      if (t2 === '' || t2.charAt(0) === '#') continue;
      var i2 = l2.match(/^\s*/)[0].length;
      if (i2 <= jobIndent + 2) break;
      var m2 = l2.match(/^\s*-\s*(.+?)\s*$/);
      if (m2 && i2 === jobIndent + 4) out.push(m2[1].replace(/^["']|["']$/g, ''));
    }
  }
  return out;
}

function checkCertificationGate() {
  console.log('\n=== Certification Gate Audit ===\n');

  var issues = [];
  var warnings = [];
  var passes = [];

  // 1. Check ci-tests.yml has certification check
  var ciTests = checkWorkflow('ci-tests.yml');

  if (ciTests.indexOf('CHECK_certification_status.cjs') !== -1) {
    passes.push('ci-tests.yml: Certification check present');
  } else {
    issues.push('ci-tests.yml: Missing CHECK_certification_status.cjs');
  }

  if (ciTests.indexOf('--mode pr') !== -1) {
    passes.push('ci-tests.yml: Uses --mode pr flag');
  } else {
    warnings.push('ci-tests.yml: Missing --mode pr flag');
  }

  // 2. Check cloudflare-production.yml has certification gate
  var cfProd = checkWorkflow('cloudflare-production.yml');

  if (cfProd.indexOf('certification-gate') !== -1) {
    passes.push('cloudflare-production.yml: certification-gate job present');
  } else {
    issues.push('cloudflare-production.yml: Missing certification-gate job');
  }

  if (cfProd.indexOf('--mode deploy') !== -1) {
    passes.push('cloudflare-production.yml: Uses --mode deploy flag');
  } else {
    issues.push('cloudflare-production.yml: Missing --mode deploy flag');
  }

  // Dépendance du déploiement à la porte de certification : vérifiée par
  // APPARTENANCE (et non par égalité de chaîne) — voir jobNeeds().
  var deployNeeds = jobNeeds(cfProd, 'deploy');
  if (deployNeeds.indexOf('certification-gate') !== -1) {
    passes.push('cloudflare-production.yml: deploy depends on certification-gate');
  } else {
    issues.push('cloudflare-production.yml: deploy does not depend on certification-gate (needs: ' + (deployNeeds.join(', ') || 'aucun') + ')');
  }

  // Périmètre d'application : la porte de certification ne doit tourner que
  // sur un run de production (job `scope`). Sans cela, un run hors `main`
  // (dispatch manuel sur une branche de dev, workflow_run hors main) échoue
  // systématiquement sur la porte — 10 runs rouges identiques (run
  // 39383768675, SHA 4eea0367, branche agent/coding/TASK-P1-002).
  var gateNeeds = jobNeeds(cfProd, 'certification-gate');
  if (gateNeeds.indexOf('scope') !== -1) {
    passes.push('cloudflare-production.yml: certification-gate depends on scope (perimetre d\'application)');
  } else {
    issues.push('cloudflare-production.yml: certification-gate does not depend on scope — la porte tournerait hors perimetre de production');
  }

  var gateBody = cfProd.slice(cfProd.indexOf('certification-gate:'));
  if (gateBody.indexOf('needs.scope.outputs.production') !== -1) {
    passes.push('cloudflare-production.yml: certification-gate conditionne par la sortie production de scope');
  } else {
    issues.push('cloudflare-production.yml: certification-gate non conditionne par needs.scope.outputs.production');
  }

  // 3. Check that cert script exists and has proper modes
  var certScript = fs.readFileSync(path.join(ROOT, 'scripts/CHECK_certification_status.cjs'), 'utf-8');

  if (certScript.indexOf('--mode') !== -1) {
    passes.push('CHECK_certification_status.cjs: Supports --mode flag');
  } else {
    issues.push('CHECK_certification_status.cjs: Missing --mode support');
  }

  if (certScript.indexOf('NOT_PROVEN') !== -1 && certScript.indexOf('PASS') !== -1 && certScript.indexOf('FAIL') !== -1) {
    passes.push('CHECK_certification_status.cjs: Has all three statuses');
  } else {
    issues.push('CHECK_certification_status.cjs: Missing status values');
  }

  // 4. Check that verify.cjs fails on absent tests (not SKIP)
  var verifyScript = fs.readFileSync(path.join(ROOT, 'scripts/autopilot/verify.cjs'), 'utf-8');

  if (verifyScript.indexOf('FAIL (absent') !== -1 && verifyScript.indexOf('SKIP (absent') === -1) {
    passes.push('verify.cjs: Fails on absent tests (no SKIP)');
  } else {
    issues.push('verify.cjs: Still uses SKIP for absent tests');
  }

  // 5. Check for mock detection in certification tests
  var certDir = path.join(ROOT, 'tests/unit/certification');
  if (fs.existsSync(certDir)) {
    var testFiles = fs.readdirSync(certDir);
    var hasMockDetection = false;

    for (var i = 0; i < testFiles.length; i++) {
      var f = testFiles[i];
      var content = fs.readFileSync(path.join(certDir, f), 'utf-8');
      if (content.indexOf('simulated:true') !== -1 || content.indexOf('tr_test_') !== -1 || (content.indexOf('paymentMode') !== -1 && content.indexOf('live') !== -1)) {
        hasMockDetection = true;
        break;
      }
    }

    if (hasMockDetection) {
      passes.push('Certification tests: Mock detection present');
    } else {
      warnings.push('Certification tests: No explicit mock detection found');
    }
  } else {
    warnings.push('No certification test directory found');
  }

  // 6. Check that PR workflow has certification check
  var agentHandoff = checkWorkflow('agent-handoff.yml');

  if (agentHandoff.indexOf('CHECK_certification_status.cjs') !== -1) {
    passes.push('agent-handoff.yml: Runs certification check');
  } else {
    warnings.push('agent-handoff.yml: No certification check in handoff flow');
  }

  // Output results
  console.log('\n=== Certification Gate Audit ===\n');

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
  checkCertificationGate();
}

module.exports = { checkCertificationGate };