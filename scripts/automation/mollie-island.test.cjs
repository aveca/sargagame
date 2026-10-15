#!/usr/bin/env node
/**
 * mollie-island.test.cjs — Mission attribution : agrégation Mollie par île+devise.
 *
 * Audit : `mollie.php` ne pose JAMAIS metadata.island ; SOSPlage envoie
 * metadata.beach (beach.id). L'attribution DÉRIVE de beach.id (beaches-list +
 * listes inline régions), jamais devinée (description, montant, email).
 *
 * Fixtures 100 % synthétiques (aucune transaction réelle, aucune clé, aucun
 * email réel — domaine .invalid). Politique testée : paid-only, fenêtre 30 j,
 * testHorsCollecté, doublons dédupliqués, devises jamais converties, nets =
 * payé − remboursé − chargebacké, non-attribué séparé, période documentée.
 */
'use strict';
const { aggregateMollieByIsland, resolveIsland } = require('./lib/mollie-island.cjs');

let failures = 0;
let count = 0;
function record(name, ok, extra) {
  count++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}
const NOW = Date.parse('2026-10-10T12:00:00Z');
const SINCE = NOW - 30 * 864e5;
const iso = (d) => new Date(d).toISOString();
const P = (o) => ({
  id: o.id, status: o.status || 'paid', createdAt: o.createdAt || iso(NOW - 864e5),
  amount: { currency: o.cur || 'EUR', value: o.val },
  amountRefunded: o.ref ? { value: o.ref } : undefined,
  amountChargedBack: o.cb ? { value: o.cb } : undefined,
  metadata: o.meta || {}, description: o.desc || 'Sargasses Pass', mode: o.mode,
  testmode: o.testmode,
});
const run = (list) => aggregateMollieByIsland(list, { sinceMs: SINCE, nowMs: NOW });

console.log('mollie-island : attribution par île+devise (fixtures)\n');

