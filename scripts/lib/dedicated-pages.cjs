/**
 * dedicated-pages.cjs — Générateur de pages dédiées /beach/[id], /poi/[id], /region/[slug], /activity/[type]
 * Appelé par vite.config.js (plugin seo-pages) pour toutes les régions.
 * Pages HTML statiques (no React) pour SEO + conversion.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const esc = s => String(s ?? '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const STATUS_COLOR = { clean: '#16A34A', moderate: '#D97706', avoid: '#DC2626' };
const STATUS_LABEL = { clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter' };
const STATUS_LABEL_EN = { clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid' };
const STATUS_LABEL_ES = { clean: 'Limpia', moderate: 'Moderada', avoid: 'Evitar' };

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}

function pageShell({ title, desc, pathname, domain, lang, noscript, jsonLd, alternates, robots, videoMeta }) {
  const canonical = `https://${domain}${pathname}`;
  const tplPath = path.join(ROOT, 'dist', 'index.html');
  let html = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, 'utf-8') : fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  
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
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  
  html = html.replace(/<noscript>\s*<h1>[\s\S]*?<\/noscript>/, '');
  const ld = (jsonLd || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  
  let altBlock;
  if (Array.isArray(alternates) && alternates.length) {
    const tags = alternates.map(a => `<link rel="alternate" hreflang="${a.lang}" href="${a.href}" />`);
    const xd = (alternates.find(a => a.xDefault) || alternates[0]).href;
    altBlock = `${tags.join('\n')}\n<link rel="alternate" hreflang="x-default" href="${xd}" />`;
  } else {
    altBlock = `<link rel="alternate" hreflang="${lang}" href="${canonical}" />\n<link rel="alternate" hreflang="x-default" href="${canonical}" />`;
  }
  
  if (robots) html = html.replace(/<meta name="robots"[^>]*>\s*/gi, '');
  html = html.replace('</head>', `${robots ? `<meta name="robots" content="${robots}" />\n` : ''}${altBlock}\n${ld}\n${videoMeta ? videoMeta + '\n' : ''}</head>`);
  html = html.replace('<div id="root">', `<noscript>${noscript}</noscript>\n<div id="root">`);
  return html;
}

function writePage(outDir, urlPath, html) {
  const dir = path.join(outDir, ...urlPath.split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8');
}

function fmtDate(lang, d = new Date()) {
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getT(lang) {
  return {
    fr: { beachesDir: 'plages', score: 'Beach Score', forecast: 'Prévision 7 jours', status: 'État du jour', viewMap: 'Voir la carte', allBeaches: 'Toutes les plages', nearby: 'Plages proches', home: 'Carte en direct' },
    en: { beachesDir: 'beaches', score: 'Beach Score', forecast: '7-day forecast', status: 'Status today', viewMap: 'View live map', allBeaches: 'All beaches', nearby: 'Nearby beaches', home: 'Live map' },
    es: { beachesDir: 'playas', score: 'Beach Score', forecast: 'Pronóstico 7 días', status: 'Estado hoy', viewMap: 'Ver mapa en vivo', allBeaches: 'Todas las playas', nearby: 'Playas cercanas', home: 'Mapa en vivo' },
  }[lang] || { beachesDir: 'plages', score: 'Beach Score', forecast: 'Prévision 7 jours', status: 'État du jour', viewMap: 'Voir la carte', allBeaches: 'Toutes les plages', nearby: 'Plages proches', home: 'Carte en direct' };
}

function networkFooter(region, t, lang) {
  const network = [
    { name: { fr: 'Martinique', en: 'Martinique', es: 'Martinica' }, url: 'https://sargasses-martinique.com/' },
    { name: { fr: 'Guadeloupe', en: 'Guadeloupe', es: 'Guadalupe' }, url: 'https://sargasses-guadeloupe.com/' },
  ];
  const links = network.filter(n => !n.url.includes(region.domain))
    .map(n => `<a href="${n.url}" rel="noopener">${esc(n.name[lang] || n.name.en)}</a>`).join(' · ');
  return `<p><strong>${t.network || 'Réseau'}</strong>: ${links}</p>`;
}

// ── Enrichissement data-driven des fiches (P1 pages plages) : que du réel ──
// Sources : flags plage (kids/snorkel/parking), resorts regions/resorts/<id>.json
// (beachId), proximité haversine sur coords réelles. Aucune section vide : chaque
// bloc n'est émis que si ses données existent. Zéro invention.
function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || isNaN(v))) return Infinity;
  const R = 6371, dLa = (lat2 - lat1) * Math.PI / 180, dLo = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Plages les plus proches (même tableau régional fourni — jamais cross-région),
