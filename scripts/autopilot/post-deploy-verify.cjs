#!/usr/bin/env node
/**
 * post-deploy-verify.cjs — Post-deployment verification with real HTTP tests
 *
 * Contrôles RÉELS sur les domaines déployés (aucun résultat simulé) :
 *   1. Accessibilité HTTP (200)
 *   2. Identité d'artefact : version.json v/b servi == v/b construit (si fourni via
 *      --expect-v/--expect-b ; sinon les valeurs servies sont enregistrées)
 *   3. Fraîcheur des données Copernicus (sargassum.json)
 *   4. Cohérence région ↔ plages : aucun niveau d'une autre région servi
 *   5. Paramètres régionaux : canonical/og:url = domaine de la région, et si
 *      regions/<id>.json définit un GA4 réel (!= TODO_GA4_ID) ⇒ présent dans le HTML.
 *      Sans GA4 configuré, le contrôle analytics reste NOT_VERIFIED (jamais PASS simulé).
 *   6. Parcours ?sos=1 : HTTP 200 sans redirection d'erreur. Le rendu UI du modal
 *      est client-side : non prouvable en HTTP pur ⇒ reste NOT_VERIFIED.
 *   7. API paiement : POST {"action":"__payment_smoke__"} doit répondre 400 et ne
 *      jamais révéler payment_backend_not_configured / api_route_not_migrated.
 *
 * États par contrôle : VERIFIED | NOT_VERIFIED | FAILED.
 * Stade global : PRODUCTION_VERIFIED (tout VERIFIED) | NOT_VERIFIED (aucun échec
 * mais au moins un NOT_VERIFIED) | FAILED (au moins un FAILED => exit 1).
 * Toute erreur d'exécution elle-même => exit 1 (fail-closed).
 *
 * Usage :
 *   node scripts/autopilot/post-deploy-verify.cjs --all --sos-test \
 *     --expect-v 2026.10.08 --expect-b abc123 \
 *     --job <traceJobId> --report post-deploy-report.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { compareHtmlFingerprint } = require('./html-integrity.cjs');
const { SAT_STALE_HOURS, satelliteFreshness } = require('../lib/satellite-freshness.cjs');

const ROOT = path.resolve(__dirname, '..', '..');

function getRegions() {
  return require(path.join(ROOT, 'regions', 'index.cjs')).getAllRegions().filter(r => r.live !== false);
}

// ── HTTP helpers (curl — réseau réel requis ; absent => contrôle FAILED/NOT_VERIFIED) ──
function curl(args, timeoutMs) {
  try {
    const out = execFileSync('curl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs || 25000 });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String(e.stdout || ''), error: e.message };
  }
}
function httpStatus(url, timeoutMs) {
  const devnull = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const r = curl(['-sL', '-o', devnull, '-w', '%{http_code}', '--max-time', String(Math.ceil((timeoutMs || 25000) / 1000)), '-A', 'Mozilla/5.0 (compatible; SargagamePostDeploy/2.0)', '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', url], timeoutMs);
  const status = parseInt((r.out || '').trim(), 10) || 0;
  return { ok: r.ok, status, error: r.ok ? null : String(r.error || 'curl exited non-zero').split(/\r?\n/)[0] };
}
function httpBody(url, timeoutMs) {
  const r = curl(['-sL', '--max-time', String(Math.ceil((timeoutMs || 25000) / 1000)), '-A', 'Mozilla/5.0 (compatible; SargagamePostDeploy/2.0)', url], timeoutMs);
  return { ok: r.ok, body: r.out || '', error: r.ok ? null : String(r.error || 'curl exited non-zero').split(/\r?\n/)[0] };
}
function describeHttpProbe(probe) {
  if (!probe.ok) {
    const status = Number(probe.status) > 0 ? ` after HTTP ${probe.status}` : '';
    const error = String(probe.error || 'unknown transport error').split(/\r?\n/)[0];
    return `curl exited non-zero${status}: ${error}`;
  }
  return Number(probe.status) === 200 ? '' : `HTTP ${Number(probe.status) || 0}`;
}

/**
 * Only invoked after the live HTML differs from the prepared artifact.
 * Purges exactly the homepage and /index.html for the affected hostname.
 * Never falls back to purge_everything; credential/permission failures are explicit.
 */
