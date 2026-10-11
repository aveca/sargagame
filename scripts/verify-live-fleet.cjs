#!/usr/bin/env node
/**
 * Garde-fou de flotte — vérifie les domaines PROD en live, jamais le build local.
 *
 * Corrige le trou qui a laissé passer le cutover Cloudflare du 07/10/2026 :
 * la CI pouvait être verte pendant que /sitemap.xml renvoyait 404 sur 3
 * domaines, que la Guadeloupe servait les canonicals de Martinique et qu'une
 * région était figée sur un build antérieur.
 *
 * Usage :
 *   node scripts/verify-live-fleet.cjs
 *   node scripts/verify-live-fleet.cjs --regions mq,gp,florida,puntacana,rivieramaya,tulum
 *   node scripts/verify-live-fleet.cjs --fingerprint-dir ./fingerprints --max-age-h 48
 *
 * Codes sortie :
 *   0 = tout PASS, 1 = au moins un FAIL, 2 = usage/erreur interne.
 *
 * Chaque contrôle est écrit en tableau : contrôle | domaine | détail | statut.
 * Aucun contrôle n'est considéré « PASS » sans réponse HTTP + corps vérifié.
 */

const path = require('path');
const fs = require('fs');
const { getAllRegions } = require('../regions/index.cjs');

// Régions sans Worker ni domaine public (config présente, jamais déployée).
const NOT_DEPLOYED = new Set(['barbados']);

const argv = process.argv.slice(2);
function argOf(name, fallback = null) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

const regionsArg = argOf('--regions');
const fingerprintDir = argOf('--fingerprint-dir');
const maxAgeH = Number(argOf('--max-age-h', '48'));
const UA = 'Mozilla/5.0 (compatible; SargagameFleetGuard/1.0)';

const results = [];
function record(check, domain, detail, status) {
  results.push({ check, domain, detail, status });
}

async function get(url, opts = {}) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': UA, ...(opts.headers || {}) },
    });
    const body = opts.body === false ? '' : await res.text();
    return { ok: res.status === 200, status: res.status, body, headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: e.message || String(e) };
  }
}

function hostsOf(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/https?:\/\/([^/\s"'<>\\)]+)/g)) {
    out.add(m[1].replace(/^www\./, '').toLowerCase());
  }
  return out;
}

/** Hôtes déclarés dans les <loc> uniquement (ignore les xmlns type sitemaps.org). */
function locHosts(xml) {
  const out = new Set();
  for (const m of String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try { out.add(new URL(m[1].trim()).host.replace(/^www\./, '').toLowerCase()); } catch { /* loc illisible */ }
  }
  return out;
}

/**
 * Hôtes des SIGNAUX SEO (canonical / hreflang / og:url / JSON-LD url).
 * On ne regarde PAS tous les <a> : les liens éditoriaux vers les sites sœurs
 * ("dans la Caraïbe : Guadeloupe › Punta Cana › …") sont voulus et ne sont
 * pas des signaux de ranking. C'est bien canonical/hreflang/og:url qui posaient
 * problème sur GP (issue #780).
 */
function seoSignalHosts(html) {
  const out = new Set();
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi,
    /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/gi,
    /"@type"\s*:\s*"WebPage"[\s\S]{0,400}?"url"\s*:\s*"([^"]+)"/gi,
  ];
  for (const re of patterns) {
    for (const m of String(html).matchAll(re)) {
      try { out.add(new URL(m[1]).host.replace(/^www\./, '').toLowerCase()); } catch { /* href relatif */ }
    }
  }
  return out;
}

/**
 * Hôtes « étrangers » = un de NOS domaines ailleurs que le sien.
 * Les CDN tiers (stripe/mollie/gtm/clarity) sont légitimes et ne doivent pas
 * faire échouer le contrôle — sinon le garde devient inutilisable.
 */
function ourForeignHosts(text, ownDomain, allOurDomains) {
  const own = ownDomain.replace(/^www\./, '').toLowerCase();
  return [...hostsOf(text)].filter((h) => h !== own && allOurDomains.has(h));
}

