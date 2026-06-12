// Vérif locale de la landing scrollable (dev server 5220) — frames réels.
const { chromium } = require('playwright')
const wait = ms => new Promise(r => setTimeout(r, ms))
const SHOTS = __dirname + '/landing-shots'
require('fs').mkdirSync(SHOTS, { recursive: true })

;(async () => {
  const br = await chromium.launch()
  const out = {}

  for (const [name, vp] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
    const ctx = await br.newContext({ viewport: vp })
    const pg = await ctx.newPage()
    await pg.route(/script\.google\.com/, r => r.abort())
    await pg.addInitScript(() => { try { sessionStorage.removeItem('sg_hero_seen') } catch (_) {} })
    await pg.goto('http://localhost:5220/', { waitUntil: 'domcontentloaded' })
    await pg.waitForSelector('[role=dialog]', { timeout: 15000 })
    await wait(2500)
    await pg.screenshot({ path: `${SHOTS}/${name}-1-hero.png` })

    // chevron → S2
    await pg.evaluate(() => document.querySelector('[role=dialog] .sg-hero-chev').closest('button').click())
    await wait(1100)
    const r1 = await pg.evaluate(() => {
      const dlg = document.querySelector('[role=dialog]')
      return {
        s2Top: Math.round(dlg.querySelector('#sg-s2').getBoundingClientRect().top),
        sticky: dlg.querySelector('.sg-stick').classList.contains('on'),
        revealed: [...dlg.querySelectorAll('.sg-rv')].filter(n => n.classList.contains('in')).length,
        total: dlg.querySelectorAll('.sg-rv').length,
      }
    })
    out[name + '_afterChevron'] = r1
    await pg.screenshot({ path: `${SHOTS}/${name}-2-s2.png` })

    // bas de page (S4 + footer)
    await pg.evaluate(() => { const d = document.querySelector('[role=dialog]'); d.scrollTo({ top: d.scrollHeight }) })
    await wait(1100)
    out[name + '_bottom'] = await pg.evaluate(() => {
      const dlg = document.querySelector('[role=dialog]')
      return {
        revealed: [...dlg.querySelectorAll('.sg-rv')].filter(n => n.classList.contains('in')).length,
        sticky: dlg.querySelector('.sg-stick').classList.contains('on'),
        footerSeen: dlg.querySelector('footer').getBoundingClientRect().top < (window.innerHeight + 5),
      }
    })
    await pg.screenshot({ path: `${SHOTS}/${name}-3-bottom.png` })

    // sortie : « Ouvrir la carte live » (S2) → fondu → carte
    await pg.evaluate(() => {
      const dlg = document.querySelector('[role=dialog]')
      const btns = [...dlg.querySelectorAll('button')].filter(b => /Ouvrir la carte live|Open the live map/.test(b.textContent))
      btns[btns.length - 1].click()
    })
    await wait(150)
    out[name + '_exitMidFade'] = await pg.evaluate(() => {
      const dlg = document.querySelector('[role=dialog]')
      return dlg ? { opacity: getComputedStyle(dlg).opacity, present: true } : { present: false }
    })
    await wait(600)
    out[name + '_afterExit'] = await pg.evaluate(() => ({
      heroGone: !document.querySelector('[role=dialog].sg-heroSec, [role=dialog] .sg-heroSec'),
      fab: (() => { const f = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '💬'); if (!f) return null; const r = f.getBoundingClientRect(); return { bottom: Math.round(window.innerHeight - r.bottom) } })(),
      searchTop: (() => { const i = document.querySelector('input[placeholder*="echercher"],input[placeholder*="earch"],input[placeholder*="uscar"]'); return i ? Math.round(i.getBoundingClientRect().top) : null })(),
    }))
    await pg.screenshot({ path: `${SHOTS}/${name}-4-map.png` })

    // fiche : ouvre la 1re plage via la liste, puis ferme → sortie animée
    if (name === 'mobile') {
      await pg.evaluate(() => { const t = [...document.querySelectorAll('button')].find(b => /^Plages$|^Beaches$|^Playas$/.test(b.textContent.trim())); t && t.click() })
      await wait(900)
      await pg.evaluate(() => { const c = document.querySelector('.beach-card,[class*=card]')||[...document.querySelectorAll('button')].find(b=>/\/100/.test(b.textContent)); c && c.click() })
      await wait(1000)
      const sheetOpen = await pg.evaluate(() => !!document.querySelector('.sheet'))
      let exitSeen = false
      if (sheetOpen) {
        await pg.evaluate(() => { const x = [...document.querySelectorAll('.sheet button')].find(b => b.textContent.trim() === '✕'); x && x.click() })
        await wait(120)
        exitSeen = await pg.evaluate(() => !!document.querySelector('.sheet-exit'))
        await wait(400)
      }
      out.sheet = { sheetOpen, exitAnimated: exitSeen, goneAfter: await pg.evaluate(() => !document.querySelector('.sheet')) }
    }
    await ctx.close()
  }
  console.log(JSON.stringify(out, null, 1))
  await br.close()
})().catch(e => { console.error(e); process.exit(1) })
