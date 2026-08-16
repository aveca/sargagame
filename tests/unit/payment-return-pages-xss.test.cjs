// Régression XSS : les paramètres de retour Mollie sont contrôlés par l'URL.
// Ces pages ne doivent donc jamais utiliser innerHTML pour les afficher.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', 'public', 'payment');
const good = fs.readFileSync(path.join(root, 'good.html'), 'utf8');
const error = fs.readFileSync(path.join(root, 'error.html'), 'utf8');

let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('Paiement — retours HTML sans XSS réfléchi\n');

check('good.html n’utilise pas innerHTML', !/\.innerHTML\s*=|\.innerHTML\s*\+=/.test(good));
check('good.html affiche email et plan avec textContent', /emailLine\.textContent\s*=\s*'📧 '\s*\+\s*email/.test(good) && /planLine\.textContent\s*=\s*'Plan : '\s*\+\s*plan/.test(good));
check('error.html n’utilise pas innerHTML', !/\.innerHTML\s*=|\.innerHTML\s*\+=/.test(error));
check('error.html affiche code, raison et email avec textContent', /codeLine\.textContent\s*=\s*'Code : '\s*\+\s*code/.test(error) && /reasonLine\.textContent\s*=\s*reasonText/.test(error) && /emailLine\.textContent\s*=\s*'📧 '\s*\+\s*email/.test(error));

console.log(`\n✅ ${passed} assertions passées — paramètres URL affichés comme texte.`);
