/**
 * civic-pages.cjs — Pages /presse/ + /soutenir/ (P1 acquisition & communauté).
 *
 * Générées au build core MQ/GP (canonical MQ + miroir _gp/, sitemaps patchés —
 * pattern month-pages). Contenu :
 *   /presse/   : kit presse data-driven — 3 graphiques SVG calculés depuis les
 *                VRAIES données (history.json 31 j + backtest-results.json),
 *                méthodologie, lien /fiabilite/, contact. Zéro attaque
 *                concurrentielle, zéro sensationnalisme, chiffres hedgés.
 *   /soutenir/ : soutien communautaire « Veilleur » (3/10/25/50 €) — positionné
 *                comme SOUTIEN, jamais comme don fiscalement déductible (aucun
 *                reçu fiscal), jamais mélangé à l'achat premium, jamais
 *                d'influence sur le verdict. Paiement NON branché (voir REMAINING
 *                du rapport) : capture email de pré-lancement via /alertes/.
 *
 * RÈGLE D'OR : aucun chiffre inventé. Sans données → section absente + mention.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const today = () => new Date().toISOString().slice(0, 10)

function writePage(distDir, slug, html) {
  const dir = path.join(distDir, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
}

function appendToSitemap(sitemapPath, domain, slug) {
  let xml
  try { xml = fs.readFileSync(sitemapPath, 'utf-8') } catch { return false }
  const loc = `https://${domain}/${slug}/`
  if (xml.includes(loc)) return true
  if (!xml.includes('</urlset>')) return false
  fs.writeFileSync(sitemapPath, xml.replace('</urlset>', `  <url><loc>${loc}</loc><lastmod>${today()}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>\n</urlset>`), 'utf-8')
  return true
}

function shell({ lang, domain, siteName, slug, title, desc, body }) {
  const tplPath = path.join(ROOT, 'dist', 'index.html')
  let html = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, 'utf-8') : fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8')
  const canonical = `https://${domain}/${slug}/`
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/(<link rel="canonical" href=)"[^"]*"/, `$1"${canonical}"`)
    .replace(/(<meta property="og:title" content=)"[^"]*"/, `$1"${esc(title)}"`)
    .replace(/(<meta property="og:description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=)"[^"]*"/, `$1"${canonical}"`)
    .replace(/(<meta name="twitter:title" content=)"[^"]*"/, `$1"${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\s*/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
    .replace(/<noscript>\s*<h1>[\s\S]*?<\/noscript>/, '')
  const alt = `<link rel="alternate" hreflang="${lang}" href="${canonical}" />\n<link rel="alternate" hreflang="x-default" href="${canonical}" />`
  const ld = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url: canonical, dateModified: today(), inLanguage: lang, isPartOf: { '@type': 'WebApplication', name: siteName, url: `https://${domain}/` } })}</script>`
  html = html.replace('</head>', `${alt}\n${ld}\n</head>`)
  html = html.replace('<div id="root">', `<noscript>${body}</noscript>\n<div id="root">`)
  return html
}

// SVG minimaliste : barres + labels, 100 % calculé, jamais décoratif.
function barChart({ title, bars, unit, color }) {
  // bars: [{label, value (0-100), sub}]
  const W = 560, H = 34 * bars.length + 44, BW = 300
  const rows = bars.map((b, i) => {
    const y = 30 + i * 34, w = Math.max(2, Math.round(BW * Math.min(100, b.value) / 100))
    return `<text x="0" y="${y + 11}" font-size="12" fill="#333" font-family="system-ui">${esc(b.label)}</text>`
      + `<rect x="170" y="${y}" width="${w}" height="16" rx="4" fill="${color}"/>`
      + `<text x="${178 + w}" y="${y + 12}" font-size="12" font-weight="700" fill="#0D0D0D" font-family="system-ui">${b.value}${unit}</text>`
      + (b.sub ? `<text x="170" y="${y + 27}" font-size="10" fill="#686868" font-family="system-ui">${esc(b.sub)}</text>` : '')
  }).join('')
  return `<figure style="margin:1.2em 0"><figcaption style="font-weight:800;margin-bottom:6px">${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}">${rows}</svg></figure>`
}