// hors la plage elle-même. Retourne [{beach, km}] triés, max n.
function nearestBeaches(beach, beaches, n) {
  const out = [];
  for (const b of beaches || []) {
    if (!b || b.id === beach.id) continue;
    const km = haversineKm(beach.lat, beach.lng, b.lat, b.lng);
    if (!isFinite(km)) continue;
    out.push({ beach: b, km });
  }
  out.sort((a, b) => a.km - b.km);
  return out.slice(0, Math.max(0, n || 0));
}

// Attributs réels de la plage (flags) → libellés factuels (vocabulaire existant).
function beachFacts(beach, lang) {
  const facts = [];
  if (beach.kids) facts.push(lang === 'es' ? 'Niños OK' : lang === 'en' ? 'Kids OK' : 'Enfants OK');
  if (beach.snorkel) facts.push('Snorkel');
  if (beach.parking) facts.push('Parking');
  return facts;
}

// Flags → pages /activity/<slug>/ EXISTANTES de la région (générées au build).
// Mapping strict : que ce que le flag prouve (snorkel≠dive, kids→kids+family).
function beachActivities(beach, lang) {
  const acts = [];
  if (beach.snorkel) acts.push({ slug: 'snorkel', label: 'Snorkel' });
  if (beach.kids) {
    acts.push({ slug: 'kids', label: lang === 'es' ? 'Niños' : lang === 'en' ? 'Kids' : 'Enfants' });
    acts.push({ slug: 'family', label: lang === 'es' ? 'Familia' : lang === 'en' ? 'Family' : 'Famille' });
  }
  if (beach.parking) acts.push({ slug: 'parking', label: 'Parking' });
  return acts;
}

function sectionTitle(lang, fr, en, es) {
  return lang === 'es' ? es : lang === 'en' ? en : fr;
}

