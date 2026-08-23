// Regression test for the fb-post-card « Participation review » gate detector.
// Run: node scripts/automation/fb-review-gate.test.cjs   (exit 1 on any wrong verdict)
//
// Invariant : detectParticipationReview() returns a non-null excerpt iff a POST-time
// participation gate is on screen (rules to tick + membership question → post NOT
// submitted, human required). It must NOT fire on a clean composer, an empty page, a
// group name that merely contains "questions", or a moderated "pending admin approval"
// notice (there the post WAS submitted — not a failure). Doctrine: we never fill these.
const { detectParticipationReview } = require('./lib/fb-review-gate.cjs')

// dialogs = array of { text, hasTextbox } as collected from visible role=dialog nodes.
const CASES = [
  // ── MUST DETECT (gate before submission → post held) ──────────────────────────
  { label: 'EN full modal (observed PC group)', expect: true, dialogs: [{
    text: 'Participation review\nGroup rules from the admins\n1. Be respectful\n2. No spam\nI agree to the group rules\nWhen are you going to travel to Punta Cana?\nSubmit',
    hasTextbox: true }] },
  { label: 'EN title only', expect: true, dialogs: [{ text: 'Participation review', hasTextbox: true }] },
  { label: 'EN agree-to-rules', expect: true, dialogs: [{ text: 'Pending posts\nI agree to the group rules', hasTextbox: true }] },
  { label: 'EN answer-question-to-post', expect: true, dialogs: [{ text: 'Answer the following question to post in this group', hasTextbox: true }] },
  { label: 'FR examen participation', expect: true, dialogs: [{ text: "Examen de la participation\nJ'accepte les règles du groupe\nQuand voyagez-vous ?", hasTextbox: true }] },
  { label: 'ES revisión participación', expect: true, dialogs: [{ text: 'Revisión de participación\nAcepto las reglas del grupo\n¿Cuándo viajas a Cancún?', hasTextbox: true }] },
  { label: 'secondary heuristic (textbox + membership question)', expect: true, dialogs: [{ text: 'Please answer this membership question before your post is shared.', hasTextbox: true }] },
  { label: 'gate hidden behind a benign first dialog', expect: true, dialogs: [
    { text: 'Notifications', hasTextbox: false },
    { text: 'Participation review\nI agree to the group rules\nWhen are you traveling?', hasTextbox: true } ] },

  // ── MUST NOT DETECT ───────────────────────────────────────────────────────────
  { label: 'empty (no dialogs = composer closed clean)', expect: false, dialogs: [] },
  { label: 'null guard', expect: false, dialogs: null },
  { label: 'clean composer still open', expect: false, dialogs: [{ text: 'Create a public post\nMon super texte de plage\nAdd to your post\nPhoto/Video\nPost', hasTextbox: true }] },
  { label: 'moderated PENDING approval (post WAS submitted)', expect: false, dialogs: [{ text: "Your post is pending approval. It will be reviewed by an admin before it's visible to the group.", hasTextbox: false }] },
  { label: 'pending — "will be reviewed by the admins"', expect: false, dialogs: [{ text: 'Done. Your post will be reviewed by the admins before it appears.', hasTextbox: false }] },
  { label: 'group name contains "questions"', expect: false, dialogs: [{ text: 'Punta Cana Travel-questions', hasTextbox: false }] },
  { label: 'group name in composer textbox dialog', expect: false, dialogs: [{ text: 'Punta Cana Travel-questions\nWhat’s on your mind?\nPost', hasTextbox: true }] },
  { label: 'sidebar "Group rules" heading, no textbox/no-admins', expect: false, dialogs: [{ text: 'Group rules', hasTextbox: false }] },
]

let pass = 0, fail = 0
for (const c of CASES) {
  const hit = detectParticipationReview(c.dialogs)
  const ok = c.expect ? !!hit : !hit
  console.log(`${ok ? '✓' : '✗'} ${c.label}  [detected=${!!hit}${hit ? ' :: ' + hit.slice(0, 60) : ''}]`)
  ok ? pass++ : fail++
}

console.log(`\n${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
