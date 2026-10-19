#!/usr/bin/env node
// Purge dead A/B test references from Sargasses_PROD.jsx

const fs = require('fs');

let content = fs.readFileSync('src/Sargasses_PROD.jsx', 'utf8');

// Replace the nav_dive dead arm comment with historical reference
content = content.replace(
  '// nav_dive RETIRÉ 2026-06-18 (loop ab-eval 28j) : bras mort n=46 @0% conv vs control n=358 @1.4%.',
  '// nav_dive : test A/B retiré — taux contrôle 1.4% sur 358 visites vs 0% variante sur 46 visites (28j)'
);

// Replace the reversibility comment for nav_dive
content = content.replace(
  '// encore l\'aperçu. Réversible : restaurer abVariant("nav_dive",["control","dive"],[.85,.15])==="dive".',
  '// nav_dive : A/B test historiqué — reversible si besoin futur'
);

fs.writeFileSync('src/Sargasses_PROD.jsx', content, 'utf8');
console.log('Cleanup completed');