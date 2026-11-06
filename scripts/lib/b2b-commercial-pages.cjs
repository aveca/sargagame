/**
 * b2b-commercial-pages.cjs — pages commerciales regionalisées (build, par région).
 *
 * PROBLÈMES PRODUITS mesurés le 2026-11-05 (lecture seule sur les 6 domaines) :
 *
 *  1. Les 6 sites servaient la MÊME page /pro/ en FRANÇAIS — y compris
 *     sargassummiami.com, sargassumpuntacana.com (EN), sargassumcancun.com et
 *     sargazotulum.com (ES). Un hôtelier de Miami atterrissait sur une page FR.
 *  2. Les pages EN/ES portaient des <link rel=canonical> / og:url / hreflang
 *     pointant sur sargasses-martinique.com : sur les 4 domaines USD, la page
 *     commerciale se déclarait canoniquement Martinique (SEO + confiance).
 *  3. Les CTA internes des pages FR pointaient en absolu vers la Martinique :
 *     sur un domaine USD, « Offres & tarifs » menait au site FR de la Martinique.
 *  4. Le lien « voir la fiabilité » des pages EN/ES menait à /fiabilite/ (FR).
 *  5. La page EN/ES affichait un palier « from $219/month » (Coastline) qui
 *     N'EXISTE dans aucune grille payable (canonical : territoire = 1 990 €/an
 *     EUR, annuel uniquement) → prix annoncé non vendable = promesse fausse.
 *
 * CE QUE FAIT CE MODULE (build, jamais de prod touchée) :
 *   - /pro/ sert la variante de langue de la région (EN pour florida/puntacana,
 *     ES pour rivieramaya/tulum) ; son canonical reste l'URL de la variante
 *     (/pro/en/, /pro/es/) sur LE DOMAINE DE LA RÉGION → pas de doublon.
 *   - toutes les URL absolues de nos domaines → le domaine de la région ;
 *     les liens vers la version FR des Antilles pointent explicitement vers le
 *     domaine Martinique (c'est là que vit la page FR).
 *   - la page EN/ES de tarifs affiche le palier Territoire canonique (EUR) et
 *     plus de montant USD non vendable.
 *   - /pro/demo/ : une démo par destination, lue sur les données PUBLIQUES du
 *     site, avec le contrôle de fraîcheur appliqué AU MOMENT DE L'AFFICHAGE
 *     (SLA 900 min) — fail-closed : pas de verdict sur donnée périmée.
 */
const fs = require('fs')
const path = require('path')

const SLA_MINUTES = 900 // SLA opérationnel : JAMAIS abaissé (cf. P0.118 §9)

const OUR_DOMAINS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassummiami.com',
  'sargassumpuntacana.com',
  'sargassumcancun.com',
  'sargazotulum.com',
]

const RELIABILITY_PATH = { fr: 'fiabilite', en: 'reliability', es: 'fiabilidad' }

/**
 * Noms réels des plages, indexés par l'identifiant de niveau Copernicus
 * (la clé que publie /api/copernicus/sargassum.json).
 *   - MQ/GP : les niveaux ont des clés courtes (« grande-anse », « gp-gosier »)
 *     → mappées vers beaches-list.json via SARG_TO_BEACH (source unique).
 *   - Régions USD : le niveau porte l'ID de plage de la région (fl001, tu001…)
 *     → nom lu dans regions/<id>.json.
 * Sans ce mapping, la démo affichait des identifiants techniques
 * (« grande-anse ») au lieu du nom de la plage : un prospect ne reconnaît pas
 * SA plage → la démo ne prouve rien.
 */
function buildBeachNames({ region, publicDir }) {
  const names = {}
  const load = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(publicDir, rel), 'utf8')) } catch { return null } }
  const isSharedLegacy = region.id === 'mq' || region.id === 'gp'
  // MQ/GP : un SEUL build sert les deux îles (le domaine Guadeloupe est
  // substitué au packaging) → il faut les noms des plages MQ ET GP.
  // Régions USD : uniquement les plages de la région (le build est mono-région).
  if (isSharedLegacy) {
    const list = load('data/beaches-list.json')
    const beaches = Array.isArray(list) ? list : ((list && list.beaches) || [])
    const byId = new Map(beaches.map(b => [b.id, b.name]))
    let sargMap = {}
    try { sargMap = require('./sarg-to-beach.cjs').SARG_TO_BEACH } catch { sargMap = {} }
    for (const [sargKey, beachId] of Object.entries(sargMap)) {
      const name = byId.get(beachId)
      if (name) names[sargKey] = name
    }
    return names
  }
  // Régions USD : ID de plage = ID de niveau publié par la région.
  for (const b of (region.beaches || [])) {
    if (b && b.id && b.name) names[b.id] = b.name
  }
  return names
}