async function purgeSpecificHtmlCache(domain) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { ok: false, detail: 'CLOUDFLARE_API_TOKEN absent; permission to purge exact URLs unavailable' };
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  let zones;
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/zones?name=' + encodeURIComponent(domain) + '&per_page=50', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok || body.success !== true) {
      const codes = (body.errors || []).map(e => String(e.code)).join(',');
      return { ok: false, detail: 'Cloudflare zone lookup failed HTTP ' + response.status + (codes ? ' codes=' + codes : '') };
    }
    zones = (body.result || []).filter(z => z.name === domain);
  } catch (e) {
    return { ok: false, detail: 'Cloudflare zone lookup unavailable: ' + String(e.message || e).slice(0, 180) };
  }
  if (zones.length !== 1 || !zones[0].id) {
    return { ok: false, detail: 'exact Cloudflare zone not uniquely resolved for ' + domain };
  }
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/zones/' + encodeURIComponent(zones[0].id) + '/purge_cache', {
      method: 'POST',
      headers,
      body: JSON.stringify({ files: ['https://' + domain + '/', 'https://' + domain + '/index.html'] }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok || body.success !== true) {
      const codes = (body.errors || []).map(e => String(e.code)).join(',');
      return { ok: false, detail: 'targeted purge rejected HTTP ' + response.status + (codes ? ' codes=' + codes : '') };
    }
    return { ok: true, detail: 'Cloudflare accepted targeted purge for / and /index.html' };
  } catch (e) {
    return { ok: false, detail: 'targeted purge request failed: ' + String(e.message || e).slice(0, 180) };
  }
}

// Préfixes d'ids de plages par région (cohérence croisée)
const REGION_PREFIX = { mq: ['mq', 'martinique'], gp: ['gp', 'guadeloupe'], florida: ['fl'], puntacana: ['pc'], rivieramaya: ['rm'], tulum: ['tu'] };

// Identité d'artefact : comparaison stricte servi-vs-attendu quand une attente
// est fournie (fingerprints du build) ; sinon NOT_VERIFIED explicite — une
// identité seulement enregistrée ne vaut jamais VERIFIED (mission P0 §4).
// Pure et testable (voir tests/unit/regional-copernicus.test.cjs, série V).
function checkArtifactIdentity(vj, expectV, expectB) {
  if (!vj || !vj.v) return { status: 'FAILED', detail: 'version.json absent/invalide' };
  if (expectV || expectB) {
    const okV = !expectV || vj.v === expectV;
    const okB = !expectB || vj.b === expectB;
    return okV && okB
      ? { status: 'VERIFIED', detail: `v=${vj.v} b=${vj.b} == build` }
      : { status: 'FAILED', detail: `servi v=${vj.v} b=${vj.b} != attendu v=${expectV} b=${expectB}` };
  }
  return { status: 'NOT_VERIFIED', detail: `servi v=${vj.v} b=${vj.b || 'n/a'} (aucune attente fournie — identité enregistrée, non comparée)` };
}

// ID GA4 d'une région : champ `ga4Id` (config actuelle), repli `ga4` historique.
// `TODO_GA4_ID`, absent ou vide => null (contrôle NOT_VERIFIED honnête).
// Pure et testée (voir tests/unit/sos-modal.test.cjs, série G).
function resolveGa4Id(region) {
  const raw = (region && region.ga4Id) || (region && region.ga4) || null;
  if (typeof raw !== 'string' || !raw.trim() || raw.trim() === 'TODO_GA4_ID') return null;
  return raw.trim();
}

