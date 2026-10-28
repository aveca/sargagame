/**
 * tests/unit/mojibake-regression.test.cjs
 * Mission 9 — Empêche le retour du mojibake UTF-8 dans les pages publiques (#1035).
 *
 * Vérifie qu'aucune séquence mojibake connue (caractère encodé deux fois) ne
 * subsiste dans les fichiers HTML servis au public, notamment les pages B2B
 * EN/ES sous public/pro/ qui étaient affectées.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');

// Séquences mojibake connues (UTF-8 lu en Latin-1 puis ré-encodé en UTF-8)
const MOJIBAKE_PATTERNS = [
  /Ã©/g, /Ã¨/g, /Ã‰/g, /Ãª/g, /Ã®/g, /Ã±/g, /Ã§/g, /Ã³/g, /Ãº/g,
  /Ã¡/g, /Ã¿/g, /Ã«/g, /Ã¯/g, /Ã¹/g, /Ã¶/g, /Ã¼/g, /Ãÿ/g, /Ã´/g,
  /Ã/g, /Ã€/g, /Ã‡/g, /Ãˆ/g, /Ãš/g, /Ã¨/g,
  /â€”/g, /â€“/g, /â€™/g, /â€“/g, /â€”/g, /â€¢/g, /â€¦/g,
  /Â·/g, /Â«/g, /Â»/g, /Â¿/g, /Â¡/g,
  ['â†’', 'g'],
  ['âœ“', 'g'],
  ['â€œ', 'g'],
  ['â€', 'g'],
];

let filesWithMojibake = 0;
let totalOccurrences = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
        walk(full);
      }
    } else if (/\.(html|htm|js|jsx|json|css)$/i.test(entry.name)) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        let found = 0;
        for (const pattern of MOJIBAKE_PATTERNS) {
          const matches = content.match(pattern);
          if (matches) found += matches.length;
        }
        if (found > 0) {
          filesWithMojibake++;
          totalOccurrences += found;
          console.log(`MOJIBAKE: ${full} — ${found} occurrence(s)`);
        }
      } catch (_) {}
    }
  }
}

walk(PUBLIC);

if (filesWithMojibake > 0) {
  console.log(`\n❌ ${filesWithMojibake} fichier(s) avec ${totalOccurrences} occurrence(s) de mojibake.`);
  process.exit(1);
} else {
  console.log('✅ Aucun mojibake détecté dans public/.');
  process.exit(0);
}
