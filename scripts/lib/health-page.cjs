/**
 * health-page.cjs — Page « Santé / Risques » Q&A auto-générée au build (régions USD).
 * Appelée par le plugin seo-pages de vite.config.js (closeBundle), branche IS_NEW_REGION,
 * APRÈS generateMonthPages — même mécanique que reliability-page.cjs / month-pages.cjs :
 *   - dist/<slug>/index.html (page standalone dark-theme, cohérente avec /about/ et /reliability/)
 *   - patch dist/sitemap.xml (écrit avant par region-seo-pages.cjs).
 *
 * Slugs : EN 'sargassum-health-risks', ES 'sargazo-salud-riesgos' (lang = region.primaryLang).
 *
 * RÈGLE D'OR (santé) : ton médicalement CONSERVATEUR et factuel. Aucun chiffre inventé,
 * aucune affirmation médicale non sourcée. Les autorités sanitaires sont citées par leur nom
 * SANS citation fabriquée ; la base scientifique sûre est le H2S émis par la décomposition
 * en grands volumes (irritation yeux/voies respiratoires), faible à distance d'une plage nettoyée.
 *
 * Ne touche RIEN du chemin MQ/GP : si region n'est pas une nouvelle région → no-op.
 */
const fs = require('fs')
const path = require('path')

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Autorité sanitaire compétente par région — citée par son nom réel, jamais de citation inventée.
const AUTHORITY = {
  florida: { en: 'the Florida Department of Health', es: 'el Departamento de Salud de Florida' },
  puntacana: { en: "the Dominican Republic's Ministry of Public Health (Ministerio de Salud Pública)", es: 'el Ministerio de Salud Pública de República Dominicana' },
  rivieramaya: { en: 'the Quintana Roo health authorities', es: 'las autoridades de salud de Quintana Roo' },
}

/**
 * Q&A par langue. Réponses en texte brut (pas de HTML) → réutilisées telles quelles
 * pour le FAQPage JSON-LD et, escapées, pour le rendu visible. Aucune valeur numérique
 * (seuils ppm, etc.) : on reste qualitatif pour ne rien inventer.
 */