function canonicalHost(html) {
  const m = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
  ) || html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
  );
  if (!m) return null;
  try { return new URL(m[1]).host.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

async function main() {
  let regions = getAllRegions().filter((r) => !NOT_DEPLOYED.has(r.id));
  if (regionsArg) {
    const wanted = new Set(regionsArg.split(',').map((s) => s.trim()).filter(Boolean));
    regions = getAllRegions().filter((r) => wanted.has(r.id));
    if (regions.length !== wanted.size) {
      const missing = [...wanted].filter((id) => !getAllRegions().some((r) => r.id === id));
      console.error(`[fleet] régions inconnues : ${missing.join(', ')}`);
      return 2;
    }
  }
  if (regions.length === 0) {
    console.error('[fleet] aucune région à vérifier');
    return 2;
  }

  const fingerprints = new Map();
  if (fingerprintDir && fs.existsSync(fingerprintDir)) {
    for (const f of fs.readdirSync(fingerprintDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(fingerprintDir, f), 'utf8'));
        if (j && j.id) fingerprints.set(j.id, j);
      } catch { /* artefact illisible = non fourni, pas bloquant */ }
    }
  }

  const versions = [];
  const rows = [];
  const ourDomains = new Set(regions.map((r) => r.domain.replace(/^www\./, '').toLowerCase()));

  for (const region of regions) {
    const domain = region.domain;
    const base = `https://${domain}`;

    // 1 — version.json : preuve que le Worker sert le build attendu.
    const v = await get(`${base}/version.json`);
    let parsed = null;
    if (v.ok) { try { parsed = JSON.parse(v.body); } catch { /* deco */ } }
    if (!parsed || !parsed.v || !parsed.b) {
      record('version.json', domain, v.ok ? `corps illisible (v=${parsed && parsed.v} b=${parsed && parsed.b})` : `HTTP ${v.status} ${v.error || ''}`.trim(), 'FAIL');
    } else {
      versions.push({ id: region.id, domain, v: String(parsed.v), b: String(parsed.b) });
      const fp = fingerprints.get(region.id);
      if (fp) {
        const match = fp.v === String(parsed.v) && fp.b === String(parsed.b);
        record('deploy-fingerprint', domain, `live v=${parsed.v} b=${parsed.b} vs build v=${fp.v} b=${fp.b}`, match ? 'PASS' : 'FAIL');
      } else {
        record('version.json', domain, `v=${parsed.v} b=${parsed.b}`, 'PASS');
      }
    }

    // 2 — /sitemap.xml : doit exister ET n'être composé que de ce domaine.
    const sm = await get(`${base}/sitemap.xml`);
    if (!sm.ok) {
      record('sitemap.xml', domain, `HTTP ${sm.status} ${sm.error || ''}`.trim(), 'FAIL');
    } else if (!/<urlset[\s>]/.test(sm.body) && !/<sitemapindex[\s>]/.test(sm.body)) {
      record('sitemap.xml', domain, `corps non-XML (${sm.body.length} octets)`, 'FAIL');
    } else {
      const hosts = locHosts(sm.body);
      const own = hosts.has(domain.replace(/^www\./, '').toLowerCase());
      const others = [...hosts].filter((h) => h !== domain.replace(/^www\./, '').toLowerCase());
      const urls = (sm.body.match(/<loc>/g) || []).length;
      record('sitemap.xml', domain,
        own && others.length === 0 ? `${urls} URLs, hôte unique` : `${urls} URLs | hôtes étrangers: ${others.join(',') || 'aucun'}`,
        own && others.length === 0 ? 'PASS' : 'FAIL');
    }

    // 3 — /robots.txt : doit déclarer UNIQUEMENT le sitemap de son domaine.
    const rb = await get(`${base}/robots.txt`);
    if (!rb.ok) {
      record('robots.txt', domain, `HTTP ${rb.status} ${rb.error || ''}`.trim(), 'FAIL');
    } else {
      const foreign = ourForeignHosts(rb.body, domain, ourDomains);
      const declaresOwn = rb.body.includes(`https://${domain}/sitemap.xml`);
      record('robots.txt', domain,
        foreign.length === 0 && declaresOwn ? 'sitemap déclaré, aucun domaine étranger' : `étrangers=[${foreign.join(',')}] sitemapPropre=${declaresOwn}`,
        foreign.length === 0 && declaresOwn ? 'PASS' : 'FAIL');
    }

    // 4 — page d'accueil : 200 + canonical hôte = domaine (régression #780 GP).
    const home = await get(`${base}/`);
    if (!home.ok) {
      record('homepage', domain, `HTTP ${home.status} ${home.error || ''}`.trim(), 'FAIL');
    } else {
      const ch = canonicalHost(home.body);
      const expected = domain.replace(/^www\./, '').toLowerCase();
      const foreign = [...seoSignalHosts(home.body)].filter((h) => h !== expected);
      const ok = ch !== null && ch === expected;
      record('canonical', domain,
        ch === null ? 'aucun <link rel=canonical>' : `canonical=${ch}${foreign.length ? ` | signaux SEO étrangers: ${foreign.slice(0, 6).join(',')}` : ''}`,
        ok && foreign.length === 0 ? 'PASS' : 'FAIL');
    }

    // 5 — donnée sargassum fraîche ET de la bonne région (chemin racine front).
    const data = await get(`${base}/api/copernicus/sargassum.json`);
    if (!data.ok) {
      record('sargassum.json', domain, `HTTP ${data.status} ${data.error || ''}`.trim(), 'FAIL');
    } else {
      let j = null;
      try { j = JSON.parse(data.body); } catch { /* deco */ }
      if (!j || !j.updatedAt) {
        record('sargassum.json', domain, 'updatedAt absent / JSON illisible', 'FAIL');
      } else {
        const ageH = (Date.now() - Date.parse(j.updatedAt)) / 36e5;
        const ids = Array.isArray(j.levels) ? j.levels.map((l) => l.id) : [];
        // MQ/GP partagent le fichier legacy racine (13 ids MQ + 8 ids GP) :
        // c'est le comportement historique attendu, pas une fuite de région.
        const shared = ['mq', 'gp'].includes(region.id);
        const foreignIds = shared
          ? []
          : ids.filter((id) => /^(mq|gp)-|^(grande-anse|anse-|tartane|diamant|pt-marin|sainte-anne|les-salines|vauclin|precheur)/.test(id));
        record('sargassum.json', domain,
          `updatedAt=${j.updatedAt} (${ageH.toFixed(1)}h) levels=${ids.length}${foreignIds.length ? ` | ids MQ/GP détectés: ${foreignIds.slice(0, 5).join(',')}` : ''}`,
          ageH <= maxAgeH && foreignIds.length === 0 ? 'PASS' : 'FAIL');
      }
    }
  }

  // 6 — cohérence de flotte : les 6 domaines doivent servir LA MÊME version
  // de produit et le MÊME fingerprint de source. `b` = hash des sources
  // (stamp-sw-hash) : un domaine qui n'a pas été redéployé conserve un `b`
  // antérieur → c'est précisément l'état de tuzlum/tulum du 07/10/2026.
  if (versions.length > 1) {
    const vs = new Set(versions.map((x) => x.v));
    const bs = new Set(versions.map((x) => x.b));
    record('fleet-version-coherence', `${versions.length} domaines`,
      `v distincts=${vs.size} (${[...vs].join(',')})`,
      vs.size === 1 ? 'PASS' : 'FAIL');
    record('fleet-build-coherence', `${versions.length} domaines`,
      `b distincts=${bs.size} (${[...bs].join(',')})`,
      bs.size === 1 ? 'PASS' : 'FAIL');
    if (bs.size > 1) {
      const stale = versions.filter((x) => x.b !== versions[0].b);
      record('fleet-stale-domains', stale.map((x) => x.id).join(','),
        `b=${stale.map((x) => `${x.id}:${x.b}`).join(' ')} != référence ${versions[0].id}:${versions[0].b}`,
        'FAIL');
    }
  }

  rows.push(...results);
  const fails = rows.filter((r) => r.status === 'FAIL');

  console.log('\nCOMPONENT | DOMAIN | BEFORE | TEST | LIVE PROOF | STATUS');
  console.log('---|---|---|---|---|---');
  for (const r of rows) {
    console.log(`${r.check} | ${r.domain} | - | http | ${r.detail.replace(/\|/g, '/')} | ${r.status}`);
  }
  console.log(`\n[fleet] ${rows.length - fails.length}/${rows.length} PASS`);
  if (fails.length) {
    console.error(`[fleet] FAIL (${fails.length}) :`);
    for (const f of fails) console.error(`  - ${f.check} @ ${f.domain}: ${f.detail}`);
    return 1;
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('[fleet] erreur interne :', e);
  process.exit(2);
});
