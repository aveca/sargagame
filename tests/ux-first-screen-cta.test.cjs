#!/usr/bin/env node
'use strict'

// Mission P0 refonte UX (2026-10-14) — « Trouve ta plage » doit être visible et
// joignable DIRECTEMENT depuis l'accueil, sans paramètre d'URL. Ce test verrouille :
//   1. le CTA principal existe sur la carte (data-testid="cta-trouve-ta-plage"),
//      traduit FR/EN/ES (« Trouve ta plage » / « Find your beach » / « Encuentra tu playa ») ;
//   2. il ouvre le parcours TrouvePlage IN-APP (prop onFind → setShowRecommend(true)) ;
//   3. un rollback ?trouveplage=0 rétablit l'ancienne pastille géoloc (onFind undefined) ;
//   4. la bannière cookies pousse le chrome bas via --sg-consent-h (le CTA n'est plus masqué) ;
//   5. la fermeture du parcours en mode IN-APP ne recharge pas la page (prop onClose).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const app = fs.readFileSync(path.join(__dirname, '../src/Sargasses_PROD.jsx'), 'utf8')
const map = fs.readFileSync(path.join(__dirname, '../src/WorldMapView.jsx'), 'utf8')
const funnel = fs.readFileSync(path.join(__dirname, '../src/TrouvePlage.jsx'), 'utf8')

// 1. CTA primaire sur la carte + i18n
assert.equal(map.includes('data-testid="cta-trouve-ta-plage"'), true, 'le CTA principal « Trouve ta plage » doit exister sur la carte')
assert.equal(map.includes('"Trouve ta plage","Find your beach","Encuentra tu playa"'), true, 'le CTA doit être traduit FR/EN/ES')

// 2. ouverture IN-APP (map → app → funnel)
assert.equal(map.includes('onFind=null'), true, 'WorldMapView doit accepter la prop onFind (fallback g��oloc conserv�)')
assert.equal(app.includes('setShowRecommend(true)'), true, 'le CTA carte doit ouvrir le parcours sans paramètre d’URL')
assert.equal(app.includes('onClose={()=>setShowRecommend(false)}'), true, 'le parcours IN-APP doit pouvoir se fermer')

// 3. rollback documenté
assert.equal(app.includes('trouveplage=0'), true, 'rollback ?trouveplage=0 obligatoire (FIND_CTA_OFF)')

// 4. bannière cookies : le chrome bas remonte, le CTA reste visible
assert.equal(app.includes('"--sg-consent-h"'), true, 'la bannière cookies doit exposer --sg-consent-h')
for (const f of [
  ['src/Sargasses_PROD.jsx', 'SOS PLAGE'],
]) { void f }
assert.equal(map.includes('var(--sg-consent-h,0px)'), true, 'le CTA carte doit remonter au-dessus de la bannière cookies')
assert.equal((app.match(/var\(--sg-consent-h,0px\)/g) || []).length >= 3, true, 'SOS/chat/découverte remontent aussi (--sg-consent-h ≥ 3 usages)')

// 5. fermeture douce sans rechargement quand onClose est fourni
assert.equal(funnel.includes('onClose = null'), true, 'TrouvePlage accepte onClose optionnel')
assert.ok(
  /typeof onClose === 'function'[\s\S]*?history\.replaceState/.test(funnel),
  'la fermeture IN-APP nettoie l’URL sans recharger (replaceState)'
)

// 6. régression SOS : le portail payant ne doit plus être strippé par .sg-fab
//    (fond encre !important rendait le SOS invisible sur fond nuit — vu en prod 2026-10-14)
const css = fs.readFileSync(path.join(__dirname, '../src/app-runtime.css'), 'utf8')
assert.equal(css.includes('.sg-soscta.sg-soscta.sg-soscta'), true, 'classe armurée .sg-soscta obligatoire (gradient or)')
assert.equal(app.includes('className="sg-soscta"'), true, 'le bouton SOS doit utiliser .sg-soscta (pas .sg-fab)')

console.log('OK — CTA « Trouve ta plage » visible sans param URL, rollback documenté, bannière cookies non bloquante, SOS or restauré')
