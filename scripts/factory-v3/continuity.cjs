#!/usr/bin/env node
'use strict';

/**
 * continuity.cjs — opérateur de continuité OpenCode pour Factory V3.
 *
 * Usage :
 *   node scripts/factory-v3/continuity.cjs --inspect [--limit 40]
 *   node scripts/factory-v3/continuity.cjs --status [--limit 20]
 *   node scripts/factory-v3/continuity.cjs --resume --session ses_x \
 *        [--dir <repo>] [--model <ref>] [--mission <texte>] \
 *        [--candidate <ref> ...] [--error-file <f>] [--dry-run]
 *
 * Ce CLI n'est PAS un orchestrateur : il exécute UNE opération de continuité
 * (détecter → lire → classifier → choisir → reprendre → vérifier) et journalise
 * le résultat. La boucle de jobs reste `run.cjs`.
 *
 * Codes de sortie : 0 succès · 1 erreur · 2 rien à faire (aucune session bloquée)
 *                   3 reprise non vérifiée · 4 verrou occupé
 */

const fs = require('fs');
const path = require('path');

const continuity = require('./lib/continuity.cjs');
const { readSessionsCli } = require('./session-registry.cjs');
const { loadConfig } = require('./run.cjs');

const STATE_DIR_DEFAULT = path.resolve(__dirname, 'state');

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
function argValues(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const stateDir = path.resolve(argValue('--state') || STATE_DIR_DEFAULT);
  const limit = Math.max(1, Number(argValue('--limit', '40')) || 40);

  if (hasFlag('--help') || (!hasFlag('--inspect') && !hasFlag('--status') && !hasFlag('--resume'))) {
    console.log([
      'Usage:',
      '  continuity.cjs --inspect [--limit n] [--state dir]',
      '  continuity.cjs --status  [--limit n] [--state dir]',
      '  continuity.cjs --resume --session ses_x [--dir repo] [--model ref] [--mission txt]',
      '                 [--candidate ref ...] [--error-file f] [--dry-run] [--state dir]',
      '',
      'Le CLI exécute UNE opération de continuité. La boucle de jobs reste run.cjs.',
    ].join('\n'));
    return 1;
  }

  if (hasFlag('--inspect')) {
    const sessions = readSessionsCli(limit);
    if (!Array.isArray(sessions)) {
      print({ ok: false, error: sessions && sessions.error ? sessions.error : 'SESSIONS_UNREADABLE' });
      return 1;
    }
    const stuck = continuity.detectStuckSessions({ sessions, nowMs: Date.now() });
    print({
      ok: true,
      sessionsTotal: sessions.length,
      stuckTotal: stuck.length,
      stuck,
      note: 'Lecture seule : aucune session n\'est modifiée par --inspect.',
    });
    return stuck.length ? 0 : 2;
  }

  if (hasFlag('--status')) {
    const journal = continuity.readContinuityJournal(stateDir, limit);
    const paths = continuity.continuityPaths(stateDir);
    let checkpoints = [];
    try {
      checkpoints = fs.readdirSync(paths.checkpoints).map((f) => {
        const data = continuity.loadCheckpoint(stateDir, f.replace(/\.json$/, ''));
        return data;
      }).filter(Boolean);
    } catch (_) { checkpoints = []; }
    print({
      ok: true,
      journalFile: paths.journal,
      journalEntries: journal.length,
      journal,
      checkpoints,
    });
    return 0;
  }

  // --resume
  const sessionId = argValue('--session');
  if (!sessionId) {
    print({ ok: false, error: 'CONTINUITY_SESSION_REQUIRED' });
    return 1;
  }

  const sessions = readSessionsCli(Math.max(limit, 100));
  const session = Array.isArray(sessions)
    ? sessions.find((s) => s && (s.id === sessionId || s.sessionID === sessionId)) || null
    : null;
  if (!session) {
    print({ ok: false, error: 'SESSION_NOT_FOUND', sessionId });
    return 1;
  }

  const cfg = loadConfig(stateDir);
  const candidates = argValues('--candidate').length
    ? argValues('--candidate')
    : (Array.isArray(cfg.models) ? cfg.models : []);

  let errorText = '';
  const errorFile = argValue('--error-file');
  if (errorFile && fs.existsSync(errorFile)) {
    errorText = fs.readFileSync(errorFile, 'utf8');
  } else {
    const journal = continuity.readContinuityJournal(stateDir, 200);
    const last = [...journal].reverse().find((e) => e.sessionId === sessionId && e.category);
    if (last) errorText = `${last.category || ''} ${last.reason || ''}`.trim();
  }

  const report = await continuity.runContinuity({
    stateDir,
    session,
    repoDir: path.resolve(argValue('--dir') || session.directory || process.cwd()),
    mission: argValue('--mission') || (session.title || ''),
    candidates,
    modelRef: argValue('--model'),
    errorText,
    opencodeBin: argValue('--opencode-bin'),
    dryRun: hasFlag('--dry-run'),
  });

  print({ ok: report.verified || report.steps.some((s) => s.step === 'dry_run' && s.ok), report });

  if (report.error === 'CONTINUITY_LOCK_BUSY') return 4;
  if (report.error) return 1;
  if (!report.verified) return 3;
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error(`CONTINUITY_FAILED: ${String(error && error.message || error)}`);
      process.exitCode = 1;
    });
}

module.exports = { main };
