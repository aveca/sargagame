#!/usr/bin/env node
/**
 * prune.cjs — pruning/rotation BORNÉE des artefacts volumineux de l'autopilot.
 *
 * Cible UNIQUEMENT :
 *  - `.ai/autopilot/runs/20*.md` (rapports de cycles horodatés) : garde les
 *    KEEP_RUN_FILES plus récents + TOUJOURS les fichiers plus jeunes que
 *    ACTIVE_GRACE_MS (jamais de suppression des traces d'un cycle actif).
 *  - `.ai/autopilot/runs/runner.log` et `runs/log.txt` : si > LOG_MAX_BYTES,
 *    conserve les derniers LOG_KEEP_BYTES (rotation par troncature du head).
 *
 * Ne touche JAMAIS : scheduler.json, queue.json, latest.md, config.json,
 * STOP, orchestrator.lock (+ .stale-*.json = preuves de reprise), ni aucun
 * autre fichier (allowlist stricte par nom/motif, jamais de glob large).
 *
 * Toujours exit 0 (non-fatal : appelé par les wrappers avant démarrage).
 * Seuils surchargeables par env pour les tests (SARGA_PRUNE_*).
 *
 * Usage : node scripts/autopilot/prune.cjs [--quiet] [apDir]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AP_DIR_DEFAULT = path.join(__dirname, '..', '..', '.ai', 'autopilot');

const KEEP_RUN_FILES = Number(process.env.SARGA_PRUNE_KEEP || 1000);
const ACTIVE_GRACE_MS = Number(process.env.SARGA_PRUNE_GRACE_MS || 2 * 60 * 60 * 1000); // 2 h
const LOG_MAX_BYTES = Number(process.env.SARGA_PRUNE_LOG_MAX || 8 * 1024 * 1024); // 8 Mo
const LOG_KEEP_BYTES = Number(process.env.SARGA_PRUNE_LOG_KEEP || 2 * 1024 * 1024); // 2 Mo

const REPORT_RE = /^20\d{2}-\d{2}-\d{2}-.*\.md$/; // rapports horodatés uniquement
const ROTATE_FILES = new Set(['runner.log', 'log.txt']);

function logFn(quiet) {
  return (m) => { if (!quiet) console.log('[prune] ' + m); };
}

function pruneReports(runsDir, log) {
  let entries;
  try { entries = fs.readdirSync(runsDir, { withFileTypes: true }); }
  catch (e) { log('runs/ illisible (' + e.message + ') — rien à faire'); return { kept: 0, deleted: 0 }; }
  const now = Date.now();
  const reports = [];
  for (const e of entries) {
    if (!e.isFile() || !REPORT_RE.test(e.name)) continue;
    let mtime = 0;
    try { mtime = fs.statSync(path.join(runsDir, e.name)).mtimeMs; }
    catch (_) { continue; }
    reports.push({ name: e.name, mtime });
  }
  reports.sort((a, b) => a.mtime - b.mtime); // plus ancien d'abord
  const excess = reports.length - KEEP_RUN_FILES;
  if (excess <= 0) { log(`rapports : ${reports.length} ≤ ${KEEP_RUN_FILES} — rien à supprimer`); return { kept: reports.length, deleted: 0 }; }
  let deleted = 0;
  for (let i = 0; i < excess; i++) {
    const r = reports[i];
    if (now - r.mtime < ACTIVE_GRACE_MS) continue; // cycle actif/récent : intouchable
    try { fs.unlinkSync(path.join(runsDir, r.name)); deleted++; }
    catch (e) { log(`suppression ignorée ${r.name} (${e.message})`); }
  }
  log(`rapports : ${reports.length} trouvés, ${deleted} supprimés (borne ${KEEP_RUN_FILES}, grâce ${Math.round(ACTIVE_GRACE_MS / 60000)} min)`);
  return { kept: reports.length - deleted, deleted };
}

function rotateLogs(runsDir, log) {
  const out = {};
  for (const f of ROTATE_FILES) {
    const p = path.join(runsDir, f);
    let size = -1;
    try { size = fs.statSync(p).size; }
    catch (_) { out[f] = 'absent'; continue; }
    if (size <= LOG_MAX_BYTES) { out[f] = `ok (${Math.round(size / 1024)} Ko)`; continue; }
    try {
      const fd = fs.openSync(p, 'r');
      const start = Math.max(0, size - LOG_KEEP_BYTES);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      // Coupe au premier saut de ligne pour ne pas laisser une ligne tronquée.
      let off = buf.indexOf(0x0a);
      const tail = off >= 0 ? buf.slice(off + 1) : buf;
      const tmp = p + '.prune.tmp';
      fs.writeFileSync(tmp, Buffer.concat([Buffer.from(`…[prune rotation ${new Date().toISOString()} — head tronqué]…\n`), tail]));
      fs.renameSync(tmp, p);
      out[f] = `rotated ${Math.round(size / 1024)} Ko → ${Math.round(fs.statSync(p).size / 1024)} Ko`;
    } catch (e) { out[f] = `échec rotation (${e.message}) — fichier préservé`; }
  }
  log('logs : ' + Object.entries(out).map(([k, v]) => `${k}=${v}`).join(' '));
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const log = logFn(quiet);
  const apDir = args.find(a => !a.startsWith('--')) || AP_DIR_DEFAULT;
  const runsDir = path.join(apDir, 'runs');
  const rep = pruneReports(runsDir, log);
  const rot = rotateLogs(runsDir, log);
  if (!quiet) console.log(`[prune] done kept=${rep.kept} deleted=${rep.deleted}`);
  return { reports: rep, logs: rot };
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.log('[prune] erreur non-fatale : ' + e.message); }
  process.exit(0); // TOUJOURS 0 — le pruning ne doit jamais bloquer un démarrage
}

module.exports = { pruneReports, rotateLogs, REPORT_RE };
