/**
 * legacy-404-localize.cjs — Page 404 localisée par région (Jalon canal #6).
 * Constat live (audit UX, 2026-10-11) : la 404 servie sur sargassummiami.com,
 * sargassumpuntacana.com et sargassumcancun.com est la page française générique
 * de public/404.html (« Même le satellite a perdu celle-ci »). Sur les builds
 * régionaux (IS_NEW_REGION), on réécrit dist/404.html avec la langue primaire
 * de la région. Mêmes balises, mêmes styles, mêmes liens internes valides —
 * aucun contenu métier inventé (les libellés de liens reprennent les slugs
 * existants générés au build : /reliability/, /fiabilidad/, /terms/, /privacy/…).
 */

const I18N = {
  fr: {
    htmlLang: 'fr',
    title: 'Le Veilleur a perdu celle-ci — Sargasses Martinique & Guadeloupe',
    heading: 'Même le satellite a perdu celle-ci',
    body: "Cette page n'existe pas (ou a glissé au large). Pas grave — la mer, elle, est toujours là. Le Veilleur la regarde 4×/jour, baie par baie. Choisis une plage propre vérifiée ce matin, ou ouvre la carte.",
    cta: 'Voir la carte des sargasses',
    linksLabel: 'Le Plan B :',
    links: [
      { href: '/', label: 'la carte du jour' },
      { href: '/previsions/', label: 'Prévisions 7 jours' },
      { href: '/mentions-legales.html', label: 'Mentions légales' },
      { href: '/confidentialite.html', label: 'Confidentialité' }
    ]
  },
  en: {
    htmlLang: 'en',
    title: 'Even the satellite lost this one — Sargassum forecast',
    heading: 'Even the satellite lost this one',
    body: "This page doesn't exist (or drifted offshore). No big deal — the sea is still there. The Veilleur checks it 4× a day, bay by bay. Pick a beach checked clean this morning, or open the map.",
    cta: 'View the sargassum map',
    linksLabel: 'Plan B:',
    links: [
      { href: '/', label: "today's map" },
      { href: '/reliability/', label: 'Forecast reliability' },
      { href: '/terms/', label: 'Terms' },
      { href: '/privacy/', label: 'Privacy' }
    ]
  },
  es: {
    htmlLang: 'es',
    title: 'Hasta el satélite perdió esta — Pronóstico sargazo',
    heading: 'Hasta el satélite perdió esta página',
    body: 'Esta página no existe (o se fue a la deriva mar adentro). No importa — el mar sigue ahí. El Vigía la observa 4 veces al día, bahía por bahía. Elige una playa verificada limpia esta mañana, o abre el mapa.',
    cta: 'Ver el mapa de sargazo',
    linksLabel: 'Plan B:',
    links: [
      { href: '/', label: 'el mapa de hoy' },
      { href: '/fiabilidad/', label: 'Fiabilidad del pronóstico' },
      { href: '/terminos/', label: 'Términos' },
      { href: '/privacidad/', label: 'Privacidad' }
    ]
  }
}

/** Rétrocompatibilité du FR historique (contenu actuel de public/404.html). */
const FR_MARKERS = ['Même le satellite a perdu celle-ci', 'Voir la carte des sargasses']

function build404(lang) {
  const t = I18N[lang] || I18N.en
  const linksHtml = t.links.map(l => `<a href="${l.href}">${l.label}</a>`).join(' · ')
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${t.title}</title>
  <meta name="robots" content="noindex, follow" />
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root,.theme-light{--sg-bg:#FFFFFF;--sg-bgD:#F7F7F8;--sg-card:#FFFFFF;--sg-cardS:#FAFAFA;--sg-ink:#000000;--sg-mid:#000000;--sg-mute:#333333;--sg-border:rgba(0,0,0,.08);--sg-borderM:rgba(0,0,0,.14);--sg-glass:rgba(255,255,255,.92);--sg-glassBorder:rgba(0,0,0,.06);--sg-rowHover:rgba(0,0,0,.03);--sg-handle:rgba(0,0,0,.25);--sg-card-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06);}
    .theme-dark{--sg-bg:#0d1117;--sg-ink:#e6edf3;--sg-mid:#adbac7;--sg-mute:#8b949e;--sg-border:rgba(255,255,255,.08);--sg-link:#009688;--sg-link-hover:#00adb3;}
    *{margin:0;padding:0;box-sizing:border-box}
    html{font-size:clamp(14px,2.2vw + 12px,16px);-webkit-text-size-adjust:100%}
    html,body{font-family:'Syne',sans-serif;background:var(--sg-bg);color:var(--sg-ink);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px 40px;text-align:center;line-height:1.6;-webkit-font-smoothing:antialiased}
    .code{font-family:'Anton',sans-serif;font-size:4rem;line-height:1;color:var(--sg-link);margin-bottom:12px}
    h1{font-family:'Anton',sans-serif;font-size:1.5rem;letter-spacing:.05em;text-transform:uppercase;margin-bottom:12px;color:var(--sg-ink)}
    p{max-width:360px;margin-bottom:24px;color:var(--sg-mid)}
    .cta{display:inline-block;padding:12px 24px;background:var(--sg-link);color:#fff;text-decoration:none;border-radius:12px;font-weight:600;font-size:14px}
    .cta:hover{background:var(--sg-link-hover);color:#fff;text-decoration:none}
    .links{margin-top:20px;font-size:13px;color:var(--sg-mute)}
    .links a{color:var(--sg-link);text-decoration:none;padding:4px 10px;font-weight:600}
    .links a:hover{color:var(--sg-link-hover);text-decoration:underline}
  </style>
  <script>
    (function(){ try { var v = localStorage.getItem("sg_theme"); if (v === "dark") document.documentElement.classList.add("theme-dark"); else if (v !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("theme-dark"); } catch (e) {} })();
  </script>
</head>
<body>
  <div class="code">404</div>
  <h1>${t.heading}</h1>
  <p>${t.body}</p>
  <a href="/" class="cta">${t.cta}</a>
  <div class="links">
    ${t.linksLabel} ${linksHtml}
  </div>
</body>
</html>
`
}

/** Réécrit dist/404.html avec la langue primaire de la région (build IS_NEW_REGION). */
function localize404(region, distDir) {
  const fs = require('fs')
  const path = require('path')
  const lang = region.primaryLang === 'es' ? 'es' : region.primaryLang === 'en' ? 'en' : 'fr'
  const target = path.join(distDir, '404.html')
  fs.writeFileSync(target, build404(lang), 'utf-8')
  return { target, lang }
}

module.exports = { build404, localize404, FR_MARKERS, I18N }
