// tests/unit/cart-recovery-truth.test.cjs — 2026-09-23
// Constance produit : les emails de récupération panier ne doivent JAMAIS
// promettre un prix différent du débit réel (moat = honnêteté), et leur dédup
// doit être persistée par le workflow (sinon re-envois multiples aux mêmes
// abonnés — leçon 2026-06-11, cf. commentaire anti-doublon daily-copernicus.yml).
// Lancement : node tests/unit/cart-recovery-truth.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const MAIL = fs.readFileSync(path.join(ROOT, 'scripts/automation/cart-recovery-unified.cjs'), 'utf8');
const WF = fs.readFileSync(path.join(ROOT, '.github/workflows/daily-copernicus.yml'), 'utf8');
const PRICE = fs.readFileSync(path.join(ROOT, 'src/lib/pass-price.js'), 'utf8');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}
const count = (src, s) => (src.split(s).length - 1);

console.log('CART-RECOVERY TRUTH — prix réel + dédup persistée\n');

// 1. Prix réalistes : l'email annonce le prix débité (14,99 € EUR / 11,99 $ USD base,
//    13,79 $ en saison juin→nov — contrat src/lib/pass-price.js ligne PASS_CENTS).
check('contrat prix intact côté src (PASS_CENTS eur 1499 / usd 1199)',
  /PASS_CENTS\s*=\s*\{\s*eur:\s*1499,\s*usd:\s*1199\s*\}/.test(PRICE));
check('helper passPriceLabel présent dans cart-recovery-unified',
  /function passPriceLabel/.test(MAIL));
check('helper contient le tarif EUR réel 14,99 €', MAIL.includes("'14,99 €'"));
check('helper contient le tarif USD réel 11,99 $ (base) et 13,79 $ (saison)',
  MAIL.includes("'11,99 $'") && MAIL.includes("'13,79 $'"));

// 2. Zéro prix obsolète dans les copy (hors commentaire de correction du 2026-09-23)
check("aucune promesse '12,99 €' hors commentaire de correction", count(MAIL, '12,99 €') === 1);
check("aucune promesse '9,99 $' hors commentaire de correction", count(MAIL, '9,99 $') === 1);
check("aucune fausse remise 'au lieu de'", !MAIL.includes('au lieu de'));

// 3. Dédup persistée : le commit anti-doublon du workflow inclut les 3 marqueurs
for (const day of ['1', '3', '5']) {
  check(`workflow commit cart-recovery-j${day}-sent.json`,
    WF.includes(`scripts/automation/sent_markers/cart-recovery-j${day}-sent.json`));
}

// 4. Cap + unsubscribe restent en place (garde anti-spam)
check('cap par défaut présent (--cap=50)', MAIL.includes('--cap=50'));
check('lien unsubscribe dans chaque template (unsubUrl)', count(MAIL, '${unsubUrl}') >= 3);

console.log(`\n${passed} checks OK`);
