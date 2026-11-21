'use strict';

/**
 * factory-v3-continuity-stub.cjs — faux binaire `opencode` pour les tests de
 * continuité Factory V3 (processus réel, aucun réseau, aucun quota).
 *
 * Usage réel simulé :
 *   node factory-v3-continuity-stub.cjs run --dir <repo> -m <provider/model>
 *        --format json --print-logs --log-level INFO --title <t>
 *        [--session <ses_x>] <prompt>
 *
 * Comportement piloté par FACTORY_CONTINUITY_STUB_MODE :
 *   ok       → réponse texte + preuve modèle/fournisseur/session sur UNE ligne
 *   429      → erreur fournisseur HTTP 429 (quotas épuisés)
 *   mismatch → preuve portant un AUTRE modèle (la reprise doit être refusée)
 *
 * Journal des appels : FACTORY_CONTINUITY_STUB_LOG (JSONL).
 */

const fs = require('fs');

function argAfter(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const mode = process.env.FACTORY_CONTINUITY_STUB_MODE || 'ok';
const dir = argAfter('--dir');
const ref = argAfter('-m') || argAfter('--model');
const session = argAfter('--session');
const title = argAfter('--title');
const prompt = process.argv[process.argv.length - 1];

const slash = String(ref || 'provider/model').indexOf('/');
const providerID = slash >= 0 ? String(ref).slice(0, slash) : 'provider';
const modelID = slash >= 0 ? String(ref).slice(slash + 1) : String(ref || 'model');

try {
  const logFile = process.env.FACTORY_CONTINUITY_STUB_LOG;
  if (logFile) {
    fs.appendFileSync(logFile, `${JSON.stringify({
      ts: new Date().toISOString(), mode, dir, ref, providerID, modelID, session, title, prompt,
    })}\n`, 'utf8');
  }
} catch (_) { /* le journal du stub n'est jamais bloquant */ }

if (mode === '429') {
  process.stderr.write(
    'ERROR Provider request failed with HTTP 429: {"status":429,"title":"Too Many Requests"}\n'
    + 'providerID=nvidia modelID=nvidia/nemotron-3.5-super-vl-120b-a12b session.id=ses_stub_429\n'
  );
  process.stdout.write(`${JSON.stringify({ type: 'error', error: { name: 'AI_Error', status: 429, message: 'Too Many Requests' } })}\n`);
  process.exit(1);
}

if (mode === 'mismatch') {
  process.stderr.write('providerID=autre modelID=autre/modele session.id=ses_stub_mismatch\n');
  process.stdout.write(`${JSON.stringify({ type: 'text', text: 'REPRISE_OK' })}\n`);
  process.exit(0);
}

process.stderr.write(`providerID=${providerID} modelID=${modelID} session.id=${session || 'ses_stub'}\n`);
process.stdout.write(`${JSON.stringify({ type: 'text', text: 'REPRISE_OK' })}\n`);
process.stdout.write(`${JSON.stringify({ type: 'step_finish' })}\n`);
process.exit(0);
