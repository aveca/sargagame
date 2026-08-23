#!/usr/bin/env node
/**
 * fb-list-groups.cjs — liste les groupes FB dont le compte .fb-session est MEMBRE.
 * Read-only (aucune publication). Sert à choisir un --group=URL pour fb-post-card.cjs.
 * Usage : node scripts/automation/fb-list-groups.cjs [--headless]
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const SESSION_DIR = path.join(ROOT, '.fb-session')
const OUT = path.join(ROOT, 'scripts', 'video', 'out')
const HEADLESS = process.argv.includes('--headless')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'))
  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: HEADLESS, viewport: { width: 1280, height: 1000 }, locale: 'fr-FR',
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
  await sleep(3000)
  const logged = await page.evaluate(() => !(document.querySelector('input[name="pass"]')) && !/login|checkpoint/i.test(location.pathname))
  if (!logged) { console.error('✗ session FB non connectée'); await ctx.close(); process.exit(2) }
  console.log('✓ session connectée — chargement des groupes…')

  await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded' })
  await sleep(4000)
  // scroll pour charger toute la liste
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 2400); await sleep(1200) }

  const groups = await page.evaluate(() => {
    const seen = {}
    document.querySelectorAll('a[href*="/groups/"]').forEach(a => {
      const m = a.getAttribute('href').match(/\/groups\/([0-9a-zA-Z.]+)\/?/)
      if (!m) return
      const id = m[1]
      if (/feed|joins|discover|create|notifications|category/.test(id)) return
      const name = (a.textContent || '').trim()
      if (!name || name.length < 2) return
      if (!seen[id] || seen[id].length < name.length) seen[id] = name
    })
    return Object.entries(seen).map(([id, name]) => ({ id, name, url: 'https://www.facebook.com/groups/' + id + '/' }))
  })

  await page.screenshot({ path: path.join(OUT, 'fb-groups-list.png') }).catch(() => {})
  const HOSPI = /h[oô]tel|h[ée]bergे|h[ée]berg|location|loueur|g[iî]te|villa|tourism|tourisme|airbnb|saisonni|riad|résidence|residence|professionnel|pro |conciergerie|restaurat/i
  const hospi = groups.filter(g => HOSPI.test(g.name))
  console.log('\n=== TOUS LES GROUPES (' + groups.length + ') ===')
  groups.forEach(g => console.log((HOSPI.test(g.name) ? '★ ' : '  ') + g.name + '  —  ' + g.url))
  console.log('\n=== CANDIDATS HÔTELLERIE / LOCATION (' + hospi.length + ') ===')
  hospi.forEach(g => console.log('★ ' + g.name + '  —  ' + g.url))
  fs.writeFileSync(path.join(OUT, 'fb-groups.json'), JSON.stringify({ all: groups, hospi }, null, 2))
  await ctx.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