function pressBody(island, domain) {
  const hist = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'history.json'), { history: [] })
  const bt = loadJSON(path.join(ROOT, 'scripts', 'automation', 'data', 'backtest-results.json'), null)
  const days = (hist.history || []).slice(-30)
  // G1 : % plages propres / jour (30 derniers jours mesurés).
  const g1 = days.map(d => {
    const lv = d.levels || []
    const clean = lv.filter(l => l.status === 'clean').length
    return { label: String(d.date).slice(5), value: lv.length ? Math.round(100 * clean / lv.length) : 0, sub: `${clean}/${lv.length}` }
  })
  const g1chart = g1.length >= 7 ? barChart({ title: `Plages propres par jour — 30 derniers jours mesurés (${island})`, bars: g1.slice(-14), unit: ' %', color: '#16A34A' })
    : '<p>Données en cours d\u2019accumulation (moins de 7 jours mesurés).</p>'
  // G2 : taux de justesse par horizon (backtest réel).
  const hor = bt && bt.byHorizon ? ['day1', 'day2', 'day3', 'day4', 'day5', 'day6'].filter(k => bt.byHorizon[k]).map(k => ({ label: 'J+' + k.slice(3), value: bt.byHorizon[k].statusHitRate, sub: `N=${bt.byHorizon[k].n || '?'}` })) : []
  const win = bt && (bt.dateRange || bt.window)
  const g2chart = hor.length ? barChart({ title: 'Prévisions justes par horizon (backtest figé, append-only)', bars: hor, unit: ' %', color: '#E8A800' })
    + `<p style="color:#686868;font-size:13px">Fenêtre : ${esc(win ? JSON.stringify(win) : 'voir /fiabilite/')} · Taux global tous régimes : <strong>${bt.overall ? bt.overall.statusHitRate + ' %' : 'voir /fiabilite/'}</strong>. On cite le plancher, jamais le flatteur.</p>`
    : '<p>Backtest en cours de calcul — voir <a href="/fiabilite/">/fiabilite/</a>.</p>'
  // G3 : fiabilité par régime (hedgée).
  const reg = bt && bt.byRegime ? Object.entries(bt.byRegime).map(([k, v]) => ({ label: k, value: v.statusHitRate != null ? v.statusHitRate : v.hitRate, sub: `N=${v.n || v.total || '?'}` })) : []
  const g3chart = reg.length ? barChart({ title: 'Justesse par régime (saison calme vs pics — le pic reste peu échantillonné)', bars: reg, unit: ' %', color: '#0E7C66' }) : ''
  return `<article style="max-width:700px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><nav style="font-size:13px;color:#686868;margin-bottom:12px"><a href="/" style="color:#686868">Accueil</a></nav><h1 style="font-size:26px;margin-bottom:8px">Kit presse — Sargasses ${esc(island)}</h1><p style="color:#444">Trois graphiques calculés ce jour (${today()}) depuis nos données publiques. Réutilisation libre avec mention « Sargagame / satellite Copernicus ». Contact : <a href="mailto:alerte@sargasses-martinique.com">alerte@sargasses-martinique.com</a>.</p><h2 style="font-size:18px;margin:22px 0 8px">Angle 1 — « On publie nos erreurs »</h2>${g2chart}${g3chart}<h2 style="font-size:18px;margin:22px 0 8px">Angle 2 — « Où aller plutôt »</h2><p style="color:#444">Chaque fiche plage défavorable propose l'alternative propre la plus proche (même île, ≤ 60 km, mesurée). Démo : <a href="/aujourdhui/">où se baigner aujourd'hui</a>.</p><h2 style="font-size:18px;margin:22px 0 8px">Angle 3 — « Les plages du mois »</h2>${g1chart}<h2 style="font-size:18px;margin:22px 0 8px">Méthodologie (2 minutes)</h2><p style="color:#444">Indice AFAI mesuré au large (Copernicus Sentinel-3 / MODIS), 4 passages/jour. Propre : AFAI &lt; 0,15. Modéré : 0,15–0,40. À éviter : &gt; 0,40. Prévisions figées J+1→J+6 puis comparées à l'observation satellite (archive append-only, non réécrivable). Détail et limites : <a href="/fiabilite/">/fiabilite/</a> · données brutes : <a href="/api/reliability.json">reliability.json</a>.</p><nav style="margin-top:28px;padding-top:16px;border-top:1px solid #eee"><a href="/aujourdhui/" style="color:#E8A800;font-weight:600;margin-right:16px">Où se baigner aujourd'hui</a><a href="/fiabilite/" style="color:#E8A800;font-weight:600">Fiabilité</a></nav></article>`
}

