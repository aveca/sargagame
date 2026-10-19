'use strict'

function enforceRegionHomeSeo(html, region, regionLangs) {
  if (!html || typeof html !== 'string') throw new TypeError('index.html doit être une chaîne UTF-8')
  if (!region || !/^[a-z0-9.-]+$/i.test(region.domain || '')) throw new Error('Domaine régional invalide')
  if (!regionLangs || typeof regionLangs.emittedLangs !== 'function' || typeof regionLangs.langPrefix !== 'function') {
    throw new TypeError('Politique region-langs.cjs requise')
  }
  if (html.includes('\uFFFD')) throw new Error('index.html contient U+FFFD (texte UTF-8 déjà corrompu) pour ' + region.domain)
  if (!/<\/head\s*>/i.test(html)) throw new Error('index.html sans fermeture </head> pour ' + region.domain)

  const domain = region.domain.toLowerCase()
  const canonical = 'https://' + domain + '/'
  const languages = regionLangs.emittedLangs(region)
  if (!languages.length) throw new Error('Aucune langue SEO émise pour ' + (region.id || domain))

  const alternates = languages.map(lang =>
    '<link rel="alternate" hreflang="' + lang + '" href="https://' + domain + regionLangs.langPrefix(region, lang) + '/" />'
  )
  alternates.push('<link rel="alternate" hreflang="x-default" href="' + canonical + '" />')

  // Replace only homepage SEO signals. Ordinary cross-site navigation and links
  // to the other five regional sites must remain untouched.
  let out = html
    .replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>\s*/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhreflang=["'])[^>]*>\s*/gi, '')
    .replace(/<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*>\s*/gi, '')

  const block = [
    '<link rel="canonical" href="' + canonical + '" />',
    '<meta property="og:url" content="' + canonical + '" />',
  ].concat(alternates).join('\n    ')
  out = out.replace(/<\/head\s*>/i, '    ' + block + '\n  </head>')

  const canonicals = [...out.matchAll(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
  if (canonicals.length !== 1 || canonicals[0][1] !== canonical) {
    throw new Error('Canonical homepage non conforme pour ' + domain)
  }
  const hreflangTags = [...out.matchAll(/<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhreflang=["']([^"']+)["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  const expected = new Map(alternates.map(tag => {
    const m = tag.match(/hreflang="([^"]+)" href="([^"]+)"/)
    return [m[1], m[2]]
  }))
  if (hreflangTags.length !== expected.size || hreflangTags.some(m => expected.get(m[1]) !== m[2])) {
    throw new Error('Cluster hreflang homepage non conforme pour ' + domain)
  }
  return out
}

module.exports = { enforceRegionHomeSeo }
