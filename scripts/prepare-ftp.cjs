/**
 * Copie dist/ vers les dossiers FTP par région (moteur regions/).
 *
 * Deux modes selon la région de build (env VITE_REGION/REGION, défaut mq) :
 * - mq/gp (build partagé historique) : produit martinique-ftp/ ET guadeloupe-ftp/
 *   avec README pour upload FTP — sortie byte-identique à l'ancien script.
 * - nouvelle région (ex: VITE_REGION=puntacana) : produit UNIQUEMENT
 *   <region.ftpDir>/ depuis dist/, sans aucun artefact MQ/GP (sitemaps,
 *   fichiers de vérification Google/Bing, images sociales, routes SEO des
 *   autres domaines, api/stripe-config.php).
 */
const fs = require('fs')
const path = require('path')
const { getAllRegions, getRegion, getBuildRegion } = require('../regions/index.cjs')

const root = path.join(__dirname, '..')
const dist = path.join(root, 'dist')

if (!fs.existsSync(dist)) {
  console.error('Run npm run build first.')
  process.exit(1)
}

// Build per-region slug sets so each FTP folder only ships the beaches that
// actually belong to its domain. Without this, every FTP folder would ship
// all the beach pages → cross-domain duplicate content → Google flags ~90%
// of URLs as "Discovered, currently not indexed".
const slugify = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const BEACHES_LIST = JSON.parse(fs.readFileSync(path.join(root, 'public/data/beaches-list.json'), 'utf-8'))

// Slugs des plages d'une région : inline dans regions/<id>.json (nouvelles
// régions) ou depuis public/data/beaches-list.json filtré par island (mq/gp).
function beachSlugsFor(region) {
  const island = (region.beachFilter && region.beachFilter.island) || region.id
  const list = Array.isArray(region.beaches) && region.beaches.length
    ? region.beaches
    : BEACHES_LIST.filter(b => b.island === island)
  return new Set(list.map(b => slugify(b.name)))
}

// Régions historiques produites ensemble par le build partagé (défaut) — leur
// sortie doit rester byte-identique à l'ancien script mono-MQ/GP.
const SHARED_LEGACY_IDS = ['mq', 'gp']

// Names that must never be copied into either FTP folder. _gp/ holds the
// GP-flavored mirror of pages whose vite generator runs in a GP→MQ loop
// (where MQ wins in dist/) — it gets overlaid onto guadeloupe-ftp/ later
// so the GP build ends up with GP-correct beach lists, not MQ ones.
const COPY_SKIP_TOP = new Set(['_gp'])

// skipRel = Set de chemins relatifs POSIX (fichiers ou dossiers) à ne pas
// copier. Un nom simple ('_gp') ne matche qu'à la racine, comme avant.
function copyRecursive(src, dest, skipRel = null, rel = '') {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      const childRel = rel ? `${rel}/${name}` : name
      if (skipRel && skipRel.has(childRel)) continue
      copyRecursive(path.join(src, name), path.join(dest, name), skipRel, childRel)
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

// Walk `srcDir` and overwrite every matching file under `destDir`. Used to
// stamp the GP-mirror pages on top of guadeloupe-ftp/ after the base copy.
function overlayDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0
  let count = 0
  for (const name of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, name)
    const d = path.join(destDir, name)
    if (fs.statSync(s).isDirectory()) {
      fs.mkdirSync(d, { recursive: true })
      count += overlayDir(s, d)
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true })
      fs.copyFileSync(s, d)
      count++
    }
  }
  return count
}

// App ID OneSignal placeholder du build, remplacé par celui de chaque région
const OLD_ONESIGNAL_APP_ID = '4280dcab-fc43-415d-a9cd-a3da8cf601f1'

// ── Dispatch selon la région de build ──────────────────────────────────────
// VITE_REGION absent ou mq/gp → build partagé historique (les deux îles).
// Autre région → build mono-région (prepareNewRegion, bas de fichier).
const buildRegion = getBuildRegion()
if (!SHARED_LEGACY_IDS.includes(buildRegion.id)) {
  prepareNewRegion(buildRegion)
  return // return top-niveau CJS : on ne touche pas aux dossiers MQ/GP
}

const legacyRegions = SHARED_LEGACY_IDS.map((id) => getRegion(id))

for (const region of legacyRegions) {
  const dir = region.ftpDir
  const title = region.name
  const domain = region.domain
  const onesignalAppId = region.onesignalAppId
  const out = path.join(root, dir)
  if (fs.existsSync(out)) fs.rmSync(out, { recursive: true })
  copyRecursive(dist, out, COPY_SKIP_TOP)

  // GP-mirror overlay is deferred until the END of this iteration (after all
  // content patching) — see comment near the OK log. If we stamped here, the
  // bulk sargasses-martinique→sargasses-guadeloupe URL swap would clobber the
  // cross-island absolute URLs the vite plugin wrote into the editorials.

  // Drop editorial articles that belong to the other island. The build copies
  // public/articles/ verbatim to both FTP folders, and the bulk URL swap would
  // otherwise rewrite a cross-island article's canonical to the wrong domain.
  // Keeping only the island's own articles also avoids duplicate-content risk.
  const articlesDir = path.join(out, 'articles')
  const articlesIndexPath = path.join(articlesDir, 'index.json')
  const ownIsland = region.beachFilter.island
  if (fs.existsSync(articlesIndexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(articlesIndexPath, 'utf-8'))
      let removed = 0
      const kept = []
      for (const art of idx.articles || []) {
        if (art.island === ownIsland) { kept.push(art); continue }
        const artDir = path.join(articlesDir, art.slug)
        if (fs.existsSync(artDir)) {
          fs.rmSync(artDir, { recursive: true })
          removed++
        }
      }
      fs.writeFileSync(articlesIndexPath, JSON.stringify({ ...idx, articles: kept }, null, 2))
      if (removed > 0) console.log(`   → articles cross-island supprimés (${title}): ${removed}`)
    } catch (e) { console.warn(`   → articles filter skipped (${title}):`, e.message) }
  }

  // Drop beach pages that don't belong to this island. The build emits
  // dist/plages/<slug>/ for ALL 136 beaches; without this filter both FTP
  // folders ship the full set and Google sees the same beach page on both
  // domains → duplicate content → "Discovered, currently not indexed".
  const plagesDir = path.join(out, 'plages')
  const islandSlugs = beachSlugsFor(region)
  if (islandSlugs && fs.existsSync(plagesDir)) {
    let removed = 0
    for (const entry of fs.readdirSync(plagesDir)) {
      const full = path.join(plagesDir, entry)
      if (!fs.statSync(full).isDirectory()) continue // keep plages/index.html
      if (!islandSlugs.has(entry)) {
        fs.rmSync(full, { recursive: true })
        removed++
      }
    }
    const kept = fs.readdirSync(plagesDir).filter(e => fs.statSync(path.join(plagesDir, e)).isDirectory()).length
    console.log(`   → plages filtrées (${title}): ${kept} gardées, ${removed} supprimées`)
  }

  // Remplacer l'ancien OneSignal App ID par le bon pour ce site
  const filesToPatch = [
    'index.html',
    'sarg_carte_satellite_app.html',
    'sarg_carte_satellite_standalone.html',
    'config/push.js',
  ]
  for (const relPath of filesToPatch) {
    const filePath = path.join(out, relPath)
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf-8')
      if (content.includes(OLD_ONESIGNAL_APP_ID)) {
        content = content.replace(new RegExp(OLD_ONESIGNAL_APP_ID, 'g'), onesignalAppId)
        fs.writeFileSync(filePath, content, 'utf-8')
        console.log(`   → OneSignal appId patché dans ${relPath} (${title})`)
      }
    }
  }

  // Sitemap + robots par domaine
  const sitemapName = `sitemap-${slugify(title)}.xml`
  const sitemapSrc = path.join(out, sitemapName)
  const sitemapDest = path.join(out, 'sitemap.xml')
  if (fs.existsSync(sitemapSrc)) {
    fs.copyFileSync(sitemapSrc, sitemapDest)
    console.log(`   → sitemap.xml (${domain})`)
  }
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /neptunes_fury.html

