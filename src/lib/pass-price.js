// CONTRAT PRIX PASS B2C (one-time) — miroir STRICT du serveur public/api/mollie.php :
//   allowlist anti-tamper  p30 → EUR 14.99 / USD 11.99   (validation AVANT surcharge)
//   surcharge saison USD   +15 % juin→novembre (hors trip7), appliquée AU DÉBIT
// → le payload envoyé au serveur reste le prix de BASE ; seul l'AFFICHAGE reflète
//   la surcharge. Moat = honnêteté : le prix affiché doit être le prix débité.
// Toute modif serveur (mollie.php) doit être répercutée ici — test de contrat :
// tests/unit/pass-money-contract.test.cjs échoue si les deux côtés divergent.

export const PASS_CENTS = { eur: 1499, usd: 1199 }

// month (1-12) injectable pour les tests ; défaut = mois courant (comme date('n') PHP).
export const seasonalCents = (cents, cur, month) => {
  if (cur !== "usd") return cents
  const m = month || (new Date().getMonth() + 1)
  return (m >= 6 && m <= 11) ? Math.round(cents * 1.15) : cents
}