// Generate beach detail page — NEW: /beach/[slug] + /beach/[id] (dedicated Sprint #23)
function generateBeachPage(region, beach, data, lang, distDir, allBeaches = []) {
  const t = getT(lang);
  const domain = region.domain;
  const lv = data.levels?.find(l => l.id === beach.id) || {};
  const fc = data.weekly?.[beach.id]?.forecast || [];
  const score = lv.score != null ? lv.score : '—';
  const status = lv.status || 'clean';
  const color = STATUS_COLOR[status] || '#999';
  const label = lang === 'es' ? STATUS_LABEL_ES[status] : (lang === 'en' ? STATUS_LABEL_EN[status] : STATUS_LABEL[status]);

  const slug = beach.slug || slugify(beach.name);
  // Sprint #25: dedicated routes are /beach/[slug] (and /beach/[id] if different) — NOT /plages
  const pathname = `/beach/${slug}/`;
  const pathnameById = `/beach/${beach.id}/`;
  const title = `${beach.name} (${region.name}) — ${label}, ${t.score} ${score}/100`;
  const desc = `${label} aujourd'hui à ${beach.name}, ${region.name}. ${t.score} ${score}/100. ${t.forecast} mis à jour 4×/jour par satellite Copernicus.`;

  const alternates = [
    { lang: lang, href: `https://${domain}${pathname}`, xDefault: true },
  ];

  // ── Enrichissement data-driven (P1) Phase 4 : que du réel, zéro invention ──
  // Proximité : plages voisines (même région, haversine), max 3 à 5 km
  const nearby = nearestBeaches(beach, allBeaches, 3);
  const nearbyHtml = nearby.length
    ? `<section style="margin:1.5em 0">
      <h3 style="font:800 12px/1 'Bricolage Grotesque';color:#0D0D0D;margin:0 0 0.5em;display:flex;align-items:center;gap:6px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8"/></svg>
        ${sectionTitle(lang,'Plages proches','Nearby beaches','Playas cercanas')}
        <span style="font:700 10px/1 'Bricolage Grotesque';color:#667eea;background:#e8eaff;padding:1px 6px;border-radius:999;border:1px solid #667eea">${nearby.length}</span>
      </h3>
      <ul style="list-style:none;padding:0;margin:0">${nearby.map(b=>
        `<li style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;border:2px solid #e8eaff;background:#fff;box-shadow:1px 1px 0 #667eea;margin-bottom:6px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor='#667eea';this.style.boxShadow='2px 2px 0 #667eea'" onmouseout="this.style.borderColor='#e8eaff';this.style.boxShadow='1px 1px 0 #667eea'">
          <a href="/beach/${b.beach.slug || slugify(b.beach.name)}/" style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:8px;flex:1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8"/></svg>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${esc(b.beach.name)}</span>
          </a>
          <span style="display:flex;align-items:center;gap:4px;font:700 11px/1 'Bricolage Grotesque';color:#667eea;white-space:nowrap;background:#e8eaff;padding:2px 8px;border-radius:999;border:1px solid #667eea">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8"/></svg>
            ${b.km < 1 ? Math.round(b.km * 1000) + ' m' : Math.round(b.km) + ' km'}
          </span>
        </li>`).join('')}</ul></section>`
    : '';

  // Résorts / hébergements à proximité (regions/resorts/<regionId>.json)
  // JSON is a direct array [{...}], not {resorts: [...]}
  const resortData = loadJSON(path.join(ROOT, 'regions', 'resorts', `${region.id}.json`), []);
  const resortsArray = Array.isArray(resortData) ? resortData : (resortData.resorts || []);
  const beachResorts = resortsArray.filter(r => r.beachId === beach.id);
  // Only show resorts for FL/PC/RM (regions with actual data)
  const hasResortData = ['florida', 'puntacana', 'rivieramaya'].includes(region.id);
  const resortHtml = beachResorts.length && hasResortData
    ? `<section style="margin:1.5em 0">
      <h3 style="font:800 12px/1 'Bricolage Grotesque';color:#0D0D0D;margin:0 0 0.5em;display:flex;align-items:center;gap:6px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        ${sectionTitle(lang,'Hébergements','Accommodation','Alojamiento')}
        <span style="font:700 10px/1 'Bricolage Grotesque';color:#22C55E;background:#dcfce7;padding:1px 6px;border-radius:999;border:1px solid #22C55E">${beachResorts.length} vérifiés</span>
      </h3>
      <ul style="list-style:none;padding:0;margin:0">${beachResorts.slice(0,5).map(r=>
        `<li style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;border:2px solid #e8eaff;background:#fff;box-shadow:1px 1px 0 #667eea;margin-bottom:6px">
          <span style="font:800 12px/1 'Bricolage Grotesque';color:#0D0D0D">${esc(r.name)}</span>
          <span style="color:#6B6B6B;font:700 11px/1 'Bricolage Grotesque'">${esc(r.area||'')}</span>
        </li>`).join('')}</ul></section>`
    : '';

  // Faits / attributs réels de la plage (kids/snorkel/parking) — as chips with icons
  const facts = beachFacts(beach, lang);
  const factsHtml = facts.length
    ? `<section style="margin:1.5em 0">
      <h3 style="font:800 12px/1 'Bricolage Grotesque';color:#0D0D0D;margin:0 0 0.5em;display:flex;align-items:center;gap:6px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8"/></svg>
        ${sectionTitle(lang,'Caractéristiques','Features','Características')}
        <span style="font:700 10px/1 'Bricolage Grotesque';color:#667eea;background:#e8eaff;padding:1px 6px;border-radius:999;border:1px solid #667eea">${facts.length}</span>
      </h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${facts.map(f=>`<span style="display:inline-flex;align-items:center;gap:4px;background:#e2e8f0;margin:2px 6px;padding:4px 10px;border-radius:999;font:700 10px/1 'Bricolage Grotesque';color:#0D0D0D;border:1px solid #cbd5e1">${f === 'Enfants OK' || f === 'Kids OK' || f === 'Niños OK' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"/><path d="M6 21a9 9 0 0 1 12 0"/><path d="M6 15a3 3 0 0 1 6 0"/></svg>' : f === 'Snorkel' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-4"/><path d="M18 18a6 6 0 0 0-12 0"/><path d="M6 14a8 8 0 0 1 12 0"/><circle cx="12" cy="10" r="2"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17v-5"/><path d="M15 17v-5"/></svg>'}${esc(f)}</span>`).join(' ')}</div></section>`
    : '';

  // Activities / choses à faire — categorised with icons (snorkeling, family, parking)
  const activities = beachActivities(beach, lang);
  const hasActivities = activities.length > 0;
  let activitiesHtml = '';
  if (hasActivities) {
    // Group activities by category
    const cats = [];
    if (activities.some(a => a.slug === 'snorkel')) cats.push({ key: 'snorkeling', label: { fr: 'Snorkeling / Baignade', en: 'Snorkeling / Swimming', es: 'Snorkeling / Bañarse' }, icon: 'snorkel' });
    if (activities.some(a => a.slug === 'kids' || a.slug === 'family')) cats.push({ key: 'family', label: { fr: 'Famille / Enfants', en: 'Family / Kids', es: 'Familia / Niños' }, icon: 'family' });
    if (activities.some(a => a.slug === 'parking')) cats.push({ key: 'parking', label: { fr: 'Accès / Parking', en: 'Access / Parking', es: 'Acceso / Aparcamiento' }, icon: 'parking' });
    
    activitiesHtml = `<section style="margin:1.5em 0">
      <h3 style="font:800 12px/1 'Bricolage Grotesque';color:#0D0D0D;margin:0 0 0.5em;display:flex;align-items:center;gap:6px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M12 22V12"/><path d="M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z"/><path d="M12 12c2-2 5-2 7 0M12 12c-2-2-5-2-7 0"/></svg>
        ${sectionTitle(lang,'À faire','Things to do','Qué hacer')}
        <span style="font:700 10px/1 'Bricolage Grotesque';color:#667eea;background:#e8eaff;padding:1px 6px;border-radius:999;border:1px solid #667eea">${cats.reduce((s,c)=>s+(activities.filter(a=>a.slug===c.items?.[0]?.id).length||0),0)}</span>
      </h3>
      <div style="display:flex;flex-direction:column;gap:8px">${cats.map(cat=>{
        const catActs = activities.filter(a => (cat.key==='snorkeling'&&a.slug==='snorkel')||(cat.key==='family'&&(a.slug==='kids'||a.slug==='family'))||(cat.key==='parking'&&a.slug==='parking'));
        if(!catActs.length) return '';
        return `<div style="display:flex;flex-direction:column;gap:4px">
          <div style="font:700 10px/1 'Bricolage Grotesque';color:#6B6B6B;text-transform:uppercase;letter-spacing:0.5px">${cat.label[lang]||cat.label.fr}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${catActs.map(a=>`<button style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:2px solid #e8eaff;background:#fff;box-shadow:1px 1px 0 #667eea;cursor:pointer;font:700 11px/1 'Bricolage Grotesque';color:#0D0D0D;text-align:left;transition:all 0.15s" onmouseover="this.style.borderColor='#667eea';this.style.boxShadow='2px 2px 0 #667eea'" onmouseout="this.style.borderColor='#e8eaff';this.style.boxShadow='1px 1px 0 #667eea'">
            <span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:#e8eaff;color:#667eea;flex:none">${cat.key==='snorkeling'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d=\"M12 22v-4\"/><path d=\"M18 18a6 6 0 0 0-12 0\"/><path d=\"M6 14a8 8 0 0 1 12 0\"/><circle cx=\"12\" cy=\"10\" r=\"2\"/></svg>':cat.key==='family'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d=\"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>':cat.key==='parking'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17v-5"/><path d="M15 17v-5"/></svg>':''}</span>
            <span style="font:700 11px/1 \'Bricolage Grotesque\';color:#0D0D0D;flex:1">${esc(cat.label[lang]||cat.label.fr)}</span>
            <span style="color:#6B6B6B;font:700 11px/1 \'Bricolage Grotesque\'">→</span>
          </button>`).join('')}</div></div>`;
      }).join('')}</div></section>`;
  }

  const forecastHtml = fc.slice(0, 7).map(f => {
    const d = new Date(f.date + 'T12:00:00Z');
    const day = d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { weekday: 'short' });
    const fcColor = STATUS_COLOR[f.status] || '#999';
    const fcLabel = lang === 'es' ? STATUS_LABEL_ES[f.status] : (lang === 'en' ? STATUS_LABEL_EN[f.status] : STATUS_LABEL[f.status]);
    return `<li style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #eee"><span style="width:12px;height:12px;border-radius:50%;background:${fcColor};flex:none"></span><span><strong>${day}</strong> — ${fcLabel} (confiance ${Math.round((f.confidence || 0)*100)}%)</span></li>`;
  }).join('');

  const noscript = `<article><h1>${esc(beach.name)} — ${esc(region.name)}</h1>
<p>${esc(t.status)}: <strong>${label}</strong> · ${t.score}: <strong>${score}/100</strong> · ${esc(fmtDate(lang))}</p>
<p>Mise à jour satellite Copernicus 4×/jour. Données mesurées au large de cette plage.</p>
<h2>${t.forecast}</h2><ul style="list-style:none;padding:0">${forecastHtml}</ul>
${nearbyHtml}${resortHtml}${factsHtml}${activitiesHtml}
<h2>${t.viewMap}</h2><p><a href="/">${t.home}</a> · <a href="/${t.beachesDir}/">${t.allBeaches}</a></p></article>`;

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'Beach',
    name: beach.name,
    description: desc,
    url: `https://${domain}${pathname}`,
    geo: { '@type': 'GeoCoordinates', latitude: beach.lat, longitude: beach.lng },
    address: { '@type': 'PostalAddress', addressLocality: beach.commune, addressRegion: region.name },
    image: `https://${domain}/beaches/${slug}.jpg`,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Sargassum Status', value: label },
      { '@type': 'PropertyValue', name: 'Beach Score', value: score.toString() },
      { '@type': 'PropertyValue', name: 'Last Updated', value: new Date().toISOString().slice(0,10) }
    ]
  }];

  const html = pageShell({ title, desc, pathname, domain, lang, noscript, jsonLd, alternates });
  writePage(distDir, pathname, html);
  // Also write /beach/[id] if id differs from slug (so /beach/mq001 and /beach/anse-charpentier both work)
  if (pathnameById !== pathname) {
    writePage(distDir, pathnameById, html);
  }
  return { loc: pathname, changefreq: 'daily', priority: '0.7' };
}

