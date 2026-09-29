#!/usr/bin/env node
/**
 * seo-hreflang-targets.test.cjs — Contrat hreflang "zéro URL fantôme".
 *
 * Règle de vérité : un hreflang ne peut être émis QUE vers une page qui
 * existe réellement, indexable, au canonical cohérent. Une variante
 * linguistique absente ⇒ AUCUN hreflang vers elle (jamais de page vide
 * créée pour satisfaire un compteur).
 *
 * Deux garde-fous complémentaires, tous deux sur de la génération réelle :
 *  A) Matrice éditoriale vite.config.js : chaque enPath/esPath non-null de
 *     `pages[]` DOIT avoir sa page générée dans `enPages[]`/`esPages[]`
 *     (évalue les vrais littéraux du build, pas un grep).
 *  B) Génération réelle today-pages.cjs dans un dossier temporaire avec les
 *     VRAIES données du repo : chaque page émise doit être self-canonical et
 *     chaque hreflang doit résoudre vers un fichier existant, non-noindex.
 *
 * Régression couverte (2026-09-29) : sargasses-aujourdhui / sargasses-pres-de-moi
 * annonçaient en/sargassum-today, es/sargazo-hoy, en/sargassum-near-me,
 * es/sargazo-cerca-de-mi — jamais générés — + canonical today-pages sans
 * préfixe /en///es/ (/sargassum-today/, /hoy/ inexistants).
 * Exit 1 si échec.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
let failures = 0
let checks = 0
function ok(cond, label) {
  checks++
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

// ── Extraction d'un littéral tableau JS (string/comments-aware) ────────────
function extractArrayLiteral(src, varName) {
  const anchor = `const ${varName} = [`
  const idx = src.indexOf(anchor)
  if (idx < 0) throw new Error(`ancre introuvable: ${anchor}`)
  let i = idx + anchor.length - 1 // sur le '['
  let depth = 0
  let quote = null
  let esc = false
  let lineComment = false
  let blockComment = false
  for (; i < src.length; i++) {
    const ch = src[i]
    const nx = src[i + 1]
    if (lineComment) { if (ch === '\n') lineComment = false; continue }
    if (blockComment) { if (ch === '*' && nx === '/') { blockComment = false; i++ } continue }
    if (quote) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '/' && nx === '/') { lineComment = true; i++; continue }
    if (ch === '/' && nx === '*') { blockComment = true; i++; continue }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue }
    if (ch === '[') depth++
    else if (ch === ']') { depth--; if (depth === 0) break }
  }
  if (depth !== 0) throw new Error(`littéral ${varName} non équilibré`)
  const literal = src.slice(idx + anchor.length - 1, i + 1)
  return new Function(`return (${literal})`)()
}

function main() {
  // ── A. Matrice éditoriale réelle du build ────────────────────────────────
  const viteSrc = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')
  const pages = extractArrayLiteral(viteSrc, 'pages')
  const enPages = extractArrayLiteral(viteSrc, 'enPages')
  const esPages = extractArrayLiteral(viteSrc, 'esPages')
  ok(Array.isArray(pages) && pages.length > 20, `A1 pages[] éditorial évalué (${pages.length} entrées)`)
  ok(enPages.length > 5 && esPages.length > 2, `A1 enPages (${enPages.length}) + esPages (${esPages.length}) évalués`)
  const enPaths = new Set(enPages.map(e => e.path))
  const esPaths = new Set(esPages.map(e => e.path))
  for (const pg of pages) {
    if (pg.enPath != null) {
      ok(enPaths.has(pg.enPath), `A2 ${pg.path} : enPath ${pg.enPath} réellement généré (enPages)`)
    }
    if (pg.esPath != null) {
      ok(esPaths.has(pg.esPath), `A2 ${pg.path} : esPath ${pg.esPath} réellement généré (esPages)`)
    }
  }
  // Les 2 hubs "aujourd'hui / près de moi" n'ont AUCUNE variante éditoriale
  // EN/ES générée ⇒ politique FR-only explicite (pas de hreflang fantôme).
  for (const hub of ['sargasses-aujourdhui', 'sargasses-pres-de-moi']) {
    const e = pages.find(p => p.path === hub)
    ok(!!e && e.enPath == null && e.esPath == null, `A3 ${hub} : FR-only (enPath/esPath null, aucun hreflang EN/ES émis)`)
  }

  // ── B. Génération réelle today-pages (données live du repo, dossier tmp) ─
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'), 'utf8'))
  ok(Array.isArray(live.levels) && live.levels.length > 0, `B1 sargassum.json live présent (${(live.levels || []).length} niveaux)`)
  const { generateTodayPages } = require(path.join(ROOT, 'scripts', 'lib', 'today-pages.cjs'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hreflang-targets-'))
  try {
    generateTodayPages(null, tmp)
    const domainRoot = { 'sargasses-martinique.com': tmp, 'sargasses-guadeloupe.com': path.join(tmp, '_gp') }
    const files = []
    const walk = d => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name)
        if (e.isDirectory()) walk(f)
        else if (e.name === 'index.html') files.push(f)
      }
    }
    walk(tmp)
    ok(files.length >= 6, `B2 6 pages jour générées FR/EN/ES × MQ/_gp (${files.length} fichiers)`)
    const toFile = (domain, pathname) => {
      const root = domainRoot[domain]
      if (!root) return null
      const clean = String(pathname).replace(/^\/+/, '').replace(/\/+$/, '')
      return clean === '' ? path.join(root, 'index.html') : path.join(root, clean, 'index.html')
    }
    for (const f of files) {
      const h = fs.readFileSync(f, 'utf8')
      const canon = (h.match(/rel="canonical" href="([^"]*)"/) || [])[1]
      const robotsNoindex = /name="robots" content="[^"]*noindex/i.test(h)
      ok(!robotsNoindex, `B3 ${path.relative(tmp, f)} : indexable (pas de noindex)`)
      if (canon) {
        try {
          const u = new URL(canon)
          const expect = toFile(u.hostname, u.pathname)
          ok(expect && path.resolve(expect) === path.resolve(f), `B3 ${path.relative(tmp, f)} : self-canonical (${u.pathname})`)
        } catch { ok(false, `B3 ${path.relative(tmp, f)} : canonical URL valide`) }
      } else {
        ok(false, `B3 ${path.relative(tmp, f)} : canonical présent`)
      }
      const re = /hreflang="([^"]+)" href="([^"]+)"/g
      let m
      let nAlt = 0
      while ((m = re.exec(h))) {
        nAlt++
        const [, lang, href] = m
        try {
          const u = new URL(href)
          const target = toFile(u.hostname, u.pathname)
          ok(!!target && fs.existsSync(target), `B4 ${path.relative(tmp, f)} : hreflang ${lang} → cible existante (${u.hostname}${u.pathname})`)
          if (target && fs.existsSync(target)) {
            const th = fs.readFileSync(target, 'utf8')
            ok(!/name="robots" content="[^"]*noindex/i.test(th), `B4 ${path.relative(tmp, f)} : cible ${lang} indexable`)
          }
        } catch { ok(false, `B4 ${path.relative(tmp, f)} : hreflang ${lang} URL valide`) }
      }
      ok(nAlt >= 2, `B3 ${path.relative(tmp, f)} : cluster hreflang présent (${nAlt} tags)`)
    }
    // Invariants structurels : les FR de référence existent aux deux domaines.
    ok(fs.existsSync(path.join(tmp, 'aujourdhui', 'index.html')), 'B2 /aujourdhui/ (MQ) générée')
    ok(fs.existsSync(path.join(tmp, '_gp', 'aujourdhui', 'index.html')), 'B2 /_gp/aujourdhui/ (GP) générée')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  console.log(`\n${checks - failures}/${checks} checks OK`)
  process.exit(failures ? 1 : 0)
}

main()
