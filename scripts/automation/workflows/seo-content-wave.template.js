export const meta = {
  name: 'seo-enes-wave2',
  description: 'EN/ES wave 2 — scale toward x100: city + question + Spanish pages across Florida, Punta Cana, Cancun/Riviera Maya, excluding already-shipped slugs',
  phases: [
    { title: 'Plan', detail: 'per site, plan a batch of NEW page targets (cities, questions, Spanish variants)' },
    { title: 'Write', detail: 'fan out full publish-ready page specs' },
  ],
}

// Real query themes + the sub-destinations/intents to expand into. ES-heavy.
const SITES = [
  { key: 'rivieramaya', domain: 'sargassumcancun.com', market: 'Cancun & Riviera Maya (Mexico)', primary: 'es', langs: 'es (primary, root) + en (/en/)',
    targets: 'BIGGEST untapped pool (202 Spanish "sargazo" queries, almost all zero-click). Cover sub-destinations as their own pages (each backed by the nearest tracked beach): Playa del Carmen, Tulum, Cancun Hotel Zone (Zona Hotelera), Isla Mujeres, Akumal, Puerto Morelos, Cozumel. Plus Spanish question/safety pages: "sargazo es peligroso para la salud", "cuando se va el sargazo en cancun", "el sargazo es malo", "que es el sargazo", "playas sin sargazo en cancun hoy", "como saber si hay sargazo". Plus a few EN: "cancun seaweed today", "tulum sargassum today", "playa del carmen sargassum".' },
  { key: 'florida', domain: 'sargassummiami.com', market: 'Florida (USA)', primary: 'en', langs: 'en (primary, root) + es (/es/)',
    targets: 'Add SPANISH versions (large US Hispanic audience): "sargazo en miami hoy", "playas sin sargazo en florida", "alga marina en miami hoy". Plus more EN sub-destination cities (each backed by nearest tracked beach): Fort Myers, Naples, Hollywood Beach, Pompano Beach, Boca Raton, Delray Beach, Daytona Beach, Sunny Isles. Plus EN safety/question: "is sargassum dangerous in florida", "when is sargassum season in florida".' },
  { key: 'puntacana', domain: 'sargassumpuntacana.com', market: 'Punta Cana (Dominican Republic)', primary: 'en', langs: 'en (primary, root) + es (/es/)',
    targets: 'Add SPANISH (DR + LatAm travelers): "sargazo en punta cana hoy" already exists — instead do "sargazo en bavaro hoy", "playas sin sargazo en punta cana", "es peligroso el sargazo en punta cana", "cuando hay menos sargazo en punta cana". Plus more EN sub-destinations (nearest tracked beach): Uvero Alto, Juanillo, Bavaro vs Cap Cana comparison, La Romana / Bayahibe, Macao. Plus "best beaches in punta cana without seaweed".' },
]

const EXISTING = {
  florida: ['clearwater-beach-sargassum-today','miami-beach-seaweed-map-today','key-west-sargassum-today','is-there-sargassum-in-miami-today','fort-lauderdale-sargassum-today','sargassum-forecast','beaches-without-sargassum-today','seaweed-map','sargassum-season-florida','best-beaches-no-sargassum-florida','sargassum-florida-this-week','press'],
  puntacana: ['is-sargassum-dangerous-punta-cana','does-punta-cana-have-sargassum','sargassum-bavaro-beach-today','sargassum-macao-uvero-alto-today','sargassum-cap-cana-today','best-time-to-visit-punta-cana-avoid-sargassum','sargazo-punta-cana-hoy','sargassum-forecast','beaches-without-sargassum-today','seaweed-map','sargassum-season-punta-cana','best-beaches-no-sargassum-punta-cana','sargassum-punta-cana-this-week','press'],
  rivieramaya: ['porque-hay-tanto-sargazo-cancun','sargazo-cancun-hoy','mapa-sargazo-riviera-maya-hoy','sargazo-riviera-maya','cancun-seaweed-map-2026','pronostico-sargazo','playas-sin-sargazo-hoy','mapa-sargazo','temporada-sargazo-rivieramaya','mejores-playas-sin-sargazo-rivieramaya','sargazo-rivieramaya-esta-semana','press'],
}

const PRODUCT = 'Product: a live satellite sargassum (seaweed/sargazo) map. Copernicus/NOAA AFAI imagery refreshed 4x/day, per-beach Beach Score (0-100), status clean/moderate/avoid, 7-day per-beach forecast, published backtest accuracy. Honesty doctrine: NEVER invent specific numbers, percentages or testimonials -- use live placeholders ("updated today", "Beach Score", "status today"). Voice = "The Watcher"/"El Vigia": a satellite that watches the sea while you sleep and tells you each morning where the water is clean -- measured, never guessed. Conversion = one-time PASS, USD 5.99/11.99/19.99.'

