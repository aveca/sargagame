# Plan produit — 2 phases (décision fondateur 2026-06-28)

Filtre fondateur (constant) : **automatisé, ~0 travail récurrent, scalable à ~€10k, tech/data,
acquisition non-spammy.** Pas de cold-email-SMB (rejeté), pas d'affiliation (rejetée), pas de
SEO-from-zero.

## PHASE 1 (maintenant → ~1-2 mois max) : Bump-ifier l'app sargasses
Rendre l'app actuelle **beaucoup plus attractive** (B2C ET B2B) en s'inspirant du design
Bump/Zenly : carte vivante, bulles-plages avec avatar + score + statut coloré, micro-animations
springy, UI arrondie/bold, couleurs franches, sheet du bas arrondie, dock « veilleurs ».
- Workflow : prototype autonome `design/proto-map-bump.html` → validation visuelle fondateur →
  portage dans `WorldMapView` (pins → bulles-avatars animées) puis le reste de l'UI.
- But : maximiser l'attrait/rétention de l'existant pendant qu'on prépare la phase 2.
- Le B2B sargasse (machine cold-email + Mollie + funnel) continue de tourner = preuve vivante
  que la machine convertit (ou non).

## PHASE 2 (dans ~1-2 mois) : nouveau produit marketplace = A11yFix (Chrome)
Audit `marketplace-audit` (28/06) → gagnant : **A11yFix**, extension Chrome d'audit
**accessibilité / conformité EAA-WCAG 2.2 AA**, repositionnée sur le **rapport de conformité
facturable** (pas la remédiation IA).
- **Pourquoi** : EAA en vigueur (juin 2025) = demande réglementaire chaude + récurrente ; tech ;
  self-service (billing ExtPay/Stripe) ; **moat** = scan derrière auth/staging (là où les SaaS
  publics ne vont pas) + rapport daté/versionné white-label + diff dans le temps ; axe-core **100%
  local** (privacy = argument de vente + faible COGS).
- **Distribution non-spammy** : Chrome Web Store (segment solo dev) + **boucle virale** = footer
  « audité avec A11yFix » sur chaque rapport white-label exporté → le client de l'agence découvre
  l'outil. PAS de cold-email, PAS de SEO-from-zero.
- **Calcul €10k** : ~120 Agence ($49) + ~200 Solo ($19) ≈ $9,7k/mo, 12-18 mois, **SI la boucle
  virale s'amorce** (le vrai pari, testable tôt).
- **Honnêteté** : sans la boucle virale, plafond ~$3-4k (store organique seul). Pas de €10k passif garanti.
- **Build** : MOI = extension MV3 (axe-core local) + moteur de rapport white-label + diff + alt-text
  IA (seul appel LLM, cappé) + mapping violation→clause/risque-pays + ExtPay billing + listing.
  TOI (one-time) = compte dev Chrome (5 $), ExtPay+Stripe, politique de confidentialité (je rédige),
  soumission review Chrome (je prépare le texte permissions), clé LLM avec cap.
- **Test décisif <30j** : le 1er paiement Agence venu de la boucle virale (pas du store seul).

## Réutilisé (déjà en prod, ne pas jeter)
Machine cold-email/Mollie/drip/funnel · pipeline data · savoir-faire full-static + GH Actions.
Le repo sargagame reste (B2C SEO passif + B2B test) ; il ne devient pas €10k, mais finance ses frais
et sert de terrain.
