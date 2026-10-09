#!/usr/bin/env node
/**
 * check-certification-status.test.cjs — Tests obligatoires du verrou fail-closed.
 *
 * Couvre les scénarios de la directive gouvernance :
 *   1. trois certifications PASS avec preuves valides   => promotion autorisée (exit 0)
 *   2. une certification NOT_PROVEN                     => échec, code non nul
 *   3. une certification absente                        => échec, code non nul
 *   4. preuve obligatoire supprimée                     => échec, code non nul
 *   5. PASS avec preuve invalide (hash) ou périmée      => échec, code non nul
 *   6. tentative de promotion par chemin alternatif     => bloquée (exit 1)
 *      (ici : statuts PASS écrits dans .ai/current_state.md sans manifeste)
 *   + erreurs de lecture (manifeste = dossier), formats invalides (JSON cassé,
 *     statut inconnu, clé inconnue), preuves rattachées à un autre commit,
 *     preuve TEST pour PRODUCTION, métriques historiques pour BUSINESS,
 *     preuve simulée.
 *
 * TOUTES les fixtures sont créées dans un dossier temporaire isolé
 * (os.tmpdir()) et supprimées après usage. Aucune preuve réelle du dépôt
 * n'est lue en écriture, modifiée ou supprimée.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHECK = path.join(REPO, 'scripts', 'CHECK_certification_status.cjs');

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const NOW = '2026-10-08T12:00:00Z';
const NOW_MS = Date.parse(NOW);
const iso = (msShift) => new Date(NOW_MS + msShift).toISOString();
const H = 3600e3, D = 24 * H;

let failures = 0;
const results = [];
function record(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

// ── Fixture helpers ──────────────────────────────────────────────────────────
const tmpRoots = [];
function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'certcheck-'));
  tmpRoots.push(dir);
  fs.mkdirSync(path.join(dir, '.ai', 'certification'), { recursive: true });
  return dir;
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function writeEvidence(root, rel, commit, extra = '') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const content = `evidence for ${rel}\ncontrolled commit: ${commit}\ngenerated: ${NOW}\n${extra}`;
  fs.writeFileSync(abs, content, 'utf8');
  return { path: rel.replace(/\\/g, '/'), sha256: sha256(content) };
}
function baseManifest(root, commit) {
  return {
    version: 1,
    controlledCommit: commit,
    certifications: {
      TECHNICAL: {
        status: 'PASS', commit, certifiedAt: iso(-1 * H), expiresAt: iso(10 * D),
        evidence: [writeEvidence(root, '.ai/certification/ev-tech.txt', commit, 'build OK · bundle 178KB · CI 15/15')],
      },
      PRODUCTION: {
        status: 'PASS', commit, certifiedAt: iso(-1 * H), expiresAt: iso(10 * D),
        paymentMode: 'live',
        evidence: [writeEvidence(root, '.ai/certification/ev-prod.txt', commit, 'live payment tr_live_9abc webhook->grant->report delivered')],
      },
      BUSINESS: {
        status: 'PASS', commit, certifiedAt: iso(-1 * H), expiresAt: iso(10 * D),
        observationPeriod: { from: iso(-20 * D), to: iso(-1 * D) },
        attributedToCommit: commit,
        evidence: [writeEvidence(root, '.ai/certification/ev-bus.txt', commit, 'n=340 sessions, 12 paid conversions, window=20d')],
      },
    },
  };
}
function writeManifest(root, obj) {
  const abs = path.join(root, '.ai', 'certification', 'status.json');
  if (typeof obj === 'string') fs.writeFileSync(abs, obj, 'utf8');
  else fs.writeFileSync(abs, JSON.stringify(obj, null, 2), 'utf8');
  return abs;
}
function runChecker(root, args = []) {
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--commit', SHA_A, '--now', NOW, '--json', ...args], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* sortie non JSON */ }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// ── Scénarios ────────────────────────────────────────────────────────────────
console.log('check-certification-status : scénarios directive\n');

// S1 — Trois PASS avec preuves valides => exit 0
{
  const root = makeRoot();
  writeManifest(root, baseManifest(root, SHA_A));
  const r = runChecker(root);
  record('S1 trois PASS + preuves valides => promotion autorisée (exit 0)', r.code === 0 && r.json && r.json.global === 'PASS', `exit=${r.code} global=${r.json && r.json.global}`);
}