/** Réécrit les URL absolues de nos domaines vers le domaine de la région. */
function rewriteHosts(html, { domain, lang }) {
  const rel = RELIABILITY_PATH[lang] || 'fiabilite'
  let out = String(html || '')
  // « voir la fiabilité » : /fiabilite/ est la page FR ; EN/ES ont leur propre slug.
  out = out.replace(/https:\/\/sargasses-martinique\.com\/fiabilite\/?/g, `https://${domain}/${rel}/`)
  out = out.replace(/https:\/\/sargasses-guadeloupe\.com\/fiabilite\/?/g, `https://${domain}/${rel}/`)
  // Lien RELATIF « /fiabilite/ » dans les hubs EN/ES : sur un domaine EN/ES la
  // page de fiabilité est /reliability/ (EN) ou /fiabilidad/ (ES) — le slug FR
  // n'existait pas sur ces domaines (lien mort vers une page hors marché).
  if (rel !== 'fiabilite') {
    out = out.replace(/(href=")\/fiabilite\/(")/g, `$1/${rel}/$2`)
  }
  for (const d of OUR_DOMAINS) {
    out = out.replace(new RegExp(`https:\\/\\/${d.replace(/\./g, '\\.')}`, 'g'), `https://${domain}`)
  }
  return out
}

/**
 * Le lien « Version française » du hub EN/ES doit pointer vers la page FR, qui
 * vit sur le domaine Martinique (Antilles françaises) — sinon il pointe sur
 * lui-même une fois le hub régionalisé.
 */
function rewriteLanguageSwitcher(html, { frDomain = 'sargasses-martinique.com' } = {}) {
  return String(html || '').replace(/href="\/pro\/"/g, `href="https://${frDomain}/pro/"`)
}

/**
 * Palier « Coastline / Territoire » des pages EN/ES : on remplace le montant
 * USD non vendable ($219/mois) par le canonique (1 990 €/an, EUR, annuel).
 * AUCUN montant inventé : la valeur vient de la grille TIERS unique.
 */
function fixTerritoryPrice(html, { tierValue = '1990.00', tierCurrency = 'EUR' } = {}) {
  let out = String(html || '')
  const n = Number(tierValue)
  const shown = tierCurrency === 'EUR'
    ? `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} €`
    : `$${n.toLocaleString('en-US')}`
  out = out.replace(/(from\s*)?\$\s?219\s*\/\s*month/gi, `${shown}/year`)
  out = out.replace(/(à partir de\s*)?\$\s?219\s*\/\s*mes/gi, `${shown}/an`)
  out = out.replace(/\(from\s*\$219\/month\)/gi, `(${shown}/year)`)
  return out
}

/** Bloc CTA « démo » ajouté en fin de page (avant </body>). */
function demoCtaBlock({ lang, regionName }) {
  const copy = {
    fr: {
      title: 'Voir la démo sur vos plages',
      // Formulation NEUTRE : le build MQ/GP est partagé (le domaine Guadeloupe
      // est substitué au deploy) — nommer « Martinique » ici afficherait
      // « Martinique » sur le site Guadeloupe.
      text: `La même lecture que sur la carte publique : statut, score et date d'observation de chaque plage suivie — en direct, avec l'heure de la dernière observation.`,
      cta: 'Voir la démo',
    },
    en: {
      title: 'See the demo on your beaches',
      text: `The same read-out as on ${regionName}: status, score and observation time for every monitored beach — live, with the timestamp of the last observation.`,
      cta: 'See the demo',
    },
    es: {
      title: 'Ver la demo en tus playas',
      text: `La misma lectura que en ${regionName}: estado, score y hora de la última observación de cada playa seguida — en vivo, con la fecha de la observación.`,
      cta: 'Ver la demo',
    },
  }[lang] || null
  if (!copy) return ''
  return `
<div style="max-width:960px;margin:36px auto 0;padding:0 18px">
  <div style="background:var(--sg-card,#fff);border:1px solid var(--sg-border-m,#e5e0d5);border-radius:18px;padding:22px 24px;display:flex;gap:18px;flex-wrap:wrap;align-items:center;justify-content:space-between">
    <div style="max-width:620px">
      <div style="font-weight:800;font-size:19px;margin-bottom:6px;color:var(--sg-ink,#1a1a1a)">${copy.title}</div>
      <div style="font-size:14px;line-height:1.55;color:var(--sg-mid,#555)">${copy.text}</div>
    </div>
    <a href="/pro/demo/" style="display:inline-block;padding:13px 24px;background:#FFC72C;color:#0D0D0D;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px">${copy.cta} →</a>
  </div>
</div>`
}