Sitemap: https://${domain}/sitemap.xml
`
  fs.writeFileSync(path.join(out, 'robots.txt'), robotsTxt, 'utf-8')
  console.log(`   → robots.txt (${domain})`)

  // ── Guadeloupe: patch ALL HTML files (SEO, analytics, geo, schema, OG) ──
  // The index.html is fully rewritten below; this patches every OTHER html file
  // so that subpages (carte-sargasses, previsions, alertes, en/, editorial, plages/*)
  // all carry correct GP branding instead of Martinique leftovers.
  if (region.id === 'gp') {
    function collectHtmlFiles(dirPath) {
      const results = []
      for (const entry of fs.readdirSync(dirPath)) {
        const full = path.join(dirPath, entry)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
          results.push(...collectHtmlFiles(full))
        } else if (entry.endsWith('.html')) {
          results.push(full)
        }
      }
      return results
    }
    const allHtmlFiles = collectHtmlFiles(out)
    let patchedCount = 0
    for (const filePath of allHtmlFiles) {
      const relPath = path.relative(out, filePath).replace(/\\/g, '/')
      // Skip root index.html — it is fully rewritten further below
      if (relPath === 'index.html') continue
      let content = fs.readFileSync(filePath, 'utf-8')
      const before = content

      // 0. Protect "Martinique et Guadeloupe" / "Martinique & Guadeloupe" / "Martinique and Guadeloupe"
      //    patterns from double-replacement (→ "Guadeloupe et Guadeloupe"). We swap GP first on the GP site.
      content = content.replace(/Martinique et Guadeloupe/g, '##GP_ET_MQ##')
      content = content.replace(/Martinique &amp; Guadeloupe/g, '##GP_AMP_MQ##')
      content = content.replace(/Martinique & Guadeloupe/g, '##GP_AMPRAW_MQ##')
      content = content.replace(/Martinique and Guadeloupe/g, '##GP_AND_MQ##')

      // 1. Domain: sargasses-martinique.com → sargasses-guadeloupe.com (canonicals, OG urls, hreflang, JSON-LD, breadcrumbs, sitemaps)
      content = content.replace(/sargasses-martinique\.com/g, 'sargasses-guadeloupe.com')

      // 2. GA4 + Clarity IDs
      content = content.replace(/G-V8JGMDZZ2Y/g, 'G-Q31VV3LLM9')
      content = content.replace(/w4o6w9aenv/g, 'w4oect7ph3')

      // 3. Geo meta tags
      content = content.replace(/<meta name="geo\.region" content="MQ"\s*\/?>/g, '<meta name="geo.region" content="GP" />')
      content = content.replace(/<meta name="geo\.placename" content="Martinique"\s*\/?>/g, '<meta name="geo.placename" content="Guadeloupe" />')

      // 4. Title tag: "Martinique" → "Guadeloupe" (covers all subpage titles)
      content = content.replace(/(<title>[^<]*?)Martinique([^<]*?<\/title>)/g, '$1Guadeloupe$2')

      // 5. Meta description: "Martinique" → "Guadeloupe"
      content = content.replace(/(<meta name="description" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')

      // 6. OG tags: title, description, site_name, image alt
      content = content.replace(/(<meta property="og:title" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
      content = content.replace(/(<meta property="og:description" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
      content = content.replace(/(<meta property="og:site_name" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
      content = content.replace(/(<meta property="og:image:alt" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')

      // 7. Twitter tags: title, description, image alt
      content = content.replace(/(<meta name="twitter:title" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
      content = content.replace(/(<meta name="twitter:description" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
      content = content.replace(/(<meta name="twitter:image:alt" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')

      // 8. Schema.org JSON-LD: replace "Martinique" in JSON-LD blocks (name, description, publisher, FAQ answers)
      //    Careful: only replace inside <script type="application/ld+json"> blocks
      content = content.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (match, open, json, close) => {
        const patched = json
          .replace(/Sargasses Martinique/g, 'Sargasses Guadeloupe')
          .replace(/Sargassum Martinique/g, 'Sargassum Guadeloupe')
          .replace(/sargasses en Martinique/g, 'sargasses en Guadeloupe')
          .replace(/plages Martinique/g, 'plages Guadeloupe')
          .replace(/"addressRegion"\s*:\s*"Martinique"/g, '"addressRegion":"Guadeloupe"')
          .replace(/"addressCountry"\s*:\s*"MQ"/g, '"addressCountry":"GP"')
        return open + patched + close
      })

      // 9. EN pages: "Martinique" → "Martinique & Guadeloupe" is already correct in the build
      //    but "Sargassum Martinique real-time" → "Sargassum Guadeloupe real-time" for EN root
      if (relPath.startsWith('en/')) {
        content = content.replace(/(<title>[^<]*?)Martinique([^<]*?<\/title>)/g, '$1Guadeloupe$2')
        content = content.replace(/(<meta property="og:title" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
        content = content.replace(/(<meta name="twitter:title" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
      }

      // Restore protected bi-island phrases (GP listed first on the GP site)
      content = content.replace(/##GP_ET_MQ##/g, 'Guadeloupe et Martinique')
      content = content.replace(/##GP_AMP_MQ##/g, 'Guadeloupe &amp; Martinique')
      content = content.replace(/##GP_AMPRAW_MQ##/g, 'Guadeloupe & Martinique')
      content = content.replace(/##GP_AND_MQ##/g, 'Guadeloupe and Martinique')

      if (content !== before) {
        fs.writeFileSync(filePath, content, 'utf-8')
        patchedCount++
      }
    }
    console.log(`   → ${patchedCount} fichiers HTML patchés SEO/analytics/geo pour Guadeloupe`)
  }

  // Index SEO spécifique : seul GP a un template bespoke — voir writeRegionIndex().
  if (region.id === 'gp') writeRegionIndex(region, out)
  const readme = `# Upload FTP ${title} — Sargasses