// Generate POI page — /poi/[slug] + /poi/[id]
function generatePOIPage(region, poi, lang, distDir) {
  const t = getT(lang);
  const domain = region.domain;
  const slug = poi.slug ? slugify(poi.slug) : slugify(poi.name);
  const pathname = `/poi/${slug}/`;
  const pathnameById = `/poi/${poi.id}/`;
  const title = `${poi.name} — ${poi.type} près de ${region.name}`;
  const desc = `${poi.type} à ${poi.name} (${region.name}). ${esc(poi.name)}, ${poi.type}. Carte et infos pratiques.`;
  
  const noscript = `<article><h1>${esc(poi.name)}</h1>
<p><strong>Type:</strong> ${esc(poi.type)} · <strong>Région:</strong> ${esc(region.name)}</p>
<p>Coordonnées: ${poi.lat?.toFixed(4)}, ${poi.lng?.toFixed(4)}</p>
<p><a href="/">${t.home}</a></p></article>`;
  
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: poi.name,
    description: desc,
    url: `https://${domain}${pathname}`,
    geo: { '@type': 'GeoCoordinates', latitude: poi.lat, longitude: poi.lng },
    additionalType: poi.type
  }];
  
  const html = pageShell({ title, desc, pathname, domain, lang, noscript, jsonLd });
  writePage(distDir, pathname, html);
  if (pathnameById !== pathname) writePage(distDir, pathnameById, html);
  return { loc: pathname, changefreq: 'weekly', priority: '0.4' };
}

