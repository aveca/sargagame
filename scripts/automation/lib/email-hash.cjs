/**
 * email-hash.cjs — RGPD: hash SHA-256 (tronqué 128 bits) des emails
 * pour l'état persisté dans le repo public. Normalise trim+lowercase
 * avant hash pour que la dédup survive aux variations de casse.
 */
const { createHash } = require('crypto')
const emailHash = e => createHash('sha256').update(String(e).trim().toLowerCase()).digest('hex').slice(0, 32)
// Identifiant de LOG (RGPD) : les logs GitHub Actions d'un repo public sont
// lisibles par tous (~90 j) — JAMAIS d'email en clair dedans (fuite confirmée
// audit 2026-06-12). hash8 = corrélable aux fichiers d'état (mêmes 8 premiers
// hex de emailHash), zéro PII.
const logId = e => emailHash(e).slice(0, 8)
module.exports = { emailHash, logId }