function checkSatelliteFreshness(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'FAILED', ageMinutes: null, detail: 'sargassum.json absent/invalide' };
  }
  if (payload.source !== 'erddap-live') {
    return { status: 'NOT_VERIFIED', ageMinutes: null, detail: 'source non satellite live ; fraîcheur satellite non prouvée' };
  }

  const freshness = satelliteFreshness(payload.erddapTimestamp, now);
  if (!Number.isFinite(freshness.dataAgeMinutes)) {
    return { status: 'FAILED', ageMinutes: null, detail: 'erddapTimestamp satellite absent/invalide/futur' };
  }

  const limitMinutes = SAT_STALE_HOURS * 60;
  if (freshness.stale) {
    return {
      status: 'FAILED',
      ageMinutes: freshness.dataAgeMinutes,
      detail: `observation satellite périmée (${freshness.dataAgeMinutes}min >= ${limitMinutes}min)`,
    };
  }
  return {
    status: 'VERIFIED',
    ageMinutes: freshness.dataAgeMinutes,
    detail: `âge satellite ${freshness.dataAgeMinutes}min (seuil ${limitMinutes}min)`,
  };
}

/**
 * Validate the public B2B partner catalogue consumed by ChasseHome.
 * Empty partner/preview arrays are valid; missing or malformed assets are not.
 */
function checkB2BPartnersPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'FAILED', detail: 'b2b-partners.json absent/invalide' };
  }
  if (typeof payload.updatedAt !== 'string' || !Number.isFinite(Date.parse(payload.updatedAt))) {
    return { status: 'FAILED', detail: 'updatedAt absent/invalide' };
  }
  for (const key of ['partners', 'preview']) {
    if (!Array.isArray(payload[key])) {
      return { status: 'FAILED', detail: key + ' absent ou non-tableau' };
    }
  }
  const required = ['beachId', 'slug', 'name', 'tagline', 'url', 'area'];
  for (const key of ['partners', 'preview']) {
    for (let index = 0; index < payload[key].length; index++) {
      const partner = payload[key][index];
      if (!partner || typeof partner !== 'object' || Array.isArray(partner)) {
        return { status: 'FAILED', detail: key + '[' + index + '] invalide' };
      }
      for (const field of required) {
        if (typeof partner[field] !== 'string' || !partner[field].trim()) {
          return { status: 'FAILED', detail: key + '[' + index + '].' + field + ' absent/invalide' };
        }
      }
      let url;
      try { url = new URL(partner.url); } catch (_) {}
      if (!url || !['http:', 'https:'].includes(url.protocol)) {
        return { status: 'FAILED', detail: key + '[' + index + '].url invalide' };
      }
    }
  }
  return {
    status: 'VERIFIED',
    detail: 'updatedAt=' + payload.updatedAt + '; partners=' + payload.partners.length + '; preview=' + payload.preview.length,
  };
}

