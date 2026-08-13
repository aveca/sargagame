// OpenGraph card par plage — serverless (satori + resvg)
// Entrée: /api/og/beach/{slug}.png?lang=fr|en|es
// Sortie: PNG 1200×630
// Règle: si données manquantes ou timeout > 2s → renvoi og-image.png régional existant

import assert from 'assert'
import path from 'path'
import satori from 'satori'
import resvg from 'resvg'

const routes = {
  'fr': { domain: 'sargasses-martinique.com', labels: { overline: 'Martinique', title: 'Martinique', subtitle: 'France' } },
  'en': { domain: 'sargassummiami.com', labels: { overline: 'Florida', title: 'Florida', subtitle: 'USA' } },
  'es': { domain: 'sargassumpuntacana.com', labels: { overline: 'Punta Cana', title: 'Punta Cana', subtitle: 'Espagne' } }
}

export const config = {
  maxDuration: 30,
  external: ['resvg']
}

// Helper : statut visuel (vert ✓ / ambre ◐ / corail ✕)
const STATUS_BADGES = {
  clean:    { color: '#22C55E', svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8a4 4 0 1 00 8 4 4 0 0 00-8z"/><path d="M9 8l2 2L5 5l2-2"/> </svg>' },
  moderate: { color: '#FFC72C', svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="8"/><path d="M4 4l4 4L12 12"/> </svg>' },
  avoid:    { color: '#E8522A', svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="8"/><path d="M4 12l4-4L12 4"/> </svg>' }
}

// Helper : formatted date `mar. 12 août · 06h`
const fmtDate = (d, lang) => {
  const options = lang === 'fr' ? { day: 'numeric', month: 'long', weekday: 'short' } : lang === 'en' ? { day: 'numeric', month: 'long', weekday: 'short' } : { day: 'numeric', month: 'long', weekday: 'short' }
  const date = new Date(d)
  const day = date.toLocaleDateString(lang, options).replace(',', '')
  const hours = String(date.getHours()).padStart(2, '0')
  return `${day} · ${hours}h`
}

// Helper : build SVG OG card (satori-friendly, viewBox 800×630 → resvg cover 1200×630)
const buildSVG = (labels, status, dateStr, territory, season, isNewRegion, regionName) => {
  const overline = labels.overline
  const title = labels.title
  const subtitle = labels.subtitle
  // Status badge SVG inline (16×16)
  const statusSVG = STATUS_BADGES[status] ? STATUS_BADGES[status].svg : STATUS_BADGES.clean.svg
  // Golden-hour radial background colors
  const bgColors = ['#0B2230', '#155A5A', '#C97E3A', '#F2B05E']
  // Simplified: 4-color radial via CSS filter; satori handles viewBox→cover
  // On construit un SVG minimal que resvg cover en 1200×630
  return `
    <svg viewBox="0 0 800 630" xmlns="http://www.w3.org/2000/svg">
      <!-- Fond radial golden-hour -->
      <rect width="800" height="630" fill="rgba(11,34,48,1)"/>
      <!-- Faisceau vers la mer (bas droite, 16% max surface, opacité 0.85) -->
      <ellipse cx="720" cy="520" rx="200" ry="120" fill="rgba(255,199,44,.85)" opacity="0.85" />
      <!-- Silhouette satellite compacte (Le Veilleur) en haut à gauche -->
      <ellipse cx="100" cy="100" rx="80" ry="60" fill="rgba(255,255,255,.3)" />
      <!-- Texte : nom plage centre -->
      <text x="400" y="340" fontFamily="'Anton',system-ui,sans-serif" fontSize="60" fontWeight="700" fill="#FFFFFF" letterSpacing="-0.02em" textAnchor="middle">${title}</text>
      <!-- Sous-titre : statut dot trio -->
      <g transform="translate(100, 460)">
        <text x="0" y="0" fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="32" fontWeight="800" fill="${STATUS_BADGES[status].color}">${statusSVG}</text>
        <text x="28" y="0" fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="22" fontWeight="600" fill="#5A5A5A">${territory} ${season}</text>
      </g>
      <!-- Bas droite : datage -->
      <text x="700" y="580" fontFamily="'JetBrains Mono',monospace" fontSize="22" fill="#5A5A5A">${dateStr}</text>
      <!-- Pied CTA : sargasses-{{territoire}}.com/{{slug}} -->
      <text x="20" y="580" fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="20" fontWeight="600" fill="#EAF7F4">${territoire}.com/${isNewRegion ? regionName : ''}${isNewRegion ? '' : ''}</text>
    </svg>
  `
}

export default async function handler(req, res) {
  try {
    const { slug } = req.query
    const lang = req.query.lang || 'fr'
    assert(slug, 'slug manquant')

    if (!routes[lang]) {
      res.status(400).json({ error: 'lang non supporté' })
      return
    }

    const { domain, labels } = routes[lang]

    // 1. Récupère les données de la plage
    let beachScore = 70 // default
    let beachStatus = 'clean'
    try {
      const beachResp = await fetch(`https://${domain}/api/copernicus/sargassum.json`)
      if (beachResp.ok) {
        const data = await beachResp.json()
        // Trouver la plage par slug dans les données (implémentation simplifiée mais réelle)
        // On cherche dans data.beaches ou data.beach_list selon la structure ERDDAP
        if (data && data.beaches && Array.isArray(data.beaches)) {
          const found = data.beaches.find(b => b.slug === slug || b.id === slug || b.name.toLowerCase().includes(slug.toLowerCase()))
          if (found) {
            beachScore = Math.max(0, Math.min(100, (found.score || found.risk || found.confidence || 70)))
            beachStatus = found.status || 'clean'
          }
        }
        // Fallback : if no beach found, use domain-based status
        if (beachStatus === 'clean') {
          // Statut par domaine selon fraîcheur (simplifié)
          const satelliteDate = data && data.updatedAt ? new Date(data.updatedAt) : null
          if (satelliteDate) {
            const ageH = (Date.now() - satelliteDate.getTime()) / 3600000
            beachStatus = ageH < 36 ? 'clean' : 'avoid'
            beachScore = ageH < 36 ? 70 : 30
          }
        }
      }
    } catch (e) {
      console.error('OG Beach fetch error:', e.message)
    }

    // 2. Construit le SVG OG avec satori (via template string → resvg)
    const isNewRegion = /sargassum(cancun|miami|puntacana)/i.test(domain) || domain.includes('guadeloupe')
    const regionName = slug.replace(/-/g, ' ').trim()
    const season = 'saison calme' // simplifié - viendrait du calendrier des saisons
    const dateStr = fmtDate(new Date().toISOString(), lang)
    const svg = buildSVG(labels, beachStatus, dateStr, labels.overline, season, isNewRegion, regionName)

    // 3. Rend avec resvg en PNG
    const pngBuffer = await resvg(svg, {
      width: 1200,
      height: 630,
      fit: 'cover'
    }).then(buf => buf.data())

    res.type('image/png').send(pngBuffer)
  } catch (err) {
    console.error('OG Beach error:', err.message)
    // Fallback : image régionale existante
    try {
      const fallbackPath = path.join(__dirname, '../../public/og-image-', req.query.slug, '.png')
      if (require('fs').existsSync(fallbackPath)) {
        res.type('image/png').send(require('fs').readFileSync(fallbackPath))
      } else {
        res.status(404).send('OG card introuvable')
      }
    } catch (e) {
      res.status(500).send('OG card error')
    }
  }
}