Contenu prêt à envoyer sur le serveur FTP (hébergement ${title}).

⚠️ IMPORTANT — Pour avoir la même version qu'en local :
1. En local : lance "npm run build" puis "node scripts/prepare-ftp.cjs" (ou "npm run martinique").
2. Envoie sur le FTP **tout le contenu** du dossier ${dir}/ (ce dossier), en remplaçant l'existant.
3. N'envoie PAS une ancienne archive .zip : elle ne contient pas les derniers changements (liens, mentions légales, etc.). Régénère toujours le dossier avec "npm run martinique" puis envoie le dossier frais.

## Upload

1. Connecte-toi en FTP à ton hébergeur (ex. Namecheap, o2switch, etc.).
2. Va à la racine du site (souvent public_html ou www).
3. Envoie **tous les fichiers et dossiers** de ce dossier :
   - index.html (à la racine)
   - sitemap.xml, robots.txt, .htaccess (SEO et redirections)
   - dossier assets/
   - dossier en/ (version anglaise)
   - dossier carte-sargasses/, previsions/
   - dossier api/ (données sargasses + prévisions 7j)
   - mentions-legales.html, confidentialite.html, 404.html
   - neptunes_fury.html (si présent)
   - BUILD.txt (optionnel, pour vérifier la date de build sur le serveur)

Ne pas envoyer ce README (LISEZMOI-FTP.txt) si ton FTP n'accepte que les fichiers du site.

## Contenu

- App Sargasses (Martinique & Guadeloupe) : plages, prévisions 7 jours, dérive.
- Données statiques : api/copernicus/sargassum.json (niveaux + batch hebdo).
- Jeu Neptune's Fury : neptunes_fury.html.

## Après mise en ligne

