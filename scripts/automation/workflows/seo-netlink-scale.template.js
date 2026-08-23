export const meta = {
  name: 'netlink-scale',
  description: 'Large-scale backlink prospect research across 4 markets x many prospect types — expands backlink-prospects.json toward x100 referral surface',
  phases: [
    { title: 'Research', detail: 'one agent per market x prospect-type batch → real, verifiable prospects' },
  ],
}

const MARKETS = [
  { key: 'fr', label: 'Martinique & Guadeloupe (French Antilles)', lang: 'fr', sites: 'sargasses-martinique.com, sargasses-guadeloupe.com' },
  { key: 'florida', label: 'Florida / Miami (US English + Hispanic)', lang: 'en', sites: 'sargassummiami.com' },
  { key: 'puntacana', label: 'Punta Cana (Dominican Republic)', lang: 'en', sites: 'sargassumpuntacana.com' },
  { key: 'rivieramaya', label: 'Cancun & Riviera Maya (Mexico, Spanish)', lang: 'es', sites: 'sargassumcancun.com' },
]
const TYPE_BATCHES = [
  'official/regional tourism boards & DMOs, convention & visitors bureaus, municipal/government beach-conditions or environmental pages',
  'hotel & resort groups, all-inclusive chains, concierge/blog sections of major properties, and beach clubs',
  'high-traffic travel blogs, destination guides, "things to do" sites, and independent travel writers for this destination',
  'local & regional news outlets, TV/radio stations and their weather desks, and ocean/weather data aggregators',
  'dive shops, snorkeling/boat-tour & watersport operators, vacation-rental managers, OTAs, traveler forums (Reddit/TripAdvisor/Facebook groups) and active YouTube/Instagram creators covering this destination',
]

const PRODUCT = 'We run a free, always-current, citable live satellite sargassum/sargazo map (Copernicus/NOAA AFAI, refreshed 4x/day, per-beach Beach Score + 7-day forecast). Link assets: an embeddable live-map widget (one-line iframe), a weekly per-beach data report journalists/DMOs can cite, and a free press/data kit with methodology + published backtest accuracy. The pitch is value-first (a resource their audience needs before going to the beach), never a bare link request.'

const PROS_SCHEMA = { type:'object', additionalProperties:false, required:['prospects'], properties:{ prospects:{ type:'array', minItems:6, maxItems:20, items:{ type:'object', additionalProperties:false, required:['name','type','url','whyRelevant','contactHint','authority','angle'], properties:{ name:{type:'string'}, type:{type:'string'}, url:{type:'string'}, whyRelevant:{type:'string'}, contactHint:{type:'string'}, authority:{type:'string',enum:['high','medium','low']}, angle:{type:'string'} } } } } }

phase('Research')
const jobs = []
for (const m of MARKETS) for (let i = 0; i < TYPE_BATCHES.length; i++) jobs.push({ m, batch: TYPE_BATCHES[i], i })

const results = await parallel(jobs.map(j => () => {
  const prompt = 'You are a digital-PR / link-building researcher for ' + j.m.label + ' (site(s): ' + j.m.sites + '). Find REAL, verifiable backlink/referral prospects of this type:\n' + j.batch + '\n\n' + PRODUCT + '\n\nUse web search if available; otherwise rely only on well-known REAL entities — never invent fake URLs. For each prospect give: name, type, url (real homepage/section), whyRelevant (why their audience needs a live beach-conditions resource), contactHint (how to reach: PR/editor email pattern, contact page, social DM), authority (high/medium/low), and angle (the specific link hook — embed the widget on their "beach conditions" page, cite the weekly data report, use the free press kit, a guest data-story, etc.). Write contactHint/angle in ' + j.m.lang + ' where natural. 6-20 prospects, all real.'
  return agent(prompt, { schema: PROS_SCHEMA, label: 'pros:' + j.m.key + ':' + j.i, phase: 'Research' })
    .then(r => ({ market: j.m.key, label: j.m.label, lang: j.m.lang, prospects: (r && r.prospects) || [] }))
    .catch(() => ({ market: j.m.key, label: j.m.label, lang: j.m.lang, prospects: [] }))
}))

// Merge per market, dedupe by domain.
const byMarket = {}
for (const r of results.filter(Boolean)) {
  if (!byMarket[r.market]) byMarket[r.market] = { market: r.label, lang: r.lang, prospects: [], _seen: new Set() }
  for (const p of r.prospects) {
    let host = ''
    try { host = new URL(p.url).hostname.replace(/^www\./, '') } catch { host = p.url }
    if (host && !byMarket[r.market]._seen.has(host)) { byMarket[r.market]._seen.add(host); byMarket[r.market].prospects.push(p) }
  }
}
const out = Object.values(byMarket).map(m => ({ market: m.market, lang: m.lang, prospects: m.prospects }))
const total = out.reduce((a, m) => a + m.prospects.length, 0)
log('Netlink prospects (deduped): ' + total + ' across ' + out.length + ' markets')
return { counts: { markets: out.length, prospects: total }, markets: out }
