#!/usr/bin/env node
/**
 * release-from-outbox.cjs — Le VALVE unique du réservoir social.
 *
 * Par défaut HOLD / dry-run : n'affiche QUE ce qui serait mis en file, ne
 * modifie rien. Ne bascule les assets `staged` → `queued` QUE si
 * SARGA_DEPLOY_UNLOCK=1 (passé à la main via workflow_dispatch au moment du
 * funnel-proof, cf. REFONTE-MASTER §5 PHASE 4 : modal→CTA ≥5% tenu 2 sem).
 *
 * ⚠️ Ne POSTE JAMAIS nulle part. Les publishers FB restent locaux/bloqués.
 *    Ce script avance seulement l'état de l'outbox — c'est le seul point de
 *    déverrouillage, volontairement manuel, du réservoir stagé.
 *
 * Usage : node scripts/automation/release-from-outbox.cjs
 * Env    : SARGA_DEPLOY_UNLOCK=1 (sinon HOLP/dry-run)
 */
const fs = require('fs');
const path = require('path');

const OUTBOX = path.join(__dirname, 'data', 'social-outbox.json');
const CAP = 20; // plafond d'assets basculés par run
const unlocked = process.env.SARGA_DEPLOY_UNLOCK === '1';

let outbox = [];
try { outbox = JSON.parse(fs.readFileSync(OUTBOX, 'utf8')); } catch { outbox = []; }
if (!Array.isArray(outbox)) outbox = [];
const staged = outbox.filter(e => e.state === 'staged');

if (!unlocked) {
  console.log(`[HOLD] ${staged.length} assets stagés dans le réservoir. Aucune bascule (dry-run).`);
  console.log(`→ Pour en mettre ${Math.min(CAP, staged.length)} en file (queued), relance ce workflow avec unlock=1.`);
  staged.slice(0, CAP).forEach(e => console.log(`  · ${e.id} (${e.type}/${e.region})`));
  process.exit(0);
}

// UNLOCK explicite : bascule jusqu'à CAP staged → queued.
const today = new Date().toISOString().slice(0, 10);
let flipped = 0;
for (const e of outbox) {
  if (flipped >= CAP) break;
  if (e.state === 'staged') { e.state = 'queued'; e.queuedAt = today; flipped++; }
}
fs.writeFileSync(OUTBOX, JSON.stringify(outbox, null, 2) + '\n');
console.log(`[UNLOCK] ${flipped} assets basculés staged→queued (cap ${CAP}). Reste stagés : ${staged.length - flipped}.`);
console.log('Note : ce valve ne poste rien — il avance juste l\'état outbox. La publication réelle reste manuelle/locale.');