function buildContent(lang, regionName, authority) {
  if (lang === 'es') {
    return {
      back: 'Volver al mapa',
      h1a: '¿El sargazo es', h1b: 'peligroso?',
      lead: `Respuestas claras y prudentes sobre el sargazo y tu salud en ${regionName}. Información general, no consejo médico: ante una alerta sanitaria, sigue siempre las indicaciones de las autoridades locales.`,
      lbl: 'Salud y seguridad',
      qaTitle: 'Lo que conviene saber',
      qa: [
        {
          q: '¿El sargazo en la playa es peligroso?',
          a: `El sargazo que flota fresco en el agua no suele ser dañino al tacto. El problema aparece cuando se acumula en grandes cantidades y se descompone en la orilla: al pudrirse libera gases, sobre todo sulfuro de hidrógeno (H2S), el responsable del olor a huevo podrido. Junto a una playa limpia o a cierta distancia de los amontonamientos el riesgo es bajo; junto a grandes acumulaciones en descomposición, conviene mantenerse alejado.`,
        },
        {
          q: '¿Por qué el sargazo huele a huevo podrido?',
          a: `Ese olor es sulfuro de hidrógeno (H2S), un gas que se desprende cuando el sargazo se descompone en grandes volúmenes, sobre todo en bahías cerradas o con poca ventilación. En concentraciones altas, junto a montones abundantes en descomposición, puede irritar los ojos, la nariz, la garganta y las vías respiratorias. Una playa recién limpiada, o estar a distancia de los amontonamientos, reduce mucho la exposición.`,
        },
        {
          q: '¿Es seguro nadar donde hay sargazo?',
          a: `El agua con sargazo fresco flotando no es tóxica, pero nadar entre grandes masas resulta incómodo, reduce la visibilidad y puede dificultar el movimiento. Es preferible evitar nadar dentro de acumulaciones espesas de algas y elegir una zona despejada. Si el agua está parda y cargada de restos en descomposición, lo más prudente es no entrar.`,
        },
        {
          q: '¿El sargazo afecta a niños y embarazadas?',
          a: `Los niños pequeños, las embarazadas, las personas mayores y quienes tienen asma o problemas respiratorios suelen ser más sensibles a los gases del sargazo en descomposición. Como precaución, conviene que no jueguen ni permanezcan cerca de los montones en descomposición y elegir playas limpias y bien ventiladas. Ante síntomas o dudas, consulta a un profesional de salud.`,
        },
        {
          q: '¿El sargazo es peligroso para las mascotas?',
          a: `Sí conviene tener cuidado: evita que los perros coman, laman o se revuelquen en el sargazo en descomposición, ya que los gases y la materia en putrefacción pueden sentarles mal. Mantenlos alejados de los grandes amontonamientos y, si tu mascota muestra malestar tras estar en la playa, consulta a un veterinario.`,
        },
        {
          q: '¿El sargazo puede irritar la piel?',
          a: `Puede aparecer una irritación conocida como "pica-pica" o dermatitis por sargazo. A menudo no la causa el alga en sí, sino diminutos organismos urticantes (como larvas de medusa) que viajan atrapados en los bancos de algas; el sargazo en descomposición también puede irritar la piel sensible. Si notas picor o sarpullido, sal del agua, enjuágate con agua dulce y evita rascarte; si la molestia persiste, busca atención médica.`,
        },
        {
          q: '¿Cuándo conviene evitar la playa?',
          a: `Conviene evitar acercarse cuando hay grandes acumulaciones pardas o negras de sargazo en descomposición, un olor fuerte a huevo podrido, o en bahías cerradas con marea baja donde el gas se concentra. Las personas sensibles deberían posponer la visita esos días. La situación cambia en horas con el viento: revisar el estado del día antes de salir es la mejor protección.`,
        },
        {
          q: '¿Qué recomiendan las autoridades de salud?',
          a: `En general, ${authority} y las autoridades sanitarias recomiendan no acercarse a las acumulaciones de sargazo en descomposición, mantener alejadas a las personas sensibles y seguir los avisos locales. Esta página resume información de salud pública ampliamente difundida; ante una alerta concreta, sigue siempre las indicaciones oficiales vigentes.`,
        },
      ],
      disclaimer: 'Esta página ofrece información general de salud pública sobre el sargazo y no sustituye el consejo médico ni los avisos oficiales.',
      methodLabel: 'Cómo medimos el sargazo',
      methodSlug: 'metodologia',
      homeLabel: 'Mapa en vivo',
      cta: 'Consulta el estado de hoy antes de ir →',
      foot: 'Información general de salud pública · sigue siempre los avisos de las autoridades locales',
    }
  }
  return {
    back: 'Back to the map',
    h1a: 'Is sargassum', h1b: 'dangerous?',
    lead: `Clear, conservative answers about sargassum and your health in ${regionName}. General information, not medical advice: when an advisory is in effect, always follow your local authorities.`,
    lbl: 'Health & safety',
    qaTitle: 'What you should know',
    qa: [
      {
        q: 'Is sargassum on the beach dangerous?',
        a: `Sargassum floating fresh in the water is generally not harmful to touch. The problem comes when it piles up in large quantities and decomposes on the shore: as it rots it releases gases, mainly hydrogen sulfide (H2S) — the source of the rotten-egg smell. Next to a clean beach, or at a distance from the piles, the risk is low; close to large decomposing accumulations, it is best to keep away.`,
      },
      {
        q: 'Why does sargassum smell like rotten eggs?',
        a: `That smell is hydrogen sulfide (H2S), a gas given off when sargassum decomposes in large volumes — especially in enclosed or poorly ventilated bays. At high concentrations, right next to big rotting piles, it can irritate the eyes, nose, throat and airways. A freshly cleaned beach, or simply keeping your distance from the accumulations, greatly reduces exposure.`,
      },
      {
        q: 'Is it safe to swim where there is sargassum?',
        a: `Water with fresh floating sargassum is not toxic, but swimming through thick mats is unpleasant, cuts visibility and can make movement harder. It is better to avoid swimming inside dense seaweed accumulations and to pick a clear stretch instead. If the water is brown and full of decomposing debris, the prudent choice is to stay out.`,
      },
      {
        q: 'Is sargassum safe for children and pregnant women?',
        a: `Young children, pregnant women, older adults and people with asthma or respiratory conditions tend to be more sensitive to the gases from decomposing sargassum. As a precaution, they should not play or linger near rotting piles, and should choose clean, well-ventilated beaches. If symptoms or concerns arise, consult a healthcare professional.`,
      },
      {
        q: 'Can sargassum harm pets?',
        a: `It is worth being careful: keep dogs from eating, licking or rolling in decomposing sargassum, as the gases and rotting matter can make them unwell. Keep them away from large piles, and if your pet seems unwell after a beach visit, contact a veterinarian.`,
      },
      {
        q: 'Can sargassum irritate your skin?',
        a: `A skin irritation sometimes called "sargassum dermatitis" or "pica-pica" can occur. It is often caused not by the algae itself but by tiny stinging organisms (such as jellyfish larvae) that travel trapped in the seaweed mats; decomposing sargassum can also irritate sensitive skin. If you feel itching or a rash, leave the water, rinse with fresh water and avoid scratching; if the discomfort persists, seek medical attention.`,
      },
      {
        q: 'When should you avoid the beach?',
        a: `It is best to keep away when there are large brown or black accumulations of decomposing sargassum, a strong rotten-egg smell, or enclosed bays at low tide where the gas concentrates. Sensitive people should postpone their visit on those days. Conditions change within hours as the wind shifts, so checking today's status before you go is the best protection.`,
      },
      {
        q: 'What do health authorities recommend?',
        a: `In general, ${authority} and health authorities recommend not approaching decomposing sargassum accumulations, keeping sensitive people away, and following local advisories. This page summarizes widely published public-health guidance; when a specific advisory is in effect, always follow the official instructions then in force.`,
      },
    ],
    disclaimer: 'This page offers general public-health information about sargassum and does not replace medical advice or official advisories.',
    methodLabel: 'How we measure sargassum',
    methodSlug: 'methodology',
    homeLabel: 'Live map',
    cta: "Check today's status before you go →",
    foot: 'General public-health information · always follow your local authorities’ advisories',
  }
}