function soutienBody(island) {
  const tiers = [
    { amount: 3, label: 'Regard', desc: 'Le prix d\u2019un café : vous gardez un œil sur la mer avec nous.' },
    { amount: 10, label: 'Veilleur', desc: 'Vous financez une journée de passages satellite pour une plage.' },
    { amount: 25, label: 'Guetteur', desc: 'Vous soutenez une semaine de veille sur votre commune.' },
    { amount: 50, label: 'Sentinelle', desc: 'Vous portez le réseau de veille d\u2019une île entière.' },
  ]
  const cards = tiers.map(t => `<div style="border:2px solid #0D0D0D;border-radius:12px;padding:14px;margin:8px 0"><div style="font-size:20px;font-weight:800">${t.amount} € — ${t.label}</div><div style="color:#444;margin-top:4px">${t.desc}</div></div>`).join('')
  return `<article style="max-width:700px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><nav style="font-size:13px;color:#686868;margin-bottom:12px"><a href="/" style="color:#686868">Accueil</a></nav><h1 style="font-size:26px;margin-bottom:8px">Soutenir la veille — ${esc(island)}</h1><p style="color:#444;font-size:17px"><strong>Les plages sont publiques. Leur intelligence devrait l\u2019être aussi.</strong></p><p style="color:#444">Le Veilleur mesure la mer chaque jour pour que personne ne découvre les sargasses une fois la serviette posée. Votre soutien finance les passages satellite, les serveurs et la vérification terrain — pas des promesses.</p>${cards}<h2 style="font-size:18px;margin:22px 0 8px">Transparence totale</h2><ul style="color:#444;line-height:1.7"><li>Soutien <strong>communautaire</strong> : ce n\u2019est pas un don fiscalement déductible, aucun reçu fiscal n\u2019est émis.</li><li>Le soutien n\u2019achète <strong>ni premium ni privilège</strong> : l\u2019accès payant reste séparé, sur le pass.</li><li><strong>Aucun soutien ne peut modifier un verdict</strong> : statuts 100 % satellite, erreurs publiées sur <a href="/fiabilite/">/fiabilite/</a>.</li><li>Le paiement en ligne ouvre prochainement — laissez votre email pour être prévenu.</li></ul><p><a href="/alertes/" style="display:inline-block;padding:13px 26px;background:#FFC72C;color:#0D0D0D;border-radius:12px;font-weight:800;text-decoration:none">Me prévenir de l\u2019ouverture →</a></p><nav style="margin-top:28px;padding-top:16px;border-top:1px solid #eee"><a href="/fiabilite/" style="color:#E8A800;font-weight:600;margin-right:16px">Fiabilité</a><a href="/aujourdhui/" style="color:#E8A800;font-weight:600">Où se baigner aujourd'hui</a></nav></article>`
}

function generateCivicPages(region, distDir) {
  // Core uniquement (MQ + miroir _gp) — pas de sens FR pour les domaines US.
  const jobs = [
    { island: 'mq', label: 'Martinique', domain: 'sargasses-martinique.com', outDir: distDir, sm: 'sitemap-martinique.xml' },
    { island: 'gp', label: 'Guadeloupe', domain: 'sargasses-guadeloupe.com', outDir: path.join(distDir, '_gp'), sm: 'sitemap-guadeloupe.xml' },
  ]
  for (const j of jobs) {
    const pressHtml = shell({ lang: 'fr', domain: j.domain, siteName: `Sargasses ${j.label}`, slug: 'presse', title: `Kit presse — Sargasses ${j.label} : données, graphiques, méthodologie`, desc: `Kit presse Sargagame ${j.label} : 3 graphiques calculés du jour (prévisions justes, régimes, plages propres), méthodologie satellite, contact.`, body: pressBody(j.label, j.domain) })
    writePage(j.outDir, 'presse', pressHtml)
    const supHtml = shell({ lang: 'fr', domain: j.domain, siteName: `Sargasses ${j.label}`, slug: 'soutenir', title: `Soutenir la veille sargasses — ${j.label} (Veilleur)`, desc: `Soutenez la veille sargasses en ${j.label} : 3, 10, 25 ou 50 €. Soutien communautaire, sans reçu fiscal, sans influence sur les verdicts satellite.`, body: soutienBody(j.label) })
    writePage(j.outDir, 'soutenir', supHtml)
    const ok1 = appendToSitemap(path.join(distDir, j.sm), j.domain, 'presse')
    const ok2 = appendToSitemap(path.join(distDir, j.sm), j.domain, 'soutenir')
    console.log(`   → pages civiques ${j.island} : /presse/${ok1 ? ' +sitemap' : ''} · /soutenir/${ok2 ? ' +sitemap' : ''}`)
  }
}

module.exports = { generateCivicPages }
