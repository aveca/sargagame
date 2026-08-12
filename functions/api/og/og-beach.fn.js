// OpenGraph card par plage — serverless (satori + resvg)
// Entrée: /api/og/beach/{slug}.png?lang=fr|en|es
// Sortie: PNG 1200×630
// Règle: si données manquantes ou timeout > 2s → renvoi og-image.png régional existant

import assert from 'assert'
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

    // 1. Récupère les données de la plage dans sargassum.json + beaches-list
    const beachData = await fetch(`https://${domain}/api/copernicus/sargassum.json`)
      .then(r => r.json())
      .then(data => {
        // Find beach by slug in the data
        // ... (implémentation simplifiée)
        return { status: 'clean', score: 70 } // fallback
      })

    // 2. Construit le SVG OG avec satori
    const svg = /* SVG template avec labels.overline, labels.title, labels.subtitle,
                   + domaine + score + date + vignette plage */ 
    
    // 3. Rend avec resvg en PNG
    const pngBuffer = await resvg(svg, {
      width: 1200,
      height: 630,
      fit: 'cover'
    ).then(buf => buf.data())

    res.type('image/png').send(pngBuffer)
  } catch (err) {
    console.error('OG Beach error:', err.message)
    // Fallback : image régionale existante
    const fallbackPath = path.join(__dirname, '../../public/og-image-', req.query.slug, '.png')
    if (fs.existsSync(fallbackPath)) {
      res.type('image/png').send(fs.readFileSync(fallbackPath))
    } else {
      res.status(404).send('OG card introuvable')
    }
  }
}