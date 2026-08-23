/**
 * email-ab.cjs — A/B des emails, déterministe par destinataire.
 *
 * pickArm(testKey, email) renvoie 'A' (control) ou 'B' (challenger) de façon
 * STABLE : le même destinataire reçoit toujours le même bras pour un test donné
 * (pas de flip entre J+7 et J+14, pas de re-tirage entre runs). Le testKey isole
 * chaque expérience (ex 'subj_welcome_v1') → des tests différents ne se corrèlent
 * pas sur les mêmes users.
 *
 * Pas de PII persistée : l'assignation est recalculée à la volée depuis le hash.
 * Le bras est loggé dans l'email_tracking (ab_test/ab_arm) → l'éval mesure la
 * conversion par bras (les VRAIS users tranchent, cf. doctrine "goût = A/B live").
 */
const { createHash } = require('crypto')

function pickArm(testKey, email, arms = ['A', 'B']) {
  const h = createHash('sha256').update(`${testKey}|${String(email).trim().toLowerCase()}`).digest('hex')
  const n = parseInt(h.slice(0, 8), 16)
  return arms[n % arms.length]
}

/**
 * Applique un challenger sur les champs choisis si le bras est 'B'.
 * @param arm     'A' | 'B'
 * @param base    objet copy de base (control) — { subject, preheader, ... }
 * @param chal    challenger { subject?, preheader?, headline?, body?, cta? }
 * @param fields  champs à remplacer en bras B (défaut: subject + preheader)
 * @returns       copie fusionnée (control inchangé en bras A)
 */
function applyArm(arm, base, chal, fields = ['subject', 'preheader']) {
  if (arm !== 'B' || !chal) return { ...base }
  const out = { ...base }
  for (const f of fields) if (chal[f] != null && chal[f] !== '') out[f] = chal[f]
  return out
}

module.exports = { pickArm, applyArm }
