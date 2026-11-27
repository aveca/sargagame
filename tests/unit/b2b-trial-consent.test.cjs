#!/usr/bin/env node
'use strict'

/**
 * b2b-trial-consent.test.cjs — garde-fous du parcours d'essai B2B 30 jours.
 *
 * 1) FATAL PHP (2026-11-04) : public/api/b2b-trial.php appelait
 *    sg_analytics_event(), SUPPRIMÉE de mollie-lib.php par le commit 16eb15e12c.
 *    En PHP, l'appel d'une fonction inexistante est une Error FATALE — le `@` ne
 *    la supprime pas → l'endpoint d'essai renvoyait 500 AVANT de rendre le token :
 *    l'essai « instantané » n'était jamais activé et l'événement de funnel
 *    `b2b_trial_started` n'arrivait jamais. Ce test verrouille la présence de la
 *    fonction ET le filet function_exists() côté appelant.
 *
 * 2) CONSENTEMENT MARKETING : capture OPTIONNELLE, JAMAIS pré-cochée, stockée
 *    avec version + horodatage + source. Ce test verrouille qu'aucun envoi
 *    marketing n'est déclenché par l'endpoint (l'email de l'essai reste
 *    transactionnel) et que l'essai ne dépend PAS du consentement.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const trial = read('public/api/b2b-trial.php')
const lib = read('public/api/mollie-lib.php')
const modal = read('src/PremiumModal.jsx')

let failures = 0
function check(ok, label) {
  if (ok) console.log('  ok  ' + label)
  else { failures++; console.error('  FAIL ' + label) }
}

console.log('1. sg_analytics_event existe (sinon : fatal PHP)')
check(/function\s+sg_analytics_event\s*\(/.test(lib),
  'sg_analytics_event() est DÉFINIE dans public/api/mollie-lib.php')
check(/function_exists\('sg_analytics_event'\)/.test(trial),
  'b2b-trial.php appelle la télémétrie sous function_exists() (filet de sécurité)')
const telemetryCalls = (trial.match(/sg_analytics_event\('/g) || []).length
const telemetryGuards = (trial.match(/function_exists\('sg_analytics_event'\)/g) || []).length
check(telemetryCalls === telemetryGuards && telemetryCalls >= 1,
  'chaque appel à sg_analytics_event est gardé par function_exists()')
check(trial.indexOf("sg_analytics_event('b2b_trial_started'") < trial.lastIndexOf('echo json_encode'),
  'la télémétrie est émise AVANT la réponse JSON (le token part toujours)')

console.log('\n2. Consentement marketing : optionnel, jamais pré-coché')
check(/const \[mktConsent,setMktConsent\]=useState\(false\)/.test(modal),
  'l’état du consentement démarre à false (case non cochée)')
check(/type="checkbox"\s+checked=\{mktConsent\}/.test(modal),
  'la case est pilotée par l’état (contrôlée), jamais defaultChecked')
check(!/defaultChecked/.test(modal), 'aucun defaultChecked dans le module')
check(/marketingConsent:mktConsent\?1:0/.test(modal),
  'le front envoie le consentement (1/0) au endpoint d’essai')
check(!/disabled=\{[^}]*mktConsent/.test(modal),
  'l’essai n’est JAMAIS bloqué par l’absence de consentement marketing')
check(/marketingConsent/.test(trial) && /consent_v/.test(trial) && /consent_ts/.test(trial) && /consent_source/.test(trial),
  'le endpoint stocke version + horodatage + source du consentement')
check(/'consent'\s*=>\s*1/.test(trial),
  'l’opt-in explicite est tracé (événement b2b_marketing_consent)')
check(/\$marketingConsent\s*=\s*false/.test(trial),
  'le consentement vaut false par défaut côté serveur (jamais pré-coché)')

console.log('\n3. Aucun envoi marketing déclenché par cet endpoint')
const mailCalls = (trial.match(/@?mol_b2b_trial_email\(/g) || []).length
check(mailCalls === 1, 'un seul envoi d’email depuis l’endpoint : l’email TRANSACTIONNEL de l’essai')
check(!/\b(?:resend|sendgrid|mailgun|smtp|ses|sendmail)\w*\s*\(/i.test(trial),
  'aucun autre mécanisme d’envoi d’email dans l’endpoint')
check(!/campaign|newsletter|drip|broadcast/i.test(trial.replace(/newsletter\)\.|consent/g, '')),
  'aucune logique de campagne / newsletter dans l’endpoint')

// 4) WORKER PERSISTANT (`workers/sg-payments`) — le handler réellement routé
//    sur les 6 domaines live. Avant, il IGNORAIT `marketingConsent` : le
//    consentement collecté côté front était perdu. Il doit conserver
//    version + horodatage + source, et ne pas pré-cocher l'opt-in.
console.log('\n4. Consentement dans le worker persistant (sg-payments)')
const prodWorker = read('workers/sg-payments/index.js')
check(prodWorker.includes('const rawConsent = input.marketingConsent'),
  'sg-payments lit marketingConsent dans la requête')
check(/const marketingConsent = rawConsent === true \|\| rawConsent === 1 \|\| rawConsent === "1"/.test(prodWorker),
  'sg-payments normalise le consentement (booléen / 1 / "1") — jamais pré-coché')
check(/consent_v/.test(prodWorker) && /consent_ts/.test(prodWorker) && /consent_source/.test(prodWorker),
  'sg-payments conserve version + horodatage + source du consentement')
check(/b2b_marketing_consent/.test(prodWorker),
  'sg-payments trace l’opt-in explicite (événement analytics)')
check(!/marketingConsent\s*:\s*true/.test(prodWorker),
  'sg-payments ne force jamais le consentement à true')
check(!/waitUntil\(fetch\("https:\/\/script\.google\.com\/macros/.test(prodWorker),
  'sg-payments n’écrit plus le lead en fire-and-forget (l’accusé est attendu)')
check(/lead_not_persisted/.test(prodWorker),
  'sg-payments refuse (503) si le sink n’accuse pas l’enregistrement')

console.log('\nB2B_TRIAL_CONSENT_TESTS', failures === 0 ? 'PASS' : 'FAIL')
process.exit(failures ? 1 : 0)