Ouvre ton domaine (ex. ${domain}) : la page d'accueil doit s'afficher. Les données sargasses et prévisions sont chargées depuis le fichier JSON (pas de serveur Node nécessaire).
`
  fs.writeFileSync(path.join(out, 'LISEZMOI-FTP.txt'), readme.replace(/\n/g, '\r\n'), 'utf-8')
  // Stamp GP-mirror files LAST — after the bulk URL swap and all per-island
  // patching — so the cross-island absolute URLs in editorials survive.
  if (region.id === 'gp') {
    const gpMirror = path.join(dist, '_gp')
    const overlaid = overlayDir(gpMirror, out)
    if (overlaid > 0) console.log(`   → ${overlaid} fichiers GP-mirror overlaid sur guadeloupe-ftp/ (post-patch)`)
  }
  console.log(`OK: ${dir}/ créé (contenu de dist/ + LISEZMOI-FTP.txt)`)
}

// Fichier de build pour vérifier que le FTP contient bien cette version
const buildInfo = `Build: ${new Date().toISOString()}
Généré par: npm run build && node scripts/prepare-ftp.cjs
À envoyer: tout le contenu de ce dossier sur le FTP (remplacer l'existant).
Ne pas utiliser une ancienne .zip : régénérer avec "npm run martinique" ou "npm run daily" puis envoyer le dossier frais.
`
for (const region of legacyRegions) {
  const out = path.join(root, region.ftpDir)
  fs.writeFileSync(path.join(out, 'BUILD.txt'), buildInfo, 'utf-8')
}

console.log('')
console.log('   → Martinique : envoie le contenu de martinique-ftp/ sur le FTP (pas une vieille zip).')
console.log('   → Guadeloupe : envoie le contenu de guadeloupe-ftp/ sur le FTP (pas une vieille zip).')
console.log('   → Si le site en ligne ne change pas : vérifie que tu envoies bien le dossier frais après "npm run martinique".')


// ─────────────────────────────────────────────────────────────────────────
// Fonctions par région (hoistées — utilisées par le dispatch plus haut)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Réécrit l'index.html SEO d'une région dans son dossier FTP.
 * Extrait du bloc GP historique : le build partagé sort un index MQ, GP le
 * réécrit entièrement (SEO + PWA + perf parity). Les autres régions gardent
 * l'index.html région-aware produit par le build vite — n'ajouter un template
 * ici que si une région a besoin d'un index bespoke.
 */
function writeRegionIndex(region, out) {
  if (region.id !== 'gp') return false
  const onesignalAppId = region.onesignalAppId
  const distIndex = path.join(dist, 'index.html')
  let scriptSrc = '/assets/index.js'
  let cssSrc = ''
  let modulePreloads = ''
  if (fs.existsSync(distIndex)) {
    const html = fs.readFileSync(distIndex, 'utf-8')
    const jsMatch = html.match(/type="module"[^>]+src="([^"]+\.js)"/)
    if (jsMatch) scriptSrc = jsMatch[1]
    const cssMatch = html.match(/href="([^"]+\.css)"/)
    if (cssMatch) cssSrc = cssMatch[1]
    // Extract modulepreload hints (React, Leaflet chunks)
    const preloadMatches = html.matchAll(/<link rel="modulepreload"[^>]+>/g)
    for (const m of preloadMatches) modulePreloads += '\n  ' + m[0]
  }
  const gpIndex = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#E8A800" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/og-image.png" />
    <title>Plages Guadeloupe aujourd'hui · Score 0-100 (sargasses, mer, soleil) 2026</title>
    <meta name="description" content="Quelle plage de Guadeloupe aujourd'hui ? Score 0-100 par plage combinant sargasses, houle, vent, soleil et température de l'eau. 82 plages notées en direct, toute l'année." />
    <link rel="canonical" href="https://sargasses-guadeloupe.com/" />
    <link rel="alternate" hreflang="fr" href="https://sargasses-guadeloupe.com/" />
    <link rel="alternate" hreflang="en" href="https://sargasses-guadeloupe.com/en/" />
    <link rel="alternate" hreflang="x-default" href="https://sargasses-guadeloupe.com/" />
    <meta name="geo.region" content="GP" />
    <meta name="geo.placename" content="Guadeloupe" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Plages Guadeloupe aujourd'hui · Score 0-100 par plage (2026)" />
    <meta property="og:description" content="Quelle plage de Guadeloupe aujourd'hui ? Score 0-100 combinant sargasses, houle, vent, soleil et température eau. 82 plages notées en direct, toute l'année." />
    <meta property="og:url" content="https://sargasses-guadeloupe.com/" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:site_name" content="Sargasses Guadeloupe" />
    <meta property="og:image" content="https://sargasses-guadeloupe.com/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Score 0-100 par plage en Guadeloupe - sargasses, houle, vent, soleil, eau" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Plages Guadeloupe aujourd'hui · Score 0-100 par plage (2026)" />
    <meta name="twitter:description" content="Score 0-100 par plage : sargasses, mer, vent, soleil, température eau. 82 plages en direct, toute l'année." />
    <meta name="twitter:image" content="https://sargasses-guadeloupe.com/og-image.png" />
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"WebApplication","name":"Plages Guadeloupe · Score 0-100","description":"Score 0-100 par plage en Guadeloupe : sargasses, houle, vent, soleil, température de l'eau. 82 plages notées en direct, toute l'année.","url":"https://sargasses-guadeloupe.com/","applicationCategory":"TravelApplication","operatingSystem":"Web","inLanguage":["fr","en"],"dateModified":"${new Date().toISOString().slice(0,10)}","datePublished":"2026-02-21","publisher":{"@type":"Organization","name":"Sargasses Guadeloupe","logo":"https://sargasses-guadeloupe.com/icon-512.png"},"potentialAction":{"@type":"SearchAction","target":"https://sargasses-guadeloupe.com/plages/{search_term_string}/","query-input":"required name=search_term_string"}}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Quelle plage de Guadeloupe aujourd'hui ?","acceptedAnswer":{"@type":"Answer","text":"Chaque plage reçoit un score 0-100 qui combine 7 facteurs : sargasses, houle, vent, température de l'eau, nuages, UV et marée. Le top 3 est recalculé chaque jour — ouvrez la carte pour voir les meilleures plages du jour en Grande-Terre et Basse-Terre."}},{"@type":"Question","name":"Comment est calculé le score 0-100 ?","acceptedAnswer":{"@type":"Answer","text":"Le score combine 7 facteurs pondérés : sargasses (30%), houle (20%), vent (15%), température eau (10%), nuages (10%), UV (10%), marée (5%). 90+ c'est exceptionnel, 70+ bon, en dessous de 40 mieux vaut éviter."}},{"@type":"Question","name":"Quand arrivent les sargasses en Guadeloupe en 2026 ?","acceptedAnswer":{"@type":"Answer","text":"Les pics sargasses en Guadeloupe sont observés entre avril et septembre, avec un maximum en juin-août. Les côtes sud et est de Grande-Terre (Sainte-Anne, Le Gosier, Saint-François) sont les plus touchées. Les plages sous le vent de Basse-Terre (Malendure, Deshaies) sont généralement épargnées. L'application fonctionne toute l'année et intègre les sargasses dans le score 0-100."}},{"@type":"Question","name":"Quelles plages de Guadeloupe sont sans sargasses ?","acceptedAnswer":{"@type":"Answer","text":"Les plages de la côte sous le vent de Basse-Terre (Malendure, Grande Anse Deshaies, Bouillante) sont rarement touchées. Sur Grande-Terre, vérifiez la carte en temps réel car la situation change quotidiennement."}},{"@type":"Question","name":"Comment fonctionnent les prévisions sargasses ?","acceptedAnswer":{"@type":"Answer","text":"Nos prévisions combinent les données satellite Copernicus (indice AFAI), les courants marins et les vents. Fiabilité : 80% à J+1, décroissante ensuite. Prévisions disponibles pour 82 plages en Guadeloupe."}},{"@type":"Question","name":"Les sargasses sont-elles dangereuses pour la santé ?","acceptedAnswer":{"@type":"Answer","text":"Les sargasses en décomposition libèrent du H2S (sulfure d'hydrogène), un gaz toxique. À forte concentration, il irrite les yeux et les voies respiratoires. Évitez les plages marquées en rouge sur notre carte, surtout avec des enfants."}},{"@type":"Question","name":"Où se baigner à Sainte-Anne en Guadeloupe sans sargasses ?","acceptedAnswer":{"@type":"Answer","text":"À Sainte-Anne (Grande-Terre), la plage de Bois Jolan et la plage du Bourg sont les plus surveillées. L'état change selon les vents et courants — consultez notre carte en temps réel avant de partir. Les plages protégées par la barrière de corail sont généralement plus propres."}},{"@type":"Question","name":"Le Gosier est-il touché par les sargasses ?","acceptedAnswer":{"@type":"Answer","text":"La plage du Gosier (Guadeloupe) est exposée aux sargasses en haute saison (juin-août). Elle est située sur la côte sud de Grande-Terre, face à l'îlet du Gosier. Consultez l'état en temps réel pour la journée."}},{"@type":"Question","name":"Quelles plages de Basse-Terre sont épargnées des sargasses ?","acceptedAnswer":{"@type":"Answer","text":"La côte sous-le-vent de Basse-Terre (Malendure, Plage de la Perle à Deshaies, Grande Anse Deshaies, Bouillante) est structurellement protégée des sargasses par le relief de l'île et les courants. Ces plages sont recommandées pendant les pics de saison."}},{"@type":"Question","name":"Comment recevoir une alerte sargasses en Guadeloupe ?","acceptedAnswer":{"@type":"Answer","text":"Activez les notifications push gratuites sur sargasses-guadeloupe.com : vous recevez une alerte quand l'état d'une plage favorite change (arrivée de sargasses, retour à propre). Disponible pour les 82 plages de Guadeloupe."}}]}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Organization","name":"Sargasses Guadeloupe","url":"https://sargasses-guadeloupe.com","logo":"https://sargasses-guadeloupe.com/icon-512.png","description":"Compagnon plage Guadeloupe — score 0-100 par plage combinant sargasses, mer, vent, soleil et température de l'eau. 82 plages suivies en direct toute l'année.","areaServed":{"@type":"AdministrativeArea","name":"Guadeloupe"},"knowsAbout":["plages Guadeloupe","sargasses","baignade","Grande-Terre","Basse-Terre","Sainte-Anne","Le Gosier","Deshaies","météo marine","AFAI"],"sameAs":["https://sargasses-martinique.com"]}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"SiteNavigationElement","name":["Carte","Plages","Prévisions","Alertes"],"url":["https://sargasses-guadeloupe.com/carte-sargasses/","https://sargasses-guadeloupe.com/plages/","https://sargasses-guadeloupe.com/previsions/","https://sargasses-guadeloupe.com/alertes/"]}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://sargasses-guadeloupe.com/"}]}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Place","name":"Guadeloupe","geo":{"@type":"GeoCoordinates","latitude":16.265,"longitude":-61.551},"containedInPlace":{"@type":"Country","name":"France"},"containsPlace":[{"@type":"Beach","name":"Plage de Bois Jolan","address":{"@type":"PostalAddress","addressLocality":"Sainte-Anne","addressRegion":"Guadeloupe","addressCountry":"GP"}},{"@type":"Beach","name":"Plage du Gosier","address":{"@type":"PostalAddress","addressLocality":"Le Gosier","addressRegion":"Guadeloupe","addressCountry":"GP"}},{"@type":"Beach","name":"Grande Anse Deshaies","address":{"@type":"PostalAddress","addressLocality":"Deshaies","addressRegion":"Guadeloupe","addressCountry":"GP"}},{"@type":"Beach","name":"Plage de Malendure","address":{"@type":"PostalAddress","addressLocality":"Bouillante","addressRegion":"Guadeloupe","addressCountry":"GP"}}]}
    </script>
  <style>
    :root,.theme-light{--sg-bg:#FFFFFF;--sg-bgD:#F7F7F8;--sg-card:#FFFFFF;--sg-cardS:#FAFAFA;--sg-ink:#000000;--sg-mid:#000000;--sg-mute:#333333;--sg-border:rgba(0,0,0,.08);--sg-borderM:rgba(0,0,0,.14);--sg-glass:rgba(255,255,255,.92);--sg-glassBorder:rgba(0,0,0,.06);--sg-rowHover:rgba(0,0,0,.03);--sg-handle:rgba(0,0,0,.25);--sg-card-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06);}
    .theme-dark{--sg-bg:#0d1117;--sg-bgD:#161b22;--sg-card:#161b22;--sg-cardS:#21262d;--sg-ink:#e6edf3;--sg-mid:#adbac7;--sg-mute:#8b949e;--sg-border:rgba(255,255,255,.08);--sg-borderM:rgba(255,255,255,.14);--sg-glass:rgba(22,27,34,.85);--sg-glassBorder:rgba(255,255,255,.08);--sg-rowHover:rgba(255,255,255,.06);--sg-handle:rgba(255,255,255,.2);}
    html{font-size:clamp(14px,2.2vw + 12px,16px);-webkit-text-size-adjust:100%}
    html,body{font-family:'Bricolage Grotesque',system-ui,sans-serif;background:var(--sg-bg);color:var(--sg-ink);height:100vh;height:100dvh;margin:0;-webkit-font-smoothing:antialiased}
  </style>
  <link rel="preload" href="/api/copernicus/sargassum.json" as="fetch" crossorigin />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://www.clarity.ms" />
  <link rel="dns-prefetch" href="https://api.open-meteo.com" />
  <link rel="dns-prefetch" href="https://marine-api.open-meteo.com" />
  <link rel="dns-prefetch" href="https://server.arcgisonline.com" />
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,600;12..96,700;12..96,800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,600;12..96,700;12..96,800&display=swap" rel="stylesheet" /></noscript>
  <!-- OneSignal Push — SDK chargé à la demande -->
  <script>
    window.ONESIGNAL_APP_ID="${onesignalAppId}";
    window.loadOneSignal=function(){
      if(window.__osLoaded)return;window.__osLoaded=true;
      var s=document.createElement('script');
      s.src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      s.onload=function(){
        window.OneSignalDeferred=window.OneSignalDeferred||[];
        OneSignalDeferred.push(function(O){O.init({appId:window.ONESIGNAL_APP_ID,allowLocalhostAsSecureOrigin:true,autoPrompt:false});O.Notifications.requestPermission()});
      };document.head.appendChild(s);
    };
  </script>
  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-Q31VV3LLM9"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
  gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});
  gtag('js',new Date());gtag('config','G-Q31VV3LLM9',{transport_url:'https://www.google-analytics.com'});</script>
  <!-- Stripe.js — chargé à la demande -->
  <script>
    window.loadStripe=function(){
      if(window.Stripe)return Promise.resolve(window.Stripe);
      return new Promise(function(ok){
        var s=document.createElement('script');s.src='https://js.stripe.com/v3/';
        s.onload=function(){ok(window.Stripe)};document.head.appendChild(s);
      });
    };
  </script>
  <!-- Microsoft Clarity + bridge — deferred after first paint -->
  <script>
  (function(){
    function boot(){
      (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w4oect7ph3");
      if(!window.gtag)return;
      var sent={};
      function send(name,data){var key=name+data.target;if(sent[key])return;sent[key]=1;gtag('event',name,data);}
      var clicks=[],RAGE_THRESHOLD=3,RAGE_WINDOW=1500;
      document.addEventListener('click',function(e){
        var now=Date.now(),t=e.target,cn=typeof t.className==='string'?t.className:'',tag=t.tagName+'.'+cn.split(' ')[0]+'#'+(t.id||'');
        clicks.push({time:now,tag:tag});clicks=clicks.filter(function(c){return now-c.time<RAGE_WINDOW});
        var same=clicks.filter(function(c){return c.tag===tag});
        if(same.length>=RAGE_THRESHOLD){send('clarity_rage_click',{target:tag,page:location.pathname,count:same.length});clicks=[];}
      },true);
      document.addEventListener('click',function(e){
        var t=e.target,interactive=['A','BUTTON','INPUT','SELECT','TEXTAREA','LABEL'];
        if(interactive.indexOf(t.tagName)>=0||t.closest('a,button,[role="button"],[data-click],.gbtn,.sg-click'))return;
        var cn=typeof t.className==='string'?t.className:'',tag=t.tagName+'.'+cn.split(' ')[0]+'#'+(t.id||''),url=location.href;
        var preCount=document.getElementsByTagName('*').length;
        setTimeout(function(){
          var postCount=document.getElementsByTagName('*').length;
          if(location.href===url&&Math.abs(postCount-preCount)<5)send('clarity_dead_click',{target:tag,page:location.pathname});
        },2000);
      },true);
      var loaded=Date.now();
      window.addEventListener('beforeunload',function(){
        if(Date.now()-loaded<10000){
          navigator.sendBeacon&&navigator.sendBeacon('https://www.google-analytics.com/g/collect?v=2&tid=G-Q31VV3LLM9&en=clarity_quick_bounce&ep.page='+encodeURIComponent(location.pathname));
        }
      });
    }
    if('requestIdleCallback' in window)requestIdleCallback(boot,{timeout:3000});
    else setTimeout(boot,2000);
  })();
  </script>
  <script type="module" crossorigin src="${scriptSrc}"></script>${modulePreloads}
  ${cssSrc ? `<link rel="stylesheet" crossorigin href="${cssSrc}" />` : ''}
</head>
  <body>
    <script>
      (function(){
        try {
          var v = localStorage.getItem("sg_theme");
          if (v === '"dark"') document.documentElement.classList.add("theme-dark");
          else if (v !== '"light"' && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("theme-dark");
        } catch (e) {}
      })();
    </script>
    <script>
    window.onerror=function(msg,src,line){
      if(sessionStorage.getItem('sg_crash'))return;
      sessionStorage.setItem('sg_crash','1');
      setTimeout(function(){location.reload()},500);
    };
    window.addEventListener('load',function(){sessionStorage.removeItem('sg_crash')});
    </script>
    <div id="root">
      <noscript>
        <h1>Sargasses Guadeloupe en temps réel — carte et plages aujourd'hui (2026)</h1>
        <p>Carte des sargasses en Guadeloupe en temps réel. Où se baigner aujourd'hui en Guadeloupe ? État de 82 plages mis à jour quotidiennement grâce aux données satellite Copernicus Marine. Prévisions sargasses 7 jours et alertes push gratuites.</p>
        <h2>Carte sargasses Guadeloupe — état des plages en direct</h2>
        <p>Notre carte interactive affiche en temps réel la concentration de sargasses au large de chaque plage de Guadeloupe. Les données proviennent du satellite Copernicus Marine (indice AFAI) et sont rafraîchies 4 fois par jour. Chaque plage est classée : propre, modéré ou alerte.</p>
        <h2>Grande-Terre — plages les plus surveillées</h2>
        <p>Les côtes sud et est de Grande-Terre sont les plus exposées aux échouages de sargasses. Plages surveillées : <a href="/plages/plage-bois-jolan/">Bois Jolan</a> (Sainte-Anne), <a href="/plages/plage-de-sainte-anne/">Plage de Sainte-Anne</a>, <a href="/plages/plage-du-souffleur/">Plage du Souffleur</a> (Port-Louis), <a href="/plages/plage-de-la-caravelle/">Plage de la Caravelle</a>, <a href="/plages/plage-du-gosier/">Le Gosier</a>, <a href="/plages/plage-de-saint-francois/">Saint-François</a>, <a href="/plages/pointe-des-chateaux/">Pointe des Châteaux</a>.</p>
        <h2>Basse-Terre — plages généralement propres</h2>
        <p>La côte sous le vent de Basse-Terre est naturellement protégée des sargasses. Plages rarement touchées : <a href="/plages/plage-de-malendure/">Malendure</a> (Bouillante), <a href="/plages/la-grande-anse-deshaies/">Grande Anse Deshaies</a>, <a href="/plages/plage-de-grande-anse/">Grande Anse</a> (Trois-Rivières).</p>
        <h2>Prévisions sargasses Guadeloupe 7 jours</h2>
        <p>Consultez les prévisions sargasses pour chaque plage de Guadeloupe, de demain à 7 jours. Basées sur les courants marins, le vent et les données satellite. Recevez une alerte push quand l'état de votre plage change.</p>
        <h2>Saison des sargasses en Guadeloupe 2026</h2>
        <p>La saison des sargasses en Guadeloupe s'étend d'avril à septembre, avec des pics entre juin et août. Les courants atlantiques transportent ces algues brunes depuis la mer des Sargasses vers les côtes antillaises. Consultez la <a href="/carte-sargasses/">carte en temps réel</a> et les <a href="/previsions/">prévisions 7 jours</a>.</p>
        <h2>Sargasse Guadeloupe — communes surveillées en direct</h2>
        <p>Notre carte sargasse Guadeloupe couvre toutes les communes littorales : Sainte-Anne, Le Gosier, Saint-François, Port-Louis, Petit-Canal, Anse-Bertrand, Morne-à-l'Eau, Le Moule, Capesterre-de-Marie-Galante, Bouillante, Deshaies, Trois-Rivières, Capesterre-Belle-Eau, Goyave, Petit-Bourg, Baillif, Vieux-Habitants, Pointe-Noire, Sainte-Rose, Lamentin. L'état sargasses est mis à jour 4 fois par jour via les données satellite Copernicus Marine (indice AFAI).</p>
        <h2>Alerte sargasse Guadeloupe aujourd'hui — comment ça marche</h2>
        <p>Activez les notifications push gratuites pour recevoir une alerte sargasse Guadeloupe dès qu'une plage favorite change d'état. Les échouages peuvent varier d'heure en heure selon les vents et les courants : notre système surveille en temps réel et envoie une alerte push sans inscription. Vous pouvez aussi <a href="/alertes/">consulter la liste des alertes sargasses actives</a>.</p>
        <h2>Iles satellites — Marie-Galante, Les Saintes, La Désirade</h2>
        <p>Marie-Galante, Les Saintes (Terre-de-Haut, Terre-de-Bas) et La Désirade sont également suivies : ces îles proches de la Guadeloupe ont souvent des conditions sargasses différentes du continent. Consultez les prévisions par plage pour préparer votre excursion en bateau.</p>
        <h2>Données satellite — pourquoi notre carte sargasses est fiable</h2>
        <p>Notre carte sargasses Guadeloupe utilise les données satellite Copernicus Marine Service (Sentinel-3 OLCI) avec l'indice AFAI (Alternative Floating Algae Index) développé par Wang &amp; Hu 2016. Seuils NOAA SIR v1.4 : AFAI &lt; 0.15 = plage propre (verte), 0.15 à 0.40 = présence modérée (orange), ≥ 0.40 = alerte rouge. Les prévisions combinent vent, courants et persistance des bancs observés au large.</p>
      </noscript>
    </div>
    <script>
    (function(){
      var LOCAL_KEY='sg_v';
      fetch('/version.json',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
        var cur=d&&d.v;if(!cur)return;
        var prev=localStorage.getItem(LOCAL_KEY);
        localStorage.setItem(LOCAL_KEY,cur);
        if(prev&&prev!==cur&&'caches' in window){
          caches.keys().then(function(ks){
            return Promise.all(ks.map(function(k){return caches.delete(k)}));
          }).then(function(){location.reload()});
        }
      }).catch(function(){});
    })();
    if('serviceWorker' in navigator){
      window.addEventListener('load',function(){
        navigator.serviceWorker.register('/sw.js').catch(function(){})
      })
    }
    </script>
  </body>
</html>
`
  fs.writeFileSync(path.join(out, 'index.html'), gpIndex, 'utf-8')
  console.log(`   → index.html Guadeloupe (SEO + PWA + perf parity) écrit avec script ${scriptSrc}`)
  return true
}

