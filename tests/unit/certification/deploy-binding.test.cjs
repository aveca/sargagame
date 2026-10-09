#!/usr/bin/env node
/**
 * deploy-binding.test.cjs — Contrôle B (certification avant déploiement) et
 * liaison preuve ↔ SHA produit effectif (autoréférence résolue).
 *
 * Mécanisme testé sur PLUSIEURS COMMITS DISTINCTS (vrais dépôts git en %TEMP%) :
 *   - le commit produit P est attesté par des commits ultérieurs ne touchant
 *     QUE .ai/certification/ (résolution de l'autoréférence) ;
 *   - tout nouveau commit produit Z non attesté => déploiement REFUSÉ (exit 1) ;
 *   - preuve altérée (hash), attestation forgée (nom != cible), commit mêlant
 *     code + attestation => REFUS ;
 *   - Contrôle A (--mode pr) : tolère NOT_PROVEN (réparation gouvernance
 *     mergeable), refuse toute valeur ambiguë ou attestation forgée ;
 *   - real entry points : manual-ftp-deploy.cjs s'arrête AVANT tout accès
 *     externe quand NOT_PROVEN ; gitops.enableAutoMerge lève CERTIFICATION_REFUSED
 *     avant tout appel gh ; les workflows référencent le gate AVANT le déploiement.
 *
 * Aucun accès réseau, aucune preuve réelle du dépôt modifiée.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHECK = path.join(REPO, 'scripts', 'CHECK_certification_status.cjs');

let failures = 0;
const results = [];
function record(name, ok, extra) {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

// ── Fixture git helpers ──────────────────────────────────────────────────────
const tmpRoots = [];
function makeGitRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-gate-'));
  tmpRoots.push(dir);
  const g = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'fixture@test.invalid']);
  g(['config', 'user.name', 'fixture']);
  g(['config', 'commit.gpgsign', 'false']);
  return dir;
}
function gcommit(root, msg) {
  execFileSync('git', ['-C', root, 'add', '-A'], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'commit', '-q', '--no-verify', '-m', msg], { stdio: 'ignore' });
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}
function writeCode(root, name, content) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', name), content, 'utf8');
}
function sha256file(abs) { return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'); }

/** Écrit une attestation v2 valide pour `target` (+ preuves) dans .ai/certification/attestations/. */
function writeAttestation(root, target, { businessToDaysAgo = 1, evidenceExtra = '' } = {}) {
  const now = Date.now(), H = 3600e3, D = 24 * H;
  const iso = (ms) => new Date(now + ms).toISOString();
  const dir = path.join(root, '.ai', 'certification');
  fs.mkdirSync(dir, { recursive: true });
  const evs = [];
  for (const [name, extra] of [['tech', 'build+budget+ci'], ['prod', 'live payment tr_live_ok'], ['bus', 'cohort metrics']]) {
    const rel = `.ai/certification/ev-${name}-${target.slice(0, 8)}.txt`;
    const abs = path.join(root, rel);
    fs.writeFileSync(abs, `evidence ${name}\nsealed commit: ${target}\n${extra}\n${evidenceExtra}`, 'utf8');
    evs.push(rel);
  }
  const ev = (i) => ({ path: evs[i], sha256: sha256file(path.join(root, evs[i])) });
  const att = {
    version: 2, target, createdAt: iso(-1 * H), certifier: 'fixture',
    certifications: {
      TECHNICAL: { status: 'PASS', commit: target, certifiedAt: iso(-1 * H), expiresAt: iso(10 * D), evidence: [ev(0)] },
      PRODUCTION: { status: 'PASS', commit: target, certifiedAt: iso(-1 * H), expiresAt: iso(10 * D), paymentMode: 'live', evidence: [ev(1)] },
      BUSINESS: {
        status: 'PASS', commit: target, certifiedAt: iso(-1 * H), expiresAt: iso(10 * D),
        observationPeriod: { from: iso(-20 * D), to: iso(-businessToDaysAgo * D) },
        attributedToCommit: target, evidence: [ev(2)],
      },
    },
  };
  fs.mkdirSync(path.join(dir, 'attestations'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attestations', `${target}.json`), JSON.stringify(att, null, 2), 'utf8');
  return att;
}
function runCheck(root, mode) {
  const r = spawnSync(process.execPath, [CHECK, '--mode', mode, '--root', root, '--json'], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) {}
  return { code: r.status, out: r.stdout + (r.stderr || ''), json };
}

console.log('deploy-binding : liaison preuve↔SHA, contrôles A/B\n');

// ── D1 : commit produit sans attestation => REFUS ───────────────────────────
{
  const root = makeGitRoot();
  writeCode(root, 'app.js', 'v1\n');
  const P = gcommit(root, 'product v1');
  const r = runCheck(root, 'deploy');
  record('D1 commit produit sans attestation => REFUS (exit 1)', r.code === 1 && r.json && r.json.productCommit === P, `exit=${r.code} produit=${r.json && (r.json.productCommit || '').slice(0, 8)}`);
}

// ── D2 : attestation portée par un commit ultérieur (autoréférence résolue) ──
let keepForD3D4 = null;
{
  const root = makeGitRoot();
  writeCode(root, 'app.js', 'v1\n');
  const P = gcommit(root, 'product v1');
  writeAttestation(root, P);
  gcommit(root, 'cert: attestation for product v1'); // ne touche QUE .ai/certification/
  const r = runCheck(root, 'deploy');
  record('D2 attestation du commit produit via commit ultérieur => AUTORISÉ (exit 0)', r.code === 0 && r.json.global === 'PASS' && r.json.productCommit === P, `exit=${r.code} global=${r.json && r.json.global}`);
  keepForD3D4 = { root, P };
}

// ── D3 : 2e commit attestation-only en plus => toujours AUTORISÉ ─────────────
{
  const { root } = keepForD3D4;
  fs.writeFileSync(path.join(root, '.ai', 'certification', 'status.json'), JSON.stringify({ version: 1, controlledCommit: keepForD3D4.P, certifications: { TECHNICAL: { status: 'NOT_PROVEN' }, PRODUCTION: { status: 'NOT_PROVEN' }, BUSINESS: { status: 'NOT_PROVEN' } } }, null, 2), 'utf8');
  gcommit(root, 'cert: rollup update');
  const r = runCheck(root, 'deploy');
  record('D3 empilement de commits attestation-only => commit produit toujours résolu (exit 0)', r.code === 0, `exit=${r.code}`);
}

// ── D4 : NOUVEAU commit produit non attesté => REFUS (preuve ≠ SHA cible) ────
{
  const { root } = keepForD3D4;
  writeCode(root, 'app.js', 'v2 — modification produit\n');
  const Z = gcommit(root, 'product v2 (non certifié)');
  const r = runCheck(root, 'deploy');
  const refused = r.code === 1 && r.json && r.json.productCommit === Z;
  record('D4 nouveau commit produit sans attestation => REFUS (exit 1)', refused, `exit=${r.code} produit=${r.json && (r.json.productCommit || '').slice(0, 8)}`);

  // ── D5 : certification de Z sur un 3e commit distinct => AUTORISÉ ──────────
  writeAttestation(root, Z);
  gcommit(root, 'cert: attestation for product v2');
  const r2 = runCheck(root, 'deploy');
  record('D5 certification du 2e commit produit => AUTORISÉ (exit 0)', r2.code === 0 && r2.json.productCommit === Z, `exit=${r2.code}`);

  // ── D6 : preuve altérée (hash mismatch) => REFUS ───────────────────────────
  fs.appendFileSync(path.join(root, '.ai', 'certification', `ev-tech-${Z.slice(0, 8)}.txt`), 'tampered\n');
  gcommit(root, 'cert: (tamper evidence)');
  const r3 = runCheck(root, 'deploy');
  record('D6 preuve altérée (sha256 mismatch) => REFUS (exit 1)', r3.code === 1 && r3.json.reasons.some(x => /sha256 mismatch/.test(x)), `exit=${r3.code}`);
}

// ── D7 : attestation forgée (nom de fichier != target) => REFUS partout ──────
{
  const root = makeGitRoot();
  writeCode(root, 'app.js', 'v1\n');
  const P = gcommit(root, 'product v1');
  const att = writeAttestation(root, P);
  // forgery : le fichier prétend attester P mais son target pointe ailleurs
  att.target = 'f'.repeat(40);
  fs.writeFileSync(path.join(root, '.ai', 'certification', 'attestations', `${P}.json`), JSON.stringify(att, null, 2), 'utf8');
  gcommit(root, 'cert: forged');
  const rd = runCheck(root, 'deploy');
  const rp = runCheck(root, 'pr');
  record('D7a attestation forgée => REFUS deploy (exit 1)', rd.code === 1, `exit=${rd.code}`);
  record('D7b attestation forgée => REFUS pr (exit 1)', rp.code === 1 && rp.json.reasons.some(x => /forgée|!= nom/.test(x)), `exit=${rp.code}`);
}

// ── D8 : commit mêlant code + attestation => REFUS (fail-closed) ─────────────
{
  const root = makeGitRoot();
  writeCode(root, 'app.js', 'v1\n');
  const P = gcommit(root, 'product v1');
  writeAttestation(root, P);
  writeCode(root, 'app.js', 'v2\n');
  gcommit(root, 'MIXTE: code + attestation'); // tente de passer la certification avec du code
  const r = runCheck(root, 'deploy');
  record('D8 commit mêlant code+attestation => traité comme produit, REFUS (exit 1)', r.code === 1 && r.json && r.json.reasons.some(x => /attestation pour/.test(x)), `exit=${r.code}`);
}

// ── D9 : Contrôle A (pr) tolère NOT_PROVEN, refuse l'ambiguïté ───────────────
{
  const root = makeGitRoot();
  fs.mkdirSync(path.join(root, '.ai', 'certification'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ai', 'certification', 'status.json'),
    JSON.stringify({ version: 1, certifications: { TECHNICAL: { status: 'NOT_PROVEN' }, PRODUCTION: { status: 'NOT_PROVEN' }, BUSINESS: { status: 'NOT_PROVEN' } } }), 'utf8');
  gcommit(root, 'governance: declare NOT_PROVEN');
  const ok = runCheck(root, 'pr');
  record('D9a pr-mode : NOT_PROVEN toléré (réparation gouvernance mergeable) => exit 0', ok.code === 0, `exit=${ok.code}`);
  fs.writeFileSync(path.join(root, '.ai', 'certification', 'status.json'),
    JSON.stringify({ version: 1, certifications: { TECHNICAL: { status: 'GREEN' }, PRODUCTION: { status: 'NOT_PROVEN' }, BUSINESS: { status: 'NOT_PROVEN' } } }), 'utf8');
  gcommit(root, 'governance: ambiguous status');
  const ko = runCheck(root, 'pr');
  record('D9b pr-mode : statut "GREEN" inconnu => exit 1', ko.code === 1 && ko.json.reasons.some(x => /inconnu\/ambigu/.test(x)), `exit=${ko.code}`);
}

// ── D10 : vrai point d'entrée FTP — arrêt AVANT tout accès externe ───────────
{
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'manual-ftp-deploy.cjs')], { encoding: 'utf8', cwd: REPO, env: { ...process.env, FTP_HOST: '127.0.0.1', FTP_USER: 'x', FTP_PASS: 'x' }, timeout: 60000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const refused = r.status === 1 && /CERTIFICATION REFUSÉE/.test(out);
  const noFtp = !/connect|FTPS|Upload|STOR/i.test(out.replace(/CERTIFICATION REFUSÉE[^]*$/m, '')); // rien après le refus
  record('D10 manual-ftp-deploy.cjs (réel) : NOT_PROVEN => exit 1 AVANT toute connexion FTP', refused && noFtp, `exit=${r.status} en ${Date.now() - t0}ms`);
}

// ── D11 : câblage des workflows (gate AVANT déploiement) ─────────────────────
{
  const wf = (f) => fs.readFileSync(path.join(REPO, '.github', 'workflows', f), 'utf8');
  const cf = wf('cloudflare-production.yml');
  const cfOk = /certification-gate:[\s\S]*?--mode deploy/.test(cf)
    && /\n  deploy:\r?\n    needs: \[build, certification-gate\]/.test(cf)
    && /\n  deploy-pages:\r?\n    needs: \[build, certification-gate\]/.test(cf)
    && cf.indexOf('--mode deploy') < cf.indexOf('wrangler@latest deploy');
  record('D11a cloudflare-production.yml : job gate + needs deploy/deploy-pages', cfOk);

  for (const f of ['weekly-optimize.yml', 'weekly-seo-automation.yml', 'provision-barbados.yml']) {
    const t = wf(f);
    const gate = t.indexOf('Certification gate (deploy)');
    const deployStep = t.indexOf('node scripts/manual-ftp-deploy.cjs');
    record(`D11b ${f} : étape gate AVANT manual-ftp-deploy`, gate >= 0 && deployStep > gate);
  }
  const ci = wf('ci-tests.yml');
  record('D11c ci-tests.yml : Contrôle A (--mode pr) présent', /--mode pr/.test(ci));
}

// ── D12 : auto-merge orchestrateur verrouillé (avant tout appel gh) ──────────
{
  const gitops = require(path.join(REPO, 'scripts', 'autopilot', 'lib', 'gitops.cjs'));
  let threw = null;
  try { gitops.enableAutoMerge(REPO, 'https://github.com/aveca/sargagame/pull/0'); }
  catch (e) { threw = e; }
  record('D12 gitops.enableAutoMerge : CERTIFICATION_REFUSED avant tout gh pr merge', !!threw && threw.code === 'CERTIFICATION_REFUSED', threw ? `code=${threw.code}` : 'PAS DE REFUS — gate absent!');
}

// ── D13 : dépôt réel — verdicts honnêtes ─────────────────────────────────────
{
  const rd = runCheck(REPO, 'deploy');
  const rp = runCheck(REPO, 'pr');
  record('D13a dépôt réel : deploy => NOT_PROVEN (exit 1) tant que non attesté', rd.code === 1 && rd.json.global === 'NOT_PROVEN', `exit=${rd.code}`);
  record('D13b dépôt réel : pr => intégrité OK (exit 0)', rp.code === 0, `exit=${rp.code}`);
}

// ── Nettoyage + bilan ────────────────────────────────────────────────────────
for (const d of tmpRoots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
const total = results.length;
console.log(`\n${total - failures}/${total} scénarios conformes`);
process.exit(failures ? 1 : 0);