async function verifyDomain(region, opts) {
  const domain = region.domain;
  const R = { domain, region: region.id, checks: {}, errors: [], notes: [] };
  const set = (name, status, detail) => { R.checks[name] = { status, detail: detail || '' }; if (status === 'FAILED') R.errors.push(`${name}: ${detail || ''}`); };

  // 1. Accessibilité HTTP
  const home = httpStatus(`https://${domain}/?pdv=${Date.now()}`);
  if (!home.ok || home.status !== 200) { set('http_accessible', 'FAILED', home.ok ? `HTTP ${home.status}` : `injoignable (${String(home.error || '').split('\n')[0]})`); finalize(); return R; }
  set('http_accessible', 'VERIFIED', 'HTTP 200');

  // 2. Identité d'artefact (version.json) — règle P0 : sans attente fournie,
  //    l'identité est ENREGISTRÉE mais NON COMPARÉE => NOT_VERIFIED (jamais
  //    VERIFIED simulé). Avec attente (fingerprints du build) => comparaison
  //    stricte v/b => VERIFIED ou FAILED.
  const ver = httpBody(`https://${domain}/version.json?pdv=${Date.now()}`);
  let vj = null;
  try { vj = JSON.parse(ver.body); } catch (_) {}
  if (!ver.ok || !vj || !vj.v) { set('artifact_identity', 'FAILED', !ver.ok ? `version.json curl failed: ${ver.error || 'curl exited non-zero'}` : 'version.json absent/invalide'); }
  else {
    R.served = { v: vj.v, b: vj.b || null };
    const idr = checkArtifactIdentity(vj, opts.expectV, opts.expectB);
    set('artifact_identity', idr.status, idr.detail);
  }

  // 3. Fraîcheur du payload/pipeline (updatedAt) — distincte de l'observation satellite.
  const sj = httpBody(`https://${domain}/api/copernicus/sargassum.json?pdv=${Date.now()}`);
  let sd = null;
  try { sd = JSON.parse(sj.body); } catch (_) {}
  if (!sj.ok || !sd || !sd.updatedAt) { set('data_freshness', 'FAILED', !sj.ok ? `sargassum.json curl failed: ${sj.error || 'curl exited non-zero'}` : 'sargassum.json absent/invalide'); }
  else {
    const ageH = (Date.now() - new Date(sd.updatedAt).getTime()) / 3.6e6;
    R.dataAgeHours = +ageH.toFixed(1);
    set('data_freshness', ageH <= 26 ? 'VERIFIED' : 'FAILED', `âge ${ageH.toFixed(1)}h (seuil 26h)`);
  }

  // 3bis. Fraîcheur réelle de l'observation satellite : un pipeline récent ne suffit pas.
  const satelliteCheck = checkSatelliteFreshness(sd);
  if (Number.isFinite(satelliteCheck.ageMinutes)) R.satelliteAgeMinutes = satelliteCheck.ageMinutes;
  set('satellite_freshness', satelliteCheck.status, satelliteCheck.detail);

  // 4. Cohérence région ↔ plages
  if (sd && Array.isArray(sd.levels)) {
    const mine = REGION_PREFIX[region.id] || [region.id];
    const foreign = sd.levels.filter(l => {
      const id = String(l && l.id || '');
      const mineHit = mine.some(p => id.startsWith(p));
      if (mineHit) return false;
      return Object.entries(REGION_PREFIX).some(([rid, prefs]) => rid !== region.id && prefs.some(p => id.startsWith(p)));
    });
    set('region_beaches_coherence', foreign.length === 0 ? 'VERIFIED' : 'FAILED', foreign.length === 0 ? `${sd.levels.length} niveaux, aucun niveau d'une autre région` : `${foreign.length} niveaux étrangers : ${foreign.slice(0, 3).map(l => l.id).join(',')}`);
  } else set('region_beaches_coherence', 'NOT_VERIFIED', 'levels absents du sargassum.json');


  // 4bis. Catalogue partenaires B2B consommé par ChasseHome.
  // Un 404 ou un JSON incomplet masque silencieusement les cartes partenaires.
  const b2bUrl = `https://${domain}/b2b-partners.json?pdv=${Date.now()}`;
  const b2bStatus = httpStatus(b2bUrl);
  if (!b2bStatus.ok || b2bStatus.status !== 200) {
    set('b2b_partners_api', 'FAILED',
      !b2bStatus.ok ? `b2b-partners.json curl failed: ${b2bStatus.error || 'curl exited non-zero'}` : `b2b-partners.json HTTP ${b2bStatus.status}`);
  } else {
    const b2bResponse = httpBody(b2bUrl);
    let b2bPayload = null;
    try { b2bPayload = JSON.parse(b2bResponse.body); } catch (_) {}
    if (!b2bResponse.ok) {
      set('b2b_partners_api', 'FAILED', `b2b-partners.json body unavailable: ${b2bResponse.error || 'curl exited non-zero'}`);
    } else {
      const b2bCheck = checkB2BPartnersPayload(b2bPayload);
      set('b2b_partners_api', b2bCheck.status, b2bCheck.detail);
    }
  }

  // 5. HTML servi vs empreinte construite (CSP + bundle JS/CSS exacts)
  // Toute divergence déclenche au plus une purge ciblée, suivie d'une nouvelle lecture.
  // Une purge acceptée seule ne vaut jamais PASS : l'HTML rechargé doit correspondre.
  // Vérifier le chemin exact de visiteur, sans query string (le cache key peut ignorer la query).
  let html = httpBody(`https://${domain}/`);
  let htmlOk = html.ok && html.body.length > 500;
  if (!opts.htmlFingerprint) {
    set('live_html_integrity', opts.htmlFingerprintRequired ? 'FAILED' : 'NOT_VERIFIED',
      opts.htmlFingerprintRequired ? 'fingerprint HTML du build préparé absent' : 'aucune empreinte HTML préparée fournie');
  } else {
    let comparison = htmlOk
      ? compareHtmlFingerprint(html.body, opts.htmlFingerprint, domain)
      : { ok: false, reason: 'HTML live absent/trop court', actual: null };
    let purgeDetail = '';
    if (!comparison.ok) {
      const initialReason = comparison.reason;
      const purge = await purgeSpecificHtmlCache(domain);
      purgeDetail = purge.detail;
      if (purge.ok) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 1000));
          const retryStatus = httpStatus(`https://${domain}/`, 20000);
          if (!retryStatus.ok || retryStatus.status !== 200) continue;
          const retry = httpBody(`https://${domain}/`);
          if (!retry.ok || retry.body.length <= 500) continue;
          const retryComparison = compareHtmlFingerprint(retry.body, opts.htmlFingerprint, domain);
          html = retry;
          htmlOk = true;
          comparison = retryComparison;
          if (retryComparison.ok) break;
        }
      }
      if (!comparison.ok) {
        set('live_html_integrity', 'FAILED', initialReason + '; ' + purgeDetail +
          (purge.ok ? '; échec persistant après relecture post-purge: ' + comparison.reason : ''));
      }
    }
    if (comparison.ok) {
      const assets = [comparison.actual.moduleSrc, ...(comparison.actual.cssSrcs || [])];
      const failedAssets = [];
      for (const ref of assets) {
        const assetUrl = new URL(ref, `https://${domain}/`).href;
        const assetStatus = httpStatus(assetUrl, 20000);
        const probeDetail = describeHttpProbe(assetStatus);
        if (probeDetail) failedAssets.push(`${ref} ${probeDetail}`);
      }
      set('live_html_integrity', failedAssets.length ? 'FAILED' : 'VERIFIED',
        failedAssets.length ? 'CSP/bundle paths matched but referenced asset probe failed: ' + failedAssets.join(', ') :
          comparison.reason + '; bundle JS/CSS répondent HTTP 200' + (purgeDetail ? '; ' + purgeDetail : ''));
    }
  }

  // L'HTML peut avoir été relu après une purge ciblée ; réutiliser ce corps pour SEO/GA4.
  htmlOk = html.ok && html.body.length > 500;
  const canonOk = htmlOk && html.body.includes(`://${domain}`);
  set('region_domain_params', htmlOk ? (canonOk ? 'VERIFIED' : 'FAILED') : 'NOT_VERIFIED',
    htmlOk ? (canonOk ? `canonical/og référencent ${domain}` : `le HTML servi ne référence pas ${domain}`) : 'HTML servi trop court/injoignable');
  const ga4 = resolveGa4Id(region);
  if (ga4) {
    set('analytics_region_param', htmlOk && html.body.includes(ga4) ? 'VERIFIED' : 'FAILED', htmlOk ? (html.body.includes(ga4) ? `GA4 ${ga4} présent` : `GA4 ${ga4} ABSENT du HTML servi`) : 'HTML injoignable');
  } else {
    set('analytics_region_param', 'NOT_VERIFIED', `aucun GA4 configuré pour ${region.id} — contrôle non applicable (jamais simulé)`);
  }

  // 6. Parcours ?sos=1 (niveau HTTP ; le rendu modal est client-side)
  if (opts.sosTest) {
    const sos = httpStatus(`https://${domain}/?sos=1&pdv=${Date.now()}`);
    if (!sos.ok) set('sos_deeplink', 'NOT_VERIFIED', `injoignable (${String(sos.error || '').split('\n')[0]})`);
    else if (sos.status !== 200) set('sos_deeplink', 'FAILED', `HTTP ${sos.status}`);
    else {
      set('sos_deeplink_http', 'VERIFIED', '?sos=1 → HTTP 200');
      set('sos_modal_render', 'NOT_VERIFIED', 'modal SOS rendu côté client (JS) — non prouvable en HTTP pur ; contrôle navigateur requis');
    }
  }

  // 7. API paiement — contrat réel : POST __payment_smoke__ => 400, backend configuré
  const pay = curl(['-sS', '--max-time', '20', '-X', 'POST', '-H', 'Content-Type: application/json', '--data', '{"action":"__payment_smoke__"}', '-w', '\n%{http_code}', `https://${domain}/api/mollie.php`], 25000);
  if (!pay.ok) set('payment_api', 'NOT_VERIFIED', `injoignable (${String(pay.error || '').split('\n')[0]})`);
  else {
    const parts = (pay.out || '').trim().split('\n');
    const code = parseInt(parts[parts.length - 1], 10) || 0;
    const body = parts.slice(0, -1).join('\n');
    const misconfigured = /payment_backend_not_configured|api_route_not_migrated/.test(body);
    if (code === 400 && !misconfigured) set('payment_api', 'VERIFIED', 'POST __payment_smoke__ → 400 (backend configuré, requête invalide rejetée comme prévu)');
    else set('payment_api', 'FAILED', `HTTP ${code}${misconfigured ? ' + backend non configuré/route non migrée' : ''} — attendu 400 avec backend configuré`);
  }

  finalize();
  return R;

  function finalize() {
    const vals = Object.values(R.checks).map(c => c.status);
    R.stage = vals.includes('FAILED') ? 'FAILED' : (vals.includes('NOT_VERIFIED') ? 'NOT_VERIFIED' : 'PRODUCTION_VERIFIED');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const A = (n) => { const i = args.findIndex(a => a === '--' + n || a.startsWith('--' + n + '=')); if (i < 0) return null; const a = args[i]; return a.includes('=') ? a.split('=')[1] : args[i + 1]; };
  const ids = A('regions') ? String(A('regions')).split(',').map(s => s.trim()) : null;
  const sosTest = args.includes('--sos-test');
  const expectV = A('expect-v'), expectB = A('expect-b');
  const reportPath = A('report');
  const jobId = A('job');
  const fingerprintDir = A('fingerprint-dir');
  const htmlFingerprints = new Map();
  if (fingerprintDir) {
    const fullDir = path.resolve(ROOT, fingerprintDir);
    try {
      for (const name of fs.readdirSync(fullDir).filter(f => f.endsWith('.json'))) {
        try {
          const record = JSON.parse(fs.readFileSync(path.join(fullDir, name), 'utf8'));
          if (record && record.id && record.cspSha256 && record.moduleSrc) htmlFingerprints.set(record.id, record);
        } catch (_) { /* fichiers illisibles : contrôle fail-closed ci-dessous */ }
      }
    } catch (_) { /* dossier absent : contrôle fail-closed ci-dessous */ }
  }

  let regions = getRegions();
  if (ids) regions = regions.filter(r => ids.includes(r.id));

  // Traçabilité job_id (scripts/autopilot/lib/job-trace.cjs — CLI, étape par étape)
  const trace = (action, extra) => {
    if (!jobId) return;
    const targs = [path.join(__dirname, 'lib', 'job-trace.cjs'), action, '--job', jobId, ...(extra || [])];
    try { execFileSync(process.execPath, targs.filter(Boolean), { cwd: ROOT, stdio: 'ignore' }); } catch (_) {}
  };
  if (jobId) {
    try { execFileSync(process.execPath, [path.join(__dirname, 'lib', 'job-trace.cjs'), 'create', '--task', 'POST-DEPLOY-VERIFY'], { cwd: ROOT, stdio: 'ignore' }); } catch (_) {}
    // create génère son propre id ; pour corréler avec un id imposé, on réécrit le fichier si besoin
    const traceDir = path.join(ROOT, 'scripts', 'traces');
    const target = path.join(traceDir, jobId + '.json');
    try {
      if (!fs.existsSync(target)) {
        fs.mkdirSync(traceDir, { recursive: true });
        const created = fs.readdirSync(traceDir).filter(f => f.startsWith('POST-DEPLOY-VERIFY-')).sort().pop();
        if (created && created !== jobId + '.json') fs.renameSync(path.join(traceDir, created), target);
        else fs.writeFileSync(target, JSON.stringify({ jobId, taskId: 'POST-DEPLOY-VERIFY', createdAt: new Date().toISOString(), steps: [] }, null, 2));
      }
    } catch (_) {}
  }
  trace('start', ['--step', 'post-deploy-verify']);

  console.log('=== Post-Deployment Verification (contrôles réels HTTP) ===');
  console.log(`Régions: ${regions.map(r => r.id + '@' + r.domain).join(', ')}`);
  console.log(`Attentes artefact: v=${expectV || 'n/a'} b=${expectB || 'n/a'} · job=${jobId || 'n/a'}`);

  const results = [];
  for (const r of regions) {
    try {
      const res = await verifyDomain(r, {
        sosTest, expectV, expectB,
        htmlFingerprint: htmlFingerprints.get(r.id) || null,
        htmlFingerprintRequired: Boolean(fingerprintDir),
      });
      results.push(res);
      console.log(`\n[${r.id}] ${r.domain} → ${res.stage}`);
      for (const [name, c] of Object.entries(res.checks)) console.log(`   ${c.status === 'VERIFIED' ? 'OK ' : c.status === 'FAILED' ? 'FAIL' : 'N/V '} ${name} — ${c.detail}`);
      trace('link-verify', ['--domain', r.domain, '--results', JSON.stringify(res.checks)]);
    } catch (e) {
      results.push({ domain: r.domain, region: r.id, stage: 'FAILED', checks: {}, errors: ['exception: ' + e.message] });
      console.log(`\n[${r.id}] ${r.domain} → FAILED (exception: ${e.message.split('\n')[0]})`);
    }
  }

  const anyFailed = results.some(r => r.stage === 'FAILED');
  const anyNV = results.some(r => r.stage === 'NOT_VERIFIED');
  const stage = anyFailed ? 'FAILED' : (anyNV ? 'DEPLOYED_PENDING_VERIFICATION' : 'PRODUCTION_VERIFIED');

  const report = {
    stage, jobId: jobId || null, at: new Date().toISOString(),
    expect: { v: expectV || null, b: expectB || null },
    domains: results,
  };
  if (reportPath) {
    fs.writeFileSync(path.resolve(ROOT, reportPath), JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nRapport écrit : ${reportPath}`);
  }
  console.log(`\nSTAGE=${stage}`);
  trace(anyFailed ? 'fail' : 'complete', ['--step', 'post-deploy-verify']);

  if (anyFailed) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error('ERREUR post-deploy-verify :', e.message); process.exit(1); });
}

module.exports = { verifyDomain, getRegions, httpStatus, httpBody, describeHttpProbe, checkArtifactIdentity, resolveGa4Id, checkSatelliteFreshness, checkB2BPartnersPayload };