/**
 * Build mono-région (VITE_REGION hors mq/gp), ex: VITE_REGION=puntacana.
 * Produit <region.ftpDir>/ depuis dist/ — région-aware : aucun artefact MQ/GP
 * ne doit atterrir ici (sitemaps MQ/GP, vérifications Google/Bing de la
 * propriété MQ, images sociales/îles mq-gp, routes SEO des autres domaines,
 * _gp/, api/stripe-config.php). Le contenu HTML lui-même vient du build vite
 * région-aware (Phase 1a) ; ici on ne gère que la tuyauterie fichiers.
 */
function prepareNewRegion(region) {
  const dir = region.ftpDir
  const title = region.name
  const domain = region.domain
  const out = path.join(root, dir)
  if (fs.existsSync(out)) fs.rmSync(out, { recursive: true })

  // Exclusions : fichiers régénérés plus bas + artefacts des autres régions.
  const skip = new Set([
    ...COPY_SKIP_TOP,
    'robots.txt', // régénéré pour region.domain
    'sitemap.xml', // régénéré minimal (racine seule)
    '404.html', // régénéré région-aware (celui du build partagé est MQ/GP)
    'manifest.json', // régénéré région-aware
    'version.json', // régénéré
    'api/stripe-config.php', // secrets Stripe — déployé à part (deploy-stripe-config.cjs)
    '57a712687b6d02295a77188ff76da846.txt', // vérification Google de la propriété MQ
    'BingSiteAuth.xml', // vérification Bing de la propriété MQ
  ])
  for (const other of getAllRegions()) {
    if (other.id === region.id) continue
    skip.add(`sitemap-${slugify(other.name)}.xml`)
    skip.add(`social-facebook-${other.id}.png`)
    skip.add(`island-${other.id}.svg`)
    for (const route of Object.values(other.routes || {})) skip.add(route)
  }
  copyRecursive(dist, out, skip)

  // og:image région-aware : remplace og-image.png (visuel FR "Martinique &
  // Guadeloupe") par le visuel de la région généré par generate-og-images.cjs.
  // URL stable /og-image.png — pas d'invalidation des caches FB/WhatsApp.
  const regionOg = path.join(root, 'regions', 'og', `og-image-${region.id}.png`)
  if (fs.existsSync(regionOg)) {
    fs.copyFileSync(regionOg, path.join(out, 'og-image.png'))
    console.log(`   → og-image.png région-aware (${region.id})`)
  }

  // Photos plages : ne garder que celles de la région — public/beaches pèse
  // ~55MB toutes régions confondues, inutile d'uploader les photos MQ/GP ici.
  const beachesImgDir = path.join(out, 'beaches')
  if (fs.existsSync(beachesImgDir)) {
    const ownIds = new Set((region.beaches || []).map(b => b.id))
    let removedImgs = 0
    for (const f of fs.readdirSync(beachesImgDir)) {
      const m = f.match(/^gplace-([a-z]{2}\d+)\.jpg$/)
      if (m && ownIds.has(m[1])) continue
      fs.rmSync(path.join(beachesImgDir, f))
      removedImgs++
    }
    if (removedImgs) console.log(`   → photos plages hors-région supprimées (${title}): ${removedImgs}`)
  }

  // Articles éditoriaux : ne garder que ceux de la région (mêmes raisons que
  // le filtre cross-island du build partagé : canonical + duplicate content).
  const articlesDir = path.join(out, 'articles')
  const articlesIndexPath = path.join(articlesDir, 'index.json')
  const ownIsland = (region.beachFilter && region.beachFilter.island) || region.id
  if (fs.existsSync(articlesIndexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(articlesIndexPath, 'utf-8'))
      let removed = 0
      const kept = []
      for (const art of idx.articles || []) {
        if (art.island === ownIsland) { kept.push(art); continue }
        const artDir = path.join(articlesDir, art.slug)
        if (fs.existsSync(artDir)) {
          fs.rmSync(artDir, { recursive: true })
          removed++
        }
      }
      fs.writeFileSync(articlesIndexPath, JSON.stringify({ ...idx, articles: kept }, null, 2))
      if (removed > 0) console.log(`   → articles hors-région supprimés (${title}): ${removed}`)
    } catch (e) { console.warn(`   → articles filter skipped (${title}):`, e.message) }
  }

  // Pages plages : ne garder que les plages de la région.
  const plagesDir = path.join(out, 'plages')
  const regionSlugs = beachSlugsFor(region)
  if (fs.existsSync(plagesDir)) {
    let removed = 0
    for (const entry of fs.readdirSync(plagesDir)) {
      const full = path.join(plagesDir, entry)
      if (!fs.statSync(full).isDirectory()) continue // keep plages/index.html
      if (!regionSlugs.has(entry)) {
        fs.rmSync(full, { recursive: true })
        removed++
      }
    }
    const kept = fs.readdirSync(plagesDir).filter(e => fs.statSync(path.join(plagesDir, e)).isDirectory()).length
    console.log(`   → plages filtrées (${title}): ${kept} gardées, ${removed} supprimées`)
  }

  // OneSignal : même patch que le build partagé, avec l'app ID de la région.
  const onesignalAppId = region.onesignalAppId || ''
  if (!onesignalAppId || onesignalAppId.startsWith('TBD')) {
    console.warn(`   ⚠ onesignalAppId non provisionné pour ${region.id} — placeholder laissé tel quel`)
  } else {
    const filesToPatch = [
      'index.html',
      'sarg_carte_satellite_app.html',
      'sarg_carte_satellite_standalone.html',
      'config/push.js',
    ]
    for (const relPath of filesToPatch) {
      const filePath = path.join(out, relPath)
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf-8')
        if (content.includes(OLD_ONESIGNAL_APP_ID)) {
          content = content.replace(new RegExp(OLD_ONESIGNAL_APP_ID, 'g'), onesignalAppId)
          fs.writeFileSync(filePath, content, 'utf-8')
          console.log(`   → OneSignal appId patché dans ${relPath} (${title})`)
        }
      }
    }
  }

  // robots.txt pour le domaine de la région
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /neptunes_fury.html

