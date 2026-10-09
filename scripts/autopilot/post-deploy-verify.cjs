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
  return { ok: r.ok, status: parseInt((r.out || '').trim(), 10) || 0 };
}
function httpBody(url, timeoutMs) {
  const r = curl(['-sL', '--max-time', String(Math.ceil((timeoutMs || 25000) / 1000)), '-A', 'Mozilla/5.0 (compatible; SargagamePostDeploy/2.0)', url], timeoutMs);
  return { ok: r.ok, body: r.out || '' };
}

// Préfixes d'ids de plages par région (cohérence croisée)
const REGION_PREFIX = { mq: ['mq', 'martinique'], gp: ['gp', 'guadeloupe'], florida: ['fl'], puntacana: ['pc'], rivieramaya: ['rm'], tulum: ['tu'] };

function verifyDomain(region, opts) {
  const domain = region.domain;
  const R = { domain, region: region.id, checks: {}, errors: [], notes: [] };
  const set = (name, status, detail) => { R.checks[name] = { status, detail: detail || '' }; if (status === 'FAILED') R.errors.push(`${name}: ${detail || ''}`); };

  // 1. Accessibilité HTTP
  const home = httpStatus(`https://${domain}/?pdv=${Date.now()}`);
  if (!home.ok || home.status !== 200) { set('http_accessible', 'FAILED', home.ok ? `HTTP ${home.status}` : `injoignable (${String(home.error || '').split('\n')[0]})`); finalize(); return R; }
  set('http_accessible', 'VERIFIED', 'HTTP 200');

  // 2. Identité d'artefact (version.json)
  const ver = httpBody(`https://${domain}/version.json?pdv=${Date.now()}`);
  let vj = null;
  try { vj = JSON.parse(ver.body); } catch (_) {}
  if (!ver.ok || !vj || !vj.v) { set('artifact_identity', 'FAILED', 'version.json absent/invalide'); }
  else {
    R.served = { v: vj.v, b: vj.b || null };
    if (opts.expectV || opts.expectB) {
      const okV = !opts.expectV || vj.v === opts.expectV;
      const okB = !opts.expectB || vj.b === opts.expectB;
      set('artifact_identity', okV && okB ? 'VERIFIED' : 'FAILED', okV && okB ? `v=${vj.v} b=${vj.b} == build` : `servi v=${vj.v} b=${vj.b} != attendu v=${opts.expectV} b=${opts.expectB}`);
    } else {
      set('artifact_identity', 'VERIFIED', `servi v=${vj.v} b=${vj.b || 'n/a'} (aucune attente fournie — identité enregistrée, non comparée)`);
    }
  }

  // 3. Fraîcheur données
  const sj = httpBody(`https://${domain}/api/copernicus/sargassum.json?pdv=${Date.now()}`);
  let sd = null;
  try { sd = JSON.parse(sj.body); } catch (_) {}
  if (!sj.ok || !sd || !sd.updatedAt) { set('data_freshness', 'FAILED', 'sargassum.json absent/invalide'); }
  else {
    const ageH = (Date.now() - new Date(sd.updatedAt).getTime()) / 3.6e6;
    R.dataAgeHours = +ageH.toFixed(1);
    set('data_freshness', ageH <= 26 ? 'VERIFIED' : 'FAILED', `âge ${ageH.toFixed(1)}h (seuil 26h)`);
  }

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

  // 5. Paramètres régionaux (canonical domaine + GA4 si configuré)
  const html = httpBody(`https://${domain}/?pdv=${Date.now()}`);
  const htmlOk = html.ok && html.body.length > 500;
  const canonOk = htmlOk && html.body.includes(`://${domain}`);
  set('region_domain_params', htmlOk ? (canonOk ? 'VERIFIED' : 'FAILED') : 'NOT_VERIFIED',
    htmlOk ? (canonOk ? `canonical/og référencent ${domain}` : `le HTML servi ne référence pas ${domain}`) : 'HTML servi trop court/injoignable');
  const ga4 = region.ga4;
  if (ga4 && ga4 !== 'TODO_GA4_ID') {
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
      const res = verifyDomain(r, { sosTest, expectV, expectB });
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

module.exports = { verifyDomain, getRegions, httpStatus, httpBody };
