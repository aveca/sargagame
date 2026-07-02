#!/usr/bin/env node
/**
 * build-social-reservoir.cjs — Réservoir d'assets sociaux STAGÉS (jamais publiés).
 *
 * Génère les cartes honnêtes du jour (verdict / saga / wordle) pour chaque région
 * LIVE, les BANQUE dans une GitHub Release `social-reservoir` (⇒ zéro binaire
 * committé, pas de bloat d'historique git) et indexe chaque asset dans
 * scripts/automation/data/social-outbox.json avec l'état "staged".
 *
 * ⚠️ AUCUNE PUBLICATION ICI. Le lock social reste fermé jusqu'au valve manuel
 *    (release-from-outbox.cjs, workflow_dispatch, SARGA_DEPLOY_UNLOCK=1). Ce
 *    script ne passe JAMAIS SARGA_DEPLOY_UNLOCK aux générateurs → chemin
 *    image-only (gen-verdict-veilleur reste DEPLOY_LOCKED).
 *
 * Zéro IA (cartes = sharp/craft). Honnêteté gatée DANS chaque générateur :
 * exit(2) s'il n'y a pas de plage scorée / donnée fraîche → la carte est
 * SAUTÉE, jamais fabriquée. On ne banque que ce que la donnée réelle permet.
 *
 * Local (sans gh/token) : RESERVOIR_LOCAL=1 → génère + indexe, saute l'upload
 * Release (pour vérifier l'orchestration hors CI).
 *
 * Usage : node scripts/automation/build-social-reservoir.cjs
 * Env    : GH_TOKEN (CI, pour gh release), RESERVOIR_LOCAL=1 (skip upload)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;                         // scripts/automation
const ROOT = path.join(HERE, '..', '..');       // repo root
const OUT = path.join(HERE, 'share-cards', 'out');
const OUTBOX = path.join(HERE, 'data', 'social-outbox.json');
// ⚠️ Les générateurs de cartes (gen-*.cjs) ne connaissent que mq/gp aujourd'hui
// (« région inconnue: florida » sinon). Ajouter les clés USD DANS gen-*.cjs
// élargira le réservoir sans toucher ce wrapper (data-driven). Toute région ici
// dont le générateur sort exit≠0 est simplement SAUTÉE (jamais fabriquée).
const REGIONS = ['mq', 'gp'];
const TAG = 'social-reservoir';
const KEEP_DAYS = 30;
const LOCAL = process.env.RESERVOIR_LOCAL === '1';
const today = new Date().toISOString().slice(0, 10);

const GENS = [
  { type: 'verdict', script: 'gen-verdict-veilleur.cjs' },
  { type: 'saga', script: 'gen-saga-card.cjs' },
  { type: 'wordle', script: 'gen-beach-wordle.cjs' },
];

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

fs.mkdirSync(OUT, { recursive: true });

// 1) GÉNÉRATION — image-only, honnêteté gatée par chaque générateur (exit≠0 = skip).
let skipped = 0;
for (const region of REGIONS) {
  for (const g of GENS) {
    const r = sh('node', [path.join(HERE, g.script), `--region=${region}`]);
    if (r.status !== 0) {
      skipped++;
      console.log(`· skip ${g.type}/${region} (exit ${r.status === null ? 'signal' : r.status}) — honnêteté (exit 2), donnée absente ou région non supportée`);
    }
  }
}

// 2) COLLECTE — les cartes du jour dans out/ (nommées <type>-<region>-<date>*.png).
const files = fs.existsSync(OUT)
  ? fs.readdirSync(OUT).filter(f => f.endsWith('.png') && f.includes(today))
  : [];
console.log(`Cartes générées aujourd'hui : ${files.length} (skipped ${skipped})`);

// 3) SINK — GitHub Release (binaires hors git). Idempotent via --clobber.
if (!LOCAL && files.length) {
  const exists = sh('gh', ['release', 'view', TAG]).status === 0;
  if (!exists) {
    sh('gh', ['release', 'create', TAG,
      '--title', 'Réservoir social (stagé, non publié)',
      '--notes', 'Assets sociaux stagés générés quotidiennement. STAGÉS uniquement — la publication passe par le valve manuel (release-from-outbox).']);
  }
  const up = sh('gh', ['release', 'upload', TAG, ...files.map(f => path.join(OUT, f)), '--clobber']);
  if (up.status !== 0) console.log('⚠️ gh release upload a échoué :', (up.stderr || '').slice(0, 300));
  else console.log(`↑ ${files.length} assets uploadés sur la Release ${TAG}`);
} else if (LOCAL) {
  console.log('RESERVOIR_LOCAL=1 → upload Release sauté (vérif locale).');
}

// 4) INDEX — social-outbox.json (état "staged"), dédup par id, prune > KEEP_DAYS.
let outbox = [];
try { outbox = JSON.parse(fs.readFileSync(OUTBOX, 'utf8')); } catch { outbox = []; }
if (!Array.isArray(outbox)) outbox = [];
const seen = new Set(outbox.map(e => e.id));
let added = 0;
for (const f of files) {
  const id = `${today}/${f}`;
  if (seen.has(id)) continue;
  const parts = f.replace(/\.png$/, '').split('-');
  const type = parts[0];
  const region = parts[1];
  outbox.push({ id, date: today, region, type, asset: f, releaseTag: TAG, state: 'staged', createdAt: today });
  seen.add(id);
  added++;
}
// prune : jette les entrées > KEEP_DAYS
const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
const before = outbox.length;
outbox = outbox.filter(e => (e.date || '9999') >= cutoff);
outbox.sort((a, b) => (a.id < b.id ? -1 : 1));
fs.writeFileSync(OUTBOX, JSON.stringify(outbox, null, 2) + '\n');
console.log(`Outbox : +${added} staged, prune ${before - outbox.length} (>${KEEP_DAYS}j), total ${outbox.length}.`);
