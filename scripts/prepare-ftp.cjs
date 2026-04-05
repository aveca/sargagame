/**
 * Copie dist/ vers martinique-ftp/ et guadeloupe-ftp/ avec README pour upload FTP
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const dist = path.join(root, 'dist')

if (!fs.existsSync(dist)) {
  console.error('Run npm run build first.')
  process.exit(1)
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name))
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

// OneSignal App IDs par site
const ONESIGNAL_APP_IDS = {
  martinique: 'd628363e-efc7-4d27-8d1b-fa25fe3bacc9',
  guadeloupe: 'f9adee80-8909-48d3-8517-95f9f311d164',
}
const OLD_ONESIGNAL_APP_ID = '4280dcab-fc43-415d-a9cd-a3da8cf601f1'

const readmes = [
  {
    dir: 'martinique-ftp',
    title: 'Martinique',
    domain: 'sargasses-martinique.com',
    onesignalAppId: ONESIGNAL_APP_IDS.martinique,
  },
  {
    dir: 'guadeloupe-ftp',
    title: 'Guadeloupe',
    domain: 'sargasses-guadeloupe.com',
    onesignalAppId: ONESIGNAL_APP_IDS.guadeloupe,
  },
]

for (const { dir, title, domain, onesignalAppId } of readmes) {
  const out = path.join(root, dir)
  if (fs.existsSync(out)) fs.rmSync(out, { recursive: true })
  copyRecursive(dist, out)

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
  const sitemapName = dir === 'martinique-ftp' ? 'sitemap-martinique.xml' : 'sitemap-guadeloupe.xml'
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
  if (dir === 'guadeloupe-ftp') {
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
      content = content.replace(/Martinique and Guadeloupe/g, '##GP_AND_MQ##')

      // 1. Domain: sargasses-martinique.com → sargasses-guadeloupe.com (canonicals, OG urls, hreflang, JSON-LD, breadcrumbs, sitemaps)
      content = content.replace(/sargasses-martinique\.com/g, 'sargasses-guadeloupe.com')

      // 2. GA4 + Clarity IDs
      content = content.replace(/G-V83JGMDZ2Y/g, 'G-Q31VV3LLM9')
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
      content = content.replace(/##GP_AND_MQ##/g, 'Guadeloupe and Martinique')

      if (content !== before) {
        fs.writeFileSync(filePath, content, 'utf-8')
        patchedCount++
      }
    }
    console.log(`   → ${patchedCount} fichiers HTML patchés SEO/analytics/geo pour Guadeloupe`)
  }

  // Index SEO spécifique Guadeloupe (title/meta/JSON-LD GP)
  if (dir === 'guadeloupe-ftp') {
    const distIndex = path.join(dist, 'index.html')
    let scriptSrc = '/assets/index.js'
    if (fs.existsSync(distIndex)) {
      const match = fs.readFileSync(distIndex, 'utf-8').match(/type="module"[^>]+src="([^"]+\.js)"/)
      if (match) scriptSrc = match[1]
    }
    const gpIndex = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#C4830A" />
    <title>Sargasses Guadeloupe en temps réel · Carte et plages aujourd'hui</title>
    <meta name="description" content="Sargasses Guadeloupe : où se baigner aujourd'hui ? Carte en temps réel des 10 plages surveillées, prévisions sargasses 7 jours, alertes H2S. Données satellite Copernicus." />
    <link rel="canonical" href="https://sargasses-guadeloupe.com/" />
    <link rel="alternate" hreflang="fr" href="https://sargasses-guadeloupe.com/" />
    <link rel="alternate" hreflang="en" href="https://sargasses-guadeloupe.com/en/" />
    <link rel="alternate" hreflang="x-default" href="https://sargasses-guadeloupe.com/" />
    <meta name="geo.region" content="GP" />
    <meta name="geo.placename" content="Guadeloupe" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Sargasses Guadeloupe en temps réel · Carte et plages aujourd'hui" />
    <meta property="og:description" content="Sargasses Guadeloupe : où se baigner aujourd'hui ? Carte en temps réel, prévisions 7 jours, alertes H2S." />
    <meta property="og:url" content="https://sargasses-guadeloupe.com/" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:site_name" content="Sargasses Guadeloupe" />
    <meta property="og:image" content="https://sargasses-guadeloupe.com/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Carte des sargasses en Guadeloupe - plages propres et à éviter" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Sargasses Guadeloupe en temps réel · Carte et plages aujourd'hui" />
    <meta name="twitter:description" content="Sargasses Guadeloupe : où se baigner aujourd'hui ? Carte en temps réel, prévisions 7 jours, alertes H2S." />
    <meta name="twitter:image" content="https://sargasses-guadeloupe.com/og-image.png" />
    <meta name="twitter:image:alt" content="Carte des sargasses en Guadeloupe - plages propres et à éviter" />
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"WebApplication","name":"Sargasses Guadeloupe en temps réel","description":"Carte et état des plages Guadeloupe aujourd'hui. Sargasses, plages propres, prévisions 7 jours.","url":"https://sargasses-guadeloupe.com/","applicationCategory":"EnvironmentApplication","operatingSystem":"Web","inLanguage":["fr","en"],"dateModified":"${new Date().toISOString().slice(0,10)}","datePublished":"2026-02-21","publisher":{"@type":"Organization","name":"Sargasses Guadeloupe"}}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Quand arrivent les sargasses en Guadeloupe ?","acceptedAnswer":{"@type":"Answer","text":"Les sargasses varient avec les courants et le vent. La saison la plus concernée s’étend généralement d’avril à septembre, avec des pics possibles jusqu’en octobre. Consultez la carte et les prévisions 7 jours pour l’état du jour."}},{"@type":"Question","name":"C'est quoi l'AFAI ?","acceptedAnswer":{"@type":"Answer","text":"L'AFAI (Algal Floating Algae Index) est un indice de détection des algues par satellite. Plus il est bas, mieux c’est : en dessous de 0,3 la plage est considérée comme propre, au-dessus de 0,65 il vaut mieux éviter. La courbe est affichée sur chaque fiche plage."}},{"@type":"Question","name":"Quel risque pour la santé (H2S) ?","acceptedAnswer":{"@type":"Answer","text":"Le H2S (sulfure d’hydrogène) est un gaz libéré quand les sargasses pourrissent. En forte concentration il peut irriter les yeux et la gorge. Les plages en rouge « À éviter » signalent ce risque — à éviter surtout avec des enfants ou personnes fragiles."}},{"@type":"Question","name":"Quelle plage est propre aujourd'hui en Guadeloupe ?","acceptedAnswer":{"@type":"Answer","text":"Ouvrez la carte ou l’onglet Plages : les statuts (propre / modéré / à éviter) sont mis à jour régulièrement à partir des données satellite et du modèle de dérive Copernicus Marine. L’assistant IA peut aussi vous recommander une plage selon vos critères."}},{"@type":"Question","name":"D'où viennent les données ?","acceptedAnswer":{"@type":"Answer","text":"Les statuts viennent de Copernicus Marine : produit satellite (détection des algues) et modèle de dérive océanique. Les données sont rafraîchies régulièrement pour les Antilles. L’indicateur « Copernicus » en haut de l’app confirme la source active."}}]}
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="dns-prefetch" href="https://cdn.onesignal.com" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-Q31VV3LLM9"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-Q31VV3LLM9');</script>
    <script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w4oect7ph3");</script>
    <!-- Clarity → GA4 bridge -->
    <script>
    (function(){if(!window.clarity||!window.gtag)return;var sent={};function send(n,d){var k=n+d.target;if(sent[k])return;sent[k]=1;gtag('event',n,d)}var clicks=[],RT=3,RW=1500;document.addEventListener('click',function(e){var now=Date.now(),t=e.target,tag=t.tagName+'.'+(t.className||'').split(' ')[0]+'#'+(t.id||'');clicks.push({time:now,tag:tag});clicks=clicks.filter(function(c){return now-c.time<RW});var same=clicks.filter(function(c){return c.tag===tag});if(same.length>=RT){send('clarity_rage_click',{target:tag,page:location.pathname,count:same.length});clicks=[]}},true);document.addEventListener('click',function(e){var t=e.target,ii=['A','BUTTON','INPUT','SELECT','TEXTAREA','LABEL'];if(ii.indexOf(t.tagName)>=0||t.closest('a,button'))return;var tag=t.tagName+'.'+(t.className||'').split(' ')[0]+'#'+(t.id||''),url=location.href;setTimeout(function(){if(location.href===url)send('clarity_dead_click',{target:tag,page:location.pathname})},2000)},true);var loaded=Date.now();window.addEventListener('beforeunload',function(){if(Date.now()-loaded<10000){navigator.sendBeacon&&navigator.sendBeacon('https://www.google-analytics.com/g/collect?v=2&tid=G-Q31VV3LLM9&en=clarity_quick_bounce&ep.page='+encodeURIComponent(location.pathname))}})})();
    </script>
    <script type="module" crossorigin src="${scriptSrc}"></script>
  </head>
  <body>
    <script>
      (function(){
        try {
          var v = localStorage.getItem("sg_theme");
          if (v === "dark") document.documentElement.classList.add("theme-dark");
          else if (v !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("theme-dark");
        } catch (e) {}
      })();
    </script>
    <div id="root"></div>
  </body>
</html>
`
    fs.writeFileSync(path.join(out, 'index.html'), gpIndex, 'utf-8')
    console.log(`   → index.html Guadeloupe (SEO) écrit avec script ${scriptSrc}`)
  }
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
  console.log(`OK: ${dir}/ créé (contenu de dist/ + LISEZMOI-FTP.txt)`)
}

// Fichier de build pour vérifier que le FTP contient bien cette version
const buildInfo = `Build: ${new Date().toISOString()}
Généré par: npm run build && node scripts/prepare-ftp.cjs
À envoyer: tout le contenu de ce dossier sur le FTP (remplacer l'existant).
Ne pas utiliser une ancienne .zip : régénérer avec "npm run martinique" ou "npm run daily" puis envoyer le dossier frais.
`
for (const { dir } of readmes) {
  const out = path.join(root, dir)
  fs.writeFileSync(path.join(out, 'BUILD.txt'), buildInfo, 'utf-8')
}

console.log('')
console.log('   → Martinique : envoie le contenu de martinique-ftp/ sur le FTP (pas une vieille zip).')
console.log('   → Guadeloupe : envoie le contenu de guadeloupe-ftp/ sur le FTP (pas une vieille zip).')
console.log('   → Si le site en ligne ne change pas : vérifie que tu envoies bien le dossier frais après "npm run martinique".')
