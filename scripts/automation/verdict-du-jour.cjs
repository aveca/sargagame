#!/usr/bin/env node
/**
 * verdict-du-jour.cjs — Générateur de DRAFTS « verdict du jour » (P0 distribution).
 *
 * Lit les mêmes données que /aujourdhui/ (sargassum.json par région, 100 % réel)
 * et produit des brouillons prêts à poster — JAMAIS d'envoi automatique :
 *   FACEBOOK / WHATSAPP / INSTAGRAM / REDDIT / EMAIL (objet + corps).
 *
 * Sortie : scripts/automation/data/verdict-du-jour/<AAAA-MM-JJ>-<region>.md
 * Usage : node scripts/automation/verdict-du-jour.cjs [--region=mq] [--dry-run]
 *   (toujours dry-run par nature : ce script ne poste rien, il écrit des .md)
 *
 * RÈGLES : zéro invention (que les statuts live), une alternative seulement si
 * réelle (haversine même région), ton sobre (pas de sensationnalisme), lien
 * avec UTM vers /aujourdhui/ de chaque domaine.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
const { getAllRegions } = require('../../regions/index.cjs')
const { SARG_TO_BEACH } = require('../lib/sarg-to-beach.cjs')
const { slugify } = require('../lib/slug-resolver.cjs')

const BEACH_TO_SARG = {}
for (const [sarg, bid] of Object.entries(SARG_TO_BEACH)) BEACH_TO_SARG[bid] = sarg

const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
function haversineKm(a, b, c, d) {
  if ([a, b, c, d].some(v => typeof v !== 'number' || isNaN(v))) return Infinity
  const R = 6371, dLa = (c - a) * Math.PI / 180, dLo = (d - b) * Math.PI / 180
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const L = {
  fr: {
    date: d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    title: (r, date) => `PLAGES ${r.toUpperCase()} — ${date.toUpperCase()}`,
    clean: 'Propres', watch: 'À surveiller', bad: 'À éviter',
    alt: (n, km) => `→ Plutôt : ${n} (${km})`,
    more: (domain, slug) => `https://${domain}/${slug}/?utm_source=social&utm_medium=draft&utm_campaign=verdict_jour`,
    cta: 'État plage par plage + prévision 7 jours :',
    wa: 'À partager autour de vous avant de partir à la plage.',
    mail: (r, date) => `Où se baigner en ${r} — ${date}`,
  },
  en: {
    date: d => d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    title: (r, date) => `${r.toUpperCase()} BEACHES — ${date.toUpperCase()}`,
    clean: 'Clean', watch: 'Watch', bad: 'Avoid',
    alt: (n, km) => `→ Instead: ${n} (${km})`,
    more: (domain, slug) => `https://${domain}/${slug}/?utm_source=social&utm_medium=draft&utm_campaign=verdict_jour`,
    cta: 'Beach-by-beach status + 7-day forecast:',
    wa: 'Share with anyone heading to the beach today.',
    mail: (r, date) => `Where to swim in ${r} — ${date}`,
  },
  es: {
    date: d => d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    title: (r, date) => `PLAYAS ${r.toUpperCase()} — ${date.toUpperCase()}`,
    clean: 'Limpias', watch: 'Vigilar', bad: 'Evitar',
    alt: (n, km) => `→ Mejor: ${n} (${km})`,
    more: (domain, slug) => `https://${domain}/${slug}/?utm_source=social&utm_medium=draft&utm_campaign=verdict_jour`,
    cta: 'Estado playa por playa + pronóstico 7 días:',
    wa: 'Compártelo con quien vaya a la playa hoy.',
    mail: (r, date) => `Dónde bañarse en ${r} — ${date}`,
  },
}
const DOT = { clean: '🟢', moderate: '🟡', avoid: '🔴' }
const kmFmt = km => km < 1 ? Math.round(km * 1000) + ' m' : '~' + Math.round(km) + ' km'

function buildDraft(region) {
  const lang = region.primaryLang === 'es' ? 'es' : region.primaryLang === 'en' ? 'en' : 'fr'
  const t = L[lang]
  const isCore = region.id === 'mq' || region.id === 'gp'
  const data = isCore
    ? loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'), null)
    : loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json'), null)
  const levels = (data && data.levels) || []
  if (!levels.length) return { skipped: 'pas de niveaux live' }
  let beaches
  if (isCore) {
    const all = loadJSON(path.join(ROOT, 'public', 'data', 'beaches-list.json'), [])
    beaches = all.filter(b => b.island === region.id)
  } else beaches = (region.beaches || []).filter(b => b.island === region.id)
  const lvById = Object.fromEntries(levels.map(l => [l.id, l]))
  const live = []
  for (const b of beaches) {
    const sargId = isCore ? BEACH_TO_SARG[b.id] : b.id
    const lv = lvById[sargId] || {}
    if (!['clean', 'moderate', 'avoid'].includes(lv.status)) continue
    live.push({ b, status: lv.status, score: lv.score })
  }
  if (!live.length) return { skipped: 'aucun statut live' }
  const urlOf = b => isCore ? `/plages/${b.slug}/` : `/beach/${b.slug || slugify(b.name)}/`
  const clean = live.filter(x => x.status === 'clean').sort((a, b2) => (b2.score ?? -1) - (a.score ?? -1))
  const moderate = live.filter(x => x.status === 'moderate')
  const avoid = live.filter(x => x.status === 'avoid')
  const altFor = x => {
    let best = null, bd = Infinity
    for (const c of clean) {
      if (c.b.id === x.b.id) continue
      const km = haversineKm(x.b.lat, x.b.lng, c.b.lat, c.b.lng)
      if (km < bd) { bd = km; best = c }
    }
    return best && isFinite(bd) && bd <= 60 ? { ...best, km: kmFmt(bd) } : null
  }
  const now = new Date()
  const date = t.date(now)
  // Lien : page today NATIVO de la région si elle existe (jamais de 404),
  // sinon le slug généré (/aujourdhui/ core, /today/, /hoy/).
  let slug = isCore ? 'aujourdhui' : (lang === 'es' ? 'hoy' : 'today')
  try {
    const { todaySlugFor } = require('../lib/today-pages.cjs')
    slug = todaySlugFor(region).slug
  } catch {}
  const moreUrl = t.more(region.domain, slug)
  const line = x => `${DOT[x.status]} ${x.b.name}${x.score != null ? ` (${x.score}/100)` : ''}`
  const avoidLine = x => {
    const alt = altFor(x)
    return `${DOT.avoid} ${x.b.name}` + (alt ? `\n  ${t.alt(alt.b.name, alt.km)}` : '')
  }
  const blocks = []
  if (clean.length) blocks.push(`${t.clean} :\n` + clean.slice(0, 5).map(line).join('\n'))
  if (moderate.length) blocks.push(`${t.watch} :\n` + moderate.slice(0, 4).map(line).join('\n'))
  if (avoid.length) blocks.push(`${t.bad} :\n` + avoid.slice(0, 4).map(avoidLine).join('\n'))
  const body = `${t.title(region.name, date)}\n\n${blocks.join('\n\n')}\n\n${t.cta}\n${moreUrl}`
  const wa = `${body}\n\n${t.wa}`
  const ig = `${body}\n\n#sargasses #${slugify(region.name)} #plage`
  const reddit = lang === 'fr'
    ? `État des plages du jour (${region.name}) — relevé satellite, par plage :\n\n${blocks.join('\n\n')}\n\nSource + prévision 7 jours : ${moreUrl}`
    : `Today's beach status (${region.name}) — satellite readings, beach by beach:\n\n${blocks.join('\n\n')}\n\nSource + 7-day forecast: ${moreUrl}`
  const mail = `Objet : ${t.mail(region.name, date)}\n\n${body}\n\n— Le Veilleur (données satellite Copernicus, mesuré pas deviné)`
  return { body, wa, ig, reddit, mail, stats: { clean: clean.length, moderate: moderate.length, avoid: avoid.length, total: live.length } }
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
  const only = args.region || null
  const day = new Date().toISOString().slice(0, 10)
  const outDir = path.join(ROOT, 'scripts', 'automation', 'data', 'verdict-du-jour')
  fs.mkdirSync(outDir, { recursive: true })
  const regions = getAllRegions().filter(r => (!only || r.id === only) && r.id !== 'barbados')
  for (const r of regions) {
    const d = buildDraft(r)
    if (d.skipped) { console.log(`   → ${r.id} : ignoré (${d.skipped})`); continue }
    const md = `# Verdict du jour — ${r.name} (${r.id}) · ${day}\n`
      + `> DRAFT prêt à poster (ne jamais automatiser l'envoi). Source : sargassum.json du jour. ${d.stats.clean} propres · ${d.stats.moderate} modérées · ${d.stats.avoid} à éviter (${d.stats.total} suivies).\n`
      + `\n## FACEBOOK\n\n${d.body}\n\n## WHATSAPP\n\n${d.wa}\n\n## INSTAGRAM\n\n${d.ig}\n\n## REDDIT / FORUM\n\n${d.reddit}\n\n## EMAIL\n\n${d.mail}\n`
    const fp = path.join(outDir, `${day}-${r.id}.md`)
    fs.writeFileSync(fp, md, 'utf-8')
    console.log(`   → ${r.id} : ${fp} (${d.stats.clean}/${d.stats.moderate}/${d.stats.avoid})`)
  }
  // Anti-bloat : ne garde que 7 jours de drafts (l'historique vit dans git).
  try {
    const cutoff = Date.now() - 7 * 86400000
    for (const f of fs.readdirSync(outDir)) {
      if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)) continue
      const fp = path.join(outDir, f)
      if (fs.statSync(fp).mtimeMs < cutoff) { fs.unlinkSync(fp); console.log(`   → prune ${f}`) }
    }
  } catch (e) { console.warn('   ⚠ prune drafts:', e.message) }
}
if (require.main === module) main()
module.exports = { buildDraft }
