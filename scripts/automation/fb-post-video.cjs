#!/usr/bin/env node
/**
 * fb-post-video.cjs — Poste le « Brief plage » vidéo du jour dans un groupe FB.
 * Session persistante .fb-session (même profil que fb-scrape). JAMAIS le
 * profil Chrome perso (docs/OPERATIONS.md §2).
 *
 * Usage :
 *   node scripts/automation/fb-post-video.cjs --region=mq --dry-run   # tout sauf Publier + screenshot
 *   node scripts/automation/fb-post-video.cjs --region=mq --go        # publie réellement
 *   options : --video=<chemin.mp4> --group=<url> --headless
 *
 * Sécurité : --dry-run par défaut. --go requis explicitement pour publier.
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const SESSION_DIR = path.join(ROOT, '.fb-session')
const OUTV = path.join(ROOT, 'scripts', 'video', 'out')

const GROUPS = {
  mq: { url: 'https://www.facebook.com/groups/169026757271139/', name: 'SOS Sargasses Martinique' },
  gp: { url: 'https://www.facebook.com/groups/1264655221572269/', name: 'Destination Guadeloupe' },
}
const HOOKS = {
  mq: d => `🌊 Le bulletin sargasses du ${d} en 20 secondes : ce qui tourne demain, et LA plage propre du jour — d'après le satellite Copernicus de ce matin.\n\nLa carte complète (53 plages, gratuit) 👉 https://sargasses-martinique.com/?utm_source=fb&utm_medium=video_brief`,
  gp: d => `🌊 Le bulletin sargasses du ${d} en 20 secondes : ce qui tourne demain, et LA plage propre du jour — d'après le satellite Copernicus de ce matin.\n\nLa carte complète (83 plages, gratuit) 👉 https://sargasses-guadeloupe.com/?utm_source=fb&utm_medium=video_brief`,
}

const args = process.argv.slice(2)
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }
const REGION = opt('region') || 'mq'
const GO = args.includes('--go')
const HEADLESS = args.includes('--headless')
const group = opt('group') ? { url: opt('group'), name: 'custom' } : GROUPS[REGION]
if (!group) { console.error('✗ pas de groupe pour la région ' + REGION + ' (utiliser --group=URL)'); process.exit(1) }

const date = new Date().toISOString().slice(0, 10)
const video = opt('video') || path.join(OUTV, `brief-${REGION}-${date}.mp4`)
if (!fs.existsSync(video)) { console.error('✗ vidéo introuvable: ' + video); process.exit(1) }
const dateLong = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const text = (HOOKS[REGION] || HOOKS.mq)(dateLong)

;(async () => {
  const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'))
  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: HEADLESS, viewport: { width: 1280, height: 900 }, locale: 'fr-FR',
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  const shot = n => page.screenshot({ path: path.join(OUTV, `fbpost-${REGION}-${n}.png`) }).catch(() => {})

  console.log(`→ ${group.name} | ${path.basename(video)} | mode ${GO ? 'GO (publication réelle)' : 'DRY-RUN'}`)
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const loggedIn = await page.evaluate(() => !document.querySelector('input[name="email"]'))
  if (!loggedIn) { console.error('✗ Session FB expirée — relancer en mode visible et se connecter (fb-scrape pattern).'); await shot('notlogged'); await ctx.close(); process.exit(1) }

  await page.goto(group.url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  // Fermer un éventuel dialog parasite (notifications, etc.)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(800)

  // Ouvre le composer : la zone « Écrivez quelque chose… » / « Exprimez-vous »
  const composerTriggers = [
    'div[role="button"]:has-text("Écrivez quelque chose")',
    'div[role="button"]:has-text("Exprimez-vous")',
    'div[role="button"]:has-text("Quoi de neuf")',
    'div[role="button"]:has-text("Write something")',
  ]
  let opened = false
  for (const sel of composerTriggers) {
    const el = page.locator(sel).first()
    if (await el.isVisible().catch(() => false)) { await el.click(); opened = true; break }
  }
  if (!opened) { console.error('✗ composer introuvable (membre du groupe ? droits de post ?)'); await shot('nocomposer'); await ctx.close(); process.exit(1) }
  const dialog = page.locator('div[role="dialog"]').last()
  await dialog.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => { await shot('nodialog') })
  await page.waitForTimeout(1500)
  await shot('dialog')
  console.log('   dialogs:', await page.locator('div[role="dialog"]').count(),
    '| textboxes:', await page.locator('div[role="textbox"]').count())

  // Texte — le composer peut être le dialog OU un textbox plein écran
  let box = dialog.locator('div[role="textbox"]').first()
  if (!(await box.count())) box = page.locator('div[role="textbox"]').last()
  await box.click({ timeout: 10000 }).catch(async e => { await shot('notextbox'); throw e })
  await box.type(text, { delay: 18 })
  console.log('   texte saisi')

  // Vidéo : bouton Photo/vidéo puis input[type=file] (souvent déjà dans le DOM)
  let fileInput = dialog.locator('input[type="file"]').first()
  if (!(await fileInput.count())) {
    const pv = dialog.locator('div[aria-label*="hoto"], div[role="button"]:has-text("Photo")').first()
    if (await pv.isVisible().catch(() => false)) { await pv.click(); await page.waitForTimeout(900) }
    fileInput = dialog.locator('input[type="file"]').first()
  }
  if (!(await fileInput.count())) fileInput = page.locator('input[type="file"]').last()
  await fileInput.setInputFiles(video)
  console.log('   vidéo attachée, traitement FB…')
  // Attendre la fin du processing : la barre de progression disparaît / vignette prête
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000)
    const busy = await dialog.locator('[role="progressbar"]').count()
    if (!busy) break
  }
  await page.waitForTimeout(2500)
  await shot('ready')

  const publishBtn = dialog.locator('div[aria-label="Publier"][role="button"], div[role="button"]:has-text("Publier")').last()
  const enabled = await publishBtn.isVisible().catch(() => false)
  console.log('   bouton Publier visible: ' + enabled)
  if (!GO) {
    console.log('DRY-RUN terminé — rien publié. Vérifier fbpost-' + REGION + '-ready.png puis relancer avec --go')
    await ctx.close(); process.exit(0)
  }
  if (!enabled) { console.error('✗ bouton Publier indisponible'); await ctx.close(); process.exit(1) }
  await publishBtn.click()
  // Le dialog se ferme quand c'est parti (l'upload peut continuer côté FB)
  await dialog.waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(6000)
  await shot('published')
  console.log('✓ publié dans ' + group.name)
  await ctx.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