function buildMeta(lang, regionName) {
  if (lang === 'es') {
    return {
      title: `¿El sargazo es peligroso? Salud y seguridad en la playa — ${regionName}`,
      desc: `¿El sargazo es dañino? El olor a huevo podrido (H2S), nadar, niños, mascotas e irritación de la piel ("pica-pica") — respuestas claras y prudentes y qué recomiendan las autoridades de salud en ${regionName}.`,
    }
  }
  return {
    title: `Is Sargassum Dangerous? Beach Health & Safety FAQ — ${regionName}`,
    desc: `Is sargassum seaweed harmful? The rotten-egg smell (H2S), swimming, kids, pets and skin irritation ("sargassum dermatitis") — clear, conservative answers and what health authorities advise in ${regionName}.`,
  }
}

function renderPage({ lang, domain, siteName, slug, title, desc, content }) {
  const c = content
  const canonical = `https://${domain}/${slug}/`
  const today = new Date().toISOString().slice(0, 10)
  const ldFaq = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: c.qa.map(({ q, a }) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  })
  const ldCrumb = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName, item: `https://${domain}/` },
      { '@type': 'ListItem', position: 2, name: title, item: canonical },
    ],
  })

  const qaHtml = c.qa.map(({ q, a }) =>
    `<div class="qa"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n')

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${canonical}"/>
<link rel="icon" href="/favicon.svg"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${esc(siteName)}"/>
<script type="application/ld+json">${ldFaq}</script>
<script type="application/ld+json">${ldCrumb}</script>
<style>
  :root{--ink:#0A1714;--card:#10231E;--gold:#FFC72C;--teal:#3BA7A0;--mut:rgba(255,255,255,.62);--line:rgba(255,255,255,.09)}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--ink);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6}
  .page{max-width:560px;margin:0 auto;padding:0 22px calc(40px + env(safe-area-inset-bottom))}
  .tb{display:flex;align-items:center;justify-content:space-between;padding:calc(14px + env(safe-area-inset-top)) 0 14px}
  .tb a{color:#fff;text-decoration:none;font-size:13px;font-weight:600;opacity:.85}
  .wordmark{font-weight:800;font-size:11px;letter-spacing:.16em;opacity:.85}
  h1{font-size:clamp(30px,7vw,42px);line-height:1.02;text-transform:uppercase;letter-spacing:-.01em;margin:34px 0 12px;font-weight:900}
  h1 em{font-style:normal;color:var(--gold)}
  .lead{color:var(--mut);font-size:15px;max-width:460px}
  section{margin-top:46px;padding-top:34px;border-top:1px solid var(--line)}
  .lbl{font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
  h2{font-size:22px;text-transform:uppercase;letter-spacing:-.01em;margin-bottom:8px;font-weight:800}
  p{color:var(--mut);font-size:14px;margin-bottom:10px}
  .qas{display:flex;flex-direction:column;gap:12px;margin-top:18px}
  .qa{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
  .qa h3{font-size:15.5px;font-weight:800;color:#fff;margin-bottom:6px;line-height:1.3}
  .qa p{font-size:13.5px;color:var(--mut);margin-bottom:0}
  .disc{font-size:12.5px;color:var(--mut);margin-top:18px;border-left:3px solid var(--gold);background:var(--card);border-radius:0 12px 12px 0;padding:12px 14px}
  .links{display:flex;flex-direction:column;gap:8px;margin-top:18px}
  .links a{color:var(--teal);text-decoration:none;font-size:13.5px;font-weight:600}
  .cta{display:inline-block;margin-top:18px;background:var(--gold);color:var(--ink);font-weight:800;font-size:14px;padding:13px 22px;border-radius:16px;text-decoration:none}
  .foot{margin-top:54px;padding-top:24px;border-top:1px solid var(--line);text-align:center;font-size:11px;color:rgba(255,255,255,.38)}
</style>
</head>
<body>
<div class="page">
  <div class="tb"><a href="/">←&nbsp;${esc(c.back)}</a><span class="wordmark">${esc(siteName.toUpperCase())}</span></div>

  <h1>${esc(c.h1a)} <em>${esc(c.h1b)}</em></h1>
  <p class="lead">${esc(c.lead)}</p>

  <section>
    <div class="lbl">${esc(c.lbl)}</div>
    <h2>${esc(c.qaTitle)}</h2>
    <div class="qas">
${qaHtml}
    </div>
    <p class="disc">${esc(c.disclaimer)}</p>
    <div class="links">
      <a href="/${c.methodSlug}/">${esc(c.methodLabel)} →</a>
      <a href="/">${esc(c.homeLabel)} →</a>
    </div>
    <a class="cta" href="/?utm_source=${esc(slug)}">${esc(c.cta)}</a>
  </section>

  <div class="foot">${esc(siteName.toUpperCase())} · 🩺 ${esc(c.foot)} · ${esc(today)}</div>
</div>
</body>
</html>
`
}