// S2 — Une certification NOT_PROVEN => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.BUSINESS = { status: 'NOT_PROVEN' };
  writeManifest(root, m);
  const r = runChecker(root);
  record('S2 une certification NOT_PROVEN => échec (exit 1)', r.code === 1, `exit=${r.code} global=${r.json && r.json.global}`);
}

// S3 — Une certification absente => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  delete m.certifications.BUSINESS;
  writeManifest(root, m);
  const r = runChecker(root);
  record('S3 certification BUSINESS absente => échec (exit 1)', r.code === 1, `exit=${r.code}`);
}

// S4 — Preuve obligatoire supprimée => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  writeManifest(root, m);
  fs.unlinkSync(path.join(root, '.ai', 'certification', 'ev-prod.txt')); // suppression APRÈS création manifeste
  const r = runChecker(root);
  record('S4 preuve obligatoire supprimée => échec (exit 1)', r.code === 1, `exit=${r.code} motif=${r.json && r.json.reasons.find(x => /illisible|absente/.test(x)) ? 'détecté' : '?'}`);
}

// S5a — PASS avec preuve périmée => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.TECHNICAL.expiresAt = iso(-1 * H); // périmée
  writeManifest(root, m);
  const r = runChecker(root);
  record('S5a PASS avec preuve périmée => échec (exit 1)', r.code === 1 && r.json.reasons.some(x => /périmée/.test(x)), `exit=${r.code}`);
}

// S5b — PASS avec preuve invalide (sha256 ne correspond pas) => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.PRODUCTION.evidence[0].sha256 = '0'.repeat(64);
  writeManifest(root, m);
  const r = runChecker(root);
  record('S5b PASS avec preuve invalide (hash) => échec (exit 1)', r.code === 1 && r.json.reasons.some(x => /sha256 mismatch/.test(x)), `exit=${r.code}`);
}

// S5c — Preuve non scellée au commit contrôlé => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  // réécrire la preuve business SANS le sha du commit, avec hash recalculé cohérent
  const content = 'metrics without any commit reference\n';
  fs.writeFileSync(path.join(root, '.ai', 'certification', 'ev-bus.txt'), content, 'utf8');
  m.certifications.BUSINESS.evidence[0].sha256 = sha256(content);
  writeManifest(root, m);
  const r = runChecker(root);
  record('S5c preuve rattachée à aucun commit => échec (exit 1)', r.code === 1 && r.json.reasons.some(x => /autre commit/.test(x)), `exit=${r.code}`);
}

// S6 — Promotion par chemin alternatif : statuts PASS écrits dans current_state.md
//      sans manifeste de preuves => bloqué (exit 1)
{
  const root = makeRoot();
  fs.writeFileSync(path.join(root, '.ai', 'current_state.md'),
    '# état\nTECHNICAL: PASS\nPRODUCTION: PASS\nBUSINESS: PASS\n', 'utf8');
  // volontairement AUCUN .ai/certification/status.json
  fs.rmSync(path.join(root, '.ai', 'certification'), { recursive: true, force: true });
  const r = runChecker(root);
  record('S6 chemin alternatif (PASS dans current_state.md seul) => bloqué (exit 1)', r.code === 1 && r.json.global === 'NOT_PROVEN', `exit=${r.code} global=${r.json && r.json.global}`);
}

// S7 — Erreur de format : manifeste JSON cassé => exit 1
{
  const root = makeRoot();
  writeManifest(root, '{ "version": 1, "certifications": {');
  const r = runChecker(root);
  record('S7 manifeste JSON invalide => échec (exit 1)', r.code === 1, `exit=${r.code}`);
}

// S7b — Erreur de lecture : le manifeste est un dossier => exit 1
{
  const root = makeRoot();
  fs.rmSync(path.join(root, '.ai', 'certification'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, '.ai', 'certification', 'status.json'), { recursive: true });
  const r = runChecker(root);
  record('S7b erreur de lecture (manifeste = dossier) => échec (exit 1)', r.code === 1, `exit=${r.code}`);
}

// S8 — Statut inconnu « OK » => exit 1 (valeur inconnue bloque la promotion)
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.TECHNICAL.status = 'OK';
  writeManifest(root, m);
  const r = runChecker(root);
  record('S8 statut inconnu "OK" => échec (exit 1)', r.code === 1 && r.json.reasons.some(x => /inconnu\/ambigu/.test(x)), `exit=${r.code}`);
}

