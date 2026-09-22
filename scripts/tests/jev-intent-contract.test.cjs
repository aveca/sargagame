#!/usr/bin/env node
/**
 * jev-intent-contract — garde-fous de l'intégration TypeSafe/Jev (worker).
 * Règles vérifiées statiquement : secret server-side, fallback partout, timeout
 * dur, zéro money-path dans la question, kill-switch client, events funnel.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..')

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓', label) } else { fail++; console.log('  ✗ FAIL:', label) } }

const worker = fs.readFileSync(path.join(ROOT, 'workers/sg-payments/src/index.ts'), 'utf8')
const lib = fs.readFileSync(path.join(ROOT, 'src/lib/jev-intent.js'), 'utf8')
const app = fs.readFileSync(path.join(ROOT, 'src/Sargasses_PROD.jsx'), 'utf8')

console.log('— Worker serveur (secret jamais exposé) —')
ok(worker.includes("path === '/api/jev-intent'"), 'route /api/jev-intent enregistrée')
ok(worker.includes('env.TYPESAFE_API_KEY'), 'secret lu via env worker (jamais de valeur en dur)')
ok(worker.includes('TYPESAFE_API_KEY?: string'), 'entrée Env TS déclarée')
ok(!/Bearer '\s*\+\s*['"]/.test(worker), 'pas de clé en dur dans le handler')
ok(!/console\.(log|error)\([^)]*text/.test(worker), 'texte utilisateur jamais logué')

console.log('— Garde-fous —')
ok(worker.includes("'https://api.typesafe.ai/v1/systemone'"), 'endpoint TypeSafe v1 ciblé')
ok(worker.includes("setTimeout(() => ctl.abort(), 4000)"), 'timeout dur 4 s')
ok((worker.match(/return fb\(\)/g) || []).length >= 6, 'fallback sur tous les chemins d’échec (≥6)')
ok(worker.includes('JEV_INTENTS') && worker.includes('includes(a.choice)'), 'réponse bornée à la liste des classes')
ok(worker.includes('length < 6') && worker.includes('length > 220'), 'bornes anti-coût sur l’input')

console.log('— Money-path isolé —')
const startQ = worker.indexOf('questions: {', worker.indexOf('handleJevIntent'))
ok(startQ > -1, 'questions localisées')
ok(!/price|amount|cents|payment|mollie/i.test(worker.slice(startQ, startQ + 1400)), 'aucun champ money-path dans la question Jev')

console.log('— Client —')
ok(lib.includes('/api/jev-intent'), 'client appelle la route worker')
ok(lib.includes('jev=0'), 'kill switch client ?jev=0')
ok(lib.includes('4500') , 'timeout client ~4,5 s')
ok(lib.includes('{ fallback: true }'), 'fallback client partout')
ok(app.includes('import { askJevIntent, jevEnabled } from "./lib/jev-intent.js"'), 'lib importée dans l’app')
ok(app.includes('JevAsk'), 'composant JevAsk présent')
ok(app.includes('"sg_jev_intent_ask"') && app.includes('"sg_jev_intent"') && app.includes('"sg_jev_intent_fallback"'), 'events dans SG_FUNNEL_EVENTS')
ok(app.includes('nq.length>=6&&list.length===0'), 'déclenché UNIQUEMENT quand recherche déterministe échoue')

console.log(`\n${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
