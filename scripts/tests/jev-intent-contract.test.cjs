#!/usr/bin/env node
/**
 * jev-intent-contract — garde-fous de l'intégration TypeSafe/Jev.
 * Objectif business : routeur d'intention (recherche landing sans résultat) sans
 * JAMAIS exposer la clé, bloquer l'UX, ou toucher au money-path.
 * Règles vérifiées statiquement (pattern scripts/tests/*) :
 */
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..')

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓', label) } else { fail++; console.log('  ✗ FAIL:', label) } }

const php = fs.readFileSync(path.join(ROOT, 'public/api/jev-intent.php'), 'utf8')
const lib = fs.readFileSync(path.join(ROOT, 'src/lib/jev-intent.js'), 'utf8')
const app = fs.readFileSync(path.join(ROOT, 'src/Sargasses_PROD.jsx'), 'utf8')
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')

console.log('— Endpoint serveur (clé jamais front) —')
ok(php.includes("getenv('TYPESAFE_API_KEY')"), 'clé lue depuis env serveur')
ok(php.includes('typesafe-config.php'), 'fallback config fichier locale')
ok(gi.includes('**/typesafe-config.php'), 'typesafe-config.php gitignoré')
ok(!php.includes('error_log') || !/error_log\(.*\$text/.test(php), 'aucun log du texte utilisateur')
ok(!/api_key[^=]*=.*'[A-Za-z0-9]{16,}'/.test(php), 'aucune clé en dur dans jev-intent.php')

console.log('— Garde-fous —')
ok(/CURLOPT_TIMEOUT\s*=>\s*4/.test(php), 'timeout dur ≤ 4 s')
ok(php.includes("'off'") && php.includes('mode'), 'kill switch serveur présent')
ok(php.includes('sg_rate_limit'), 'rate limit actif')
ok(php.split('jev_fallback()').length > 4, 'fallback sur tous les chemins d’échec (>4 sorties)')
ok(php.includes('365') === false && php.includes('Access-Control-Allow-Origin'), 'CORS déclaré')

console.log('— Question Jev (pas de money-path) —')
ok(!/price|amount|cents|payment|mollie/i.test(php.split('questions')[1] || ''), 'aucun mot money-path dans la question Jev')
ok(php.includes("'type' => 'choice'"), 'primitive Choice utilisée')
ok((php.match(/'\w+'\s*=>/g) || []).some((m) => m.includes('trip_planning')), 'intention trip_planning classable')

console.log('— Client —')
ok(lib.includes('jev=0'), 'kill switch client ?jev=0')
ok(lib.includes('4500') || lib.includes('4,5'), 'timeout client ~4,5 s')
ok(lib.includes('{ fallback: true }'), 'fallback client partout')
ok(app.includes('import { askJevIntent, jevEnabled } from "./lib/jev-intent.js"'), 'lib importée')
ok(app.includes('JevAsk'), 'composant JevAsk présent')
ok(app.includes('"sg_jev_intent_ask"') && app.includes('"sg_jev_intent"') && app.includes('"sg_jev_intent_fallback"'), 'events dans SG_FUNNEL_EVENTS')
ok(app.includes("track(\"sg_jev_intent\""), 'sg_jev_intent émis au routage')
ok(app.includes('nq.length>=6&&list.length===0'), 'déclenché UNIQUEMENT quand recherche déterministe échoue')

console.log(`\n${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
