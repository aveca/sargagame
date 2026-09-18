'use strict'
// G1 — migration capture leads Apps Script → Supabase (`b2c_alerts`).
// Couvre : vocabulaire région/domaine (miroir LeadCapture.jsx), construction de
// ligne (email normalisé, invalides → null, jamais de PII autre que l'email),
// dispatch submitLeadToSupabase (fire-and-forget, jamais de throw).
// Le module src est ESM → import dynamique.

let fails = 0
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg) }
  else { fails++; console.error('  ✗ ' + msg) }
}

;(async () => {
  const m = await import('../../src/supabasePhotos.js')
  const { leadDomain, leadRegionCode, buildB2CLeadRow, submitLeadToSupabase } = m

  console.log('supabase-leads — vocabulaire (miroir LeadCapture.jsx)')
  ok(leadDomain('www.sargasses-martinique.com') === 'sargasses-martinique.com', 'domaine : www strippé')
  ok(leadDomain('sargasses-guadeloupe.com') === 'sargasses-guadeloupe.com', 'domaine : inchangé sinon')
  ok(leadDomain('') === '', 'domaine : vide → vide (comme LeadCapture)')
  ok(leadRegionCode('sargasses-martinique.com') === 'mq', 'région : martinique → mq')
  ok(leadRegionCode('www.sargasses-guadeloupe.com') === 'gp', 'région : guadeloupe → gp')
  ok(leadRegionCode('sargassumcancun.com') === 'mx', 'région : cancun → mx')
  ok(leadRegionCode('sargassumtulum.com') === 'mx', 'région : tulum → mx')
  ok(leadRegionCode('sargassumpuntacana.com') === 'do', 'région : puntacana → do')
  ok(leadRegionCode('sargassummiami.com') === 'us', 'région : miami → us')
  ok(leadRegionCode('sargassumbarbados.com') === 'unknown', 'région : barbados → unknown (parité LeadCapture)')
  ok(leadRegionCode('localhost') === 'unknown', 'région : inconnu → unknown')

  console.log('supabase-leads — buildB2CLeadRow')
  {
    const r = buildB2CLeadRow('  Test@Example.COM ', 'sargasses-martinique.com')
    ok(r && r.email === 'test@example.com', 'email trim + lowercase')
    ok(r && r.region === 'mq' && r.domain === 'sargasses-martinique.com', 'region/domain du hostname')
    ok(r && Array.isArray(r.beaches) && r.beaches.length === 0 && r.status === 'active', 'forme LeadCapture (beaches [], status active)')
    ok(r && Object.keys(r).sort().join(',') === 'beaches,domain,email,region,status', 'aucune colonne hors contrat b2c_alerts')
  }
  ok(buildB2CLeadRow('', 'sargasses-martinique.com') === null, 'email vide → null (jamais de ligne vide)')
  ok(buildB2CLeadRow('pas-un-email', 'sargasses-martinique.com') === null, 'sans @ → null')
  ok(buildB2CLeadRow(null, 'sargasses-martinique.com') === null, 'null → null')
  ok(buildB2CLeadRow('a@b.co', 'sargasses-guadeloupe.com').region === 'gp', 'GP de bout en bout')

  console.log('supabase-leads — submitLeadToSupabase (sans réseau : no-op node)')
  ok(submitLeadToSupabase('not-an-email') === false, 'invalide → false, rien dispatché')
  ok(submitLeadToSupabase('') === false, 'vide → false')
  // En node (hors navigateur) : fetch relatif rejeté en async (catché) → true = dispatch tenté, jamais de throw.
  ok(submitLeadToSupabase('ok@example.com') === true, 'valide → true (dispatch tenté, fire-and-forget)')

  console.log(`\nsupabase-leads : ${fails === 0 ? 'OK' : fails + ' ÉCHEC(S)'}`)
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error('  ✗ harness: ' + (e && e.message || e)); process.exit(1) })
