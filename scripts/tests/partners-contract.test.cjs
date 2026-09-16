#!/usr/bin/env node
// partners-contract.test.cjs — Partenaires contextuels (services, jamais pubs).
// Prouve : catalogue synchronisé avec regions/*.json (source de vérité),
// couverture exacte (mq=3, gp=rhumz seul, autres=rien → jamais d'invention),
// résolution single-CTA + kill-switch + URL beach-context, tracking canonique
// allowlisté, hook build présent. Exécute le vrai résolveur src/lib/partners.js.
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const ROOT = path.resolve(__dirname, '..', '..')
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const J = (p) => JSON.parse(R(p))

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

async function main() {
  const P = await import(pathToFileURL(path.join(ROOT, 'src/lib/partners.js')).href)
  check('partners.js charge (ESM pur, sans JSX)', typeof P.resolveContext === 'function')

  console.log('— catalogue synchronisé avec regions/*.json —')
  const cat = J('src/lib/partners-catalog.json')
  const regionFiles = fs.readdirSync(path.join(ROOT, 'regions')).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  const regionIds = regionFiles.map((f) => J(`regions/${f}`).id).sort()
  check('catalogue couvre toutes les régions', JSON.stringify(Object.keys(cat.regions).sort()) === JSON.stringify(regionIds),
    `${Object.keys(cat.regions).sort()} vs ${regionIds}`)
  let syncOk = true
  for (const f of regionFiles) {
    const cfg = J(`regions/${f}`)
    const want = cfg.partners ? { transport: { local: cfg.partners.transport?.local || null, multiIsland: cfg.partners.transport?.multiIsland || null }, shopping: cfg.partners.shopping || [] } : { transport: { local: null, multiIsland: null }, shopping: [] }
    const got = cat.regions[cfg.id]
    if (JSON.stringify(got) !== JSON.stringify(want)) { syncOk = false; console.error(`    drift ${cfg.id}`) }
  }
  check('catalogue = miroir exact des sections partners (régénérer sinon)', syncOk)
  check('hook build gen-context-partners.cjs (avant vite build)',
    /gen-context-partners\.cjs/.test(J('package.json').scripts.build) &&
    J('package.json').scripts.build.indexOf('gen-context-partners.cjs') < J('package.json').scripts.build.indexOf('vite build'))

  console.log('— couverture exacte (jamais d\u2019invention) —')
  const mq = P.resolveContext(cat, 'mq', { id: 'mq001', island: 'mq', name: 'Les Salines' })
  check('mq : transport = Taxis Martinique (local prioritaire)',
    mq && mq.transport && mq.transport.trackingId === 'taxis_martinique')
  check('mq : shopping = Lovelly (Fort-de-France)',
    mq && mq.shopping.length === 1 && mq.shopping[0].trackingId === 'lovelly' && mq.shopping[0].location === 'Fort-de-France')
  const gp = P.resolveContext(cat, 'gp', { id: 'gp001', island: 'gp', name: 'Grande Anse' })
  check('gp : transport = RHUMZ seul (local MQ-only exclu)',
    gp && gp.transport && gp.transport.trackingId === 'rhumz')
  check('gp : shopping vide (Lovelly MQ-only exclue)', gp && gp.shopping.length === 0)
  for (const rid of ['florida', 'puntacana', 'rivieramaya', 'tulum', 'barbados']) {
    check(`${rid} : AUCUN partenaire (pas de couverture confirmée)`,
      P.resolveContext(cat, rid, { id: 'x', island: rid, name: 'X' }) === null)
  }
  check('région inconnue → null', P.resolveContext(cat, 'atlantis', { id: 'x', island: 'atlantis' }) === null)

  console.log('— règles de résolution —')
  const entry = {
    transport: {
      local: { name: 'L', category: 'taxi', url: 'https://l.example/', regions: ['mq'], supportsBeachContext: true, enabled: true, trackingId: 'l' },
      multiIsland: { name: 'M', category: 'VTC', url: 'https://m.example/', regions: ['mq', 'gp'], supportsBeachContext: true, enabled: true, trackingId: 'm' },
    },
    shopping: [{ name: 'S', category: 'souvenir', url: 'https://s.example/', regions: ['mq'], supportsBeachContext: false, enabled: false, trackingId: 's' }],
  }
  check('UN SEUL CTA transport : local > multi-îles', P.getTransportPartner(entry, 'mq').trackingId === 'l')
  check('repli multi-îles quand local absent', P.getTransportPartner(entry, 'gp').trackingId === 'm')
  check('disabled + hors-regions = invisible', P.getShoppingPartners(entry, 'mq').length === 0)
  check('kill-switch ?partnerctx=0 → null', P.resolveContext(cat, 'mq', { id: 'mq001', island: 'mq' }, '?partnerctx=0') === null)
  check('résolveur agnostique à la plage (le composant exige beach, pas le résolveur)',
    P.resolveContext(cat, 'mq', null, '').transport.trackingId === 'taxis_martinique')
  const beachCtx = { id: 'mq001', island: 'mq', name: 'Les Salines' }
  const u1 = P.partnerOutboundUrl({ url: 'https://www.rhumz.com/', bookingUrl: 'https://www.rhumz.com/reservation/', supportsBeachContext: true }, beachCtx)
  check('URL beach-context (bookingUrl + destination + island)',
    u1 === 'https://www.rhumz.com/reservation/?destination=Les%20Salines&island=mq', u1)
  const u2 = P.partnerOutboundUrl({ url: 'https://lovelly.fr/', supportsBeachContext: true }, beachCtx)
  check('URL shopping = url + contexte (pas de prix/commission inventés)',
    u2 === 'https://lovelly.fr/?destination=Les%20Salines&island=mq' && !/[?&](price|commission|prix)=/.test(u2), u2)
  const u3 = P.partnerOutboundUrl({ url: 'https://x.example/', supportsBeachContext: false }, beachCtx)
  check('sans supportsBeachContext → URL brute', u3 === 'https://x.example/', u3)

  console.log('— catalogue : aucune donnée inventée —')
  const ALLOWED_T = new Set(['name', 'category', 'url', 'bookingUrl', 'regions', 'supportsBeachContext', 'enabled', 'trackingId'])
  const ALLOWED_S = new Set(['name', 'category', 'url', 'location', 'regions', 'supportsBeachContext', 'enabled', 'trackingId'])
  let leakOk = true
  for (const [rid, e] of Object.entries(cat.regions)) {
    for (const s of ['local', 'multiIsland']) {
      const p = e.transport && e.transport[s]
      if (p && Object.keys(p).some((k) => !ALLOWED_T.has(k))) { leakOk = false; console.error(`    champ inattendu ${rid}.${s}`) }
    }
    for (const p of e.shopping || []) {
      if (Object.keys(p).some((k) => !ALLOWED_S.has(k))) { leakOk = false; console.error(`    champ inattendu ${rid}.shopping`) }
    }
  }
  check('catalogue = champs whitelistés uniquement (ni prix, ni commission)', leakOk)
  check('URLs catalogue toutes https', (() => {
    const urls = []
    for (const e of Object.values(cat.regions)) {
      for (const s of ['local', 'multiIsland']) { const p = e.transport && e.transport[s]; if (p) urls.push(p.url) }
      for (const p of e.shopping || []) urls.push(p.url)
    }
    return urls.length === 4 && urls.every((u) => /^https:\/\//.test(u))
  })())

  console.log('— tracking canonique allowlisté —')
  const PROD = R('src/Sargasses_PROD.jsx')
  check('SG_FUNNEL_EVENTS += sg_partner_view/cta/outbound',
    PROD.includes('"sg_partner_view"') && PROD.includes('"sg_partner_cta"') && PROD.includes('"sg_partner_outbound"'))
  check('SG_FUNNEL_EVENTS += sg_product_view/cart_add/cart_open/checkout_start/checkout_payment/order_paid/order_failed/order_confirmed/order_cancelled',
    PROD.includes('"sg_product_view"') && PROD.includes('"sg_cart_add"') && PROD.includes('"sg_cart_open"') &&
    PROD.includes('"sg_checkout_start"') && PROD.includes('"sg_checkout_payment"') &&
    PROD.includes('"sg_order_paid"') && PROD.includes('"sg_order_failed"') && PROD.includes('"sg_order_confirmed"') && PROD.includes('"sg_order_cancelled"'))
  check('FUNNEL_KEYS funnel-from-supabase += partner_*',
    /'partner_view', 'partner_cta', 'partner_outbound'/.test(R('scripts/automation/funnel-from-supabase.cjs')))
  check('FUNNEL_KEYS funnel-from-supabase += partner commerce',
    /product_view.*cart_add.*cart_open.*checkout_start.*checkout_payment.*order_paid.*order_failed.*order_confirmed.*order_cancelled/s.test(R('scripts/automation/funnel-from-supabase.cjs')))
  check('FUNNEL_KEYS daily-stats-check += partner_*',
    /'partner_view', 'partner_cta', 'partner_outbound'/.test(R('scripts/automation/daily-stats-check.cjs')))
  check('FUNNEL_KEYS daily-stats-check += partner commerce',
    /product_view.*cart_add.*cart_open.*checkout_start.*checkout_payment.*order_paid.*order_failed.*order_confirmed.*order_cancelled/s.test(R('scripts/automation/daily-stats-check.cjs')))

  console.log('— câblage surfaces (après verdict + alternatives, jamais dedans) —')
  const CH = R('src/ChasseHome.jsx')
  check('ChasseDetail : PartnerContext APRÈS planB/voisines, AVANT SeasonRepere',
    CH.indexOf('<PartnerContext') > CH.indexOf('lc-detail-planb') && CH.indexOf('<PartnerContext') < CH.indexOf('<SeasonRepere'))
  check('BeachSheetComic : PartnerContext APRÈS EnhancedAlternativesPanel, AVANT BeachReport',
    PROD.indexOf('<PartnerContext') > PROD.indexOf('<EnhancedAlternativesPanel') && PROD.indexOf('<PartnerContext') < PROD.indexOf('<BeachReport'))
  const MP = R('src/components/MaPlageView.jsx')
  check('MaPlageView : slot bespoke supprimé (plus d\u2019émission sg_transport_*)', !/track\(\s*['"]sg_transport_/.test(MP))
  check('MaPlageView : PartnerContext sur beach.island (prop region=null sur build partagé)',
    /<PartnerContext[^>]*regionId=\{beach\.island\}/.test(MP))
  const PC = R('src/components/PartnerContext.jsx')
  check('PartnerContext : badge Partenaire + rel sponsored + _blank noopener',
    /Partenaire/.test(PC) && /sponsored/.test(PC) && /noopener,noreferrer/.test(PC))
  check('PartnerContext : 0 condition région/URL en dur (lit le catalogue)',
    !/taxismartinique|rhumz\.com|lovelly\.fr|fort-de-france/i.test(PC.replace(/Partenaire|Socio|Partner/g, '')) || !/martinique\.com|rhumz|lovelly/i.test(PC))
  check('verdict intouché : PartnerContext ne consomme jamais sargData/forecast',
    !/sargData|[^a-zA-Z]forecast[^a-zA-Z_]/.test(PC))
}

main().then(() => {
  console.log(`\n${pass} ok, ${fail} échecs`)
  process.exit(fail ? 1 : 0)
}).catch((e) => { console.error('HARNESS', e); process.exit(1) })
