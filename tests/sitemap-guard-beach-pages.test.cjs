#!/usr/bin/env node
/* Régression P0 — garde sitemap : faux positif URL extensionless.
   Constat prod 2026-10-24 : 3 URLs légales (formes /cgv, /mentions-legales,
   /remboursement) jugées « manquantes » par le garde (testait UNE forme
   <slug>/index.html) → throw → 136 fiches /plages/ non générées → 23 liens 404.
   Correctif : résoudre les DEUX formes. */
'use strict'
const fs = require('fs'), path = require('path')
const ROOT = path.resolve(__dirname,'..'), DIST = path.join(ROOT,'dist')
let f = 0
function a(c,m){ if(c){console.log('  ✓ '+m)} else {f++;console.error('  ✗ '+m)} }
function existsAs(rel){
  const base=path.join(DIST,rel)
  const asDir = (/\/$/.test(rel)||!/\.[a-z0-9]+$/i.test(rel)) ? base+'/index.html' : base
  const asFlat = /\.[a-z0-9]+$/i.test(rel) ? base : base+'.html'
  return fs.existsSync(asDir)||fs.existsSync(asFlat)
}
if(!fs.existsSync(DIST)){console.error('  ✗ dist/ absent — vite build d’abord');process.exit(1)}
console.log('1) GARDE corrigé : pages légales extensionless résolues')
for (const slug of ['mentions-legales','cgv','remboursement','confidentialite']){
  a(existsAs(slug), `${slug} résolu (dist/${slug}.html)`)
}
console.log('\n2) GARDE corrigé : fiches plage générées')
const ptests=['plages/plage-des-salines','plages/plage-de-malendure','plages/grande-anse-d-arlet']
for (const s of ptests){
  const f2 = path.join(DIST,s,'index.html')
  a(fs.existsSync(f2), `${s}/index.html présent`)
}
a(fs.existsSync(path.join(DIST,'plages','index.html')),'/plages/ index présent')
console.log('\n3) Sitemaps enrichis')
for (const mq of ['sitemap-martinique.xml','sitemap-guadeloupe.xml']){
  const t=fs.readFileSync(path.join(DIST,mq),'utf8')
  const n=(t.match(/\/plages\//g)||[]).length
  a(n>0, `${mq} contient des URLs /plages/ (${n})`)
}
console.log('\n4) Sitemap garde : URL réellement absente fait échouer')
a(!existsAs('/page-inexistante-xyz'), 'URL inconnue non résolue (garde réactif)')
console.log('\nRESULTAT '+ (f===0 ? '✓ TOUS LES TESTS OK' : f+' ÉCHEC(S)'))
process.exit(f===0?0:1)
