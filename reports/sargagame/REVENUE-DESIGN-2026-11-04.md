# SARGASSES — Spécification revenue (rebased 2026-11-04)

> **Origine** : proposition de la PR #1254 (`revenue/b2c-monthly-499-20261104`,
> « SARGASSES — REVENUE, PRICING & DESIGN SPEC »).
> **Statut** : **supersédée sur son cœur commercial**, reprise ici pour sa partie
> multi-levier (SEO, capture, instrumentation, gates) et explicitement **rejetée** sur
> les 3 abonnements B2C mensuels.
> La PR #1254 est fermée avec renvoi vers ce document ; aucune de ses modifications de
> code n'est reprise.

---

## 1. Décision commerciale retenue (inchangée)

### B2C — gratuit + passs à durée fixe, paiement unique

Aucun abonnement B2C. Le client paie **une fois** pour une **durée définie** ; pas de
reconduction, pas de prélèvement récurrent, rien à résilier.

| Offre | EUR | USD | Durée |
|---|---:|---:|---:|
| Verdict gratuit | 0 € | 0 $ | — |
| **Pass 30 jours** (principal) | **14,99 €** | 11,99 $ (+15 % juin→nov. → 13,79 $) | 30 j |
| Pass 7 jours | 4,99 € | 5,99 $ | 7 j |
| Pass Saison | 19,99 € | *non vendu* | 210 j |

### B2B — widget gratuit en entrée, Pro en moteur récurrent

| Offre | Prix |
|---|---:|
| Widget / veille publique | 0 € |
| **Pro** | **79 €/mois** ou **690 €/an** |
| Brief | 29 €/mois ou 290 €/an |
| Territoire | dès 199 €/mois HT (1 990 €/an) — devis, pas de paylink carte |

Essai 30 j sans carte, instantané, self-serve.

---

## 2. Ce qui est **rejeté** de la PR #1254 (et pourquoi)

| Élément de la PR #1254 | Décision | Motif |
|---|---|---|
| 3 abonnements B2C mensuels **BEACH 4,99 € / ISLAND 7,49 € / EXPLORER 9,99 €** | **REJETÉ** | Contredit l'architecture B2C (pass à durée fixe) **et** le modèle économique demandé (cash d'avance, zéro churn, un moteur récurrent B2B côté Pro). Introduirait un parc d'abonnements sans infrastructure de ledger, de renouvellement ni de résiliation rodée. |
| « No annual plan in this launch » | **REJETÉ** | L'annuel B2B existe déjà (690 €/an Pro, 290 €/an Brief) et fait partie du moteur récurrent demandé. |
| « Do not silently migrate old one-time pass customers » | **RETENU** | Les droits payés restent valables jusqu'à leur échéance ; aucune conversion forcée. |
| « Do not accept amount/currency/interval from the browser » | **RETENU (déjà en place)** | `mollie.php` valide le montant de base contre `$passPrices` puis applique la seule règle serveur (surcharge USD) ; `create-checkout.php` porte l'allowlist anti-tampering. |
| Contraintes Mollie recurring (mandate, 1er paiement = consentement, subscription après paiement confirmé, ledger durable, idempotence, pas de double débit) | **RETENU, périmètre B2B** | C'est la mécanique du moteur Pro/Brief. Ne s'applique pas au B2C (paiement unique). |
| Gates de test Mollie (allowlist, montant forgé, double paiement, renouvellement, annulation, expiry) | **RETENU, périmètre B2B** | Idem. |

---

## 3. Ce qui est **repris** de la PR #1254 (le multi-levier utile)

### 3.1 Acquisition SEO (priorité trafic payant)

L'existant est déjà un système : `scripts/lib/region-seo-pages.cjs` génère les pages
plages, hubs, stations, FAQ et sitemaps régionaux. **Ne pas reconstruire à l'aveugle** :
inventorier d'abord les URLs réellement indexables (canonical, hreflang, liens internes,
statut HTTP, fraîcheur, sitemap) sur les 6 domaines.

Intentions FR/EUR (MQ, GP) : « sargasses Martinique aujourd'hui », « plage sans sargasses
Martinique », « état de la plage des Salines », etc.
Intentions EN/USD (Florida, Punta Cana, Riviera Maya, Tulum) et ES/USD équivalents.

Règles non négociables : jamais de volume de recherche inventé, jamais de statut
« propre aujourd'hui » sans observation fraîche dans la SLA (900 min), jamais de
« temps réel » sans horodatage réel, pas de doorway pages, pas de liens payants.

