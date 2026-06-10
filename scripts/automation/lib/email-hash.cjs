/**
 * email-hash.cjs — RGPD: hash SHA-256 (tronqué 128 bits) des emails
 * pour l'état persisté dans le repo public. Normalise trim+lowercase
 * avant hash pour que la dédup survive aux variations de casse.
 */
const { createHash } = require('crypto')
const emailHash = e => createHash('sha256').update(String(e).trim().toLowerCase()).digest('hex').slice(0, 32)
module.exports = { emailHash }
