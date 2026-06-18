#!/usr/bin/env node
/**
 * fb-post-card.cjs — Poste une IMAGE + une légende personnalisée dans un groupe FB.
 *
 * Frère de fb-post-video.cjs (qui poste le brief vidéo avec une légende figée).
 * Ici : image quelconque + texte libre lu depuis un fichier (emoji/accents safe).
 * Session persistante .fb-session (Playwright Chromium) — JAMAIS le profil perso.
 * UI FR ou EN gérée (le compte peut être en anglais malgré le locale fr-FR).
 *
 * Usage :
 *   node scripts/automation/fb-post-card.cjs --image=design/share-vauclin-bilan.png \
 *        --text-file=scripts/automation/data/fb-card-vauclin.txt --region=mq --dry-run
 *   ... --go    # publie réellement (sinon DRY-RUN : tout sauf le clic Publier)
 *   options : --group=<url>  --headless
 *
 * Sécurité : --dry-run par défaut. --go requis. Garde-fou : abandon si la légende
 *            n'est pas réellement dans le composer (jamais d'image sans texte).
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const SESSION_DIR = path.join(ROOT, '.fb-session')
const OUT = path.join(ROOT, 'scripts', 'video', 'out')

const GROUPS = {
  mq: { url: 'https://www.facebook.com/groups/169026757271139/', name: 'SOS Sargasses Martinique' },
  gp: { url: 'https://www.facebook.com/groups/1264655221572269/', name: 'Destination Guadeloupe' },
}

const args = process.argv.slice(2)
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }
const REGION = opt('region') || 'mq'
const GO = args.includes('--go')
const HEADLESS = args.includes('--headless')
const group = opt('group') ? { url: opt('group'), name: 'custom' } : GROUPS[REGION]
if (!group) { console.error('✗ pas de groupe pour la région ' + REGION + ' (utiliser --group=URL)'); process.exit(1) }

const imageArg = opt('image')
if (!imageArg) { console.error('✗ --image=<chemin> requis'); process.exit(1) }
const image = path.isAbsolute(imageArg) ? imageArg : path.join(ROOT, imageArg)
if (!fs.existsSync(image)) { console.error('✗ image introuvable: ' + image); process.exit(1) }

let text = opt('text') || ''
const textFile = opt('text-file')
if (textFile) {
  const tf = path.isAbsolute(textFile) ? textFile : path.join(ROOT, textFile)
  if (!fs.existsSync(tf)) { console.error('✗ text-file introuvable: ' + tf); process.exit(1) }
  text = fs.readFileSync(tf, 'utf-8').trim()
}
if (!text) { console.error('✗ légende vide (--text= ou --text-file=)'); process.exit(1) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
const norm = s => (s || '').replace(/\s/g, '')

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'))
  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: HEADLESS, viewport: { width: 1280, height: 900 }, locale: 'fr-FR',
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  const shot = n => page.screenshot({ path: path.join(OUT, `fbcard-${REGION}-${n}.png`) }).catch(() => {})

  console.log(`→ ${group.name} | ${path.basename(image)} | mode ${GO ? 'GO (publication réelle)' : 'DRY-RUN'}`)
  console.log(`  légende (${text.length} car.): ${text.slice(0, 90).replace(/\n/g, ' ')}…`)

  // ── Login check — poll up to 30s ───────────────────────────────────────────
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
  let loggedIn = false
  const deadlineLogin = Date.now() + 30000
  while (!loggedIn && Date.now() < deadlineLogin) {
    await sleep(2000)
    try {
      loggedIn = await page.evaluate(() => {
        if (document.querySelector('input[name="email"]')) return false
        if (document.querySelector('input[name="pass"]')) return false
        return !/login|checkpoint/i.test(location.pathname)
      })
    } catch {}
  }
  if (!loggedIn) {
    console.error('✗ Session FB expirée (pas connecté après 30s). URL:', page.url())
    console.error('  → relancer en visible et se reconnecter, ou: node scripts/automation/fb-scrape.cjs')
    await shot('notlogged'); await ctx.close(); process.exit(2)
  }
  console.log('✓ session connectée')

  // ── Aller au groupe + ouvrir le composer (FR/EN) ───────────────────────────
  await page.goto(group.url, { waitUntil: 'domcontentloaded' })
  await sleep(4500)
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(800)

  const triggers = [
    'Écrivez quelque chose', 'Exprimez-vous', 'Quoi de neuf',
    'Write something', "What's on your mind", 'Create a public post', 'Create post',
  ]
  let opened = false
  for (const t of triggers) {
    const el = page.getByText(t, { exact: false }).first()
    if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); opened = true; break }
  }
  if (!opened) { console.error('✗ composer introuvable (membre du groupe ? droits de post ?)'); await shot('nocomposer'); await ctx.close(); process.exit(3) }
  await sleep(2500)

  // Dialog du composer = celui qui contient un textbox
  const dialogs = page.locator('div[role="dialog"]')
  const nd = await dialogs.count()
  let dialog = dialogs.last()
  for (let i = nd - 1; i >= 0; i--) {
    if (await dialogs.nth(i).locator('div[role="textbox"]').count()) { dialog = dialogs.nth(i); break }
  }
  await dialog.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => { await shot('nodialog') })
  await sleep(1200)
  console.log('   dialogs:', nd, '| textboxes(dialog):', await dialog.locator('div[role="textbox"]').count())
  await shot('composer')

  // ── 1) Image d'abord (l'attachement après le texte réinitialisait l'éditeur) ─
  let fileInput = dialog.locator('input[type="file"]').first()
  if (!(await fileInput.count())) {
    const pv = dialog.locator('div[aria-label*="hoto"], div[aria-label*="Photo"], div[role="button"]:has-text("Photo")').first()
    if (await pv.isVisible().catch(() => false)) { await pv.click(); await sleep(900) }
    fileInput = dialog.locator('input[type="file"]').first()
  }
  if (!(await fileInput.count())) fileInput = page.locator('input[type="file"]').last()
  await fileInput.setInputFiles(image)
  console.log('   image attachée, traitement FB…')
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    await sleep(2500)
    const busy = await dialog.locator('[role="progressbar"]').count()
    const hasThumb = await dialog.locator('img[src^="blob:"], img[src*="scontent"]').count()
    if (!busy && hasThumb) break
  }
  await sleep(1500)

  // ── 2) Légende ensuite, avec vérification qu'elle est bien dans le composer ──
  const box = dialog.locator('div[role="textbox"]').first()
  await box.click({ timeout: 10000 }).catch(async e => { await shot('notextbox'); throw e })
  await sleep(400)
  await page.keyboard.insertText(text)
  await sleep(700)
  let got = (await box.innerText().catch(() => '')).trim()
  if (norm(got).length < 20) {
    console.log('   insertText insuffisant (' + got.length + ' car.) → fallback pressSequentially')
    await box.click()
    await page.keyboard.press('Control+A').catch(() => {})
    await page.keyboard.press('Delete').catch(() => {})
    await box.pressSequentially(text, { delay: 10 }).catch(() => {})
    await sleep(700)
    got = (await box.innerText().catch(() => '')).trim()
  }
  const captionOk = norm(got).length >= 20
  console.log('   légende dans le composer: ' + got.length + ' car. | OK: ' + captionOk)
  await sleep(700)
  await shot('ready')

  // ── 3) Bouton publier (FR/EN), via nom accessible exact ─────────────────────
  let label = ''
  for (const nm of ['Publier', 'Post', 'Suivant', 'Next']) {
    const b = dialog.getByRole('button', { name: nm, exact: true }).last()
    if (await b.isVisible().catch(() => false)) { label = nm; break }
  }
  console.log('   bouton publier détecté: ' + (label || '(aucun)') + ' | légende OK: ' + captionOk)

  if (!GO) {
    console.log('DRY-RUN terminé — RIEN publié. Vérifier scripts/video/out/fbcard-' + REGION + '-ready.png puis relancer avec --go')
    await ctx.close(); process.exit(0)
  }
  if (!label) { console.error('✗ bouton publier introuvable'); await shot('nopublish'); await ctx.close(); process.exit(4) }
  if (!captionOk) { console.error('✗ légende non insérée — abandon par sécurité (jamais d\'image sans texte)'); await shot('nocaption'); await ctx.close(); process.exit(5) }

  await dialog.getByRole('button', { name: label, exact: true }).last().click()
  if (/Suivant|Next/i.test(label)) {           // flux en 2 étapes : 2e écran avec Publier/Post
    await sleep(2500)
    const finalBtn = dialog.getByRole('button', { name: /^(Publier|Post)$/, exact: true }).last()
    if (await finalBtn.isVisible().catch(() => false)) await finalBtn.click().catch(() => {})
  }
  await dialog.waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {})
  await sleep(6000)
  await shot('published')
  console.log('✓ publié dans ' + group.name)
  await ctx.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
