/**
 * sitemap-prune.cjs — Retire du sitemap les URLs des domaines non indexables.
 * BUG-2026-032 (partie 2) : le dist/ partagé sert 6 projets Pages, et le sitemap
 * racine listait 19 URLs sargassumbarbados.com alors que ce domaine n'a pas de
 * DNS (ENOTFOUND) → erreurs de crawl + SEO Guard rouge (lychee).
 * Règle data-driven : regions/<id>.json avec "seoIndex": false (défaut : indexé).
 * Idempotent (re-run = 0 suppression) et additif (ne touche que les URLs mortes).
 */
const fs = require('fs');
const path = require('path');

function deadDomains(regionsDir) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(regionsDir); } catch (_) { return out; }
  for (const f of files) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(regionsDir, f), 'utf-8'));
      if (cfg && cfg.seoIndex === false && cfg.domain) out.push(String(cfg.domain).toLowerCase());
    } catch (_) {}
  }
  return out;
}

// Retire de dist/sitemap*.xml toute entrée <url> dont le <loc> pointe vers un
// domaine mort. Retourne {files, removed, kept}.
function pruneDeadDomains(distDir, regionsDir) {
  const dead = deadDomains(regionsDir || path.join(__dirname, '..', '..', 'regions'));
  const res = { files: 0, removed: 0, kept: 0, domains: dead };
  if (!dead.length) return res;
  let files = [];
  try { files = fs.readdirSync(distDir).filter((f) => f === 'sitemap.xml' || (f.startsWith('sitemap-') && f.endsWith('.xml'))); }
  catch (_) { return res; }
  for (const f of files) {
    const p = path.join(distDir, f);
    let xml;
    try { xml = fs.readFileSync(p, 'utf-8'); } catch (_) { continue; }
    if (xml.indexOf('<url>') < 0 && xml.indexOf('<url ') < 0) continue;
    res.files++;
    const before = (xml.match(/<loc>/g) || []).length;
    // Découpe par entrée <url>…</url> et filtre celles dont le host est mort.
    const parts = xml.split(/(<url[\s>])/);
    let keptHead = parts[0], kept = 0, removed = 0;
    for (let i = 1; i < parts.length; i += 2) {
      const open = parts[i] || '';
      const rest = parts[i + 1] || '';
      const endIdx = rest.indexOf('</url>');
      const entry = endIdx >= 0 ? open + rest.slice(0, endIdx + 6) : open + rest;
      const tail = endIdx >= 0 ? rest.slice(endIdx + 6) : '';
      const loc = (entry.match(/<loc>([^<]*)<\/loc>/) || [])[1] || '';
      let host = '';
      try { host = new URL(loc.trim()).hostname.toLowerCase(); } catch (_) {}
      if (host && dead.includes(host)) { removed++; keptHead += tail; }
      else { kept++; keptHead += entry + tail; }
    }
    res.removed += removed;
    res.kept += kept;
    if (removed > 0) {
      try { fs.writeFileSync(p, keptHead, 'utf-8'); } catch (_) {}
    }
    void before;
  }
  return res;
}

module.exports = { pruneDeadDomains, deadDomains };