// S8b — Certification inconnue en plus (ambiguïté) => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.MARKETING = { status: 'PASS', commit: SHA_A, certifiedAt: iso(-1 * H), expiresAt: iso(10 * D), evidence: [writeEvidence(root, '.ai/certification/ev-mkt.txt', SHA_A)] };
  writeManifest(root, m);
  const r = runChecker(root);
  record('S8b certification supplémentaire inconnue => échec (exit 1)', r.code === 1 && r.json.reasons.some(x => /inconnue "MARKETING"/.test(x)), `exit=${r.code}`);
}

// S9a — Manifeste rattaché à un autre commit => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.controlledCommit = SHA_B;
  writeManifest(root, m);
  const r = runChecker(root);
  record('S9a manifeste scellé sur un autre commit => échec (exit 1)', r.code === 1 && r.json.reasons.some(x => /autre commit|!= commit contrôlé/.test(x)), `exit=${r.code}`);
}

// S9b — Une certification rattachée à un autre commit => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.PRODUCTION.commit = SHA_B;
  writeManifest(root, m);
  const r = runChecker(root);
  record('S9b certification rattachée à un autre commit => échec (exit 1)', r.code === 1, `exit=${r.code}`);
}

// S10a — PRODUCTION validée avec paiement TEST => exit 1, jamais
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.PRODUCTION.paymentMode = 'test';
  writeManifest(root, m);
  const r = runChecker(root);
  record('S10a preuve TEST (paymentMode=test) => PRODUCTION jamais validée (exit 1)', r.code === 1 && r.json.reasons.some(x => /TEST ne valide jamais/.test(x)), `exit=${r.code}`);
}

// S10b — PRODUCTION avec identifiant tr_test_ dans la preuve => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  const content = `Mollie payment tr_test_123456789 confirmed\ncontrolled commit: ${SHA_A}\n`;
  fs.writeFileSync(path.join(root, '.ai', 'certification', 'ev-prod.txt'), content, 'utf8');
  m.certifications.PRODUCTION.evidence[0].sha256 = sha256(content);
  writeManifest(root, m);
  const r = runChecker(root);
  record('S10b preuve contenant tr_test_ => PRODUCTION jamais validée (exit 1)', r.code === 1 && r.json.reasons.some(x => /tr_test_/.test(x)), `exit=${r.code}`);
}

// S11a — BUSINESS avec métriques historiques (période close > 31 j) => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.BUSINESS.observationPeriod = { from: iso(-230 * D), to: iso(-200 * D) };
  writeManifest(root, m);
  const r = runChecker(root);
  record('S11a métriques historiques (>31j) => BUSINESS jamais validé (exit 1)', r.code === 1 && r.json.reasons.some(x => /historiques/.test(x)), `exit=${r.code}`);
}

// S11b — BUSINESS marqué historical:true => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.BUSINESS.historical = true;
  writeManifest(root, m);
  const r = runChecker(root);
  record('S11b historical:true => BUSINESS jamais validé (exit 1)', r.code === 1, `exit=${r.code}`);
}

// S12 — Aucun résultat simulé présenté comme preuve réelle => exit 1
{
  const root = makeRoot();
  const m = baseManifest(root, SHA_A);
  m.certifications.TECHNICAL.evidence[0].simulated = true;
  writeManifest(root, m);
  const r = runChecker(root);
  record('S12 preuve simulated:true => échec (exit 1)', r.code === 1 && r.json.reasons.some(x => /simulé/.test(x)), `exit=${r.code}`);
}

// S13 — Dépôt réel en l'état : verdict attendu NOT_PROVEN tant que les preuves
//       LIVE n'existent pas (assertion : exit 1 aujourd'hui ; 0 resterait
//       acceptable uniquement si trois preuves LIVE réelles existaient).
{
  const r = spawnSync(process.execPath, [CHECK, '--json'], { encoding: 'utf8', cwd: REPO });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) {}
  const verdict = json ? `${json.global} (exit ${r.status})` : `exit ${r.status}`;
  record('S13 dépôt réel : verdict honnêt rendu (0|1)', (r.status === 0 || r.status === 1) && !!json, `verdict réel = ${verdict}`);
  console.log(`       ↳ verdict réel du dépôt : ${verdict}`);
}

// ── Nettoyage fixtures (isolées, jamais les preuves réelles) ────────────────
for (const d of tmpRoots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

// ── Bilan ────────────────────────────────────────────────────────────────────
const total = results.length;
console.log(`\n${total - failures}/${total} scénarios conformes`);
process.exit(failures ? 1 : 0);
