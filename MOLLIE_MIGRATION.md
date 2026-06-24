# MOLLIE_MIGRATION.md — Sortie de Stripe → Mollie on-site

> Décision (2026-06-24) : **Stripe est mort** (compte bloqué). Le remplaçant est
> **Mollie on-site** (Components / cartes dans le DOM). **PayPal est écarté** (pas
> de paiement on-site, UX popup). Mollie est **en attente de validation** côté
> compte → tant que ce n'est pas validé, le paywall reste en **mode capture/waitlist**.

## État actuel (vérifié dans le code)

- Front : `PAY_PROVIDER` défaut = **`mollie`** ; `PAY_CAPTURE_ONLY` défaut = **`true`**
  (le paywall capture l'email au lieu de charger). Override QA : `?pay=mollie&pay_capture=0`.
- Mollie : flux complet déjà en place — `public/api/mollie.php` (`create_payment`
  one-time, `create_subscription` mandat+récurrent), `mollie-lib.php`, `mollie-webhook.php`.
  EUR uniquement (MQ/GP) ; USD restait sur Stripe (désormais mort → USD à rebrancher sur Mollie plus tard).
- Stripe : `create-checkout.php` reste présent mais **dormant** (jamais le provider actif).
  Ne pas le rebrancher. À supprimer une fois Mollie stable.

## Ce qui a été porté sur Mollie (ce commit) — SÛR, sous le gate capture

| Élément | État |
|---|---|
| **Trip-pass EUR 4,99€/7j** | `499` ajouté à l'allowlist `create_payment` (`mollie.php`) + entrée `trip7` dans `mollie-config.example.php`. Le front route déjà les pass via Mollie (`passCtxRef` → `create_payment`). |
| **Annuel EUR 49€** | `mollie-config` `subscription.annual` aligné 39,99 → **49,00** (cohérent avec l'affichage front). |
| **Parrainage — flux de données** | Front envoie `referredBy` + `myReferralCode` au `create_subscription` Mollie. Serveur **enregistre l'attribution** : mon code en `metadata.referral_code` du customer Mollie + `referred_by`/`referral_code` dans `mol_store`. Event `sg_referral_convert` émis (provider mollie). |

## ⚠️ Parrainage — récompense NON appliquée (à faire au go-live Mollie)

Mollie **n'a ni coupon ni customer balance** (contrairement à Stripe). La récompense
ne peut donc pas être appliquée en ligne comme sur Stripe, et **Mollie n'est pas validé
= intestable** aujourd'hui. L'attribution est **capturée** (voir tableau) ; la récompense
sera appliquée à la validation, au choix :

1. **Filleul (1er mois offert)** — options Mollie :
   - (a) 1er paiement `first` à montant minimal (mandat) + `startDate` subscription = **+2 intervalles** (saute la période 1 payante) → 1er mois effectivement offert. À TESTER (Mollie exige un montant > 0 pour le mandat carte).
   - (b) ou 1ère facture réduite (remise %) plutôt que gratuite, si (a) pose souci de mandat.
2. **Parrain (crédit 1 mois)** — Mollie n'a pas de balance → script de **réconciliation** :
   lire `mol_store` (les `referred_by`), retrouver le parrain par `metadata.referral_code`,
   et appliquer le crédit via une période gratuite (skip d'un cycle) ou un remboursement
   partiel d'une facture. Cap anti-abus 12/parrain (comme la version Stripe).

→ **Tant que ce script n'existe pas, le parrainage CAPTURE mais ne récompense pas**
(dégradation douce, aucun paiement cassé).

## Checklist go-live Mollie (action fondateur)

- [ ] **Valider le compte Mollie** (activation cartes / profil `pfl_…`).
- [ ] Créer `public/api/mollie-config.php` (depuis `.example`) avec la **clé `live_`**,
      `subscription` (monthly 4,99 / annual **49,00**) et `passes` (incl. **`trip7` 499**),
      puis **déployer par FTP** sur `martinique-ftp/api/` ET `guadeloupe-ftp/api/`.
- [ ] Basculer `PAY_CAPTURE_ONLY` → `false` (ou laisser le défaut et flipper au build)
      une fois Mollie validé. Garder `PAY_PROVIDER='mollie'`.
- [ ] **Relancer les leads waitlist** (`source 'mollie_waitlist'`) à la réouverture.
- [ ] Dé-parker le trip-pass EUR : `pw_trippass_eur` poids `[1,0]` → `[.5,.5]`.
- [ ] Écrire le **script de réconciliation parrainage** (récompense filleul + parrain)
      et le tester en mode `test_` avant le `live_`.
- [ ] (Plus tard) USD : rebrancher florida/puntacana/rivieramaya sur Mollie (compte EUR
      → conversion FX ~2,5-3%) ou un autre PSP, puisque Stripe est mort.

## Readiness pré-go-live (audit 2026-06-24, 6 agents)

### ✅ Bloquants CORRIGÉS (PR #108)
- **Fuite active** : pass off-site → liens `buy.stripe.com` morts. `passOnsite` forcé on-site.
- **Labels « Stripe » en dur** → const `PAY_LABEL` provider-aware (bascule Mollie au flip).
- **Retour 3DS Mollie** posait plus le splash/onboarding → `sg_premium_welcome=1` ajouté.
- **Verify cross-device** 100% Stripe → helper `sgVerifySub()` (Mollie + Stripe legacy).
- **Annulation abo** portail Stripe only → `?manage=1` provider-aware (cancel Mollie + confirm).

### 🟡 Nice-to-have RESTANTS (non-bloquants, à traiter au retour — judgment/UX)
- **Cohérence capture (anti bait-and-switch)** : en mode capture, masquer les cartes de
  prix / garantie 30j / mentions prix et passer le CTA à « 7 jours premium offerts · juste
  ton email ». Attaque aussi le bottleneck modal→CTA 2%. (Sargasses_PROD.jsx ~6852-7155). Effort M.
- **Pass saison (19,99€/6 mois)** cliquable en capture mais ne délivre que 7j en dur →
  masquer/rerouter en capture. Effort S.
- **payment_status réseau KO au retour 3DS** = premium perdu en silence → ajouter
  retry/backoff ou fallback `sgVerifySub(email)` avant de nettoyer. Effort M.
- **CaptureGate** « Débloquer par carte 4,99€/mois » mène au paywall payant en capture →
  reformuler « Débloquer 7 jours gratuitement ». Effort S.
- **Double `submitLead`** en capture (onsite_checkout + gap_freemium) = 2 POST/déblocage,
  gonfle les métriques → n'émettre que gap_freemium. Effort S.
- **Code mort `captureDone`** (écran succès « C'est débloqué ! » jamais rendu) → utiliser ou supprimer. Effort S.

### ✅ Déjà prêt (rassurant)
Gating `isPremium` sain · chemin Mollie inline complet (splash+onboarding+parrainage) ·
funnel capture bout-en-bout · i18n fr/en/es complet (gratuit+premium+B2B) · B2B 100%
lead-capture (zéro risque paiement) · bridge `PAY_PROVIDER`/`PAY_CAPTURE_ONLY` réversible.

## Note Stripe (mort)
`create-checkout.php` + `stripe-config.*` restent dans le repo mais ne sont plus le
chemin actif. Ne rien y rebrancher. Suppression propre à planifier une fois Mollie rodé.