Sitemap: https://${domain}/sitemap.xml
`
  fs.writeFileSync(path.join(out, 'robots.txt'), robotsTxt, 'utf-8')
  console.log(`   → robots.txt (${domain})`)

  // sitemap.xml minimal (racine seule) — les pages internes seront ajoutées
  // quand le build vite générera les routes de la région (Phase 1a).
  const today = new Date().toISOString().slice(0, 10)
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${domain}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
  fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemapXml, 'utf-8')
  console.log(`   → sitemap.xml minimal (${domain})`)

  // 404.html région-aware : celui du build partagé est bi-île MQ/GP → on
  // adapte le nom de site (+ libellés EN si la région n'est pas francophone).
  const distNotFound = path.join(dist, '404.html')
  if (fs.existsSync(distNotFound)) {
    let html = fs.readFileSync(distNotFound, 'utf-8')
    html = html.replace(/Sargasses Martinique & Guadeloupe/g, `Sargassum ${title}`)
    if (region.primaryLang !== 'fr') {
      html = html
        .replace('<html lang="fr">', `<html lang="${region.primaryLang}">`)
        .replace(/Page introuvable/g, 'Page not found')
        .replace('Cette page n’existe pas ou a été déplacée. Retournez à l’accueil pour consulter la carte des sargasses et les prévisions.', 'This page does not exist or has moved. Head back to the homepage for the live sargassum map and forecasts.')
        .replace(">Retour à l'accueil<", '>Back to home<')
        .replace('>Carte<', '>Map<')
        .replace('>Prévisions<', '>Forecast<')
        .replace('>Mentions légales<', '>Legal<')
        .replace('>Confidentialité<', '>Privacy<')
    }
    fs.writeFileSync(path.join(out, '404.html'), html, 'utf-8')
    console.log(`   → 404.html région-aware (${title})`)
  }

  // manifest.json région-aware (base = manifest du build, surcharge branding)
  const distManifest = path.join(dist, 'manifest.json')
  if (fs.existsSync(distManifest)) {
    const base = JSON.parse(fs.readFileSync(distManifest, 'utf-8'))
    const manifest = {
      ...base,
      name: `Sargassum ${title}`,
      short_name: `Sargassum ${title}`,
      description: region.primaryLang === 'fr'
        ? `Carte des sargasses en temps réel. Où se baigner aujourd'hui à ${title}.`
        : `Live sargassum map and daily beach status for ${title}.`,
      lang: region.primaryLang || 'en',
      theme_color: (region.brand && region.brand.primary) || base.theme_color,
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
    console.log(`   → manifest.json région-aware (${title})`)
  }

  // version.json proper (cache-bust client : bump à chaque génération).
  // sw.js, lui, est copié tel quel depuis dist/ (pas dans le skip set).
  fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ v: `${today}-${region.id}` }) + '\n', 'utf-8')
  console.log(`   → version.json (${today}-${region.id})`)

  // Données sargasses : le front fetche /api/copernicus/sargassum.json (chemin
  // racine, codé en dur). Le dist/ partagé y met les plages MQ/GP → on écrase
  // ce fichier par les données de la région (public/api/copernicus/<id>/) pour
  // que la racine du domaine serve les bonnes plages. Sans ça, le garde
  // anti-données-étrangères du front (ids non concordants) retombe sur les
  // statuts placeholder du JSON région. history.json idem.
  const regionDataDir = path.join(root, 'public', 'api', 'copernicus', region.id)
  const outCopernicus = path.join(out, 'api', 'copernicus')
  if (fs.existsSync(path.join(regionDataDir, 'sargassum.json'))) {
    fs.mkdirSync(outCopernicus, { recursive: true })
    for (const f of ['sargassum.json', 'history.json']) {
      const src = path.join(regionDataDir, f)
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outCopernicus, f))
    }
    // Purge les sous-dossiers d'AUTRES régions + les overlays carte spécifiques
    // MQ/GP (banks/grid) que MapView fetche : sans données régionales propres,
    // ils afficheraient les bancs/grille de Martinique sur la carte PC.
    // caribbean-afai.json est conservé : couche AFAI à l'échelle du bassin,
    // pertinente partout. MapView gère l'absence de banks/grid (catch → pas
    // d'overlay) sans casser la carte.
    const REGION_SPECIFIC_OVERLAYS = ['sargassum-banks.json', 'sargassum-grid.json', 'forecast-archive.json', 'forecast-accuracy.json']
    if (fs.existsSync(outCopernicus)) {
      for (const entry of fs.readdirSync(outCopernicus)) {
        const full = path.join(outCopernicus, entry)
        if (fs.statSync(full).isDirectory()) { fs.rmSync(full, { recursive: true }); continue }
        if (REGION_SPECIFIC_OVERLAYS.includes(entry)) fs.rmSync(full)
      }
    }
    console.log(`   → data sargasses région servie à la racine (${region.id}/sargassum.json → api/copernicus/, overlays MQ purgés)`)
  } else {
    console.warn(`   ⚠ pas de public/api/copernicus/${region.id}/sargassum.json — lance d'abord node scripts/fetch-sargassum-live.cjs`)
  }

  // api/ : mêmes endpoints PHP que MQ/GP, copiés depuis public/api/ —
  // SAUF stripe-config.php (gitignoré, déployé à part via deploy-stripe-config.cjs).
  const apiSrc = path.join(root, 'public', 'api')
  if (fs.existsSync(apiSrc)) {
    for (const name of fs.readdirSync(apiSrc)) {
      if (!name.endsWith('.php') || name === 'stripe-config.php') continue
      fs.mkdirSync(path.join(out, 'api'), { recursive: true })
      fs.copyFileSync(path.join(apiSrc, name), path.join(out, 'api', name))
    }
  }
  // Ceinture + bretelles : jamais de stripe-config.php dans un dossier FTP neuf.
  const strayStripeConfig = path.join(out, 'api', 'stripe-config.php')
  if (fs.existsSync(strayStripeConfig)) fs.rmSync(strayStripeConfig)

  // README + BUILD.txt (mêmes repères que MQ/GP)
  const readme = `# Upload FTP ${title} — Sargassum

Contenu prêt à envoyer sur le serveur FTP (${domain}).

1. En local : VITE_REGION=${region.id} npm run build puis VITE_REGION=${region.id} node scripts/prepare-ftp.cjs
2. Envoie sur le FTP **tout le contenu** du dossier ${dir}/ (ce dossier), en remplaçant l'existant.
3. Config Stripe à part : node scripts/deploy-stripe-config.cjs (jamais via ce dossier).
`
  fs.writeFileSync(path.join(out, 'LISEZMOI-FTP.txt'), readme.replace(/\n/g, '\r\n'), 'utf-8')
  const buildInfo = `Build: ${new Date().toISOString()}
Généré par: VITE_REGION=${region.id} npm run build && VITE_REGION=${region.id} node scripts/prepare-ftp.cjs
À envoyer: tout le contenu de ce dossier sur le FTP (remplacer l'existant).
`
  fs.writeFileSync(path.join(out, 'BUILD.txt'), buildInfo, 'utf-8')

  console.log(`OK: ${dir}/ créé (contenu de dist/ + LISEZMOI-FTP.txt)`)
  console.log('')
  console.log(`   → ${title} : envoie le contenu de ${dir}/ sur le FTP (pas une vieille zip).`)
}