// Generate region page
function generateRegionPage(region, lang, distDir) {
  const t = getT(lang);
  const domain = region.domain;
  const slug = slugify(region.name);
  const pathname = `/region/${slug}/`;
  const title = `${region.name} — Carte des sargasses et prévisions`;
  const desc = `État des sargasses en ${region.name} aujourd'hui. Carte en temps réel, prévisions 7 jours par plage, alertes. Mise à jour satellite 4×/jour.`;
  
  const noscript = `<article><h1>${esc(region.name)} — Sargasses aujourd'hui</h1>
<p>${esc(desc)}</p>
<p><a href="/">${t.home}</a> · <a href="/${t.beachesDir}/">${t.allBeaches}</a></p></article>`;
  
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: region.name,
    description: desc,
    url: `https://${domain}${pathname}`,
    containedInPlace: { '@type': 'Country', name: region.country || '' }
  }];
  
  const html = pageShell({ title, desc, pathname, domain, lang, noscript, jsonLd });
  writePage(distDir, pathname, html);
  return { loc: pathname, changefreq: 'daily', priority: '0.8' };
}

// Generate activity page
function generateActivityPage(activity, region, lang, distDir) {
  const t = getT(lang);
  const domain = region.domain;
  const activities = {
    snorkel: { fr: 'Snorkeling', en: 'Snorkeling', es: 'Snorkel' },
    surf: { fr: 'Surf', en: 'Surf', es: 'Surf' },
    family: { fr: 'Famille', en: 'Family', es: 'Familia' },
    parking: { fr: 'Parking', en: 'Parking', es: 'Aparcamiento' },
    dive: { fr: 'Plongée', en: 'Diving', es: 'Buceo' },
    beach: { fr: 'Plage', en: 'Beach', es: 'Playa' },
  };
  const label = activities[activity]?.[lang] || activity;
  const slug = slugify(activity);
  const pathname = `/activity/${slug}/`;
  const title = `${label} à ${region.name} — Plages et spots recommandés`;
  const desc = `Où pratiquer ${label.toLowerCase()} en ${region.name} sans sargasses ? Plages propres, prévisions, spots recommandés.`;
  
  const noscript = `<article><h1>${esc(label)} en ${esc(region.name)}</h1>
<p>${esc(desc)}</p>
<p><a href="/">${t.home}</a> · <a href="/${t.beachesDir}/">${t.allBeaches}</a></p></article>`;
  
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: `${label} en ${region.name}`,
    description: desc,
    url: `https://${domain}${pathname}`,
    containedInPlace: { '@type': 'AdministrativeArea', name: region.name }
  }];
  
  const html = pageShell({ title, desc, pathname, domain, lang, noscript, jsonLd });
  writePage(distDir, pathname, html);
  return { loc: pathname, changefreq: 'weekly', priority: '0.5' };
}