/**
 * Démo par destination : coquille statique + lecture des DONNÉES PUBLIQUES du
 * site. La fraîcheur est recalculée À L'AFFICHAGE (SLA 900 min) — le champ
 * `stale` du payload est calculé à la publication et peut être faux.
 */
function demoPage({ lang, regionName, regionId, domain, currency, beachNames }) {
  const L = {
    fr: {
      h1: `Démo — vos plages en direct`,
      lead: `Voici l'état réel des plages suivies et publiées sur ce site, lu directement dans les données publiques.`,
      beach: 'Plage', status: 'État', score: 'Score', updated: 'Observation',
      clean: 'Mer propre', moderate: 'Présence modérée', avoid: 'À éviter',
      fresh: 'Données à jour', stale: 'Vérification en cours',
      staleNote: `La dernière observation remonte à plus de ${Math.round(SLA_MINUTES / 60)} h : nous ne publions pas de verdict sur une observation périmée. La carte du site reste la référence.`,
      cta: 'Activer mon essai 30 jours (sans carte)',
      cta2: 'Voir les tarifs',
      note: 'Même source que la carte publique : satellite (Copernicus/NOAA). Aucun chiffre n’est arrondi pour la vente.',
    },
    en: {
      h1: `Demo — ${regionName}`,
      lead: `The real state of the monitored beaches in ${regionName}, read straight from this site's public data.`,
      beach: 'Beach', status: 'Status', score: 'Score', updated: 'Observation',
      clean: 'Clean water', moderate: 'Moderate', avoid: 'Avoid',
      fresh: 'Data up to date', stale: 'Verification in progress',
      staleNote: `The last observation is more than ${Math.round(SLA_MINUTES / 60)} h old: we do not publish a verdict on stale data. The live map stays the reference.`,
      cta: 'Start my 30-day trial (no card)',
      cta2: 'See pricing',
      note: 'Same source as the public map: satellite (Copernicus/NOAA). No number is rounded for selling.',
    },
    es: {
      h1: `Demo — ${regionName}`,
      lead: `El estado real de las playas monitoreadas de ${regionName}, leído directamente de los datos públicos de este sitio.`,
      beach: 'Playa', status: 'Estado', score: 'Score', updated: 'Observación',
      clean: 'Mar limpio', moderate: 'Presencia moderada', avoid: 'Evitar',
      fresh: 'Datos al día', stale: 'Verificación en curso',
      staleNote: `La última observación tiene más de ${Math.round(SLA_MINUTES / 60)} h: no publicamos un veredicto sobre datos vencidos. El mapa del sitio sigue siendo la referencia.`,
      cta: 'Activar mi prueba de 30 días (sin tarjeta)',
      cta2: 'Ver precios',
      note: 'Misma fuente que el mapa público: satélite (Copernicus/NOAA). Ningún número se redondea para vender.',
    },
  }[lang] || null
  if (!L) return null

  const pricingHref = lang === 'fr' ? '/pro/pricing/' : `/pro/${lang}/pricing/`
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${L.h1} — Le Veilleur</title>
<meta name="description" content="${L.lead}">
<link rel="canonical" href="https://${domain}/pro/demo/">
<link rel="icon" href="/favicon.ico">
<style>
  :root{--ink:#1a1a1a;--mid:#555;--line:#e5e0d5;--clean:#00B086;--moderate:#F5A623;--avoid:#D64545}
  *{box-sizing:border-box}
  body{margin:0;background:#F7F5EF;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.55}
  .wrap{max-width:960px;margin:0 auto;padding:34px 18px 70px}
  h1{font-size:30px;margin:0 0 10px;letter-spacing:-.02em}
  .lead{font-size:16px;color:var(--mid);max-width:720px}
  .bar{margin:22px 0;padding:14px 16px;border-radius:14px;font-size:14px;font-weight:700}
  .bar.fresh{background:#E7F7F1;color:#067A57;border:1px solid #B9E6D7}
  .bar.stale{background:#FFF6E5;color:#8A5B00;border:1px solid #F0D9A8}
  .bar small{display:block;font-weight:500;margin-top:4px;color:inherit;opacity:.9}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
  th,td{text-align:left;padding:11px 13px;font-size:14px;border-bottom:1px solid var(--line)}
  th{background:#FBF9F4;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--mid)}
  tr:last-child td{border-bottom:none}
  .pill{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px}
  .dot{width:9px;height:9px;border-radius:50%;background:#888;display:inline-block}
  .cta{display:inline-block;padding:14px 26px;background:#FFC72C;color:#0D0D0D;text-decoration:none;border-radius:12px;font-weight:800;margin:24px 10px 0 0}
  .cta.sec{background:#fff;border:2px solid var(--ink)}
  .note{font-size:12px;color:var(--mid);margin-top:26px}
</style>
</head>
<body>
<div class="wrap">
  <h1>${L.h1}</h1>
  <p class="lead">${L.lead}</p>
  <div id="bar" class="bar stale">${L.stale}<small id="barNote">${L.staleNote}</small></div>
  <table>
    <thead><tr><th>${L.beach}</th><th>${L.status}</th><th>${L.score}</th><th>${L.updated}</th></tr></thead>
    <tbody id="rows"><tr><td colspan="4">…</td></tr></tbody>
  </table>
  <a class="cta" href="/pro/espace/">${L.cta} →</a>
  <a class="cta sec" href="${pricingHref}">${L.cta2} →</a>
  <p class="note">${L.note}</p>
</div>
<script>
(function(){
  "use strict";
  var CFG=${JSON.stringify({ lang, regionId, regionName, slaMinutes: SLA_MINUTES, labels: L, beachNames: beachNames || {} })};
  var T=CFG.labels;
  var rows=document.getElementById("rows"),bar=document.getElementById("bar"),barNote=document.getElementById("barNote");
  function esc(s){var d=document.createElement("div");d.textContent=String(s==null?"":s);return d.innerHTML;}
  function statusLabel(s){if(s==="clean")return T.clean;if(s==="moderate")return T.moderate;if(s==="avoid")return T.avoid;return String(s||"—");}
  function statusColor(s){if(s==="clean")return "#00B086";if(s==="moderate")return "#F5A623";if(s==="avoid")return "#D64545";return "#888";}
  fetch("/api/copernicus/sargassum.json",{cache:"no-store"}).then(function(r){return r.json();}).then(function(d){
    var lv=(d&&d.levels)||[];
    var upd=d&&d.updatedAt?Date.parse(d.updatedAt):NaN;
    var ageMin=isFinite(upd)?Math.round((Date.now()-upd)/60000):Infinity;
    // Fraîcheur RECALCULÉE à l'affichage : le champ \`stale\` du payload est figé
    // à la publication et peut dire \`false\` sur une donnée de plusieurs jours.
    var fresh=ageMin<=CFG.slaMinutes;
    if(fresh){bar.className="bar fresh";bar.firstChild.nodeValue=T.fresh+" · "+ageMin+" min";barNote.textContent="";}
    else{bar.className="bar stale";bar.firstChild.nodeValue=T.stale;barNote.textContent=T.staleNote;}
    var names=CFG.beachNames||{};
    if(!lv.length){rows.innerHTML='<tr><td colspan="4">—</td></tr>';return;}
    rows.innerHTML=lv.map(function(l){
      var nm=names[l.id]||l.name||l.id;
      var sc=(typeof l.score==="number")?l.score:(l.afai!=null?Math.round(l.afai*100):"—");
      var st=fresh?statusLabel(l.status):"—";
      var col=fresh?statusColor(l.status):"#bbb";
      var when=isFinite(upd)?new Date(upd).toISOString().replace("T"," ").slice(0,16)+" UTC":"—";
      return '<tr><td>'+esc(nm)+'</td><td><span class="pill"><span class="dot" style="background:'+col+'"></span>'+esc(st)+'</span></td><td>'+esc(sc)+'</td><td>'+esc(when)+'</td></tr>';
    }).join("");
  }).catch(function(){
    rows.innerHTML='<tr><td colspan="4">—</td></tr>';
  });
})();
</script>
</body>
</html>`
}

/**
 * Applique la regionalisation aux pages commerciales du dist d'une région.
 * @param {object} opts
 * @param {object} opts.region  config regions/<id>.json
 * @param {string} opts.outDir  dossier dist de la région
 * @param {string} opts.publicDir dossier public (sources des variantes de langue)
 */
function buildCommercialPages({ region, outDir, publicDir }) {
  const lang = region.primaryLang || 'fr'
  const domain = region.domain
  const written = []

  // 1. Hub /pro/ : variante de langue de la région (canonical conservé sur /pro/<lang>/).
  if (lang !== 'fr') {
    const src = path.join(publicDir, 'pro', lang, 'index.html')
    const dst = path.join(outDir, 'pro', 'index.html')
    if (fs.existsSync(src)) {
      let html = fs.readFileSync(src, 'utf8')
      html = rewriteHosts(html, { domain, lang })
      html = rewriteLanguageSwitcher(html)
      html = html.replace('</body>', demoCtaBlock({ lang, regionName: region.name || domain }) + '\n</body>')
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.writeFileSync(dst, html, 'utf8')
      written.push(path.relative(outDir, dst).replace(/\\/g, '/'))
    }
  } else {
    // 1-bis. Hub FR (MQ/GP, build partagé) : on y ajoute le CTA démo.
    // Sans lui, /pro/demo/ resterait une page orpheline (le hub FR est la
    // porte d'entrée B2B principale des deux sites Antilles).
    const dst = path.join(outDir, 'pro', 'index.html')
    if (fs.existsSync(dst)) {
      let html = fs.readFileSync(dst, 'utf8')
      if (!html.includes('/pro/demo/')) {
        html = html.replace('</body>', demoCtaBlock({ lang: 'fr', regionName: region.name || domain }) + '\n</body>')
        fs.writeFileSync(dst, html, 'utf8')
      }
    }
  }

  // 2. Tarifs EN/ES : palier Territoire canonique + lien fiabilité régional.
  for (const l of ['en', 'es']) {
    const p = path.join(outDir, 'pro', l, 'pricing', 'index.html')
    if (!fs.existsSync(p)) continue
    let html = fs.readFileSync(p, 'utf8')
    html = fixTerritoryPrice(html)
    html = rewriteHosts(html, { domain, lang: l })
    fs.writeFileSync(p, html, 'utf8')
  }

  // 3. /for-hotels/ : canonical + og + liens vers le domaine de la région.
  const fh = path.join(outDir, 'for-hotels', 'index.html')
  if (fs.existsSync(fh)) {
    let html = fs.readFileSync(fh, 'utf8')
    html = rewriteHosts(html, { domain, lang })
    fs.writeFileSync(fh, html, 'utf8')
  }

  // 4. Démo par destination.
  const beachNames = buildBeachNames({ region, publicDir })
  const demo = demoPage({ lang, regionName: region.name || domain, regionId: region.id, domain, currency: region.currency, beachNames })
  if (demo) {
    const dst = path.join(outDir, 'pro', 'demo', 'index.html')
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.writeFileSync(dst, demo, 'utf8')
    written.push(path.relative(outDir, dst).replace(/\\/g, '/'))
  }

  // 5. Lien vers la démo depuis la page EN/ES des hôtels (entrée naturelle).
  for (const l of ['en', 'es']) {
    const p = path.join(outDir, 'pro', l, 'hotels', 'index.html')
    if (!fs.existsSync(p)) continue
    let html = fs.readFileSync(p, 'utf8')
    if (!html.includes('/pro/demo/')) {
      html = html.replace('</body>', demoCtaBlock({ lang: l, regionName: region.name || domain }) + '\n</body>')
      fs.writeFileSync(p, html, 'utf8')
    }
  }

  return { lang, domain, written }
}

module.exports = {
  SLA_MINUTES, RELIABILITY_PATH, OUR_DOMAINS,
  rewriteHosts, rewriteLanguageSwitcher, fixTerritoryPrice, demoCtaBlock, demoPage, buildCommercialPages, buildBeachNames,
}
