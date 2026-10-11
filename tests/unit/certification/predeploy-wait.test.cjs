#!/usr/bin/env node
/**
 * predeploy-wait.test.cjs — Mission P0 : les deux côtés du verrou.
 *
 * La gate tournait dans la même vague que les checks requis : verdict
 * instantané => `in_progress` => REFUS à jamais (aucun retry) alors que tout
 * finissait vert — livraison bloquée. Correctif : attente bornée (--wait-ms).
 *
 * Scénarios (fixtures git isolées en %TEMP%, injection fetch — zéro réseau,
 * zéro mock de preuve métier, aucune preuve réelle touchée) :
 *   W1 release techniquement invalide (check rouge) => REFUS deploy
 *   W2 release techniquement valide => PREDEPLOY_ELIGIBLE SANS prétendre que
 *      PRODUCTION/BUSINESS sont prouvés (NOT_PROVEN explicites, global != PASS)
 *   W3 preuve de production absente => GLOBAL reste NOT_PROVEN (jamais PASS)
 *   W4 échec post-déploiement (PRODUCTION FAIL) => GLOBAL FAIL, jamais PASS
 *   W5 in_progress puis vert => l'attente débloque (ALLOW) — la course est résolue
 *   W6 in_progress perpétuel + timeout court => REFUS fail-closed
 *   W7 commit touchant les paiements => paymentSensitive:true + rollback ;
 *      commit neutre => paymentSensitive:false (informatif, jamais bloquant)
 *   W8 échec immédiat => refus SANS attendre (sleep jamais appelé)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHECKER = require(path.join(REPO, 'scripts', 'CHECK_certification_status.cjs'));
const { evaluateDeploy, waitForChecks, paymentSensitiveInfo } = CHECKER;

let failures = 0;
let count = 0;
function record(name, ok, extra) {
  count++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}
const SHA = 'c'.repeat(40);
const run = (name, status, conclusion, completedAt) => ({ name, status, conclusion, completed_at: completedAt, html_url: 'https://example.invalid/run' });
const GREEN = [
  run('test-frontend', 'completed', 'success', '2026-10-10T01:00:00Z'),
  run('perf', 'completed', 'success', '2026-10-10T01:01:00Z'),
];
function makeGitRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-wait-'));
  const g = (a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'f@t']); g(['config', 'user.name', 'f']); g(['config', 'commit.gpgsign', 'false']);
  return { dir, g };
}
function gcommit(root, msg) {
  execFileSync('git', ['-C', root, 'add', '-A'], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'commit', '-q', '--no-verify', '-m', msg], { stdio: 'ignore' });
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

console.log('predeploy-wait : les deux côtés du verrou (mission P0)\n');

// W1 — release techniquement invalide => REFUS deploy (exit 1)
{
  const { dir } = makeGitRoot();
  try {
    fs.writeFileSync(path.join(dir, 'app.js'), 'v1\n');
    gcommit(dir, 'product v1');
    const bad = [run('test-frontend', 'completed', 'failure', '2026-10-10T01:00:00Z'), run('perf', 'completed', 'success', '2026-10-10T01:01:00Z')];
    const r = evaluateDeploy({ root: dir }, { fetchCheckRuns: () => bad });
    record('W1 check rouge => REFUS deploy (exit 1)', r.exit === 1 && r.decision === 'REFUSE', `decision=${r.decision}`);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// W2 — valide techniquement => PREDEPLOY_ELIGIBLE sans allégation commerciale
{
  const { dir } = makeGitRoot();
  try {
    fs.writeFileSync(path.join(dir, 'app.js'), 'v1\n');
    gcommit(dir, 'product v1');
    const r = evaluateDeploy({ root: dir }, { fetchCheckRuns: () => GREEN });
    const certs = r.certifications || {};
    record('W2 valide => PREDEPLOY_ELIGIBLE, PRODUCTION/BUSINESS NOT_PROVEN, global != PASS',
      r.exit === 0 && r.decision === 'ALLOW' && r.stage === 'PREDEPLOY_ELIGIBLE'
      && certs.TECHNICAL === 'PASS' && certs.PRODUCTION === 'NOT_PROVEN' && certs.BUSINESS === 'NOT_PROVEN'
      && r.global === 'PREDEPLOY_ELIGIBLE' && r.global !== 'PASS',
      `stage=${r.stage} global=${r.global}`);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// W3 — preuve de production absente => GLOBAL reste NOT_PROVEN (mode manifeste)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-w3-'));
  try {
    const m = {
      version: 1, controlledCommit: SHA,
      certifications: {
        TECHNICAL: { status: 'PASS', commit: SHA, certifiedAt: '2026-10-09T00:00:00Z', expiresAt: '2026-10-20T00:00:00Z', evidence: [] },
        BUSINESS: { status: 'NOT_PROVEN' },
      },
    };
    fs.mkdirSync(path.join(dir, '.ai', 'certification'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ai', 'certification', 'status.json'), JSON.stringify(m), 'utf8');
    const r = CHECKER.evaluate({ root: dir, commit: SHA, now: '2026-10-10T00:00:00Z' });
    record('W3 PRODUCTION absente => GLOBAL NOT_PROVEN (exit 1, jamais PASS)',
      r.exit === 1 && r.global === 'NOT_PROVEN' && r.global !== 'PASS', `global=${r.global}`);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// W4 — échec post-déploiement (PRODUCTION FAIL) => GLOBAL FAIL, jamais PASS
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-w4-'));
  try {
    const m = {
      version: 1, controlledCommit: SHA,
      certifications: {
        TECHNICAL: { status: 'PASS', commit: SHA, certifiedAt: '2026-10-09T00:00:00Z', expiresAt: '2026-10-20T00:00:00Z', evidence: [] },
        PRODUCTION: { status: 'FAIL' },
        BUSINESS: { status: 'NOT_PROVEN' },
      },
    };
    fs.mkdirSync(path.join(dir, '.ai', 'certification'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ai', 'certification', 'status.json'), JSON.stringify(m), 'utf8');
    const r = CHECKER.evaluate({ root: dir, commit: SHA, now: '2026-10-10T00:00:00Z' });
    record('W4 PRODUCTION FAIL => GLOBAL FAIL (certification finale empêchée)',
      r.exit === 1 && r.global === 'FAIL', `global=${r.global}`);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// W5 — in_progress puis vert => l'attente débloque (course résolue)
{
  const seq = [
    [run('test-frontend', 'in_progress', null, null), run('perf', 'in_progress', null, null)],
    [run('test-frontend', 'completed', 'success', '2026-10-10T01:00:00Z'), run('perf', 'in_progress', null, null)],
    GREEN,
  ];
  let i = 0;
  const reasons = [];
  const w = waitForChecks(() => seq[Math.min(i++, seq.length - 1)], SHA, { timeoutMs: 5000, pollMs: 1, sleepFn: () => {} }, reasons);
  record('W5 in_progress→vert => prêt après attente (course résolue)',
    w.ready === true && Array.isArray(w.runs) && reasons.length === 0, ` waited=${w.waitedMs}ms`);
}

// W6 — in_progress perpétuel + timeout court => REFUS fail-closed
{
  const reasons = [];
  const w = waitForChecks(() => [run('test-frontend', 'in_progress', null, null)], SHA, { timeoutMs: 30, pollMs: 1, sleepFn: () => {} }, reasons);
  record('W6 timeout d\'attente => REFUS fail-closed (jamais ALLOW)',
    w.ready === false && reasons.some(x => /épuisée|fail-closed/.test(x)));
}

// W7 — sensibilité paiements : flag informatif, jamais bloquant
{
  const { dir, g } = makeGitRoot();
  try {
    fs.writeFileSync(path.join(dir, 'app.js'), 'v1\n');
    gcommit(dir, 'product: neutral base');
    fs.mkdirSync(path.join(dir, 'public', 'api'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'public', 'api', 'mollie.php'), "<?php // v1\n");
    const P1 = gcommit(dir, 'product: mollie endpoint');
    const s1 = paymentSensitiveInfo(dir, P1);
    fs.writeFileSync(path.join(dir, 'app.js'), 'v2 — évolution neutre\n');
    const P2 = gcommit(dir, 'product: neutral change');
    const s2 = paymentSensitiveInfo(dir, P2);
    record('W7a commit paiements => paymentSensitive:true + rollback',
      s1.paymentSensitive === true && typeof s1.rollback === 'string' && s1.rollback.includes(P1),
      `fichiers=${s1.paymentFiles.join(',')}`);
    record('W7b commit neutre => paymentSensitive:false',
      s2.paymentSensitive === false && s2.rollback === null);
    // Le flag ne bloque pas : release verte (HEAD = commit neutre P2) => ALLOW
    const r = evaluateDeploy({ root: dir }, { fetchCheckRuns: () => GREEN });
    record('W7c release verte => ALLOW avec paymentSensitive:false (flag informatif)',
      r.exit === 0 && r.decision === 'ALLOW' && r.paymentSensitive === false,
      `decision=${r.decision} sensible=${r.paymentSensitive}`);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// W8 — échec immédiat => refus SANS attendre (sleep jamais appelé)
{
  let sleeps = 0;
  const reasons = [];
  const seq = [[run('test-frontend', 'completed', 'failure', '2026-10-10T01:00:00Z'), run('perf', 'completed', 'success', '2026-10-10T01:01:00Z')]];
  const w = waitForChecks(() => seq[0], SHA, { timeoutMs: 5000, pollMs: 1, sleepFn: () => { sleeps++; } }, reasons);
  record('W8 échec immédiat => refus sans attente (0 sleep)',
    w.ready === false && sleeps === 0 && reasons.some(x => /refus immédiat/.test(x)), `sleeps=${sleeps}`);
}

console.log(`\n${count - failures}/${count} scénarios conformes`);
process.exit(failures ? 1 : 0);
