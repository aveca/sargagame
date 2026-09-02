import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Sprint DATA + UX 2026-09-02 — « Où se baigner aujourd'hui ? » + « Ma plage » (free tier).
// Données réelles : la série 7 j mockée provient du VRAI fichier privé du pipeline
// (_private/forecast-full.json) servi pour le slug demandé — jamais de série inventée.

const __dirname = dirname(fileURLToPath(import.meta.url))

const PRIVATE_FC = JSON.parse(
  readFileSync(join(__dirname, '../../public/api/copernicus/_private/forecast-full.json'), 'utf8')
)

function seriesFor(id: string) {
  const w = PRIVATE_FC.weekly || {}
  return (w[id] || w['grande-anse'] || Object.values(w)[0]) as any[]
}

const FC7_HEAD = 'text=7 PROCHAINS JOURS'

// Les tests simulent des retours « le lendemain » via reload : le service worker
// (precache) servirait un bundle périmé au reload → on le bloque dans le contexte.
test.use({ serviceWorkers: 'block' })

test.describe('Ma plage — free tier', () => {
  test('homepage hero: meilleur choix réel + verdict + CTA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sg-maplabel', { timeout: 30000 })

    // Kicker « Meilleur choix aujourd'hui » visible
    await expect(page.locator('text=/Meilleur choix aujourd/i').first()).toBeVisible({ timeout: 15000 })

    // La carte héros contient un nom de plage RÉEL + fraîcheur + CTA
    const heroCta = page.locator('button:has-text("Voir →")').first()
    await expect(heroCta).toBeVisible()
    const heroText = (await heroCta.innerText()).replace(/\n/g, ' | ')
    expect(heroText).toMatch(/Données satellite/) // fraîcheur réelle affichée

    // Tap héros → fiche détail (comic) ouverte avec le strip 7 jours
    await heroCta.click()
    await expect(page.getByText('7 PROCHAINS JOURS', { exact: true })).toBeVisible({ timeout: 15000 })
  })

  test('suivre une plage débloque ses 7 jours réels (sans payer)', async ({ page }) => {
    // Mock forecast-beach.php avec la VRAIE série du pipeline (prod identique)
    await page.route('**/api/copernicus/forecast-beach.php*', route => {
      const url = new URL(route.request().url())
      const id = url.searchParams.get('beach') || ''
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id, updatedAt: new Date().toISOString(), forecast: seriesFor(id) }),
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sg-maplabel', { timeout: 30000 })

    // Ouvre la fiche via le héros
    await page.locator('button:has-text("Voir →")').first().click()
    await expect(page.getByText('7 PROCHAINS JOURS', { exact: true })).toBeVisible({ timeout: 15000 })

    // Non-suivie : cellules teaser (cadenas, teinte réelle) présentes pour les jours > J0
    const teasersBefore = await page.locator('.lc-fc-cell.teaser').count()

    // CTA « Suivre gratuitement cette plage » visible et cliquable
    const follow = page.locator('button:has-text("Suivre gratuitement cette plage")')
    await expect(follow).toBeVisible()
    await follow.click()

    // Devenu « Ma plage » : badge « Ta plage · offerts » + 0 cellule teaser (déverrouillé)
    await expect(page.locator('text=/Ta plage · offerts|Your beach · free/i')).toBeVisible({ timeout: 15000 })
    const teasersAfter = await page.locator('.lc-fc-cell.teaser').count()
    expect(teasersAfter).toBe(0)
    expect(teasersBefore).toBeGreaterThan(0)
  })

  test('boucle quotidienne : « ça a changé » depuis hier sur la carte', async ({ page }) => {
    await page.route('**/api/copernicus/forecast-beach.php*', route => {
      const url = new URL(route.request().url())
      const id = url.searchParams.get('beach') || ''
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id, updatedAt: new Date().toISOString(), forecast: seriesFor(id) }),
      })
    })

    // 1ère visite : suit une plage (pose sg_my_beach + snapshot du jour)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sg-maplabel', { timeout: 30000 })
    await page.locator('button:has-text("Voir →")').first().click()
    const follow = page.locator('button:has-text("Suivre gratuitement cette plage")')
    await expect(follow).toBeVisible({ timeout: 15000 })
    await follow.click()
    // sg_my_beach est stocké JSON-encodé par l'app (helper s()) → parser avant usage
    const myId = await page.evaluate(() => JSON.parse(localStorage.getItem('sg_my_beach') || 'null'))
    expect(myId).toBeTruthy()

    // Ferme la fiche (bouton ✕) puis retourne sur la carte via la bottom nav
    await page.locator('.lc-detail-x').click()
    await page.waitForTimeout(600)
    await page.locator('text=/^Carte$/').first().click()
    await page.waitForSelector('.sg-maplabel', { timeout: 30000 })

    // Carte d'accueil : la carte MA PLAGE est visible (snapshot du jour → pas de chip)
    await expect(page.locator('text=/MA PLAGE/').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=/Ça a changé/i')).toHaveCount(0)

    // Simule le retour LE LENDEMAIN avec un statut différent → chip « changé »
    await page.evaluate(([id]) => {
      const d = new Date(); d.setDate(d.getDate() - 1)
      const p = (n: number) => String(n).padStart(2, '0')
      const yKey = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
      localStorage.setItem('sg_my_snap', JSON.stringify({ id, day: yKey, status: 'avoid' }))
    }, [myId as string])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sg-maplabel', { timeout: 30000 })
    await expect(page.locator('text=/Ça a changé/i').first()).toBeVisible({ timeout: 15000 })
  })

  test('API 404 → état honnête, aucune donnée fabriquée', async ({ page }) => {
    await page.route('**/api/copernicus/forecast-beach.php*', route => {
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'unknown_beach' }) })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sg-maplabel', { timeout: 30000 })
    await page.locator('button:has-text("Voir →")').first().click()
    const follow = page.locator('button:has-text("Suivre gratuitement cette plage")')
    await expect(follow).toBeVisible({ timeout: 15000 })
    await follow.click()

    // Intégrité : API down → JAMAIS de valeur fabriquée. Deux issues honnêtes :
    //  (a) plage couverte par interpolation (série réelle dérivée satellite) → strip
    //      débloqué avec les statuts réels ; (b) sinon → cadenas grisés.
    await page.waitForTimeout(2500)
    const cellClasses: string[] = await page.locator('.lc-fc-cell').evaluateAll(els =>
      els.map(e => (e as HTMLElement).className))
    expect(cellClasses.length).toBe(7)
    for (const cls of cellClasses) {
      // Chaque cellule = statut réel connu OU cadenas/placeholder — jamais de couleur inventée
      expect(cls).toMatch(/lc-fc-cell/)
      const parts = cls.split(/\s+/).filter(c =>
        !['lc-fc-cell', 'now', 'far', 'teaser', 'lock', 'estimated'].includes(c))
      for (const p of parts) expect(['s-ok', 's-mod', 's-bad']).toContain(p)
    }
    // Si le déblocage « offerts » est affiché, il doit reposer sur une série RÉELLE
    // (interpolation pipeline) : ≥2 cellules statut débloquées, sinon cadenas présents.
    const unlocked = await page.locator('.lc-fc-cell.now').count()
    const locked = await page.locator('.lc-fc-cell.teaser, .lc-fc-cell.lock').count()
    // Jamais un état incohérent : ni 0 jour réel ni fabrication — (a) ou (b)
    expect(unlocked >= 7 || locked > 0).toBe(true)
  })
})
