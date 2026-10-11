#!/usr/bin/env node
/**
 * predeploy-gate.test.cjs — Contrat v3 : état PREDEPLOY_ELIGIBLE (décision pure,
 * payloads fixtures) + règle « attestation présente mais invalide ⇒ REFUS dur,
 * aucun repli predeploy » sur fixture git isolée.
 *
 * Aucune attestation de production n'est fabriquée ici : on teste la LOGIQUE de
 * décision avec des payloads de check-runs synthétiques (unitaires). La preuve
 * de bout en bout vient des runs GitHub Actions réels (rapport de mission).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHECKER = require(path.join(REPO, 'scripts', 'CHECK_certification_status.cjs'));
const { decidePredeploy, evaluateDeploy } = CHECKER;

let failures = 0;
let count = 0;
function record(name, ok, extra) {
  count++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}
const SHA = 'abcd1234'.repeat(5);
const run = (name, status, conclusion, completedAt) => ({ name, status, conclusion, completed_at: completedAt, html_url: 'https://example.invalid/run' });

console.log('predeploy-gate : décision PREDEPLOY_ELIGIBLE\n');

// P1 — tous les contextes requis verts => éligible
{
  const reasons = [];
  const proofs = decidePredeploy(SHA, [
    run('test-frontend', 'completed', 'success', '2026-10-09T01:00:00Z'),
    run('perf', 'completed', 'success', '2026-10-09T01:01:00Z'),
    run('autre-job-inoffensif', 'completed', 'failure', '2026-10-09T01:02:00Z'), // non requis
  ], reasons);
  record('P1 contexts requis verts => PREDEPLOY_ELIGIBLE', Array.isArray(proofs) && proofs.length === 2 && reasons.length === 0);
}

// P2 — un check requis en cours => refus (CI pas terminée)
{
  const reasons = [];
  const proofs = decidePredeploy(SHA, [
    run('test-frontend', 'completed', 'success', '2026-10-09T01:00:00Z'),
    run('perf', 'in_progress', null, null),
  ], reasons);
  record('P2 check requis in_progress => refus', proofs === null && reasons.some(r => /perf.*in_progress/.test(r)));
}

// P3 — check requis absent => refus
{
  const reasons = [];
  const proofs = decidePredeploy(SHA, [run('test-frontend', 'completed', 'success', '2026-10-09T01:00:00Z')], reasons);
  record('P3 check "perf" absent => refus', proofs === null && reasons.some(r => /"perf" ABSENT/.test(r)));
}

// P4 — check requis rouge => refus
{
  const reasons = [];
  const proofs = decidePredeploy(SHA, [
    run('test-frontend', 'completed', 'failure', '2026-10-09T01:00:00Z'),
    run('perf', 'completed', 'success', '2026-10-09T01:00:00Z'),
  ], reasons);
  record('P4 test-frontend failure => refus', proofs === null);
}

// P5 — vieux échec puis nouveau succès => le plus récent commande => éligible
{
  const reasons = [];
  const proofs = decidePredeploy(SHA, [
    run('test-frontend', 'completed', 'failure', '2026-10-09T00:10:00Z'),
    run('test-frontend', 'completed', 'success', '2026-10-09T01:00:00Z'),
    run('perf', 'completed', 'success', '2026-10-09T00:59:00Z'),
  ], reasons);
  record('P5 run le plus récent par nom commande => éligible', Array.isArray(proofs) && reasons.length === 0);
}

// P6 — attestation PRÉSENTE mais corrompue => REFUS dur, aucun repli predeploy
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'predeploy-gate-'));
  try {
    const g = (a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' });
    g(['init', '-q', '-b', 'main']); g(['config', 'user.email', 'f@t']); g(['config', 'user.name', 'f']); g(['config', 'commit.gpgsign', 'false']);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'app.js'), 'v1\n');
    g(['add', '-A']); g(['commit', '-q', '--no-verify', '-m', 'product v1']);
    const P = g(['rev-parse', 'HEAD']).trim();
    // Attestation volée d'un AUTRE commit (hash des preuves incohérent)
    const dir = path.join(root, '.ai', 'certification', 'attestations');
    fs.mkdirSync(dir, { recursive: true });
    const evAbs = path.join(root, '.ai', 'certification', 'ev.txt');
    fs.writeFileSync(evAbs, `sealed commit: ${P}\n`, 'utf8');
    const wrongHash = crypto.createHash('sha256').update('autre contenu').digest('hex');
    const att = {
      version: 2, target: P, createdAt: new Date().toISOString(),
      certifications: {
        TECHNICAL: { status: 'PASS', commit: P, certifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 864e5).toISOString(), evidence: [{ path: '.ai/certification/ev.txt', sha256: wrongHash }] },
        PRODUCTION: { status: 'PASS', commit: P, certifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 864e5).toISOString(), paymentMode: 'live', evidence: [{ path: '.ai/certification/ev.txt', sha256: wrongHash }] },
        BUSINESS: { status: 'PASS', commit: P, certifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 864e5).toISOString(), observationPeriod: { from: new Date(Date.now() - 20 * 864e5).toISOString(), to: new Date(Date.now() - 864e5).toISOString() }, attributedToCommit: P, evidence: [{ path: '.ai/certification/ev.txt', sha256: wrongHash }] },
      },
    };
    fs.writeFileSync(path.join(dir, `${P}.json`), JSON.stringify(att), 'utf8');
    g(['add', '-A']); g(['commit', '-q', '--no-verify', '-m', 'attestation corrompue']);
    const r = evaluateDeploy({ root });
    record('P6 attestation corrompue => REFUS dur (pas de repli predeploy)',
      r.exit === 1 && r.decision === 'REFUSE' && r.reasons.some(x => /présente mais invalide/.test(x)) && !r.reasons.some(x => /predeploy: éligible/.test(x)),
      `decision=${r.decision}`);
  } finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }
}

// P7 — fixture git JAMAIS poussée (checks invérifiables) => REFUS (fail-closed)
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'predeploy-offline-'));
  try {
    const g = (a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' });
    g(['init', '-q', '-b', 'main']); g(['config', 'user.email', 'f@t']); g(['config', 'user.name', 'f']); g(['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(root, 'app.js'), 'v1\n');
    g(['add', '-A']); g(['commit', '-q', '--no-verify', '-m', 'local only']);
    const r = evaluateDeploy({ root });
    record('P7 commit non vérifiable via API => REFUS (le hors-ligne ne vaut PAS autorisation)',
      r.exit === 1 && r.decision === 'REFUSE' && r.reasons.some(x => /non vérifiables|jamais exécuté|indisponible/.test(x)),
      `decision=${r.decision} stage=${r.stage}`);
  } finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }
}

// P8 — post-deploy-verify calcule un stade FAILED sur domaine injoignable
{
  const { verifyDomain } = require(path.join(REPO, 'scripts', 'autopilot', 'post-deploy-verify.cjs'));
  const res = verifyDomain({ id: 'mq', domain: 'invalid.invalid.127-0-0-1.example', ga4: null }, { sosTest: false });
  record('P8 domaine injoignable => stade FAILED (jamais VERIFIED simulé)', res.stage === 'FAILED' && res.checks.http_accessible.status === 'FAILED');
}

console.log(`\n${count - failures}/${count} scénarios conformes`);
process.exit(failures ? 1 : 0);
