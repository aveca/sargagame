# MOLLIE_MIGRATION.md — Sortie de Stripe → Mollie on-site

> Décision (2026-06-24) : **Stripe est mort** (compte bloqué). Le remplaçant est
> **Mollie on-site** (Components / cartes dans le DOM). **PayPal est écarté** (pas
> de paiement on-site, UX popup). Mollie est **validé et LIVE** : paiements réels
> EUR (MQ/GP) depuis le 25/06 et USD (florida/puntacana/rivieramaya) depuis le 26/06.

## État actuel (vérifié dans le code)

- Front : `PAY_PROVIDER` défaut = **`mollie`** ; `PAY_CAPTURE_ONLY` défaut =
  **`IS_NEW_REGION && !MOLLIE_LIVE_USD`** (kill-switch par surface, PAS un état waitlist
  global). Les régions live chargent réellement (MQ/GP + florida/puntacana/rivieramaya).
  Override QA : `?pay=mollie&pay_capture=0`.
- Mollie : flux complet en place et **LIVE** — `public/api/mollie.php` (`create_payment`
  one-time, `create_subscription` mandat+récurrent), `mollie-lib.php`, `mollie-webhook.php`.
  EUR LIVE (MQ/GP) depuis le 25/06 ; USD LIVE (florida/puntacana/rivieramaya) depuis le
  26/06 (`MOLLIE_LIVE_USD` set, validé par un vrai paiement $5.99 ; Mollie encaisse l'USD
  et règle en EUR). Barbados = capture-only, **non câblé** Mollie (`regions/barbados.json` live:false).
- Stripe : `create-checkout.php` reste présent mais **dormant** (jamais le provider actif).
  Ne pas le rebrancher. À supprimer une fois Mollie stable.

## Ce qui a été porté sur Mollie (ce commit) — SÛR

> **Modèle B2C actuel = PASS-ONLY** (paiement UNIQUE, plus d'abonnement) : EUR
> **7,99 / 14,99 / 24,99 €** · USD **$5.99 / $11.99 / $19.99**. Les lignes
> `subscription` (monthly/annual) ci-dessous sont **legacy / Stripe-only** (16 abos
> EUR historiques continuent d'y facturer ; aucun nouvel abo n'est vendu).

| Élément | État |
|---|---|
| **Passes EUR 7,99 / 14,99 / 24,99 €** | montants ajoutés à l'allowlist `create_payment` (`mollie.php`) + entrées `passes` dans `mollie-config.example.php`. Le front route les pass via Mollie (`passCtxRef` → `create_payment`). |
| **Abonnement annuel EUR 49€ (legacy / Stripe-only)** | `mollie-config` `subscription.annual` aligné 39,99 → **49,00** à l'époque. **Plus vendu** (modèle pass-only) ; conservé pour la base d'abonnés Stripe historiques. |
| **Parrainage — flux de données** | Front envoie `referredBy` + `myReferralCode` au `create_subscription` Mollie. Serveur **enregistre l'attribution** : mon code en `metadata.referral_code` du customer Mollie + `referred_by`/`referral_code` dans `mol_store`. Event `sg_referral_convert` émis (provider mollie). |

## ⚠️ Parrainage — mécanique récompense (voir `REFERRAL_LOOP.md`)

Mollie **n'a ni coupon ni customer balance** (contrairement à Stripe), et le modèle est
désormais **pass-only** : la récompense « 1 mois offert » Stripe n'a plus de sens. La
récompense vit donc comme un **ledger de jours de pass** dans `mollie.php` (crédité au
webhook `paid`) — détail et état dans `REFERRAL_LOOP.md`. L'attribution est **capturée**
(voir tableau). Les pistes Stripe-era ci-dessous sont **historiques** :

1. **Filleul (1er mois offert)** — options Mollie :
   - (a) 1er paiement `first` à montant minimal (mandat) + `startDate` subscription = **+2 intervalles** (saute la période 1 payante) → 1er mois effectivement offert. À TESTER (Mollie exige un montant > 0 pour le mandat carte).
   - (b) ou 1ère facture réduite (remise %) plutôt que gratuite, si (a) pose souci de mandat.
2. **Parrain (crédit 1 mois)** — Mollie n'a pas de balance → script de **réconciliation** :
   lire `mol_store` (les `referred_by`), retrouver le parrain par `metadata.referral_code`,
   et appliquer le crédit via une période gratuite (skip d'un cycle) ou un remboursement
   partiel d'une facture. Cap anti-abus 12/parrain (comme la version Stripe).

→ **Tant que ce script n'existe pas, le parrainage CAPTURE mais ne récompense pas**
(dégradation douce, aucun paiement cassé).

## Checklist go-live Mollie — FAIT (25-26/06)

- [x] **Compte Mollie validé** (cartes / profil actifs) — go-live confirmé par un vrai paiement.
- [x] `public/api/mollie-config.php` créé avec la **clé `live_`** + `passes` pass-only
      (EUR **7,99 / 14,99 / 24,99**), déployé par FTP (MQ/GP) — gitignored, non écrasé.
      La section `subscription` (monthly/annual) reste **legacy Stripe-only**, plus vendue.
- [x] `PAY_CAPTURE_ONLY` = défaut par surface (`IS_NEW_REGION && !MOLLIE_LIVE_USD`) ;
      MQ/GP + florida/puntacana/rivieramaya chargent réellement. `PAY_PROVIDER='mollie'`.
- [x] **USD LIVE sur Mollie** (florida/puntacana/rivieramaya, `MOLLIE_LIVE_USD` set ;
      Mollie encaisse l'USD, règle en EUR via FX ~2,5-3%). Stripe USD = désactivé.

Reste (non bloquant) :
- [ ] Dé-parker le trip-pass EUR si pertinent : `pw_trippass_eur` poids `[1,0]` → `[.5,.5]`.
- [ ] Récompense parrainage : voir `REFERRAL_LOOP.md` (ledger jours de pass dans `mollie.php`).
- [ ] Barbados : capture-only, à câbler sur Mollie (USD pass-only) si/quand go-live.

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
