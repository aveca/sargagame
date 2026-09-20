#!/usr/bin/env node
'use strict'
/**
 * B2B Phase 2 — garde anti-activation accidentelle (contrat statique).
 *
 * Verrouille le périmètre de Phase 2 : l'importeur et le scoring ne doivent
 * JAMAIS contenir de chemin d'envoi/d'appel/paiement, ni de référence à la
 * couche outreach existante. 100 % local, aucune lecture de secret.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }

const importer = read('scripts/automation/sirene-mq-import.cjs')
const scoring = read('scripts/lib/b2b-scoring.cjs')
const sc = sireneClient()
function sireneClient() { return read('scripts/lib/sirene-client.cjs') }
const store = read('scripts/lib/b2b-store.cjs')

let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

const FORBIDDEN = [
  ['outreach_contacts', 'aucune référence à la file outreach'],
  ['resend', 'aucun provider email (Resend)'],
  ['email-send', 'aucun helper d\'envoi email'],
  ['nodemailer', 'aucun SMTP'],
  ['mollie', 'aucun paiement'],
  ['twilio', 'aucun provider vocal'],
  ['createCall', 'aucun appel vocal'],
]

for (const [name, src] of [
  ['sirene-mq-import.cjs', importer],
  ['sirene-client.cjs', sc],
  ['b2b-scoring.cjs', scoring],
]) {
  for (const [needle, why] of FORBIDDEN) {
    ok(!new RegExp(needle, 'i').test(src), `${name} : ${why} [${needle}]`)
  }
}

// store : tables autorisées UNIQUEMENT (couche B2B sales engine)
{
  const writes = [...store.matchAll(/upsert\('(\w+)'/g)].map((m) => m[1])
  const allowed = new Set(['companies', 'company_establishments', 'data_sources'])
  for (const t of writes) ok(allowed.has(t), `store n'écrit que Phase-1 tables (${t})`)
  ok(!/outreach_contacts|analytics_events|payment_grants/.test(store),
    'store : aucune table funnel/paiement/outreach')
}

// scoring : pureté totale
ok(!/require\(/.test(scoring), 'scoring : aucun require (module pur)')
ok(!/fetch|Date\.now|Math\.random|process\.env/.test(scoring), 'scoring : aucune I/O, horloge ou env')

// importeur : DRY par défaut + fail-closed
ok(importer.includes("execute: false"), 'importeur : DRY_RUN par défaut (execute=false)')
ok(/!args\.execute/.test(importer), 'importeur : bascule explicite --execute requise')
ok(/process\.exit\((1|2)\)/.test(importer), 'importeur : exits fail-closed présents')
ok(!/SIRENE_CONSUMER_KEY\s*=/.test(importer.replace(/process\.env\.SIRENE_CONSUMER_KEY/g, '')),
  'importeur : aucune clé SIRENE codée en dur')
ok(!/SUPABASE_SERVICE_KEY\s*=\s*['"]/.test(importer), 'importeur : aucune clé Supabase codée en dur')

// CI : aucun nouveau cron / endpoint lié à Phase 2
const wf = fs.readdirSync(path.join(ROOT, '.github', 'workflows'))
  .filter((f) => f.endsWith('.yml'))
  .map((f) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', f), 'utf8'))
  .join('\n')
ok(!/sirene-mq-import/.test(wf), 'aucun workflow ne lance l\'importeur (activation manuelle uniquement)')

console.log(failures === 0
  ? '\nB2B-PHASE2-GUARDS TESTS: ALL PASS'
  : `\nB2B-PHASE2-GUARDS TESTS: ${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