// A1 — six domaines + barbados, via metadata.beach (source SOS réelle)
{
  const r = run([
    P({ id: 'pmt_mq1', val: '7.99', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_gp1', val: '7.99', meta: { beach: 'gp001' } }),
    P({ id: 'pmt_fl1', val: '5.99', cur: 'USD', meta: { beach: 'fl001' } }),
    P({ id: 'pmt_pc1', val: '11.99', cur: 'USD', meta: { beach: 'pc001' } }),
    P({ id: 'pmt_rm1', val: '5.99', cur: 'USD', meta: { beach: 'rm001' } }),
    P({ id: 'pmt_tu1', val: '5.99', cur: 'USD', meta: { beach: 'tu001' } }),
    P({ id: 'pmt_bb1', val: '9.99', cur: 'USD', meta: { beach: 'bb001' } }),
  ]);
  const got = Object.keys(r.byIsland).sort().join(',');
  record('A1 six domaines + barbados attribués via beach.id', got === 'barbados,florida,gp,mq,puntacana,rivieramaya,tulum', got);
  record('A1b montants par devise non convertis (mq EUR 7.99, florida USD 5.99)',
    r.byIsland.mq.paid.EUR.total === 7.99 && r.byIsland.florida.paid.USD.total === 5.99,
    `mq=${JSON.stringify(r.byIsland.mq.paid)} fl=${JSON.stringify(r.byIsland.florida.paid)}`);
}

// A2 — devises mixtes, remboursements, chargebacks, nets
{
  const r = run([
    P({ id: 'pmt_a', val: '7.99', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_b', val: '14.99', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_c', val: '7.99', ref: '7.99', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_d', val: '11.99', cur: 'USD', cb: '11.99', meta: { beach: 'fl001' } }),
  ]);
  const mq = r.byIsland.mq, fl = r.byIsland.florida;
  record('A2a mq EUR : 3 payés 30.97, 1 refund 7.99, net 22.98',
    mq.paid.EUR.count === 3 && mq.paid.EUR.total === 30.97
    && mq.refunded.count === 1 && mq.refunded.total.EUR === 7.99
    && mq.net.EUR.count === 3 && mq.net.EUR.total === 22.98,
    `paid=${JSON.stringify(mq.paid.EUR)} net=${JSON.stringify(mq.net.EUR)}`);
  record('A2b florida USD : chargeback intégral => net 0',
    fl.chargedBack.count === 1 && fl.chargedBack.total.USD === 11.99 && fl.net.USD.total === 0,
    `net=${JSON.stringify(fl.net.USD)}`);
}

// A3 — sans île / île inconnue / plage inconnue => non attribué, jamais inventé
{
  const r = run([
    P({ id: 'pmt_nometa', val: '7.99' }),
    P({ id: 'pmt_badisland', val: '7.99', meta: { island: 'XX' } }),
    P({ id: 'pmt_badbeach', val: '5.99', cur: 'USD', meta: { beach: 'zz999' } }),
  ]);
  const u = r.unattributed;
  record('A3a 3 paiements sans attribution => bucket unattributed (2 EUR + 1 USD)',
    (u.paid.EUR || {}).count === 2 && (u.paid.USD || {}).count === 1, JSON.stringify(u.paid));
  record('A3b aucune île créée pour XX/zz999 (pas d invention)',
    !r.byIsland.XX && Object.keys(r.byIsland).length === 0, `îles=${Object.keys(r.byIsland)}`);
  record('A3c plage inconnue listée (transparence, sans bloquer)',
    JSON.stringify(r.unmappedBeachIds) === JSON.stringify(['zz999']), JSON.stringify(r.unmappedBeachIds));
}

// A4 — doublons dédupliqués (même id deux fois)
{
  const r = run([
    P({ id: 'pmt_dup', val: '7.99', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_dup', val: '7.99', meta: { beach: 'mq001' } }),
  ]);
  record('A4 doublon compté une fois + duplicates:1',
    r.byIsland.mq.paid.EUR.count === 1 && r.duplicates === 1, `count=${r.byIsland.mq.paid.EUR.count} dup=${r.duplicates}`);
}

// A5 — paiements de TEST séparés (mode + testmode), hors collecté
{
  const r = run([
    P({ id: 'pmt_live', val: '7.99', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_t1', val: '7.99', mode: 'test', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_t2', val: '5.99', cur: 'USD', testmode: true, meta: { beach: 'fl001' } }),
  ]);
  record('A5a test isolés (2) hors collecté (mq=1 seul)',
    r.test.count === 2 && r.byIsland.mq.paid.EUR.count === 1 && !r.byIsland.florida,
    `test=${r.test.count} mq=${r.byIsland.mq.paid.EUR.count}`);
  record('A5b totaux test par devise, sans conversion',
    r.test.totals.EUR.total === 7.99 && r.test.totals.USD.total === 5.99, JSON.stringify(r.test.totals));
}

// A6 — cohérence globale : sommes îles+unattributed == totaux attendus
{
  const list = [
    P({ id: 'pmt_1', val: '7.99', meta: { beach: 'mq001' } }),
    P({ id: 'pmt_2', val: '14.99', meta: { beach: 'gp001' } }),
    P({ id: 'pmt_3', val: '5.99', cur: 'USD' }),
    P({ id: 'pmt_old', val: '99.99', createdAt: iso(SINCE - 864e5), meta: { beach: 'mq001' } }),
    P({ id: 'pmt_open', val: '7.99', status: 'open', meta: { beach: 'mq001' } }),
  ];
  const r = run(list);
  const sum = {};
  const add = (m) => { for (const [c, v] of Object.entries(m || {})) sum[c] = Math.round(((sum[c] || 0) + v.total) * 100) / 100; };
  for (const code of Object.keys(r.byIsland)) add(r.byIsland[code].paid);
  add(r.unattributed.paid);
  record('A6 fenêtre+statuts respectés, totaux cohérents (EUR 22.98, USD 5.99)',
    sum.EUR === 22.98 && sum.USD === 5.99 && r.byIsland.mq && !r.byIsland.mq.paid.USD,
    `sommes=${JSON.stringify(sum)}`);
}

// A7 — metadata.island explicite prioritaire sur beach (direct > dérivé)
{
  const r = resolveIsland({ metadata: { island: 'GP', beach: 'mq001' } });
  record('A7 island explicite prioritaire (GP malgré beach mq001)', r.island === 'gp', r.island);
  const r2 = resolveIsland({ metadata: { island: 'MQ' } });
  record('A7b normalisation casse (MQ => mq)', r2.island === 'mq');
}

// A8 — b2b par île (même heuristique que le bloc global)
{
  const r = run([
    P({ id: 'pmt_b2b', val: '79.00', meta: { beach: 'fl001', plan: 'pro_annual' } }),
    P({ id: 'pmt_b2c', val: '7.99', meta: { beach: 'fl001' } }),
  ]);
  record('A8 b2b compté sur l île (florida b2b:1)', r.byIsland.florida.b2b === 1, `b2b=${r.byIsland.florida.b2b}`);
}

// A9 — période documentée + RGPD (aucun email en clair dans la sortie)
{
  const r = run([P({ id: 'pmt_e', val: '7.99', meta: { beach: 'mq001', email: 'acheteur@example.invalid' } })]);
  const dump = JSON.stringify(r);
  record('A9a période couverte + fraîcheur documentées',
    r.period.windowDays === 30 && typeof r.period.from === 'string' && typeof r.period.to === 'string'
    && r.period.generatedAt && r.period.source === 'mollie-api', `from=${r.period.from}`);
  record('A9b aucun email en clair (hash8 uniquement)',
    !dump.includes('@') && !dump.includes('acheteur') && r.byIsland.mq.payers.length === 1, `payers=${JSON.stringify(r.byIsland.mq.payers)}`);
}

console.log(`\n${count - failures}/${count} scénarios conformes`);
process.exit(failures ? 1 : 0);
