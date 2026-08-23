/**
 * fb-review-gate.cjs — détecteur du gate « Participation review » au POST Facebook.
 *
 * Certains groupes (surtout les groupes voyage Punta Cana / Cancún) ouvrent, APRÈS le
 * clic « Post », un modal d'examen de participation : il faut cocher les règles du
 * groupe + répondre à une question d'adhésion (« When are you going to travel to Punta
 * Cana? ») puis « Submit » AVANT que le post soit réellement soumis. Le composer se
 * cache → un publisher naïf croit à tort que c'est publié alors que le post est
 * retenu/abandonné.
 *
 * Doctrine du repo : on NE coche/remplit/répond JAMAIS ces gates — on n'invente jamais
 * les réponses aux questions d'adhésion/participation (cf. fb-join-groups.cjs qui
 * flagge déjà `questions` sans remplir). On détecte seulement et on remonte
 * « réponse humaine requise ».
 *
 * Vu le 2026-06-22 sur 264786824583749 (Punta Cana Travel-questions) et
 * 309184997053112 (Punta Cana - Tips). Cf. mémoire reference_fb_publisher.md.
 *
 * ⚠️ NE PAS confondre avec « post en attente d'approbation admin » (groupe modéré) :
 * là, le post EST bien soumis — ce n'est pas un échec et NE doit PAS matcher ici. Les
 * marqueurs ci-dessous visent le gate AVANT soumission, pas un « pending/reviewed by
 * an admin » APRÈS soumission.
 */

// Le compte .fb-session est en ANGLAIS (le locale fr-FR de Playwright n'override pas la
// langue du compte) → marqueurs EN d'abord, + FR/ES pour les groupes bilingues PC/MX.
const REVIEW_RE = /Participation review|Examen de la participation|Examen des participations|Revisi[oó]n de (la )?participaci[oó]n|Group rules from the admins|R[èe]gles du groupe (d[ée]finies|de la part)|Reglas del grupo (de|por) los? (administrador|admin)|I agree to the group rules|J.?accepte les r[èe]gles du groupe|Acepto las reglas del grupo|Answer .{0,40}questions?.{0,40} to (join|post|participate)|R[ée]pond(re|ez) .{0,60}(avant de publier|pour publier)/i

// Heuristique secondaire : un textbox de question d'adhésion DANS un dialog accompagné
// d'un libellé règles/question (le composer, lui, est déjà caché à ce stade).
const RULES_Q_RE = /(group rules|r[èe]gles? du groupe|reglas del grupo|membership question|question d.?adh[ée]sion)/i

function excerpt(txt) {
  return String(txt || '').replace(/\s+/g, ' ').trim().slice(0, 200)
}

/**
 * @param {Array<{text?:string, hasTextbox?:boolean}>} dialogs  dialogs VISIBLES (role=dialog)
 *   collectés après le clic « Post ». Chacun : { text: innerText, hasTextbox: bool }.
 * @returns {string|null}  extrait du modal si un gate de participation est détecté
 *   (= post NON soumis, réponse humaine requise), sinon null.
 */
function detectParticipationReview(dialogs) {
  for (const d of dialogs || []) {
    const txt = (d && d.text) || ''
    if (REVIEW_RE.test(txt)) return excerpt(txt)
    if (d && d.hasTextbox && RULES_Q_RE.test(txt)) return excerpt(txt)
  }
  return null
}

module.exports = { REVIEW_RE, RULES_Q_RE, detectParticipationReview, excerpt }
