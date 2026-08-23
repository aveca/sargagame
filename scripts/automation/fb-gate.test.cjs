// Regression test for the fb-draft-replies honesty gate.
// Run: node scripts/automation/_test-fb-gate.cjs  (exit 1 on any leak/wrong gate)
// Guards the invariant: a satellite condition is asserted ONLY for a beach with a
// real reading in sargassum.json; untracked/arrival → honest, no fabricated status.
// Cases below include every confirmed leak from the adversarial review (substring
// collisions, commune-name mis-attribution, partial-word matches).
const fs = require('fs')
const path = require('path')
const { buildDraft } = require('./fb-draft-replies.cjs')

const sarg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'api', 'copernicus', 'sargassum.json'), 'utf-8'))
const beaches = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'data', 'beaches-list.json'), 'utf-8'))
const blist = Array.isArray(beaches) ? beaches : (beaches.beaches || [])
function makeCtx(readingOverrides = {}) {
  const reading = new Map((sarg.levels || []).map(l => [l.id, { status: l.status, score: l.score }]))
  for (const [id, v] of Object.entries(readingOverrides)) reading.set(id, { ...reading.get(id), ...v })
  return { levels: sarg.levels || [], beachById: new Map(blist.map(b => [b.id, b])), reading }
}
const ctx = makeCtx()

// Status words that may ONLY appear about the primary beach in the TRACKED branch.
const STATUS_WORDS = ['rien de marquant', 'modéré', 'bien présent', 'très présent']

