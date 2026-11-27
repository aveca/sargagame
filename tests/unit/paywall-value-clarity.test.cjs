#!/usr/bin/env node
'use strict'

/**
 * paywall-value-clarity.test.cjs — garde-fou de la mission « clarifier la
 * valeur et améliorer le CTA » sur le paywall principal (skin World, .pww-*).
 *
 * Verrouille 4 invariants, sur les SIX régions et leurs variantes
 * linguistiques (les libellés passent tous par _t(lang, fr, en, es)) :
 *
 *  1. Les avantages sont ordonnés par importance DÉCISIONNELLE :
 *     prévision pour la plage + la date choisies → aide à la décision →
 *     fonctionnalités Premium complémentaires. Aucun libellé inventé.
 *  2. Les prix affichés restent STRICTEMENT 4,99 €/mois et 49 €/an.
 *  3. L'économie annuelle est Calculée (12 mensualités − annual), jamais en dur,
 *     et n'apparaît que si elle est réellement positive.
 *  4. Le CTA est contextualisé (date réelle du contexte) et non générique.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const pw = fs.readFileSync(path.join(root, 'src', 'PremiumModal.jsx'), 'utf8');

// ── 1. Ordre décisionnel des avantages ─────────────────────────────────────
const perksStart = pw.indexOf('<div className="pww-perks">');
assert.ok(perksStart >= 0, 'le bloc .pww-perks doit exister');
const perks = pw.slice(perksStart, pw.indexOf('</div>', pw.indexOf('pww-perk b', perksStart)));

const iDate = perks.indexOf('pww-perk c');   // prévision pour la date choisie
const iBrief = perks.indexOf('pww-perk a');  // brief matin = aide à la décision
const iAlert = perks.indexOf('pww-perk b');  // alerte = fonctionnalité complémentaire
assert.ok(iDate >= 0 && iBrief >= 0 && iAlert >= 0, 'les 3 avantages doivent exister');
assert.ok(iDate < iBrief, 'la prévision pour la date choisie doit être PREMIÈRE');
assert.ok(iBrief < iAlert, 'l aide à la décision doit précéder les fonctionnalités complémentaires');
// Aucun libellé inventé : les 3 textes d'origine sont conservés
assert.ok(/Samedi/.test(perks), 'libellé du week-end conservé');
assert.ok(/brief chaque matin/.test(perks), 'libellé du brief conservé');
assert.ok(/Alerte le jour/.test(perks), 'libellé de l alerte conservé');

// ── 2. Prix STRICTEMENT inchangés ──────────────────────────────────────────
assert.ok(/const pMo=REGION_PAY\?PRICE_MO:\(lang==="en"\?"€4\.99":"4,99 €"\)/.test(pw),
  'le prix mensuel MQ/GP doit rester 4,99 € (REGION_PAY pilote les régions USD)');
assert.ok(/const pYr=REGION_PAY\?PRICE_YR:\(lang==="en"\?"€49":"49 €"\)/.test(pw),
  'le prix annuel MQ/GP doit rester 49 €');

// ── 3. Économie annuelle CALCULÉE, jamais en dur ───────────────────────────
assert.ok(/const saveYr=\(\(\)=>\{/.test(pw), 'l économie annuelle doit être calculée (saveYr)');
assert.ok(/const base=nMo\*12, save=base-nYr/.test(pw),
  'l économie = 12 mensualités − prix annuel (jamais un montant en dur)');
assert.ok(/if\(save<=0\)return null/.test(pw),
  'aucune économie affichée si elle n est pas réelle (annual >= 12 mensualités)');
assert.ok(/Math\.round\(save\/base\*1000\)\/10/.test(pw), 'le pourcentage est calculé depuis les prix réels');
// Elle doit être rendue sur la carte annuelle
assert.ok(/planBtn\("annual",[\s\S]{0,200}saveYr\)/.test(pw),
  'l économie doit être affichée sur la carte du pass annuel');
assert.ok(/\{save\?<span className="pww-save">\{save\}<\/span>:null\}/.test(pw),
  'le badge .pww-save doit rendre l économie');

// ── 4. CTA contextualisé (action réelle, date réelle) ──────────────────────
assert.ok(/wkend&&wkend\.name\s*\n\?_t\(lang,`Vérifier \$\{wkend\.name\} pour ma plage →`/.test(pw),
  'le CTA doit être contextualisé sur la date réelle du contexte (wkend.name)');
assert.ok(!/Je veux la prévision →/.test(pw),
  'le CTA générique « Je veux la prévision » ne doit plus exister');
// Repli explicite quand la date n est pas disponible
assert.ok(/Vérifier la prévision de ma plage →/.test(pw),
  'un repli explicite doit exister quand la date du contexte est absente');
// Aucune garantie de plage sans sargasses
assert.ok(!/garanti[^<]{0,30}sans sargasse/i.test(pw), 'aucune promesse de plage sans sargasses');

console.log('OK Test 1: avantages ordonnés par importance décisionnelle (date > décision > complémentaire)');
console.log('OK Test 2: prix strictement conservés (4,99 €/mois et 49 €/an)');
console.log('OK Test 3: économie annuelle calculée depuis les prix réels, affichée si positive');
console.log('OK Test 4: CTA contextualisé sur la date réelle, avec repli explicite, sans promesse');
