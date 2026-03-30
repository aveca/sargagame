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
  // Index SEO spécifique Guadeloupe (title/meta/JSON-LD GP)
  if (dir === 'guadeloupe-ftp') {
    const distIndex = path.join(dist, 'index.html')
    let scriptSrc = '/assets/index.js'
    if (fs.existsSync(distIndex)) {
      const match = fs.readFileSync(distIndex, 'utf-8').match(/src="([^"]+\.js)"/)
      if (match) scriptSrc = match[1]
    }
    const gpIndex = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#C4830A" />
    <title>Sargasses Guadeloupe – Carte en temps réel 2026</title>
    <meta name="description" content="Consultez l'état des plages de Guadeloupe face aux sargasses aujourd'hui. Carte interactive mise à jour quotidiennement. Prévisions 7 jours incluses." />
    <link rel="canonical" href="https://sargasses-guadeloupe.com/" />
    <link rel="alternate" hreflang="fr" href="https://sargasses-guadeloupe.com/" />
    <link rel="alternate" hreflang="en" href="https://sargasses-guadeloupe.com/en/" />
    <link rel="alternate" hreflang="x-default" href="https://sargasses-guadeloupe.com/" />
    <meta name="geo.region" content="GP" />
    <meta name="geo.placename" content="Guadeloupe" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Sargasses Guadeloupe – Carte en temps réel 2026" />
    <meta property="og:description" content="Consultez l'état des plages de Guadeloupe face aux sargasses aujourd'hui. Carte interactive mise à jour quotidiennement. Prévisions 7 jours incluses." />
    <meta property="og:url" content="https://sargasses-guadeloupe.com/" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:site_name" content="Sargasses Guadeloupe" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Sargasses Guadeloupe – Carte en temps réel 2026" />
    <meta name="twitter:description" content="Consultez l'état des plages de Guadeloupe face aux sargasses aujourd'hui. Carte interactive, prévisions 7 jours." />
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"WebApplication","name":"Sargasses Guadeloupe en temps réel","description":"Carte et état des plages Guadeloupe aujourd'hui. Sargasses, plages propres, prévisions 7 jours.","url":"https://sargasses-guadeloupe.com/","applicationCategory":"EnvironmentApplication","operatingSystem":"Web","inLanguage":["fr","en"],"dateModified":"2026-03-08","datePublished":"2026-02-21","publisher":{"@type":"Organization","name":"Sargasses Guadeloupe"}}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Quand arrivent les sargasses en Guadeloupe ?","acceptedAnswer":{"@type":"Answer","text":"Les sargasses varient avec les courants et le vent. La saison la plus concernée s’étend généralement d’avril à septembre, avec des pics possibles jusqu’en octobre. Consultez la carte et les prévisions 7 jours pour l’état du jour."}},{"@type":"Question","name":"C'est quoi l'AFAI ?","acceptedAnswer":{"@type":"Answer","text":"L'AFAI (Algal Floating Algae Index) est un indice de détection des algues par satellite. Plus il est bas, mieux c’est : en dessous de 0,3 la plage est considérée comme propre, au-dessus de 0,65 il vaut mieux éviter. La courbe est affichée sur chaque fiche plage."}},{"@type":"Question","name":"Quel risque pour la santé (H2S) ?","acceptedAnswer":{"@type":"Answer","text":"Le H2S (sulfure d’hydrogène) est un gaz libéré quand les sargasses pourrissent. En forte concentration il peut irriter les yeux et la gorge. Les plages en rouge « À éviter » signalent ce risque — à éviter surtout avec des enfants ou personnes fragiles."}},{"@type":"Question","name":"Quelle plage est propre aujourd'hui en Guadeloupe ?","acceptedAnswer":{"@type":"Answer","text":"Ouvrez la carte ou l’onglet Plages : les statuts (propre / modéré / à éviter) sont mis à jour régulièrement à partir des données satellite et du modèle de dérive Copernicus Marine. L’assistant IA peut aussi vous recommander une plage selon vos critères."}},{"@type":"Question","name":"D'où viennent les données ?","acceptedAnswer":{"@type":"Answer","text":"Les statuts viennent de Copernicus Marine : produit satellite (détection des algues) et modèle de dérive océanique. Les données sont rafraîchies régulièrement pour les Antilles. L’indicateur « Copernicus » en haut de l’app confirme la source active."}}]}
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