const CASES = [
  // --- legit tracked ---
  { label: 'Anse Mitan (clean)', post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Mitan', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: "Grande Anse d'Arlet", post: { beachId: 'a', island: 'mq', beachMentioned: "Grande Anse d'Arlet", inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Le Gosier (gp)', post: { beachId: 'a', island: 'gp', beachMentioned: 'Le Gosier', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Sainte-Anne (mq)', post: { beachId: 'a', island: 'mq', beachMentioned: 'Sainte-Anne', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Sainte-Anne (gp)', post: { beachId: 'a', island: 'gp', beachMentioned: 'Sainte-Anne', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Malendure', post: { beachId: 'a', island: 'gp', beachMentioned: 'Malendure', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Vieux-Fort (gp exact)', post: { beachId: 'a', island: 'gp', beachMentioned: 'Vieux-Fort', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Tartane', post: { beachId: 'a', island: 'mq', beachMentioned: 'Tartane', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Les Salines', post: { beachId: 'a', island: 'mq', beachMentioned: 'Les Salines', inferredStatus: 'clean' }, gate: 'tracked' },
  { label: 'Anse Noire', post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Noire', inferredStatus: 'clean' }, gate: 'tracked' },
  // --- confirmed leaks from review: MUST be untracked-honest now ---
  { label: 'Le Marin (commune)', post: { beachId: 'a', island: 'mq', beachMentioned: 'Le Marin', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'La Marina du Marin', post: { beachId: 'a', island: 'mq', beachMentioned: 'La Marina du Marin', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'plongée sous-marine', post: { beachId: 'a', island: 'mq', beachMentioned: 'Club de plongée sous-marine', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'la marina', post: { beachId: 'a', island: 'mq', beachMentioned: 'la marina', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: "Petite Anse d'Arlet", post: { beachId: 'a', island: 'mq', beachMentioned: "Petite Anse d'Arlet", inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Petit-Havre (Gosier)', post: { beachId: 'a', island: 'gp', beachMentioned: 'Petit-Havre (Gosier)', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Petite Plage Malendure', post: { beachId: 'a', island: 'gp', beachMentioned: 'Petite Plage Malendure', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Bas-du-Fort Sud', post: { beachId: 'a', island: 'gp', beachMentioned: 'Plage de Bas-du-Fort Sud', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Vieux-Fort (Sainte-Rose)', post: { beachId: 'a', island: 'gp', beachMentioned: 'Vieux-Fort (Sainte-Rose)', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Anse de Vieux-Fort (MG)', post: { beachId: 'a', island: 'gp', beachMentioned: 'Anse de Vieux-Fort (MG)', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'La Grande Anse (Deshaies)', post: { beachId: 'a', island: 'gp', beachMentioned: 'La Grande Anse (Deshaies)', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Plage Gosierville', post: { beachId: 'a', island: 'gp', beachMentioned: 'Plage Gosierville', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Diamantine Beach Bar', post: { beachId: 'a', island: 'mq', beachMentioned: 'Diamantine Beach Bar', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Le Vauclinois', post: { beachId: 'a', island: 'mq', beachMentioned: 'Le Vauclinois', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Tartane Surf Camp', post: { beachId: 'a', island: 'mq', beachMentioned: 'Tartane Surf Camp', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Pointe des Salines', post: { beachId: 'a', island: 'mq', beachMentioned: 'Pointe des Salines', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Cap Salines', post: { beachId: 'a', island: 'mq', beachMentioned: 'Cap Salines', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Plage du Bourg (Sainte-Anne)', post: { beachId: 'a', island: 'mq', beachMentioned: 'Plage du Bourg (Sainte-Anne)', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'free-text madame', post: { beachId: 'a', island: 'mq', beachMentioned: 'jai vu madame sur la plage', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Anse Madame Lurel', post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Madame Lurel', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  // --- real untracked beaches ---
  { label: 'Anse Figuier', post: { beachId: 'mq009', island: 'mq', beachMentioned: 'Anse Figuier', inferredStatus: 'clean' }, gate: 'untracked-honest' },
  { label: 'Petite Terre islet', post: { beachId: 'gp120', island: 'gp', beachMentioned: 'Île de la Petite Terre', inferredStatus: 'moderate' }, gate: 'untracked-honest' },
  // --- arrival / op-sees-more on a tracked-clean beach (must NOT assert clean) ---
  { label: 'Anse Mitan + avoid report', post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Mitan', inferredStatus: 'avoid' }, gate: 'tracked-arrival-honest' },
  { label: 'Anse Mitan + alert report', post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Mitan', inferredStatus: 'alert' }, gate: 'tracked-arrival-honest' },
  { label: 'Anse Mitan + moderate report', post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Mitan', inferredStatus: 'moderate' }, gate: 'tracked-arrival-honest' },
]

// Injected-reading cases: tracked beach whose OUR satellite status is non-clean.
const INJECTED = [
  { label: 'Anse Mitan our=moderate, op=clean → tracked modéré', overrides: { 'anse-mitan': { status: 'moderate' } }, post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Mitan', inferredStatus: 'clean' }, gate: 'tracked', mustContain: 'modéré' },
  { label: 'Anse Mitan our=moderate, op=avoid → tracked (no contradiction)', overrides: { 'anse-mitan': { status: 'moderate' } }, post: { beachId: 'a', island: 'mq', beachMentioned: 'Anse Mitan', inferredStatus: 'avoid' }, gate: 'tracked', mustContain: 'modéré' },
]

let pass = 0, fail = 0
function check(label, d, expectGate, mustContain) {
  const gateOk = d && d.honestyGate === expectGate
  const isHonest = expectGate !== 'tracked'
  const leak = isHonest && STATUS_WORDS.some(w => d && d.text.includes(w))
  const containOk = !mustContain || (d && d.text.includes(mustContain))
  const ok = gateOk && !leak && containOk
  console.log(`${ok ? '✓' : '✗'} ${label}  [gate=${d?.honestyGate}${leak ? ' ⚠️LEAK' : ''}${!containOk ? ' ⚠️missing:' + mustContain : ''}]`)
  if (!ok) console.log(`      ${d?.text}`)
  ok ? pass++ : fail++
}
for (const c of CASES) check(c.label, buildDraft(c.post, ctx), c.gate)
for (const c of INJECTED) check(c.label, buildDraft(c.post, makeCtx(c.overrides)), c.gate, c.mustContain)

// Exhaustive sweep: every real beach × every status. The security invariant is
// that NO honest/arrival draft ever asserts a status word about the primary beach.
let leaks = 0, scanned = 0
for (const b of blist) {
  for (const st of ['clean', 'moderate', 'avoid', 'alert']) {
    const d = buildDraft({ beachId: b.id, island: b.island, beachMentioned: b.name, inferredStatus: st }, ctx)
    if (!d) continue
    scanned++
    if (d.honestyGate !== 'tracked' && STATUS_WORDS.some(w => d.text.includes(w))) {
      leaks++
      console.log(`✗ LEAK: ${b.id} "${b.name}" [${st}] gate=${d.honestyGate} :: ${d.text}`)
    }
  }
}
console.log(`${leaks === 0 ? '✓' : '✗'} exhaustive sweep: ${scanned} drafts scanned, ${leaks} status-word leak(s) on honest/arrival paths`)
leaks === 0 ? pass++ : fail++

console.log(`\n${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