**Point ouvert prioritaire (déjà signalé par la PR #1254) :** les sites régionaux servis
affichaient encore des statuts datés du 2026-10-28 en début de mois. Les textes
« aujourd'hui / en temps réel » doivent être conditionnés à la fraîcheur réelle de la
source — c'est un problème de **vérité produit**, pas de SEO.

### 3.2 Capture de lead (B2C et B2B séparées)

1. La capture se fait **après** une preuve utile (verdict réel horodaté), jamais avant.
2. Champs minimaux : email + plage/région + langue ; région déduite quand possible.
3. **Consentement service (alerte) et consentement marketing (newsletter) séparés.**
   Le marketing n'est **jamais** pré-coché ; version + horodatage + source sont stockés.
   (Implémenté le 2026-11-04 dans `public/api/b2b-trial.php` + widget B2B.)
4. Vérification d'email, désinscription et suppression sur demande.
5. La carte et les observations publiques ne sont **jamais** bloquées par un mur email.
6. Réutiliser l'infrastructure existante (`b2c_alerts`, planner_alerts) : pas de seconde
   table newsletter, pas de second système de leads.
7. La capture B2B reste séparée de la capture B2C ; les 21 leads B2B existants sont
   conservés (normaliser région/statut/source, suivre humainement).

### 3.3 Nomenclature d'événements (funnel unifié)

`seo_landing_view` → `beach_preview_view` → `lead_capture_view` → `lead_capture_submit` →
`email_verified` → `plan_select` → `recurring_consent` → `checkout_started` →
`first_payment_paid` → `subscription_created` → `renewal_paid` → `renewal_failed` →
`cancellation_requested` → `subscription_canceled` → `access_expired` →
`alert_delivered` → `alert_opened` → `return_visit`.

Règles : région normalisée ; identifiant de session first-party (jamais d'empreinte) ;
jamais d'email, de nom ou de token dans les paramètres analytics ; UTM conservé jusqu'au
retour paiement ; **la conversion payante n'est émise que par le webhook serveur
autoritatif** (le retour navigateur n'est pas du revenu) ; distinguer alertes, leads
marketing, leads B2B, début de checkout, premier paiement encaissé, renouvellements.

### 3.4 Gates (inchangés, appliqués à cette branche)

- Build + budget bundle (≤ 210 Ko gzip sur le chemin critique) + UX smoke (4 jetons) +
  régressions Playwright + validation régionale.
- `npm test` vert, y compris la parité des prix (`tests/unit/price-parity.test.cjs`).
- Aucune écriture production non autorisée : pas de paiement, pas de remise, pas
  d'email client, pas de donnée supprimée.

### 3.5 Ordre d'exécution (repriorisé sur la preuve revenue)

**P0**
1. Livrer le correctif de l'essai B2B (endpoint 500 → token rendu) et prouver une
   activation réelle.
2. Fermer la boucle « payé → accès » (6 `paid_no_grant`).
3. Rétablir la corrélation de session (sans elle, aucun taux de conversion).
4. Réaligner prix affichés / prix débités (fait le 2026-11-04).

**P1**
5. Titres/meta/H1 des pages déjà classées, sur données GSC réelles.
6. robots/sitemaps/canonicals/hreflang/liens internes par région.
7. Pages régionales à forte intention, une par intention réelle et non par mot-clé.

**P2**
8. Guides pérennes + widget partenaire intégrable.
9. Séquence e-mail de contenus utiles **sur consentement valide**.
10. Rapport mensuel revenue par région et par intention.

**Interdit** : toute campagne payante avant qu'une landing, des données fraîches, une
capture, un checkout, une mention légale et une livraison de paiement soient prouvés.

---

## 4. Ce qui reste à construire (hors périmètre de la branche du 2026-11-04)

| Sujet | Pourquoi ce n'est pas dans la branche | Prérequis |
|---|---|---|
| Ledger durable d'abonnement B2B (renewals, échecs, résiliation, paid-through) | Écriture en production + nouvelle table Supabase | Autorisation + migration |
| Endpoint de prix serveur (quote) pour supprimer la dérive de fuseau autour du 1er juin / 1er déc. | Ajout d'API publique | Décision (l'écart est déjà mesuré via `sg_price_mismatch`) |
| Retour de l'email transactionnel d'essai B2B (`mol_b2b_trial_email`) | Changement d'email client | Autorisation explicite |
| Ré-accusation des 6 paiements payés sans accès | Écriture en production + arbitrage sur l'alias `p7` | Décision fondateur |
| Suppression des montants legacy de l'allowlist Stripe (799 / 999 / 2499) | Chemin de paiement | Autorisation |
