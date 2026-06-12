// Test fonctionnel j3 brief â€” 5 rÃ©gions, donnÃ©e live du repo
const { getRegionBrief, buildJ3, getSubject } = require('../automation/tmp-drip-test-module.cjs')
const fs = require('fs')
let fail = 0
for (const isl of ['MQ', 'GP', 'PUNTACANA', 'FLORIDA', 'RIVIERAMAYA']) {
  const brief = getRegionBrief(isl)
  if (!brief) { console.log(`${isl}: BRIEF NULL`); fail++; continue }
  const subject = getSubject('j3', isl, 0, brief)
  const html = buildJ3(isl, brief, 'test@example.com')
  const problems = []
  if (/undefined|NaN|\[object/.test(subject)) problems.push('subject polluÃ©')
  if (/undefined|NaN|\[object/.test(html)) problems.push('html polluÃ©: ' + (html.match(/.{30}(undefined|NaN|\[object).{30}/g) || []).join(' | '))
  if (brief.meta.lang === 'en' && /[Ã Ã©Ã¨ÃªÃ§]| plage /.test(html.replace(/&[a-z]+;/g, ''))) problems.push('FR rÃ©siduel dans HTML EN')
  if (brief.meta.lang === 'es' && / beach | the /.test(html)) problems.push('EN rÃ©siduel dans HTML ES')
  if (!/buy\.stripe\.com|https:\/\//.test(html)) problems.push('aucun lien CTA')
  console.log(`${isl} [${brief.meta.lang}] best=${brief.best.name} ${brief.best.score}/100 ${brief.best.status} j1=${brief.best.j1} degraded=${brief.degradedCount} day=${brief.degradeDay} alt=${brief.alt} stripe=${brief.stripeBase ? 'OK' : 'NULL'}`)
  console.log(`   sujet: ${subject}`)
  if (problems.length) { console.log(`   PROBLEMES: ${problems.join(' ; ')}`); fail++ }
  fs.writeFileSync(`${__dirname}/j3-${isl.toLowerCase()}.html`, html)
}
console.log(fail ? `\n${fail} rÃ©gion(s) en Ã©chec` : '\nOK 5/5')
process.exit(fail ? 1 : 0)
