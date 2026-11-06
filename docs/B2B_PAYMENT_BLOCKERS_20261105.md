# Blocages paiement — diagnostic et corrections préparées (2026-11-05)

> Mission : transformer les prospects contactés en clients payants.
> Règle appliquée : **aucune configuration de paiement en production n'a été
> modifiée**, **aucun paiement réel n'a été déclenché**. Tout ce qui suit est
> soit une correction de code (déployable par le pipeline), soit un point qui
> exige une autorisation explicite (déploiement / secret / routage).

## 1. État mesuré (lecture seule, 2026-11-05)

### 1.1 Offre B2B payable

| Palier | Montant canonique | Où c'est défini | Vendable ? |
|---|---|---|---|
| Pro mensuel EUR | 79 €/mois | `public/api/mollie-lib.php` → `mol_b2b_plans()` | oui (abonnement Mollie) |
| Brief mensuel EUR | 29 €/mois | idem | oui |
| Pro mensuel USD | 89 $/mois | **absent avant ce correctif** | **corrigé ici** |
| Brief annuel EUR | 290 €/an | `scripts/automation/mollie-paylinks.cjs` → `TIERS` | oui (paylink) |
| Pro annuel EUR | 690 €/an | idem | oui (paylink) |
| Territoire annuel EUR | 1 990 €/an | idem | oui (paylink) |
| Brief annuel USD | 390 $/an | idem | oui (paylink) |
| Pro annuel USD | 790 $/an | idem | oui (paylink) |
| Territoire USD | — | **n'existe pas** | **non** (les pages EN/ES annonçaient « from $219/month » → prix non vendable) |

`public/api/b2b-paylinks.json` : 5 liens Mollie présents (`brief_annual`,
`pro_annual`, `territory_annual`, `brief_annual_usd`, `pro_annual_usd`), tous
`webhooked: true`, créés le 2026-07-02. Le CTA annuel de l'Espace Pro lit ce
fichier à l'exécution → lien correct, devise correcte.

### 1.2 Parcours de conversion B2B (lu dans le code, aucun paiement déclenché)

1. `/pro/` (hub) → `/pro/pricing/` → « Activer mon essai 30 j » → `/pro/espace/`
2. `/pro/espace/` → formulaire d'essai → `POST /api/b2b-trial.php`
   → jeton Pro 30 j renvoyé dans la réponse + email (Resend) → widget en
   marque blanche + mise en avant dans l'app.
3. `/pro/espace/` → « S'abonner — 89 $/mois » → `POST /api/mollie.php`
   `{action:"create_subscription", plan:"pro_monthly_usd"}`.
4. `/pro/espace/` → « Verrouiller l'année — 790 $ » → lien de paiement Mollie
   (`pro_annual_usd`) lu dans `/api/b2b-paylinks.json`.

### 1.3 Blocages trouvés

| # | Blocage | Impact commercial | État |
|---|---|---|---|
| B1 | `pro_monthly_usd` absent de `mol_b2b_plans()` alors que les pages EN/ES et `/pro/espace/` l'annoncent et l'appellent | **CTA mort** sur les 4 domaines USD : le serveur répond « Plan mensuel inconnu: pro_monthly_usd » | **corrigé ici** (code, additif) |
| B2 | Espace Pro de Tulum (`sargazotulum.com`) : `USD_REGION` ne reconnaît pas Tulum → prix EUR, copy FR, plages MQ/GP, redirection vers `sargasses-martinique.com` | Le prospect Tulum ne peut ni voir ses plages ni s'abonner sur son propre domaine | **corrigé ici** (code) |
| B3 | Palier « Coastline/Territoire » affiché « from $219/month » sur les pages EN/ES | Prix annoncé **non vendable** (aucune grille USD de ce type) → promesse fausse | **corrigé ici** (build : palier canonique 1 990 €/an) |
| B4 | Les 4 domaines USD servent des pages `/pro/` en français et des CTA/canoniques pointant vers la Martinique | Un prospect USD atterrit sur une page FR hors domaine | **corrigé ici** (build : hub régionalisé) |
| B5 | **Données scientifiques périmées sur les 6 domaines** : `updatedAt` = 2026-10-28, soit **12 046 min** (8,4 j) au moment de la mesure, alors que le payload publie `stale:false` et `dataAgeMinutes:1772` | On ne peut pas vendre une « lecture en direct » based sur une observation de 8 jours ; la démo `/pro/demo/` applique le SLA 900 min **fail-closed** | **à traiter (data)** : le pipeline de fraîcheur est cassé (cf. P0.67 §2) ; la page démo n'affiche aucun verdict si la donnée est périmée |
| B6 | Les 6 ventes Mollie B2B ne sont pas livrées : routage Cloudflare `/api/mollie*` encore sur l'ancien Worker, `sg-payments` non déployé, `MOLLIE_WEBHOOK_SECRET` non posé | Un paiement B2B peut être encaissé **sans** droit Pro | **autorisation requise** (hors périmètre de cette mission) |
| B7 | Régions USD : le paywall B2C utilise encore des liens **Stripe** (`regions/*.json.paymentLinks`) alors que Stripe est en run-off et Mollie est la caisse active | Deux chemins de paiement B2C coexistent sur les 4 domaines USD | **à arbitrer** (hors périmètre :触及 money-path) |

## 2. Corrections préparées dans cette mission (code, sans effet avant merge/deploy)

- `public/api/mollie-lib.php` : ajout du plan `pro_monthly_usd` (89 USD) —
  montant **identique à celui déjà affiché publiquement** sur les pages EN/ES,
  aucun prix inventé. Additif, ne modifie aucun flux existant.
- `public/pro/espace/index.html` : Tulum reconnu comme région USD/ES
  (5 plages), lien « Verrouiller l'année » rendu relatif.
- `scripts/lib/b2b-commercial-pages.cjs` (nouveau) : build par région —
  `/pro/` dans la langue de la région, canonical/og/hreflang sur le domaine de
  la région, palier Territoire canonique sur les pages EN/ES, démo par
  destination `/pro/demo/` avec fraîcheur recalculée à l'affichage.
- `vite.config.js` : appel du module ci-dessus au `closeBundle` (toutes régions).

## 3. Points qui exigent une autorisation explicite (non touchés)

1. **Déploiement du Worker `sg-payments` + routage Cloudflare + pose du secret
   webhook** (B6) : sans cela, un encaissement B2B ne donne aucun droit.
2. **Migration/backfill des grants** déjà payants (6 ventes) : `scripts/automation/backfill-mollie-grants.cjs`
   existe, mode `--apply` à double confirmation — non exécuté.
3. **Arbitrage Stripe run-off vs Mollie sur les régions USD** (B7) : décision
   produit + money-path, hors périmètre de cette mission.
4. **Remise en route du pipeline de fraîcheur** (B5) : dépendance data, pas
   commercial.

## 4. Rollback

- Chaque correction est additive et isolée : revert du commit = retour à
  l'état exact précédent (aucune migration, aucun secret, aucun paiement).
- Le plan `pro_monthly_usd` n'est utilisé que si le front appelle ce plan ;
  le retirer suffit à revenir au comportement « plan inconnu » (CTA mort).
- La démo `/pro/demo/` est une page nouvelle : la supprimer suffit.
- Le hub régionalisé est régénéré à chaque build : supprimer l'appel dans
  `vite.config.js` restaure le hub FR d'origine.