const PLAN_SCHEMA = { type:'object', additionalProperties:false, required:['targets'], properties:{ targets:{ type:'array', minItems:6, maxItems:14, items:{ type:'object', additionalProperties:false, required:['slug','lang','intent','title','rationale'], properties:{ slug:{type:'string'}, lang:{type:'string',enum:['en','es']}, intent:{type:'string'}, title:{type:'string'}, rationale:{type:'string'} } } } } }

const PAGESPEC_SCHEMA = { type:'object', additionalProperties:false, required:['pages'], properties:{ pages:{ type:'array', minItems:1, maxItems:4, items:{ type:'object', additionalProperties:false, required:['site','lang','slug','title','desc','h1','intro','sections','faq','pageType'], properties:{ site:{type:'string',enum:['florida','puntacana','rivieramaya']}, lang:{type:'string',enum:['en','es']}, slug:{type:'string'}, title:{type:'string'}, desc:{type:'string'}, h1:{type:'string'}, intro:{type:'string'}, sections:{type:'array',minItems:2,maxItems:4,items:{type:'object',additionalProperties:false,required:['h2','text'],properties:{h2:{type:'string'},text:{type:'string'}}}}, faq:{type:'array',minItems:3,maxItems:6,items:{type:'object',additionalProperties:false,required:['q','a'],properties:{q:{type:'string'},a:{type:'string'}}}}, pageType:{type:'string'} } } } } }

phase('Plan')
const perSite = await pipeline(
  SITES,
  (s) => {
    const prompt = 'You are an SEO strategist scaling ' + s.domain + ' (' + s.market + ', langs: ' + s.langs + ') toward 100x traffic. Plan a batch of NEW programmatic-SEO pages.\n\n' + PRODUCT + '\n\nExpansion targets for THIS site:\n' + s.targets + '\n\nALREADY EXISTING pages (DO NOT propose these slugs or close duplicates): ' + (EXISTING[s.key]||[]).join(', ') + '\n\nRules: each target = one page mapping a real search intent. Use clean lowercase-hyphen slugs (NO lang/site prefix). Spanish pages lang=es, English lang=en. Favor sub-destination/city pages (each backed by the nearest tracked beach), question pages (snippet bait), and Spanish-language coverage (biggest untapped demand). 6-14 targets.'
    return agent(prompt, { schema: PLAN_SCHEMA, label: 'plan:' + s.key, phase: 'Plan' })
      .then(r => ({ s, targets: (r && r.targets) || [] })).catch(() => ({ s, targets: [] }))
  },
  (res) => {
    const s = res.s
    const ex = new Set(EXISTING[s.key] || [])
    const fresh = res.targets.filter(t => t.slug && !ex.has(t.slug))
    if (!fresh.length) return { site: s.key, pages: [] }
    // Batch targets into groups of ~3 per writer agent (volume + speed under low concurrency).
    const groups = []
    for (let i = 0; i < fresh.length; i += 3) groups.push(fresh.slice(i, i + 3))
    return parallel(groups.map((g, gi) => () => {
      const briefs = g.map(t => '- slug "' + t.slug + '" (lang ' + t.lang + ', intent ' + t.intent + '): ' + t.title).join('\n')
      const prompt = 'You are an SEO content engineer for ' + s.domain + ' (' + s.market + '). Write publish-ready pages for these targets:\n' + briefs + '\n\n' + PRODUCT + '\n\nFor EACH page: site="' + s.key + '"; keep the given slug and lang. title <=60 chars keyword-front-loaded; meta desc 130-155 chars; intro 110-180 words ANSWERING the query in the first two sentences (snippet bait) then differentiating (per-beach satellite data 4x/day, measured not guessed, honest about clouds/uncertainty, never invent numbers); 2-4 H2 sections (90-150 words) on sub-intents (which beaches, when it clears, safety, where to go instead); 3-6 answer-first FAQ Q&A. Correct idiom (ES: acentos correctos; EN: US spelling). Return all ' + g.length + ' pages.'
      return agent(prompt, { schema: PAGESPEC_SCHEMA, label: 'write:' + s.key + ':' + gi, phase: 'Write' })
        .then(r => (r && r.pages) || []).catch(() => [])
    })).then(arrs => ({ site: s.key, pages: arrs.filter(Boolean).flat() }))
  }
)

const allPages = perSite.filter(Boolean).flatMap(r => r.pages)
log('Wave 2 EN/ES pages: ' + allPages.length)
return { counts: { pages: allPages.length }, pages: allPages }