function writePage(distDir, slug, html) {
  const dir = path.join(distDir, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
}

/** Ajoute la page au sitemap.xml régional (écrit avant par region-seo-pages.cjs). */
function appendToRegionSitemap(distDir, domain, slug) {
  const p = path.join(distDir, 'sitemap.xml')
  let xml
  try { xml = fs.readFileSync(p, 'utf-8') } catch { return false }
  const loc = `https://${domain}/${slug}/`
  if (xml.includes(loc)) return true
  const today = new Date().toISOString().slice(0, 10)
  xml = xml.replace('</urlset>', `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>\n</urlset>`)
  fs.writeFileSync(p, xml, 'utf-8')
  return true
}

/**
 * Entrée unique. region null / mq / gp → no-op (chemin MQ/GP intouché).
 * Sinon build mono-région (florida / puntacana / rivieramaya).
 */
function generateHealthPages(region, distDir) {
  if (!region || region.id === 'mq' || region.id === 'gp') return
  const lang = region.primaryLang === 'es' ? 'es' : 'en'
  const slug = lang === 'es' ? 'sargazo-salud-riesgos' : 'sargassum-health-risks'
  const authMap = AUTHORITY[region.id] || AUTHORITY.florida
  const authority = authMap[lang] || authMap.en
  const siteName = lang === 'es' ? `Sargazo ${region.name}` : `Sargassum ${region.name}`
  const content = buildContent(lang, region.name, authority)
  const meta = buildMeta(lang, region.name)
  writePage(distDir, slug, renderPage({
    lang, domain: region.domain, siteName, slug, title: meta.title, desc: meta.desc, content,
  }))
  const inSitemap = appendToRegionSitemap(distDir, region.domain, slug)
  console.log(`   → /${slug}/ générée (${region.id})${inSitemap ? ' + sitemap' : ' (sitemap absent)'} — ${content.qa.length} Q&A`)
}

module.exports = { generateHealthPages }
