#!/usr/bin/env node
/**
 * seo-graph-contract.test.cjs — Contrat du graphe SEO (audit 2026-09-24).
 *
 * Slice 1 « SEO UNIVERSE » :
 *  A) Consolidation duplicate /beach/* (dedicated-pages.cjs) : chaque alias
 *     canonicalise vers la fiche primaire de sa région (/plages|beaches|playas)
 *     et sort du sitemap (noindex,follow).
 *  B) Couche AREA (region-seo-pages.cjs) : hub par commune réelle ≥2 plages et
 *     < total région, espace /areas|zonas/ sans collision avec les extraPages,
 *     alternative-du-jour strictement meilleure (jamais fabriquée).
 *
 * Teste les helpers réels (require des modules) sur les VRAIES configs régions.
 * Exit 1 si échec.
 */
'use strict'
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
let failures = 0
let checks = 0
function ok(cond, label) {
  checks++
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

const { primaryBeachPath, activityBeaches, ACTIVITY_FLAG } = require(path.join(ROOT, 'scripts/lib/dedicated-pages.cjs'))
const { __test } = require(path.join(ROOT, 'scripts/lib/region-seo-pages.cjs'))
const { computeAreas, findAlternativeToday, haversineKm, areaSlugify, areaCrossLink, AREAS_DIR } = __test

function region(id) { return require(path.join(ROOT, 'regions', `${id}.json`)) }

function main() {
  // ── A1. Canonical alias → fiche primaire par région ──────────────────────
  ok(primaryBeachPath({ primaryLang: 'fr' }, { slug: 'grande-anse-d-arlet', name: 'X' }) === '/plages/grande-anse-d-arlet/',
    'A1 mq/gp (fr) → /plages/<slug>/')
  ok(primaryBeachPath(region('florida'), { slug: 'south-beach', name: 'South Beach' }) === '/beaches/south-beach/',
    'A1 florida (en) → /beaches/<slug>/')
  ok(primaryBeachPath(region('tulum'), { slug: 'playa-paraiso', name: 'Playa Paraíso' }) === '/playas/playa-paraiso/',
    'A1 tulum (es) → /playas/<slug>/')
  ok(primaryBeachPath(region('rivieramaya'), { name: "Anse à l'Âne" }) === '/playas/anse-a-l-ane/',
    'A1 fallback slugify(name) déterministe')

  // ── A2. dedicated-pages ne pousse plus /beach/* dans le sitemap + noindex ──
  const dp = require('fs').readFileSync(path.join(ROOT, 'scripts/lib/dedicated-pages.cjs'), 'utf8')
  ok(dp.includes("robots: 'noindex,follow'"), 'A2 alias /beach/* en noindex,follow')
  ok(dp.includes('canonicalPath: primaryBeachPath(region, beach)'), 'A2 canonical alias = fiche primaire')
  ok(/noindex ⇒ HORS sitemap[\s\S]{0,220}return null/.test(dp) && dp.includes('if (entry) sitemap.push(entry)'),
    'A2 generateBeachPage retourne null + caller ne pousse que les entrées non-null (hors sitemap)')

  // ── B1. computeAreas sur les VRAIES configs (seuils ≥2 et < total) ───────
  const beachesOf = id => (region(id).beaches || []).map(b => ({ ...b, lv: {} }))
  const rm = computeAreas(beachesOf('rivieramaya'))
  const rmCancun = rm.find(a => a.slug === 'cancun')
  ok(!!rmCancun && rmCancun.beaches.length === 8, 'B1 rivieramaya : zone cancun = 8 plages réelles')
  ok(rm.some(a => a.slug === 'playa-del-carmen' && a.beaches.length === 2), 'B1 rivieramaya : playa-del-carmen (2)')
  ok(rm.some(a => a.slug === 'tulum' && a.beaches.length === 2), 'B1 rivieramaya : tulum (2 plages < 20 région)')
  const pc = computeAreas(beachesOf('puntacana'))
  ok(pc.some(a => a.slug === 'bavaro' && a.beaches.length === 6), 'B1 puntacana : bavaro (6)')
  ok(pc.some(a => a.slug === 'cap-cana' && a.beaches.length === 2), 'B1 puntacana : cap-cana (2)')
  const fl = computeAreas(beachesOf('florida'))
  ok(fl.length === 1 && fl[0].slug === 'miami-beach' && fl[0].beaches.length === 3,
    'B1 florida : seule miami-beach (3/20) — communes singletons = thin, rejetées')
  ok(computeAreas(beachesOf('tulum')).length === 0,
    'B1 tulum : 8/8 plages = une seule zone = doublon du listing régional → skippé')
  ok(computeAreas(beachesOf('rivieramaya'), { disabled: true }).length === 0,
    'B1 rollback VITE_NO_SEOAREAS=1 → aucune area')
  const slugs = [...rm, ...pc, ...fl].map(a => a.slug)
  ok(new Set(slugs).size === slugs.length, 'B1 aucun slug area dupliqué')

  // ── B2. Pas de collision avec les extraPages éditorialisées (espace dédié) ──
  ok(AREAS_DIR.en === 'areas' && AREAS_DIR.es === 'zonas', 'B2 espaces /areas/ + /zonas/')
  for (const id of ['florida', 'rivieramaya', 'puntacana']) {
    let extra = []
    try { extra = (require(path.join(ROOT, 'regions', 'seo-content', `${id}.json`)).extraPages || []) } catch { /* no content */ }
    const extraSlugs = new Set(extra.map(e => e.slug))
    for (const a of computeAreas(beachesOf(id))) {
      ok(!extraSlugs.has(`areas/${a.slug}`) && !extraSlugs.has(`zonas/${a.slug}`) && !extraSlugs.has(a.slug),
        `B2 ${id}/${a.slug} : pas de collision extraPages`)
    }
  }
  // Cross-link déterministe : sargazo-cancun-hoy ↔ zone cancun.
  ok((areaCrossLink({ slug: 'cancun' }, [{ slug: 'sargazo-cancun-hoy' }]) || {}).slug === 'sargazo-cancun-hoy',
    'B2 areaCrossLink retrouve la page ville éditorialisée')
  ok(areaCrossLink({ slug: 'bavaro' }, [{ slug: 'sargazo-cancun-hoy' }]) === null,
    'B2 areaCrossLink = null si aucune page ville correspondante')

  // ── B3. Alternative du jour : strictement meilleure, jamais fabriquée ────
  const lvB = (id, status, lat, lng) => ({ id, name: id, lat, lng, lv: { status, score: 50 } })
  ok(findAlternativeToday(lvB('a', 'clean', 0, 0), [lvB('a', 'clean', 0, 0), lvB('b', 'avoid', 0, 0.01)]) === null,
    'B3 plage clean → pas de bloc alternative')
  const alt1 = findAlternativeToday(lvB('a', 'avoid', 0, 0), [lvB('a', 'avoid', 0, 0), lvB('b', 'clean', 0, 0.02), lvB('c', 'clean', 0, 0.5)])
  ok(!!alt1 && alt1.beach.id === 'b' && alt1.km > 1 && alt1.km < 4, 'B3 avoid → clean la plus proche (~2.2 km)')
  const alt2 = findAlternativeToday(lvB('a', 'avoid', 0, 0), [lvB('a', 'avoid', 0, 0), lvB('b', 'moderate', 0, 0.02)])
  ok(!!alt2 && alt2.beach.id === 'b', 'B3 avoid sans clean → moderate la plus proche (honnête)')
  ok(findAlternativeToday(lvB('a', 'moderate', 0, 0), [lvB('a', 'moderate', 0, 0), lvB('b', 'avoid', 0, 0.02), lvB('c', 'moderate', 0, 0.03)]) === null,
    'B3 moderate entourée de moderate/avoid → null (strictement meilleur requis)')
  ok(!isFinite(haversineKm({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })), 'B3 haversine rejette les coords NaN')

  // ── B4. Wiring source : hubLinks + fiche plage contiennent la couche AREA ──
  const rs = require('fs').readFileSync(path.join(ROOT, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
  ok(rs.includes("items.push(['areas', areasIdxPath, areasLabel])"), 'B4 hubLinks → index des zones (anti-orphelin)')
  ok(rs.includes('aria-label="breadcrumb"'), 'B4 breadcrumb visible (nav HTML)')
  ok(/alternates: altsForArea\(a\)/.test(rs), 'B4 cluster hreflang /areas↔/zonas')
  ok(rs.includes("VITE_NO_SEOAREAS"), 'B4 flag rollback présent dans le générateur')

  // ── C. SLICE 2 : décision /poi/ /region/ /activity/ (audit coquilles) ────
  ok(dp.includes("const ACTIVITY_FLAG = {"), 'C1 mapping activité→flag réel présent')
  ok(activityBeaches('surf', [{ surf: true }, { kids: true }]).length === 0,
    'C1 surf sans flag source → [] (noindex, jamais enrichi)')
  ok(activityBeaches('kids', [{ kids: true }, { snorkel: true }, { kids: true }]).length === 2,
    'C1 kids = flag kids réel (2)')
  ok(activityBeaches('family', [{ kids: true }, {}, null]).length === 1, 'C1 family = même flag kids, null-safe')
  ok(dp.includes("const canonicalOverride = activity === 'kids' ? '/activity/family/' : undefined"),
    'C2 /activity/kids/ canonicalise vers /family/ (pas de dupe)')
  ok(dp.includes('isIndexable = flagged.length >= 2'), 'C2 activity indexable seulement si ≥2 plages réelles')
  ok(dp.includes("robots: isIndexable && !canonicalOverride ? undefined : 'noindex,follow'"),
    'C2 noindex,follow sur activity thin ou doublon')
  ok(dp.includes('href="${primaryBeachPath(region, b)}"'), 'C2 listes activity → fiches PRIMAIRES (jamais alias /beach/)')
  ok(/generatePOIPage[\s\S]{200,2000}robots: 'noindex,follow'/.test(dp),
    'C3 /poi/* = noindex,follow (coquille conservée, hors index)')
  ok(dp.includes("canonicalPath: '/', robots: 'noindex,follow'"), 'C3 /region/* canonical → home + noindex')
  ok(!/sitemap\.push\(generatePOIPage|sitemap\.push\(generateRegionPage|sitemap\.push\(generateActivityPage/.test(dp),
    'C3 orchestrateur : aucun push sitemap non gardé')
  ok(dp.includes('href="${primaryBeachPath(region, b.beach)}"'), 'C4 fiche alias : nearby → fiches primaires')

  // ── D. SLICE 3 : alternative du jour sur fiches FR /plages/<slug>/ ───────
  const vc = require('fs').readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')
  ok(vc.includes('VITE_NO_SEOALT'), 'D1 flag rollback présent (vite.config.js)')
  ok(vc.includes('${condBaignade}${altSection}${activitySection}'), 'D1 altSection branchée dans extraSections')
  ok(/o\.id === b\.id \|\| o\.island !== b\.island/.test(vc), 'D1 alternative = même île (jamais cross-island)')
  ok(/_rankAlt\(_st\) >= _curAlt/.test(vc), 'D1 alternative strictement meilleure (sinon rien)')
  ok(vc.includes("b.status && b.status !== 'clean'"), 'D1 plage clean → aucun bloc forcé')
  ok(/href="\/plages\/\$\{_bestAlt\.o\.slug/.test(vc), 'D1 lien alternative → fiche primaire /plages/')

  console.log(`\n${failures ? '✗ FAIL' : '✓ ALL PASS'} (${checks - failures}/${checks})`)
  process.exit(failures ? 1 : 0)
}

main()