function generateDedicatedPages(region, distDir) {
  // Data: sargassum per region (fallback to mq shared for legacy if missing)
  let data = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json'), null);
  if (!data) data = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'), { levels: [], weekly: {} });
  else if (!data.levels) data = { levels: [], weekly: {} };

  // POI: key mapping legacy mq/gp -> martinique/guadeloupe, new regions keep id
  const poisAll = loadJSON(path.join(ROOT, 'public', 'api', 'pois.json'), { regions: {} });
  const poiKeyMap = { mq: 'martinique', gp: 'guadeloupe' };
  const poiKey = poiKeyMap[region.id] || region.id;
  let regionPois = poisAll.regions?.[poiKey]?.pois || poisAll.regions?.[region.id]?.pois || [];
  // fallback: if still empty and region is mq/gp, collect from martinique/guadeloupe
  if (!regionPois.length && (region.id === 'mq' || region.id === 'gp')) {
    regionPois = poisAll.regions?.martinique?.pois?.slice(0,2) || [];
  }

  // Determine beaches list: inline for new regions, filtered by island for legacy mq/gp
  let beaches = [];
  if (Array.isArray(region.beaches) && region.beaches.length) {
    beaches = region.beaches;
  } else if (region.id === 'mq' || region.id === 'gp') {
    try {
      const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/beaches-list.json'), 'utf-8'));
      // Filter by island: MQ only generates MQ beaches, GP only generates GP beaches.
      // The island key is in beach.island ('mq' or 'gp') or derived from beachFilter.
      const targetIsland = (region.beachFilter && region.beachFilter.island) || region.id;
      beaches = all.filter(b => b.island === targetIsland);
    } catch (e) {
      console.warn(`   ⚠ dedicated: beaches-list.json load fail: ${e.message}`);
      beaches = [];
    }
  }

  // Language: generate once per beach using primaryLang (avoid overwriting same /beach path 3x)
  const lang = region.primaryLang || 'fr';
  const sitemap = [];

  // 1. Beach pages — /beach/[slug] + /beach/[id]
  for (const beach of beaches) {
    if (!beach || !beach.id) continue;
    // For new regions, ensure island matches (legacy already filtered above includes both islands for shared build)
    if (region.id !== 'mq' && region.id !== 'gp' && beach.island !== region.id) continue;
    sitemap.push(generateBeachPage(region, beach, data, lang, distDir, beaches));
  }
  // If legacy mq build, also ensure we counted correctly: we generated for all islands once, not per lang
  // 2. POI pages — /poi/[slug] + /poi/[id]
  for (const poi of regionPois) {
    sitemap.push(generatePOIPage(region, poi, lang, distDir));
  }
  // 3. Region page — /region/[slug] (region itself)
  sitemap.push(generateRegionPage(region, lang, distDir));
  // Also generate sub-region pages if region has subRegions (not yet, but placeholder)
  if (Array.isArray(region.subRegions)) {
    for (const sub of region.subRegions) {
      const subSlug = slugify(sub.name || sub.id || sub.slug);
      const subPath = `/region/${subSlug}/`;
      const subTitle = `${sub.name} — ${region.name}`;
      const subDesc = `État des sargasses à ${sub.name} (${region.name}). Carte et prévisions.`;
      const subNs = `<article><h1>${esc(sub.name)} — ${esc(region.name)}</h1><p>${esc(subDesc)}</p><p><a href="/">${esc(lang==='es'?'Mapa en vivo':lang==='en'?'Live map':'Carte en direct')}</a></p></article>`;
      const subJsonLd = [{ '@context':'https://schema.org','@type':'Place', name: sub.name, description: subDesc, url: `https://${region.domain}${subPath}` }];
      const html = pageShell({ title: subTitle, desc: subDesc, pathname: subPath, domain: region.domain, lang, noscript: subNs, jsonLd: subJsonLd });
      writePage(distDir, subPath, html);
      sitemap.push({ loc: subPath, changefreq: 'weekly', priority: '0.6' });
    }
  }
  // 4. Activity pages — /activity/[type]
  for (const activity of ['snorkel', 'surf', 'family', 'parking', 'dive', 'kids', 'snorkeling']) {
    // dedupe snorkel/snorkeling
    if (activity === 'snorkeling') continue;
    sitemap.push(generateActivityPage(activity, region, lang, distDir));
  }
  // Also ensure generic activity types from beachesList (collect unique activities that exist)
  // (handled above with fixed list — enough for Sprint #25)

  // Append to sitemap.xml — robust merge (preserve existing entries)
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  const today = new Date().toISOString().slice(0,10);
  const newEntries = sitemap.map(u => `  <url><loc>https://${region.domain}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n');
  if (fs.existsSync(sitemapPath)) {
    try {
      let existing = fs.readFileSync(sitemapPath, 'utf-8');
      if (existing.includes('</urlset>')) {
        existing = existing.replace('</urlset>', `${newEntries}\n</urlset>`);
        // also handle case where file was truncated without closing
        if (!existing.includes('<?xml')) existing = `<?xml version="1.0" encoding="UTF-8"?>\n${existing}`;
        fs.writeFileSync(sitemapPath, existing, 'utf-8');
      } else {
        // fallback: create new
        fs.writeFileSync(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${newEntries}\n</urlset>\n`, 'utf-8');
      }
    } catch (e) {
      console.warn(`   ⚠ sitemap merge fail: ${e.message}`);
      fs.writeFileSync(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${newEntries}\n</urlset>\n`, 'utf-8');
    }
  } else {
    fs.writeFileSync(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${newEntries}\n</urlset>\n`, 'utf-8');
  }
  
  console.log(`   → Pages dédiées ${region.id} (${lang}) : ${sitemap.length} URLs ajoutées au sitemap (beaches ${beaches.length}, pois ${regionPois.length})`);
}

module.exports = { generateDedicatedPages };