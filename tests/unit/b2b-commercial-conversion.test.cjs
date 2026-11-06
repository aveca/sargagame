#!/usr/bin/env node
'use strict';

/**
 * b2b-commercial-conversion.test.cjs — conversion B2B : les pages commerciales
 * doivent être parleuses, dans la bonne langue, dans la bonne devise, sur le
 * bon domaine — et ne doivent promettre aucun prix non vendable.
 *
 * Défauts PRODUITS mesurés le 2026-11-05 sur les 6 domaines (avant correctif) :
 *   • /pro/ servait la page FR sur les 4 domaines USD (Miami, Punta Cana,
 *     Cancún, Tulum) → un hôtelier de Miami atterrissait sur du français ;
 *   • canonical/og/hreflang des pages EN/ES pointaient sur la Martinique ;
 *   • le CTA « Offres & tarifs » des pages FR partait en absolu vers la
 *     Martinique (donc hors domaine, en français) ;
 *   • le palier « Coastline » EN/ES affichait « from $219/month » : aucun
 *     montant USD de ce type n'existe dans la grille payable (canonical :
 *     territoire = 1 990 €/an, annuel, EUR) → prix non vendable ;
 *   • l'Espace Pro de Tulum (sargazotulum.com) affichait EUR, le français,
 *     les plages MQ/GP et pointait vers sargasses-martinique.com ;
 *   • le CTA « Subscribe — $89/mo » des pages EN/ES postait le plan
 *     `pro_monthly_usd`, absent de mol_b2b_plans() → « Plan mensuel inconnu ».
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const {
  rewriteHosts, rewriteLanguageSwitcher, fixTerritoryPrice, demoPage, buildCommercialPages, buildBeachNames, SLA_MINUTES,
} = require(path.join(root, 'scripts', 'lib', 'b2b-commercial-pages.cjs'));

let failures = 0;
function check(ok, label) {
  if (ok) console.log('  ok  ' + label);
  else { failures++; console.error('  FAIL ' + label); }
}

// ── 1. Espace Pro : Tulum doit être une région USD/ES à part entière ────────
const espace = read('public/pro/espace/index.html');
check(/HOST\.indexOf\("tulum"\)>-1\?"tulum":null/.test(espace), 'espace: Tulum détecté comme région USD');
check(/REGION_LANG=\{[^}]*tulum:"es"/.test(espace), 'espace: langue ES pour Tulum');
const tulumBeaches = (espace.match(/tulum:\[([\s\S]*?)\n\s*\]/) || [, ''])[1];
check(/tu001/.test(tulumBeaches) && /tu005/.test(tulumBeaches), 'espace: 5 plages Tulum (tu001→tu005)');
check(!/href="https:\/\/sargasses-martinique\.com\/pro\/pricing\/"/.test(espace), 'espace: plus de lien absolu vers la Martinique');
check(/PLAN_MO=CUR==="USD"\?"pro_monthly_usd":"pro_monthly"/.test(espace), 'espace: plan mensuel USD = pro_monthly_usd');

// ── 2. Le plan mensuel USD doit exister côté serveur ─────────────────────────
const mollieLib = read('public/api/mollie-lib.php');
check(/'pro_monthly_usd'\s*=>\s*\[/.test(mollieLib), 'mollie-lib: plan pro_monthly_usd déclaré');
const usdPlanBlock = (mollieLib.match(/'pro_monthly_usd'\s*=>\s*\[([\s\S]*?)\]/) || [, ''])[1];
check(/'amount'\s*=>\s*89\.00/.test(usdPlanBlock), 'mollie-lib: montant mensuel USD = 89.00');
check(/'currency'\s*=>\s*'USD'/.test(usdPlanBlock), 'mollie-lib: devise USD');

// ── 3. Parité prix affiché / prix vendable (EN + ES) ────────────────────────
const nbsp = (s) => String(s).replace(/[  ]/g, ' ');
for (const lang of ['en', 'es']) {
  const pricing = read(`public/pro/${lang}/pricing/index.html`);
  check(/\$89\s*\/\s*(month|mes)/.test(pricing), `pricing ${lang}: 89 $/mois affiché`);
  const fixed = nbsp(fixTerritoryPrice(pricing));
  check(!/\$219/.test(fixed), `pricing ${lang}: palier $219 (non vendable) retiré`);
  check(/1 990 €\/(year|an)/.test(fixed), `pricing ${lang}: palier Territoire canonique 1 990 €/an`);
}

// ── 4. Réécriture des hôtes (canonical/og/liens) ────────────────────────────
const rewritten = rewriteHosts(read('public/pro/en/pricing/index.html'), { domain: 'sargassummiami.com', lang: 'en' });
check(!/https:\/\/sargasses-martinique\.com/.test(rewritten), 'rewrite: plus aucune URL absolue Martinique (EN)');
check(/https:\/\/sargassummiami\.com\/reliability\//.test(rewritten), 'rewrite: lien fiabilité EN → /reliability/ du domaine');
const switched = rewriteLanguageSwitcher(read('public/pro/en/index.html'));
check(/href="https:\/\/sargasses-martinique\.com\/pro\/"/.test(switched), 'rewrite: switcher FR → page FR des Antilles');
check(!/href="\/pro\/"/.test(switched), 'rewrite: plus de lien /pro/ auto-référent dans le hub EN');

// ── 5. Build régionalisé : hub dans la langue, démo par destination ─────────
function fakeDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-commercial-'));
  for (const rel of ['pro/en/index.html', 'pro/es/index.html', 'pro/en/pricing/index.html', 'pro/es/pricing/index.html', 'for-hotels/index.html']) {
    const dst = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(root, 'public', rel), dst);
  }
  return dir;
}
const region = (id, lang, domain, name) => {
  const real = JSON.parse(read(path.join('regions', `${id}.json`)));
  return { ...real, id, primaryLang: lang, domain, name, currency: lang === 'fr' ? 'EUR' : 'USD' };
};

for (const [id, lang, domain, name] of [
  ['florida', 'en', 'sargassummiami.com', 'Miami'],
  ['puntacana', 'en', 'sargassumpuntacana.com', 'Punta Cana'],
  ['rivieramaya', 'es', 'sargassumcancun.com', 'Cancún'],
  ['tulum', 'es', 'sargazotulum.com', 'Tulum'],
]) {
  const dir = fakeDist();
  const res = buildCommercialPages({ region: region(id, lang, domain, name), outDir: dir, publicDir: path.join(root, 'public') });
  const hub = fs.readFileSync(path.join(dir, 'pro', 'index.html'), 'utf8');
  check(hub.includes(`<html lang="${lang}"`), `${id}: /pro/ sert la langue ${lang}`);
  check(hub.includes(`rel="canonical" href="https://${domain}/pro/${lang}/"`), `${id}: canonical sur le domaine de la région`);
  check(!/href="https:\/\/sargasses-martinique\.com\/(?!pro\/")/.test(hub), `${id}: aucun CTA vers la Martinique`);
  check(hub.includes('href="/pro/demo/"'), `${id}: CTA démo présent sur le hub`);
  const demo = fs.readFileSync(path.join(dir, 'pro', 'demo', 'index.html'), 'utf8');
  check(demo.includes(`<html lang="${lang}"`), `${id}: démo dans la langue ${lang}`);
  check(demo.includes('/api/copernicus/sargassum.json'), `${id}: démo lue sur les données publiques du site`);
  check(demo.includes(`slaMinutes":${SLA_MINUTES}`), `${id}: démo — SLA 900 min appliqué`);
  check(/ageMin<=CFG\.slaMinutes/.test(demo), `${id}: démo — fraîcheur recalculée à l'affichage (fail-closed)`);
  check(demo.includes('href="/pro/espace/"'), `${id}: démo — CTA essai 30 j`);
  check(demo.includes(name), `${id}: démo — nom de la destination`);
  // Les noms réels de plages doivent être embarqués (un ID technique ne prouve rien).
  const regionFile = JSON.parse(read(path.join('regions', `${id}.json`)));
  const firstBeach = (regionFile.beaches || [])[0];
  if (firstBeach) {
    check(demo.includes(`"${firstBeach.id}":"${firstBeach.name}"`), `${id}: démo — nom réel de plage (${firstBeach.name})`);
    check(!new RegExp(`"${firstBeach.id}":"${firstBeach.id}"`).test(demo), `${id}: démo — pas d'ID technique affiché`);
  }
  const pricingPath = lang === 'fr' ? 'pro/pricing/index.html' : `pro/${lang}/pricing/index.html`;
  const pricing = fs.readFileSync(path.join(dir, pricingPath), 'utf8');
  check(!/\$219/.test(pricing), `${id}: tarifs sans palier non vendable`);
  const fh = fs.readFileSync(path.join(dir, 'for-hotels', 'index.html'), 'utf8');
  check(fh.includes(`rel="canonical" href="https://${domain}/for-hotels/"`), `${id}: /for-hotels/ canonique sur le domaine`);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(res.written.length >= 1, `${id}: fichiers écrits`);
}

// ── 6. Le module ne doit jamais déclencher de paiement ni d'envoi ───────────
const moduleSrc = read('scripts/lib/b2b-commercial-pages.cjs');
check(!/mollie\.com\/payment|create_payment|create_subscription/.test(moduleSrc), 'module: aucun appel de paiement');
check(!/smtp|sendMail|sendEmail/.test(moduleSrc), 'module: aucun envoi d’email');

// ── 7. Démo FR : formulation neutre (build MQ/GP partagé) ────────────────────
const demoFr = demoPage({ lang: 'fr', regionName: 'Martinique', regionId: 'mq', domain: 'sargasses-martinique.com', currency: 'EUR' });
check(demoFr.includes('Démo — vos plages en direct'), 'démo FR: titre neutre (build MQ/GP partagé)');
check(demoFr.includes('href="/pro/pricing/"'), 'démo FR: CTA tarifs FR');
check(!demoFr.includes('sur Martinique'), 'démo FR: aucune mention de l’île (build partagé)');

// ── 7-bis. Noms réels de plages embarqués dans la démo ──────────────────────
const beachNamesFr = buildBeachNames({ region: { id: 'mq' }, publicDir: path.join(root, 'public') });
check(beachNamesFr['grande-anse'] === "Grande Anse d'Arlet", 'noms plages MQ : Grande Anse d’Arlet');
check(beachNamesFr['gp-gosier'] === 'Plage du Gosier', 'noms plages GP : Plage du Gosier (build partagé MQ/GP)');
const beachNamesTu = buildBeachNames({ region: JSON.parse(read(path.join('regions', 'tulum.json'))), publicDir: path.join(root, 'public') });
check(beachNamesTu['tu001'] === 'Playa Paraíso', 'noms plages Tulum : Playa Paraíso');
check(!beachNamesTu['grande-anse'], 'noms plages Tulum : pas de plage MQ embarquée');

// ── 8. Segmentation / outreach : Tulum est une région USD/ES à part entière ─
const segment = require(path.join(root, 'scripts', 'automation', 'lib', 'b2b-segment.cjs'));
check(segment.regionOf('tulum') === 'tulum', 'segment: regionOf("tulum") = tulum');
check(segment.regionOf('TU') === 'tulum', 'segment: regionOf("TU") = tulum');
check(segment.regionOf('mq') === 'mq' && segment.regionOf('gp') === 'gp', 'segment: MQ/GP inchangés');
check(segment.SLA_MINUTES === 900, 'segment: SLA de fraîcheur = 900 min (jamais abaissé)');
check(segment.SLA_MINUTES === SLA_MINUTES, 'segment: SLA identique à celui de la démo (parité)');
const fresh = segment.historyFreshness('mq');
check(typeof fresh.fresh === 'boolean', 'segment: historyFreshness retourne un verdict');
check(fresh.ageMinutes >= 0 || fresh.ageMinutes === Infinity, 'segment: âge de l’historique mesuré');
// Le dépôt contient un historique périmé (> SLA) : le hook de données doit alors
// être null (fail-closed) — aucune affirmation de donnée dans les emails.
const hookStale = segment.dataHook({ island: 'mq', town: 'Le Diamant' }, 'hotel');
if (fresh.fresh) check(hookStale !== null, 'segment: hook produit quand l’historique est frais');
else check(hookStale === null, 'segment: hook null quand l’historique dépasse le SLA (fail-closed)');

const outreach = require(path.join(root, 'scripts', 'automation', 'b2b-cold-outreach.cjs'));
check(outreach.domainFor({ island: 'tulum' }) === 'sargazotulum.com', 'outreach: domainFor(tulum) = sargazotulum.com');
check(outreach.domainFor({ island: 'TU' }) === 'sargazotulum.com', 'outreach: domainFor(TU) = sargazotulum.com');
check(outreach.localeFor({ island: 'tulum' }) === 'es', 'outreach: localeFor(tulum) = es');
check(outreach.localeFor({ island: 'florida' }) === 'en', 'outreach: localeFor(florida) = en');
check(outreach.localeFor({ island: 'mq' }) === 'fr', 'outreach: localeFor(mq) = fr');

// ── 9. Le registre commercial ne doit jamais déclencher d'envoi ─────────────
const registrySrc = read('scripts/automation/b2b-registry.cjs');
check(!/sendEmail\(|smtp/i.test(registrySrc), 'registre: aucun envoi d’email');
check(/STATUSES\s*=\s*\['sent',\s*'replied',\s*'interested',\s*'demo',\s*'quote',\s*'won',\s*'lost'\]/.test(registrySrc), 'registre: 7 statuts de la mission');
check(/manualRow\.status/.test(registrySrc), 'registre: le statut manuel est prioritaire (jamais écrasé)');

// Masquage PII : le dépôt est PUBLIC → ni la partie locale ni le domaine
// ne doivent rester lisibles dans le résumé versionné.
const registry = require(path.join(root, 'scripts', 'automation', 'b2b-registry.cjs'));
const masked = registry.maskEmail('contact@bik-karaib.com');
check(!masked.includes('contact'), 'registre: la partie locale est masquée');
check(!masked.includes('bik-karaib'), 'registre: le domaine est masqué');
check(masked.endsWith('.com'), 'registre: le TLD public reste lisible');
const registryDoc = read('docs/B2B_REGISTRY.md');
check(!/[a-zA-Z0-9._%-]+@(bik-karaib|anoli-lodges|kawann-beach-hotel|diamant-les-bains)\./i.test(registryDoc), 'registre versionné: aucun domaine d’établissement en clair');
check(!/\| [a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(registryDoc), 'registre versionné: aucune adresse complète en clair');

console.log(failures === 0 ? '\nPASS b2b-commercial-conversion' : `\nFAIL b2b-commercial-conversion (${failures})`);
process.exit(failures === 0 ? 0 : 1);
