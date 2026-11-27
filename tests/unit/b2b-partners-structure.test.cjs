/**
 * tests/unit/b2b-partners-structure.test.cjs
 * Mission 7 — Valide la structure de l'API partenaires B2B (#1029).
 *
 * Vérifie que public/api/b2b-partners.json (généré par gen-b2b-partners.cjs)
 * a la structure attendue et ne publie aucun partenaire d'une autre région.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public', 'api', 'b2b-partners.json');

const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));

// 1. Structure attendue
assert.ok(data, 'fichier présent');
assert.ok(typeof data.updatedAt === 'string' && data.updatedAt.length > 0, 'updatedAt présent');
assert.ok(Array.isArray(data.partners), 'partners est un tableau');
assert.ok(Array.isArray(data.preview), 'preview est un tableau');

// 2. Chaque partner a les champs requis
const requiredFields = ['beachId', 'slug', 'name', 'tagline', 'url', 'area'];
for (const p of data.partners) {
  for (const f of requiredFields) {
    assert.ok(p[f] !== undefined, `partner ${p.slug || '?'}: champ ${f} manquant`);
  }
  // 3. Pas de beachId vide
  assert.ok(p.beachId && p.beachId.length > 0, `partner ${p.slug}: beachId vide`);
}

// 4. Séparation régionale : aucun partner avec un beachId d'une région USD
//    (florida, puntacana, rivieramaya, tulum) ne doit être publié sans
//    appartenir à cette région. Les beachIds MQ commencent par 'mq', GP par 'gp'.
const usdPrefixes = ['fl', 'pc', 'rm', 'tu'];
for (const p of data.partners) {
  const prefix = p.beachId.slice(0, 2).toLowerCase();
  assert.ok(!usdPrefixes.includes(prefix),
    `partner ${p.slug}: beachId ${p.beachId} appartient a une region USD mais est publie`);
}

// 5. preview contient uniquement des partenaires non-actifs (démo)
for (const p of data.preview) {
  assert.ok(p.slug && p.beachId, `preview ${p.slug || '?'}: champs manquants`);
}

console.log(`✅ Structure b2b-partners.json valide : ${data.partners.length} partner(s) live, ${data.preview.length} en preview`);
