# SARGASSES — État de vérité revenue (2026-11-04)

> Source : audits en lecture seule (réconciliation API Mollie — instantané local
> `reconcile-sales.json` (`mode: LIVE`, `generatedAt: 2026-11-04T06:45:00Z`),
> Supabase `analytics_events` en agrégation, code des surfaces publiées) + correctifs
> appliqués sur la branche `revenue/offres-durees-prix-coherence-20261104`.
> **Aucune donnée personnelle, aucun identifiant de paiement et aucun hash d'email ne
> figure dans ce rapport.** L'instantané de réconciliation, lui, en contient : il est
> désormais **hors du dépôt public** (retiré du dépôt et ajouté au `.gitignore` par
> la PR #1259, mergée le 2026-11-04 — `c4f9821d`).
> Rien n'est déclaré « rentable » : les données commerciales sont trop faibles pour
> conclure sur la rentabilité d'une offre.

---

## 1. Architecture d'offre validée

### B2C — gratuit + passs à durée fixe (paiement unique, aucun abonnement)

| Offre | Zone EUR | Zone USD | Durée | Rôle |
|---|---:|---:|---:|---|
| Verdict gratuit (carte, fiche plage, alerte transactionnelle) | 0 € | 0 $ | — | Entrée du tunnel |
| **Pass 30 jours** | **14,99 €** | 11,99 $ (+15 % de juin à nov. → 13,79 $) | 30 j | **Offre principale** |
| Pass 7 jours | 4,99 € | 5,99 $ | 7 j | Court séjour |
| Pass Saison | 19,99 € | *non commercialisé* | 210 j | Contre-saison / residents |

Source de vérité = le serveur : `public/api/mollie.php` (`$passPrices`), allowlist
anti-tampering `public/api/create-checkout.php` (`$ALLOWED_CENTS`), grants
`workers/sargagame/index.js` (`PASS_PRICES` / `DAYS_TABLE`). Le client a désormais un
miroir explicite : `src/lib/pricing.js` (parité verrouillée par
`tests/unit/price-parity.test.cjs`).

### B2B — widget gratuit en entrée, Pro en moteur récurrent

| Offre | Prix | Note |
|---|---:|---|
| Widget / veille publique | 0 € | Point d'entrée, hook sans carte |
| **Pro** | **79 €/mois** ou **690 €/an** | Moteur récurrent principal (décision fondateur 2026-06-29) |
| Brief | 29 €/mois ou 290 €/an | Palier d'entrée / leurre assumé |
| Territoire | dès 199 €/mois HT (1 990 €/an) | Multi-plages + API + widget public, **pas de paylink carte** (sur devis) |

Essai 30 jours sans carte, instantané et self-serve (`/api/b2b-trial.php`).

---

## 2. Vérité revenue (constatée, pas supposée)

Source : instantané de réconciliation API Mollie en lecture seule (`mode: LIVE`,
`generatedAt: 2026-11-04T06:45:00Z`, profil de production). Cet instantané contient
des identifiants de paiement et des hashes d'email : il est **hors du dépôt public**
depuis la PR #1259 (`c4f9821d`) et n'est reproduit ici qu'agrégé.

| Indicateur | Valeur |
|---|---:|
| Paiements créés (30 j glissants du fichier de réconciliation) | 147 |
| **Paiements RÉELS encaissés (`paid`)** | **6** |
| Refunds | **0** |
| Encaissement brut | **56,94** (38,96 € + 17,98 $) |
| Paiements expirés / annulés / échoués | 129 / 9 / 3 |
| Paiements de test exclus | 0 |
| **Premier encaissement** | 2026-06-28 |
| **Dernier encaissement** | **2026-07-19** |

Conséquences, sans interprétation :

1. **Aucun encaissement depuis le 19/07/2026** — soit ~3,5 mois sans revenu B2C,
   alors que le tunnel affiche des milliers de vues d'offre.
2. **Les 6 paiements sont des `paid_no_grant`** : aucun accès n'a été enregistré dans
   `payment_grants` (les 3 lignes présentes sont toutes `b2c_pass` et ne correspondent
   à aucun de ces paiements). Le client a payé **sans** recevoir son accès.
   La ré-accusation des accès est une **écriture en production** → autorisation requise.
3. **6 encaissements ne permettent pas de conclure** sur la rentabilité d'un pass, d'un
   prix ou d'une source de trafic. Le seuil de décision reste : pas de campagne payante,
   pas de changement de prix sur cette base.

### B2B

`b2b_subscriptions` : **0 ligne**. Aucun abonnement B2B n'a jamais été créé.
`b2b_leads` : 21 enregistrements (20 `contacted`, 1 `new`), le dernier du 2026-10-05.
Aucun MRR, aucun churn mesurable : le moteur récurrent n'a pas encore de base.

**Confirmation indépendante, lecture seule, depuis l'API Mollie.** Le rapport
`scripts/automation/data/mollie-mrr.json` (commité dans le dépôt, `source:
"mollie-api"`, `timestamp: 2026-11-04T05:48:56Z`) est calculé par
`scripts/automation/mollie-mrr.cjs` en listant **les customers puis leurs
subscriptions** — pas la table Supabase. Il affiche :

| Indicateur (tracker MRR, API Mollie) | Valeur |
|---|---:|
| `mrr.total_eur` | **0** |
| `mrr.subscriptions_eur` | **0** |
| `mrr.b2b_month_eur` | **0** |
| `mrr.passes_month_eur` | **0** |
| `customers.active_subs` | **0** |
| `customers.paid_this_month` | **0** |
| `customers.unique_payers_all` | **0** (payeurs **du mois en cours**) |
| `payments_this_month` | **0** |

→ **0 € de MRR, 0 abonnement actif, 0 € encaissé sur le mois.** Les deux sources
(Supabase `b2b_subscriptions` vide **et** API Mollie sans subscription) convergent :
le moteur récurrent B2B n'a produit **aucun euro récurrent**.

> Note de lecture : `unique_payers_all` compte les payeurs **du mois courant**
> (`paid` = paiements depuis le 1er du mois), pas de l'histoire. Son 0 est donc
> cohérent avec « aucun encaissement en novembre », et ne contredit pas les 6
> encaissements B2C de juin-juillet.

### Le tunnel B2B mesurables s'arrête à l'essai — la conversion payante n'est pas instrumentée

`SG_FUNNEL_EVENTS` (`src/Sargasses_PROD.jsx`) autorise le sink Supabase pour :
`sg_b2b_offer_view`, `sg_b2b_step`, `sg_b2b_intent`, `sg_b2b_trial_activated`.

| Étape B2B | Événement | État |
|---|---|---|
| Vue de l'offre | `sg_b2b_offer_view` | ✅ instrumenté (101 lignes / 30 j) |
| Progression dans le tunnel | `sg_b2b_step` | ✅ (31 lignes) |
| Intention (email + palier) | `sg_b2b_intent` | ✅ |
| **Essai activé** | `sg_b2b_trial_activated` / `b2b_trial_started` | ✅ (serveur : `b2b-trial.php`) |
| **Essai → abonnement payé** | **aucun événement** | ❌ **absent** |
| **Churn / MRR depuis la télémétrie** | **aucune table alimentée** | ❌ `b2b_subscriptions` n'a **aucun écrivain** dans le dépôt |

Conséquence directe : **le taux de conversion essai → abonnement n'est pas
mesurable par la télémétrie applicative.** Le seul chemin de preuve est
l'API Mollie (`mollie-mrr.cjs`), qui lit les subscriptions côté serveur. C'est
exactement ce chemin que #1271 répare : il était gelé avec le job d'email.

---

## 2bis. Le chemin de paiement EN PRODUCTION (mesuré le 2026-11-04)

Ce paragraphe est **le plus important du rapport** pour le revenu : il décrit
ce qui **réellement** encaisse l'argent aujourd'hui, et il **corrige** une
hypothèse du présent rapport.

### Les routes servies par les 6 domaines

Routes lues via l'API Cloudflare (`GET /zones/{zone_id}/workers/routes`, lecture
seule) — **identiques sur les 6 zones** :

| Motif de route | Worker qui sert |
|---|---|
| `<domaine>/api/mollie*` | **`sg-payments`** |
| `<domaine>/api/b2b-*` | **`sg-payments`** |
| `<domaine>/api/create-checkout*` | **`sg-payments`** |
| `<domaine>/api/copernicus/forecast*` | **`sg-payments`** |
| `<domaine>/api/widget-token*`, `/api/track-*`, `/api/comps.php`, `/api/_ratelimit.php`, `/api/paypal*`, `/api/stripe-webhook.php`, `/api/retry-failed-payment.php` | **`sg-payments`** |
| `<domaine>/*` | `sargagame-mq` / `-gp` / `-florida` / `-tulum` / `-puntacana` / `-rivieramaya` (Worker du dépôt, cible de migration) |

### Sondes live — lecture seule, 6 domaines

| Sonde | Résultat | Ce que ça prouve |
|---|---|---|
| `GET /api/mollie-webhook.php` | `200 {"ok":true}` | health-check de `sg-payments` — **pas** le PHP du dépôt (qui répondrait `400 {"error":"id + type requis"}`) |
| `GET /public/api/mollie-webhook.php` | `404 {"error":"not_found"}` (JSON) | le PHP **n'est pas joignable** : le Worker intercepte tout, y compris `/public/**` |
| `POST /api/mollie.php` `{"action":"__payment_smoke__"}` | **`500` — `error code: 1101`** | le backend de paiement live **lève une exception** sur le smoke **sans transaction** du propre gate de déploiement du dépôt (`cloudflare-production.yml:436-448`) |
| `POST /api/create-checkout.php` | **`404 {"error":"not_found"}`** | l'endpoint Stripe appelé par `src/PremiumModal.jsx` (l. 1704, 1966, 1984) **n'existe pas** en production |
| `POST /api/mollie` (sans `.php`) | **`500`** | idem |
| `GET /api/zzz-inconnu` | `404 {"error":"api_route_not_migrated","path":"/api/zzz-inconnu"}` | le Worker `/api/*` répond en JSON, avec une **liste de routes non migrées** |
| `GET /zzz-inconnu` (hors `/api/`) | `404` **HTML** | le reste vient des assets statiques (Pages/FTP) |

> **Conséquence directe : le revenu B2C est structurellement impossible en
> ce moment.** Le frontend appelle `/api/create-checkout.php` (404) puis
> `/api/mollie.php` avec `action:"create_payment"` (500). Aucun checkout ne peut
> être créé, aucun paiement ne peut être déclenché. Les **56,94 €** du §2 sont
> un **actif historique**, pas une capacité.

### `sg-payments` : un Worker sans version dans le dépôt

| Fait | Source | Valeur |
|---|---|---|
| Versions conservées | API Cloudflare | **10**, **toutes datées du 2026-10-01/02** |
| Dernière version | idem | `36fa827a-a39c-4156-9359-30fc383eb6c5` (n° 381) |
| Bindings | idem | secrets `MOLLIE_API_KEY`, `MOLLIE_PROFILE_ID`, `MOLLIE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_KEY` ; KV `TRANSIENTS` ; var `SUPABASE_URL` ; handlers `fetch` + `scheduled` |
| **Source dans le dépôt ?** | `.ai/current_state.md` | **NON** — « la source autoritative du Worker `sg-payments` n'est NI [dans le dépôt] » |

### Ce que cela change — et ce que cela ne change pas

Les 6 ventes payées non livrées datent du **2026-06-28 → 2026-07-19**.
`sg-payments` **n'existait pas encore** à ces dates (première version
conservée : 2026-10-01). Ces paiements **n'ont donc pas** été traités par
`sg-payments` : ils ont été traités par le **chemin PHP du dépôt**, dont la
validation est **cassée** (§7 R13, démontré par exécution PHP réelle).

→ **Deux défauts distincts, à ne pas confondre :**

| | Cause | Où | État |
|---|---|---|---|
| **Historique** (6 ventes de juin–juillet) | `$payment->amount->currency` lit `null` sur un **tableau** → tout paiement refusé en 400 → aucun accès servi | `public/api/mollie-webhook.php` | **cause racine prouvée**, correctif **préparé, non appliqué** (R13) |
| **Actuel** (aujourd'hui) | `/api/mollie*` pointe vers `sg-payments`, Worker **sans version dans le dépôt**, qui **lève une exception** (CF 1101) et **ne connaît pas** `/api/create-checkout.php` | routes Cloudflare | **cause prouvée**, correctif **hors périmètre direct** (R17) |

> ⚠️ **Ne pas basculer les routes sans porter le fulfillment B2B.**
> `workers/sargagame/index.js` (cible de migration) ne livre **que** le B2C :
> son webhook n'accepte que des identifiants de paiement (`tr_…`) et
> **rejette** les identifiants d'abonnement (`sub_…`), et il n'a **aucun** cron.
> `sg-payments` porte les abonnements B2B, le renewal, le cron, la
> ré-accusation et le tracking. Basculer `/api/mollie*` ou `/api/b2b-*` vers le
> Worker du dépôt **sans** porter ces fonctions **casserait le paiement
> récurrent** — c'est-à-dire le seul moteur qui pourrait rapporter.
> → **Récupérer ou porter la source `sg-payments` AVANT toute bascule.**

---

## 2ter. Les deux moteurs de revenue partagent la même organisation Mollie

Découvert pendant la mesure de BOT-WOW (2026-11-04T16:45Z–17:10Z) et
**vérifié dans les deux dépôts**.

| Fait | Preuve |
|---|---|
| **Profil canonique Sargasses** | `pfl_t8KCk4Cm2C` — `public/api/mollie-config.example.php:9`, `scripts/write-mollie-config.cjs:49`, `src/Sargasses_PROD.jsx:1778` (dépôt `aveca/sargagame`) |
| **Les paiements BOT-WOW en production utilisent CE profil** | `orders.metadata` de la D1 de production BOT-WOW : `"profileId":"pfl_t8KCk4Cm2C"` et lien dashboard `org_19554425` — **11 / 11** paiements |
| **Le tracker MRR n'est pas scopé par produit** | `scripts/automation/mollie-mrr.cjs:175-192` : `revenue_month` cumule **tous** les paiements payés du compte ; seuls `passes_month` (metadata.pass) et `b2b_month` (description contient « pro »/« brief ») sont filtrés |

**Conséquences :**

1. **Contamination croisée de la mesure de revenu** : un paiement BOT-WOW
   payé (20,00 €) serait compté dans `revenue_month` et dans
   `currencyBreakdown` de Sargasses. **Impact aujourd’hui : 0** — les 11
   paiements BOT-WOW sont expirés **impayés**, et les 6 paiements Sargasses
   sont de juin–juillet (BOT-WOW : octobre+). Mais l’attribution repose sur
   une **convention**, pas sur une construction.
2. **Une seule organisation Mollie pour deux produits** : le rapprochement
   comptable ne peut pas se faire « par compte », seulement par
   `profileId` / `description` / `metadata`.
3. **Symétriquement**, le checkout BOT-WOW n’est pas séparable : il dépose
   dans l’organisation Sargasses (PR BOT-WOW #80, §3bis.2).

> ⇒ **R18 (nouveau)** : avant toute activation d’un checkout réel d’un
> côté comme de l’autre, il faut **séparer** les deux produits (profil + clé
> BOT-WOW dédiés) ou **coder explicitement** la règle d’attribution dans
> `mollie-mrr.cjs`. Ce n’est pas une amélioration : c’est une condition de
> mesurabilité.

### ✅ R18 — **CORRIGÉ** le 2026-11-04T18:01:55Z (PR #1277, commit `df01afd9`)

La seconde branche (« coder explicitement la règle d’attribution ») a été
**exécutée**. `scripts/automation/mollie-mrr.cjs` ne compte plus comme revenu
Sargasses que les enregistrements portant **la marque Sargasses/Sargassum**
**et** un marqueur de pass ou de plan B2B connu :

| Règle | Détail |
|---|---|
| Pass B2C | `metadata.pass ∈ {p7, p30, trip7, season, sos}` **ou** description contenant un mot-clé de pass |
| B2B | `metadata.plan ∈ {pro_monthly, brief_monthly, brief_annual, pro_annual, territory_annual, …}` **ou** description contenant « pro »/« brief »/« territoire » |
| Abonnements | **uniquement** `pro_monthly` et `brief_monthly` (les deux plans récurrents du dépôt) **et** description marquée |
| Ce qui est exclu | tout paiement non marqué (BOT-WOW, autre produit, ambigu) → compté dans **`unattributed`**, jamais dans les totaux Sargasses |
| Monnaies | EUR, USD et UNKNOWN restent séparés ; **aucune conversion FX** introduite |
| Historique | schéma de rapport/history porté en **v3** ; l’historique v2 (non scopé) est **exclu** des tendances |

**[V] Vérification par EXÉCUTION (20 cas)** — formes réelles de paiement :

| Cas | Attendu | Mesuré |
|---|---|---|
| 6 paiements B2C historiques reconstitués (`p7`/`p30`, EUR/USD) | attribués | ✅ |
| `trip7`, `season` (tarifs actuels) | attribués | ✅ |
| `pro_monthly`, `brief_monthly` | attribués | ✅ |
| paylinks B2B annuels (`pro_annual`, `brief_annual`, `territory_annual`, `pro_annual_usd`) — **sans `metadata`** | attribués | ✅ |
| paylinks B2C (`trip`, `stay`, `season` USD) — **sans `metadata`** | attribués | ✅ |
| **BOT-WOW 20,00 €** | **exclu** | ✅ |
| BOT-WOW avec `metadata.pass` (hypothétique) | **exclu** | ✅ |
| paiement sans marque / vide | **exclu** | ✅ |
| abonnement BOT-WOW | **exclu** | ✅ |

**[V] Vérification END-TO-END du calcul** sur un compte partagé reconstitué
(6 paiements Sargasses + 1 abonnement B2B + 1 paiement BOT-WOW + 1 paiement
sans marque) :

```json
"passes_month_eur": 38.96,          // = le brut EUR mesuré des 6 paiements réels
"by_currency": { "EUR": { "payments": 4, "revenue_month": 38.96 },
                 "USD": { "payments": 2, "revenue_month": 17.98 } },
"payments_this_month": 6,            // Sargasses uniquement
"account_payments_this_month": 8,    // tout le compte Mollie partagé
"unattributed_payments_this_month": 2,
"unattributed_revenue_this_month_by_currency": { "EUR": 29.99 }   // = 20,00 BOT-WOW + 9,99 non marqué
```

→ Le tracker **reproduit exactement** le revenu Sargasses mesuré (38,96 €
+ 17,98 $) **et** isole BOT-WOW sans le compter. C'est la preuve que la
correction **ne supprime pas** de revenu réel : elle le sépare.

> ⚠️ **Ce que R18 ne corrige pas.** La règle d'attribution repose sur une
> **convention** (marque dans la `description`), pas sur un identifiant
> cryptographique de produit. Elle est **fiable pour les enregistrements
> produits par ce dépôt** (marque vérifiée sur chaque chemin de création) mais
> reste une convention. La **séparation des comptes Mollie** (profil + clé
> BOT-WOW dédiés) demeure la seule solution structurelle et reste demandée
> côté BOT-WOW (PR #80, B13).

---

## 3. Funnel - census et limites de mesure

Agrégation lecture seule de `public.analytics_events` sur 30 jours (2026-11-04).
Ce sont des **lignes d'événements**, pas des personnes uniques.

| Événement | Lignes | Dernière observée |
|---|---:|---|
| `sg_premium_modal_open` | 3 479 | 2026-11-04 |
| `sg_pass_offer_view` | 3 324 | 2026-11-04 |
| `sg_pass_cta` | 34 | 2026-10-29 |
| `sg_checkout_started` | 5 | 2026-10-28 |
| `sg_checkout_redirect` | 30 | 2026-10-30 |
| `sg_conversion` | 23 | 2026-10-30 |
| `sg_b2b_offer_view` | 101 | — |
| `sg_b2b_step` | 31 | 2026-10-29 |
| `sg_lead_banner_view` / `submit` | 714 / 1 | 2026-10-07 / 2026-10-05 |

**Limites (à ne pas contourner) :**

- La clé de session n'est présente que dans 22 des 3 324 lignes `sg_pass_offer_view` et
  dans 0 des 34 `sg_pass_cta` → **aucun taux de conversion fiable** ne peut être calculé.
- Les 23 `sg_conversion` ne sont pas une cohorte homogène (14 `p30`, 9 `sos`) : ce ne
  sont pas des achats du PassOffer affiché.
- `sg_demo_open` / `sg_offer_view` : 0 ligne ; `scripts/automation/data/daily-metrics.json`
  s'arrête au 2026-10-21 → l'instrumentation secondaire est aveugle, cause non établie.
- `payments_real` issu du Google Apps Script est connu comme trompeur (champ Stripe
  dominant mais périmé) → **seule** la réconciliation Mollie fait foi.

Tunnel cible B2C (étapes à instrumenter dans cet ordre) :
`plage → verdict → intention → durée → offre → checkout → confirmation → alertes`.
La nouvelle étape **durée** est désormais câblée : `?pass=p30|trip7|season` présélectionne
le pass dans le paywall (`src/PremiumModal.jsx` → `resolvePass`).

---

## 4. Divergences affichage / débit — trouvées et corrigées

| # | Divergence constatée | Où | Correction appliquée | Preuve |
|---|---|---|---|---|
| D1 | « 7,99 € (7 j) » affiché, **4,99 €** débité | `/offres/` | Prix aligné sur le serveur (4,99 €) | `price-parity.test.cjs` §7 |
| D2 | « 24,99 € (saison) » affiché, **19,99 €** débité | `/offres/` | 19,99 € + « 210 jours » | idem |
| D3 | CTA `/offres/` sans paramètre → ouvrait **p30 (30 j)** au lieu du pass choisi | `/offres/` | `?pass=p30|trip7|season` | idem |
| D4 | « 4,99 €/mois » + « S'abonner » annoncés, **14,99 € one-time** débités | `/premium/` | Page régénérée depuis `scripts/lib/premium-page.cjs` : catalogue de passes, plus d'abonnement | idem §7 |
| D5 | 11,99 $ affiché, **13,79 $** débité (surcharge USD +15 %, juin→nov.) | `PassOffer` | Client envoie la **base**, affiche l'**effectif** ; bandeau explicite | `src/lib/pricing.js`, §8 |
| D6 | CGV : 7,99 € / 24,99 € / 19,99 $ (saison en USD) | `public/cgv.html` | 4,99 € / 19,99 € + clause +15 % USD + saison non vendue en USD | idem §7 |
| D7 | « dès 7,99 € » (prix d'entrée) sur 7 surfaces | a-propos, about, veilleur, HomeAZ, HomeJuicy, VerticalesMap, PremiumModal | « dès 4,99 € » = plus bas prix réellement débité | idem §7 |
| D8 | Clé serveur `saison` (invalide) au lieu de `season` ; centimes EUR en dur | PR #1258 (supersédé) | `resolvePass` + `passBaseCents` | `price-parity.test.cjs` §8 |
| D9 | Template de config documentant `p7` (799) et un abonnement B2C fantôme 4,99 €/mois | `public/api/mollie-config.example.php` | `season` documenté, `p7` et l'abonnement fantôme retirés | idem §11 |

**Aucun prix serveur n'a été modifié.** Les allowlists (`mollie.php`, `create-checkout.php`),
les grants (`workers/sargagame`) et les prix Mollie sont inchangés : la correction porte
sur ce qui est **affiché** et sur ce qui est **envoyé** par le client.

### ⚠️ Ces corrections ne sont **pas en production** (re-mesuré le 2026-11-04T17:25Z)

Le correctif est **mergé** (PR #1264 → `22ff4d8b`), mais le déploiement est
**bloqué** (§10). Les 6 domaines servent donc encore l'ancien build
(`version.json` = `v221` / `2026-10-12` / `df18df5d`) :

| Surface live (Martinique) | Ce qui est encore affiché | Ce que le dépôt corrigé affichera |
|---|---|---|
| `/offres/` | 4,99 € **+ 7,99 € + 14,99 € + 24,99 €**, « **dès 7,99** », **aucun** `?pass=` | 4,99 € / 14,99 € / 19,99 €, « dès 4,99 », `?pass=p30\|trip7\|season` |
| `/premium/` | 4,99 € + 14,99 €, **« /mois »** | 4,99 € / 14,99 € / 19,99 €, **sans** « /mois » |
| `/a-propos/`, `/veilleur/` | « **dès 7,99** » (+ « /mois » sur veilleur) | « dès 4,99 » |

⇒ **Tant que le déploiement n'a pas eu lieu, la divergence affichage/débit
est toujours visible en production** (7,99 € affiché contre 4,99 € débité,
24,99 € contre 19,99 €, « /mois » contre paiement unique). Elle sera
**résorbée par le déploiement**, pas par le code seul : c'est une raison de
plus pour que le pipeline de publication se débloque.

> Note : en attendant, `/api/mollie.php` renvoie **500** et
> `/api/create-checkout.php` **404** (§2bis) : **aucun débit n'est possible**,
> donc ces divergences n'ont pas encore coûté d'argent — mais elles sont
> prêtes à le faire dès que le checkout sera réparé.

---

## 4bis. Le trou de fulfillment est **corrigé dans le code** (PR #1274)

Le trou de fulfillment de R7 (« 6/6 paiements payés sans accès ») a une
**cause racine identifiée** : l'ancien code de pass 7 jours (`p7`) n'est pas
reconnu par `validateMollieAmount` → `unknown_pass` → **aucun accès émis**.

### La preuve que 4 des 6 paiements sont justement des `p7`

**[V] Décomposition unique des montants mesurés.** Le brut mesuré est
**38,96 €** sur 4 paiements EUR et **17,98 $** sur 2 paiements USD. La
seule combinaison compatible avec les tarifs historiques est :

| Devise | Décomposition | Total |
|---|---|---|
| EUR | 3 × `p7` (7,99 €) + 1 × `p30` (14,99 €) | **38,96 €** ✅ |
| USD | 1 × `p7` (5,99 $) + 1 × `p30` (11,99 $) | **17,98 $** ✅ |

→ **4 des 6 paiements encaissés sont des `p7`**, exactement ce que la
branche legacy du correctif sait servir, et exactement ce que le code
actuel rejetait. Le correctif ne sert donc pas un cas théorique : il sert
**les paiements réels**.

### Ce que la PR #1274 change (3 points, aucun prix modifié)

| # | Correction | Effet |
|---|---|---|
| **P0-2** | Fenêtre historique `p7` : date **unique** `LEGACY_CUTOFF_DATE = 2026-08-01T00:00:00Z`, `payment.createdAt` lu **côté serveur**, fuseau explicite **exigé** ; refus `legacy_expired` si date absente/invalide/sans fuseau/≥ coupure. `create_payment` **refuse** `p7` (400) | Les 4 paiements `p7` historiques deviennent servables ; **aucun nouveau** prix legacy n'est créable |
| **P0-3** | Logs : identifiant de corrélation **aléatoire** par requête (`crypto.getRandomValues`), **sans lien dérivé** du `paymentId` ; whitelist stricte des champs journalisés (`status`, `code`, `reason`) | Le `paymentId`, un email ou un secret passé par erreur sont **ignorés**, pas journalisés |
| **P0-4/5/6** | Nouveau `scripts/automation/backfill-mollie-grants.cjs` : HTTP 200 **obligatoire** sur payment / refunds / chargebacks / grant ; toute lecture en échec → contrôle `indeterminate` (**jamais** converti en « rien à grant ») ; rapport **sans PII** ; **DRY RUN par défaut** ; `--apply` exige une confirmation explicite **et** re-vérifie les 4 lectures avant chaque RPC | Le backfill ne peut **pas** accorder un accès sur une donnée illisible |

### **[V] Contrat vérifié par EXÉCUTION RÉELLE du Worker** (7/7)

| # | Cas | Attendu | Mesuré |
|---|---|---|---|
| 1 | `create_payment` avec `p7` | refus | ✅ HTTP 400 `{"error":"Prix invalide"}` |
| 2 | webhook `p7` créé **avant** la coupure | grant | ✅ `granted:true` |
| 3 | webhook `p7` créé **après** la coupure | **aucun** grant | ✅ `granted:false, reason:"legacy_expired"` |
| 4 | `p7` avec une date **sans fuseau explicite** | **aucun** grant | ✅ `granted:false` |
| 5 | `p7` payé au tarif **courant** (4,99 €) | **aucun** grant | ✅ `granted:false, reason:"amount_mismatch"` |
| 6 | le log de refus contient-il le `paymentId` ? | **non** | ✅ log = `[mollie-grant] grant_granted {"cid":"req_448661046…"}` — identifiant aléatoire, aucun lien avec `tr_…` |
| 7 | `p30` au tarif courant (14,99 €) | grant | ✅ `granted:true` — **pas de régression** sur les paiements non legacy |

> Les refus (cas 3-5) sont **fail-closed** : HTTP 200 avec `granted:false`
> et un motif explicite — le webhook acquitte, mais **aucun accès n'est
> délivré**. C'est le comportement attendu et testé.

### Ce qui reste bloqué (et pourquoi ce n'est pas un détail)

1. **Le code mergé n'est pas en production** : le déploiement est bloqué
   par la garde de fraîcheur satellite (§10). Rien n'a été publié.
2. **Le chemin de paiement live n'est pas ce Worker** : c'est `sg-payments`,
   dont la **source est absente du dépôt** (R17). Le correctif est donc
   **préparé pour la bascule**, pas encore actif.
3. **Le backfill n'a pas été exécuté** : c'est une **écriture en
   production** (RPC `sg_upsert_payment_grant`) → **autorisation requise**.

---

## 5. P0 trouvé et corrigé : l'essai B2B 30 jours était mort

`public/api/b2b-trial.php` appelait `sg_analytics_event()`, **fonction supprimée de
`public/api/mollie-lib.php` par le commit `16eb15e12c`**. En PHP, l'appel d'une fonction
inexistante est une **Error fatale** — le `@` ne la supprime pas. Conséquence :
l'endpoint d'essai renvoyait une erreur **avant de rendre le token** → l'essai
« instantané » n'était jamais activé, l'événement de funnel `b2b_trial_started`
n'arrivait jamais, et l'hôtelier retombait sur un message « on vous recontacte sous 24 h »
sans personne derrière.

**Preuve ( harnais local, aucune écriture en production )** :
copie de l'endpoint dans un dossier temporaire, sortie Apps Script + Supabase redirigée
vers un sink local, stubs `curl` (PHP local sans extension curl).

- Version commitée (avant correctif) → `Fatal error: Uncaught Error: Call to undefined
  function sg_analytics_event()` en `b2b-trial.php:95`, **aucun JSON, aucun token**.
- Version corrigée → `{"ok":true,"token":"…","days":30}`.

**Correctif :** `sg_analytics_event()` restaurée dans `mollie-lib.php` (fire-and-forget
vers `analytics_events`, clé publique, sans PII) + garde `function_exists()` sur chaque
appel + l'essai est désormais rendu **avant** l'émission de la télémétrie.
Verrouillage : `tests/unit/b2b-trial-consent.test.cjs`.

**Résiduel non traité volontairement :** `mol_b2b_trial_email()` (l'email transactionnel
qui doit livrer le lien d'accès) a été supprimé **par le même commit** et n'existe plus
dans le dépôt → l'email de l'essai **n'est pas envoyé** aujourd'hui, alors que l'IHM
l'annonce (« on vient aussi de vous l'envoyer par email »). Le restaurer change le
comportement d'email client → **autorisation explicite requise** (le code d'origine est
récupérable : commit `af8408e4`).

### Consentement marketing (ajouté, sans toucher aux envois)

- Case **optionnelle, jamais pré-cochée** (`useState(false)`, `checked` piloté).
- Stocké avec **version + horodatage + source** (`consent_v = 2026-11-04`, `consent_ts`,
  `consent_source`) dans le payload du lead et dans l'événement `b2b_marketing_consent`.
- L'essai reste **transactionnel** : l'endpoint n'envoie que l'email d'essai et ne
  déclenche **aucune** campagne. Aucun envoi de masse n'est autorisé sans audit
  préalable (historique d'envoi, désinscription, preuve de consentement).

---

## 6. Instrumentation réelle — état après correctif

| Mesure | État |
|---|---|
| `sg_price_mismatch` (écart affiché/débité) | **nouveau** : le serveur renvoie le montant effectif (`amount` dans la réponse `create_payment`), le client compare et trace l'écart |
| `sg_b2b_trial_started` | restauré (la fonction qui le porte n'existait plus) |
| `sg_b2b_marketing_consent` | nouveau (opt-in explicite, versionné) |
| `sg_pass_cta` / `sg_pass_offer_view` | enrichis (`pass`, `base_cents`, `cents` effectif) |
| **Session key / corrélation de parcours** | **corrigée (PR #1255, `61c9959d`)** : sink Supabase déplacé **après** `sgCollectEvent` (qui crée `sessionStorage.sg_sid`), `sid` attaché **uniquement sous consentement explicite**, sentinelle `"x"` exclue du comptage. Un taux de conversion par session devient calculable. |
| **Submission de lead** | **corrigée (PR #1142, `b589099c`)** : `submitLead()` sortait sur `if (navigator.sendBeacon(...)) return` → l'événement `sg_email_submit` n'était **jamais** écrit quand le beacon réussissait (714 vues / 1 soumission mesurées) |
| **Exposition `api_secret` GA4** | **corrigée (PR #1142)** : 0 exposition sur les 5 fichiers (elle était **vivante en production**) |
| **Checkout SOS sur observation périmée** | **corrigé (PR #1243, `e7162cde`)** : garde **avant** le `POST /api/mollie` — on ne vendait plus un verdict inexistant |
| **Emails clients sur données périmées** | **corrigé (PR #1265, `fc6eb8cb`)** : `email-automation` conditionné à une publication fraîche |
| **Mesure du revenu (MRR)** | **corrigée (PR #1271)** : le tracker MRR était dans le job d'email → il se **gelait** quand la donnée satellite était périmée. Job autonome `revenue-metrics`. |
| `daily-metrics.json` | figé au 2026-10-21 (cause non établie) |
| **Essai → abonnement payé (B2B)** | **instrumenté (PR #1275, `b589fd66`)** : `b2b_trial_to_paid` **émis** par le webhook (mensuel via `subscription.paid`, annuel via `payment.paid`), **déduplonné** par identifiant d'encaissement, émis **avant** le contrôle du mirror ; `payment_rejected` rend visible un paiement signé refusé ; le lecteur `funnel-b2b-from-supabase.cjs` est **branché** dans le job autonome `revenue-metrics` (son instantané `funnel-b2b-snapshot.json` n'a jamais existé avant) et agrège `rejected_by_tier` / `rejected_by_kind`, **sans PII**. Preuve : exécution PHP réelle (`tests/fixtures/b2b-payment-harness.php`) → 3 appels = **2 événements**, **0** recompte en nouveau processus. ⚠️ **Porte sur le chemin PHP du dépôt** : tant que R17 n'est pas traité, cette instrumentation **ne produit aucune donnée live** (§2bis). |

---

## 7. Résiduel documenté (non réécrit : hors périmètre ou autorisation requise)

| # | Résiduel | Pourquoi pas corrigé ici |
|---|---|---|
| R1 | Allowlist Stripe EUR de `create-checkout.php` : `799` et `2499` (et `999`) encore acceptés | Chemin **latent** (atteignable seulement via `?pay=stripe`), aucun prix affiché ne correspond. Retirer des montants acceptés = modification d'un chemin de paiement → autorisation requise. **Aucun prix vivant n'est rejeté** (499 / 1499 / 1999 présents). |
| R2 | Paywall d'abonnement **legacy** (4,99 €/mois + 49 €/an) encore présent dans `WorldPaywall` / `ComicPaywall` | Visible seulement dans les régions en `PAY_CAPTURE_ONLY` (barbados/tulum) ou via `?pwpass=0` → pas une surface B2C EUR/GP atteignable. Réécriture = refonte, pas un correctif de prix. |
| R3 | `public/api/mollie-passlinks.json` : liens `p7_*` orphelins (7,99 € / 5,99 $) | Paylinks historiques hors catalogue affiché ; plus aucun code ne les lit pour un achat. |
| R4 | Clés i18n mortes `premiumPrice` (« 4,99 €/mois ») dans `Sargasses_PROD.jsx` | Non rendues sur les surfaces publiques actuelles. |
| R5 | `public/themes-lab/*` (maquettes) | Hors production. |
| R6 | Bascule de mois serveur/navigateur autour du 1er juin et du 1er décembre | La surcharge USD est calculée par le serveur (fuseau serveur) alors que l'affichage suit le navigateur. Fenêtre de quelques jours par an. **Désormais mesuré** (`sg_price_mismatch`) au lieu d'être invisible ; correction durable = endpoint de prix serveur (non ajouté ici). |
| R7 | 6/6 paiements payés sans accès (`paid_no_grant`) | **Le code correctif est désormais PRÊT** (PR #1274, `9a10faa3`, mergée 2026-11-04T17:52:43Z) : alias `p7` + fenêtre historique fail-closed, logarithmes sans identifiant, script de backfill fail-closed en DRY RUN par défaut. **Reste à** : l'**exécution** du backfill = écriture en production → **autorisation requise**. Voir §4bis. |
| R8 | `mol_b2b_trial_email()` absent → email de l'essai non envoyé | Changement d'email client → autorisation requise. |
| R9 | `b2b_subscriptions` vide, `sg_b2b_trial_activated` jamais observé | Conséquence du P0 §5 : le tunnel B2B n'a jamais pu s'activer. Confirmé indépendamment par l'API Mollie (0 subscription active, MRR 0 €). |
| R10 | Palier B2B affiché **avant** le moteur récurrent (Brief 29 € avant Pro 79 €) | **Corrigé (PR #1098, `393dc7a7`)** : Pro 79 € passe en tête. Aucun prix modifié. |
| R11 | Territoire « dès 199 €/mois HT » (1 990 €/an) **sans paylink carte** dans l'app | **Volontaire** : `payOf()` exclut `territoire` (parcours devis/BDC, pas de CB juxtaposée). Le paylink `territory_annual` (1 990 €) existe dans `public/api/b2b-paylinks.json` mais n'est **pas** exposé dans l'app. La conversion Territoire dépend donc d'un parcours **non self-serve**, dont le code d'email (`mol_b2b_trial_email`) est **absent du dépôt** (R8) → **le MRR Territoire n'est pas mesurable en l'état**. |
| R12 | `scripts/automation/lib/b2b-paylinks.cjs` mappe un lead `territoire` sur `pro_annual` (690 €) par défaut | `map[tier] || 'pro_annual'` : un lead Territoire en séquence drip reçoit un lien **Pro** à 690 €. Divergence offre/prix sur la prospection — corriger = changer le contenu d'un email de prospection → autorisation requise. |
| **R13** | **Validation du webhook PHP : tout paiement signé est refusé en HTTP 400.** `validateMollieAmountPHP()` lit `$payment->amount->currency` alors que `SgMollieClient::_request()` renvoie `json_decode($response, true)` → un **tableau** → `$currency=''`, `$value=0`. Preuve : exécution PHP réelle du **code livré** (`tests/fixtures/b2b-payment-harness.php`) — pass B2C 14,99 €, B2B mensuel 79 €, B2B annuel 690 €, paylink B2C 19,99 € : **tous refusés**. | Correctif = **2 lignes** (`$payment->amount['currency']` / `['value']`). Modifie le **chemin de paiement** → **autorisation explicite requise**. Rollback : revert du commit. |
| **R14** | **Aucun accès n'est livré pour un paiement par lien.** L'API Mollie `payment-links` n'accepte **pas** de `metadata` et `webhookUrl` n'est pas patchable a posteriori : le paiement arrive **sans** `source` ni `pass` → rien ne le rattache à un palier → aucun token n'est émis. Le design existe dans `scripts/automation/mollie-paylinks.cjs` (« identification par description + montant ») mais **n'a jamais été implémenté**. | Reconnaître le palier par (montant, devise) = **octroyer un droit d'accès** pour de l'argent déjà encaissé → autorisation requise. |
| **R15** | `mol_b2b_grant_once()` / `mol_b2c_pass_grant()` renvoient `['granted'=>false,'reason'=>'already_granted']` **sans** `mirror_ok` → le webhook fait `$mirrorOk = $grant['mirror_ok'] ?? false` → **HTTP 500** sur chaque rejeu, et le mirror Supabase **n'est jamais re-tenté**. | Un rejeu de webhook Mollie (5xx) tombe dans une **boucle morte** : 500 → rejeu → 500. Le mirror ne se répare jamais tout seul. Correctif = 1 branche → **change un code HTTP de webhook** → autorisation requise. |
| **R16** | **Dérive de prix sur la grille des liens de paiement** : `sejour_eur` 12,99 €, `sejour_usd` 9,99 $, `saison_usd` 14,99 $ — alors que la vérité canonique est `trip7` 4,99 € / 5,99 $ et `season` USD **`null`**. Les deux grilles sont désormais **parity-lockées** par test (11/11) : la divergence est désormais **visible**, pas silencieuse. | Ce sont des **prix** → décision commerciale explicite requise. **Aucun prix affiché n'est modifié** par ce rapport. |
| **R17** | **Le chemin de paiement live n'est pas versionné dans le dépôt.** `/api/mollie*`, `/api/b2b-*`, `/api/create-checkout*` → Worker `sg-payments`, **source absente du dépôt** (10 versions, toutes du 2026-10-01/02). Symptômes mesurés : `POST /api/mollie.php` → **500 / CF 1101** ; `POST /api/create-checkout.php` → **404**. | **Changement de chemin de paiement** → autorisation requise. Et la bascule **n'est pas un simple réglage** : `workers/sargagame/index.js` ne livre **que** le B2C (ids `tr_…` seulement, pas `sub_…`, pas de cron) → il faut **porter** le fulfillment B2B de `sg-payments` d'abord. |
| **R18** | **La mesure de revenu n'est pas scopée par produit.** `scripts/automation/mollie-mrr.cjs:175-192` cumule dans `revenue_month` **tous** les paiements payés du compte Mollie ; or BOT-WOW encaisse dans la **même organisation** que Sargasses (`profileId pfl_t8KCk4Cm2C`, `org_19554425`, §2ter). | ✅ **CORRIGÉ (PR #1277, `df01afd9`, 2026-11-04T18:01:55Z)** : attribution stricte par marque + marqueur de pass/plan ; les enregistrements non attribués sont isolés sous `unattributed` et **exclus** des totaux. Vérifié par exécution (20/20 cas + calcul end-to-end reproduisant 38,96 € / 17,98 $). **Reste demandé** (BOT-WOW) : la **séparation physique des comptes** (profil + clé dédiés) — la règle d'attribution reste une convention, pas un identifiant de produit. |

---

## 8. Trois prochaines actions (classées : potentiel de revenu × preuve × effort)

> **Recalibrage du 2026-11-04T15:50Z.** Les trois actions ci-dessous ont été
> **remplaces** : la mesure du chemin de paiement réel (§2bis) a montré que le
> checkout B2C est **mort en production** (`404` + `500`), que le chemin
> historique est **cassé** (R13) et que le Worker live **n'est pas dans le
> dépôt** (R17). Aucune action de « mesure » ne peut produire de revenu tant
> qu'aucun paiement ne peut être créé. L'ordre ci-dessous suit donc
> **l'ordre des verrous**, pas celui de la confortabilité.

### 1) Rétablir la capacité à encaisser — porter `sg-payments` dans le dépôt (R17)
**Potentiel : le plus élevé des trois moteurs** (sans encaissement, B2C **et**
B2B valent **0 €** ; c'est le seul geste qui rouvre les deux) ·
**Preuve : maximale** (routes lues via l'API Cloudflare ; sondes live
`500`/CF 1101 et `404` ; 10 versions toutes datées du 2026-10-01 ; source
confirmée absente du dépôt par `.ai/current_state.md`) · **Effort : moyen à
élevé** (récupérer la source ou re-implémenter le fulfillment B2B —
subscriptions `sub_…`, renewal, cron, ré-accusation — dans
`workers/sargagame/index.js`, **avant** toute bascule de route).

Décision à prendre : **(a)** récupérer la source `sg-payments` (si elle existe
ailleurs : archives CI, session wrangler, backup) et la versionner, ou
**(b)** porter ses fonctions B2B dans le Worker du dépôt. Dans les deux cas,
la **bascule de route est une décision séparée** et exige l'autorisation
explicite.

### 2) Fermer la boucle « payé → accès » — les 6 `paid_no_grant` (R7 + R13 + R14)
**Potentiel : élevé** (6 clients ont payé sans service ; remboursement
actuellement 0/6 — risque juridique et réputationnel ; 56,94 € encaissés) ·
**Preuve : forte et désormais adossée au code** (cause racine **prouvée par
exécution** : 4 des 6 paiements sont des `p7` (§4bis) ; R13 : refus PHP
reproduit sur 4 formes de paiement ; R14 : l'absence de `metadata` sur les
liens de paiement est **structurelle**, pas un oubli) · **Effort : faible
pour R13** (2 lignes) **à moyen pour R14** (reconnaissance par montant+devise
puis octroi du token).

**Avancement au 2026-11-04T18:05Z :** le **code** du correctif d'alias `p7`
et de fenêtre historique est **mergé et vérifié par exécution** (PR #1274,
`9a10faa3`, §4bis), et le **backfill fail-closed** est prêt (DRY RUN par
défaut). Ce qui manque est **l'exécution** : c'est une **écriture en
production** (RPC `sg_upsert_payment_grant`) → **autorisation requise**.

⚠️ Ces deux correctifs **touchent le chemin de paiement** et **ne sont pas
appliqués en production** dans ce rapport. R13 seul rendrait acceptables
**100 %** des paiements signés — y compris des montants qui ne doivent pas
l'être si R14 n'est pas traité dans le même lot : **les traiter ensemble ou
pas du tout.** R13 et R14 restent donc **non appliqués**.

### 3) Activer l'essai B2B 30 jours et prouver une conversion (R8 + instrumentation)
**Potentiel : moyen à élevé** (le moteur récurrent Pro n'a jamais produit une
seule activation ; 101 vues d'offre → 31 étapes → 0 abonnement) ·
**Preuve : forte** (census §3 ; API Mollie §2 : 0 subscription, MRR 0 €) ·
**Effort : faible pour l'instrumentation** (déjà livrée : PR #1275 — écriture,
lecture, dédoublonnage, rebranchement du lecteur) **+ moyen pour l'email**
(R8, `mol_b2b_trial_email()` absent du dépôt → l'hôtelier reste sans accès
par email).

⚠️ L'instrumentation livrée (#1275) rend le funnel **mesurable**, mais elle
porte sur le **chemin PHP du dépôt** : tant que R17 n'est pas traité, elle ne
produira **aucune** donnée live. **Ne pas confondre « instrumenté » et
« mesuré en production ».**

---

## 8b. État de chaque moteur de revenu — synthèse mesurée

| Moteur | Architecture | Revenu **confirmé** | Ce qui manque pour décider |
|---|---|---:|---|
| **B2C** — passs à durée fixe | Gratuit + 4,99 € (7 j) + 14,99 € (30 j) + 19,99 € (210 j) | **56,94 €** bruts, 6 paiements, **0** depuis le 2026-07-19 | **le checkout est mort en production** : `/api/create-checkout.php` → 404, `/api/mollie.php` → 500/CF 1101 (§2bis, R17) ; + 6/6 payés sans accès (R13/R14) |
| **B2B** — Pro récurrent | Essai 30 j → Pro 79 €/mois ou 690 €/an ; Territoire sur devis | **0 €** de MRR, **0** abonnement actif | l'essai n'a jamais été activable (P0 §5) ; conversion payante **instrumentée** (#1275) mais **sur le chemin PHP**, pas sur le chemin live (R17) ; fulfillment B2B à porter depuis `sg-payments` |
| **BOT-WOW** — licence unique | Démo navigateur + **20 €** unique | **0,00 €**, 0 activation, 0 livraison | checkout Mollie 6/6 en échec ; code Worker non déployé |

Aucune de ces trois lignes ne permet de conclure à la rentabilité : les volumes
sont trop faibles et la chaîne de mesure a été rompue à plusieurs endroits.
Les correctifs de mesure et d’honnêteté sont en place ; il manque la preuve
d’un flux payant réel.

> **Constat le plus dur de ce rapport (2026-11-04).** Les trois moteurs
> convergent vers la **même** cause structurelle : **le chemin de paiement
> n’est ni vérifié ni versionné**. Pour Sargasses, il est dans un Worker
> absent du dépôt (R17) ; pour BOT-WOW, le Worker n’est pas déployé et son
> checkout échoue 6/6. **Réparer la capacité d’encaissement précède toute
> optimisation de tunnel** : mesurer un funnel dont le dernier maillon est mort
> revient à mesurer une panne.
>
> **Et les deux moteurs partagent la même organisation Mollie** (§2ter) :
> le checkout BOT-WOW dépose dans le compte Sargasses, et le tracker MRR
> n’est pas scopé par produit (R18). Le problème n’est donc pas seulement
> « un chemin de paiement mort par moteur » — c’est **une seule comptabilité
> pour deux produits, aucun code traçable, et aucun euro encaissé**.

---

## 9. Journal de preuves techniques (branche `revenue/offres-durees-prix-coherence-20261104`)

| Contrôle | Résultat |
|---|---|
| `node tests/unit/price-parity.test.cjs` | PASS (11 sections, parité des 6 sources de prix) |
| `node tests/unit/pass-offer-copy.test.cjs` | PASS (contrat de prix désormais porté par `src/lib/pricing.js`) |
| `node tests/unit/b2b-trial-consent.test.cjs` | PASS (fonction de télémétrie + consentement) |
| `php -l` sur `mollie.php`, `mollie-lib.php`, `b2b-trial.php`, `mollie-config.example.php` | OK |
| E2E local `b2b-trial.php` (sink local) | 500 fatale avant → 200 + token après |
| `npm run build` | OK |
| `node scripts/check-bundle-budget.cjs` | **206,6 Ko ≤ 210 Ko** (base : 210,0 Ko) — l'import mort de `PassOffer` dans `Sargasses_PROD.jsx` tirait le module de prix dans le chunk eager ; supprimé |
| `npm test` | voir §10 |

### §10 — CI / PR / déploiement

#### Identifiants

| Élément | Valeur |
|---|---|
| Branche | `revenue/offres-durees-prix-coherence-20261104` |
| Commit | `f899da28` (rebased sur `main` = `c4f9821d`, PR #1259) |
| **PR mergée (prix)** | **#1264** → `22ff4d8b3228778a384ae4763707576fc3f30b4b` (mergée le 2026-11-04T11:04:48Z) |
| **PR mergée (analytics, P0)** | **#1142** → `b589099c606ade07a8638de4c35dec4348c7de38` (mergée le 2026-11-04T12:26:00Z) |
| **PR mergée (funnel, session)** | **#1255** → `61c9959d9eaec9ba9799aa6117faf1577bea0824` (mergée le 2026-11-04T12:41:06Z) |
| **PR mergée (checkout SOS, honnêteté)** | **#1243** → `e7162cde83a6c82b6cb9ed1c64520ff3bd54d14a` (mergée le 2026-11-04T12:58:48Z) |
| **PR mergée (email outbound, garde)** | **#1265** → `fc6eb8cb223bdc90e1549ccac195da59b6c5d9ce` (mergée le 2026-11-04T13:01:55Z) |
| **PR mergée (ordre des paliers B2B)** | **#1098** → `393dc7a77d25fdbc773583d4c0edbb478a538622` (mergée le 2026-11-04T13:43:42Z) — Pro 79 € avant Brief 29 € |
| **PR mergée (mesure du revenu autonome)** | **#1271** → `90d083a1698ca6b330210d89364d2a9073df8c76` (mergée le 2026-11-04T14:00:55Z) — job `revenue-metrics` hors garde satellite |
| **PR (instrumentation funnel B2B)** | **#1275** → `b589fd66ca6c1039e4bc90af974e5002ed10646a` (branche `fix/b2b-funnel-instrumentation-20261104`, base `997efb6c`) — écriture `b2b_trial_to_paid` + `payment_rejected`, dédoublonnage, rebranchement du lecteur, grille paylinks parité 11/11, harness d'exécution PHP réelle. **Inertie vérifiée** : aucun prix, montant, remboursement, débit, email, droit d'accès ni code HTTP modifié. |
| **PR (rapport, ce document)** | **#1272** → branche `docs/revenue-state-b2b-measurement-20261104` |
| PR #1274 (DRAFT, **non mergée**) | `fix/p0-mollie-fulfillment-review` — revue P0 du fulfillment Mollie **côté Worker** (`sg-payments`) : cutoff `p7`, logs sans identifiant, backfill fail-closed. **Base périmée** (`ec49b167b`). **Non mergée, non mergée de mon fait** : elle est **DRAFT** et son périmètre recoupe partiellement R13/R14. **À consolider avec ce rapport** avant toute action — deux diagnostics du même trou, deux chemins de code différents. |
| Push direct du fondateur | `dc31d732` (2026-11-04T12:20:20Z) — conservé par le squash de #1142 (ancêtre vérifié) |
| Push `GITHUB_TOKEN` (sans effet) | `997efb6c` « veilleurs: digest 2026-11-04 » (2026-11-04T15:0xZ) — **zéro** workflow `push` déclenché : confirme la règle « un push `GITHUB_TOKEN` ne déclenche rien » (le job de mesure peut donc commiter sans annuler un run en cours). |
| PR initiale (abandonnée) | #1263 — fermée : GitHub lie une PR au SHA d'origine et refuse de la rouvrir après un force-push (« state cannot be changed… branch was force-pushed »). Le contenu a été repris à l'identique dans #1264. |
| PR #1259 (sécurité, mergée avant) | `c4f9821d` — retire les artefacts financiers/contact du dépôt public |
| PRs fermées comme supersédées | #1254 (spec 3 abonnements B2C mensuels), #1258 (clé `saison` + centimes en dur + CI rouge), #1260 (supersédée par #1259) |

#### CI sur le SHA exact

| Run | ID | Résultat |
|---|---|---|
| CI Tests (PR) | `41817769459` | **PASS** (`test-frontend`) |
| Perf Budget + Lighthouse (PR) | `41817769356` | **PASS** (`perf`, `lighthouse-report`) |
| GitGuardian | — | PASS |
| CI Tests (push `main`) | `41818452440` | **PASS** |
| Perf Budget + Lighthouse (push `main`) | `41818452517` | **PASS** |
| Daily Copernicus + Deploy (push `main`) | `41818452572` | **PASS** |

`npm test` local sur le même contenu : **141/141 fichier(s) de test OK** (le fichier
`tests/unit/financial-artifact-privacy.test.cjs` de #1259 s'ajoute aux 140 de la
branche). Le correctif CRLF du test `morning-brief-freshness` rend la suite portable
Windows/Linux (l'échec existait **aussi** sur `origin/main`).

#### Second merge sur `main` — PR #1142 (P0 exposition GA4) + push direct du fondateur

| Élément | Valeur |
|---|---|
| Push direct du fondateur | `dc31d732` — « fix(seo): stop publishing synthetic beach forecasts » (Coco, 2026-11-04T12:20:20Z) — touche `vite.config.js` + ajoute `tests/no-synthetic-seo-forecast.test.cjs` |
| **PR #1142 mergée** | **#1142 → `b589099c606ade07a8638de4c35dec4348c7de38`** (2026-11-04T12:26:00Z) — « fix(analytics): secure client telemetry and restore lead funnel logging » |
| Diff réel du squash | **11 fichiers**, +303 / −83 — **aucun** fichier de paiement, de checkout, de prix ou d'email client |

**Le P0 corrigé.** Le `api_secret` du Measurement Protocol GA4 était servi **au
navigateur** sur `public/veille/index.html`, `public/a-propos/index.html`,
`scripts/lib/reliability-page.cjs`, `vite.config.js` et `src/Sargasses_PROD.jsx`, et
était **présent en production** :

| URL | `api_secret` | `mp/collect` | IDs GA4 visibles |
|---|---|---|---|
| `https://sargasses-martinique.com/veille/` | 1 | 1 | `G-Q31VV3LLM9`, `G-V8JGMDZZ2Y` |
| `https://sargasses-martinique.com/a-propos/` | 1 | 1 | `G-V8JGMDZZ2Y` |

Après le squash : **0 exposition** sur les 5 fichiers, et le client ne mesure plus
que par la balise Google **consent-aware** (`window.gtag`) et le sink
first-party Supabase.

**Le tunnel de leads était cassé — et c'est le correctif qui a le plus de valeur
commerciale.** Sur `main`, `submitLead()` faisait :

```js
if (navigator.sendBeacon) { try { if (navigator.sendBeacon(APPS_SCRIPT_URL, body)) return } catch {} }
```

→ quand `sendBeacon` réussissait, la fonction **sortait immédiatement** et
`logAnalyticsEvent("sg_email_submit", …)` n'était **jamais** exécuté. La soumission
de lead n'était donc **pas** enregistrée côté Supabase dans le cas le plus
fréquent — ce qui explique mesurément `sg_lead_banner_view = 714` pour
`sg_lead_banner_submit = 1`. Après le correctif, le sink first-party est
**toujours** écrit (sans PII : `{source, island}`), et la livraison Apps Script reste
**best-effort et indépendante**. La mesure du tunnel B2B redevient exploitable.

**Ce qui n'a PAS été touché par ce merge.** Aucun prix, aucun montant accepté,
aucun checkout, aucun paiement, aucun remboursement, aucun abonnement, aucun email
client. La télémétrie de frustration perd son champ `email` (PII) au profit d'un
payload minimal (`sanitizeFrustrationAnalytics`) — c'est une **amélioration de
confidentialité**, pas un changement d'email envoyé au client.

#### CI et portes sur le SHA `b589099c` (état réel de `main`)

| Run | ID | Résultat |
|---|---|---|
| CI Tests (push `main`) | `41829229512` | **PASS** (`test-frontend`) |
| Perf Budget + Lighthouse (push `main`) | `41829229657` | **PASS** (`perf`, `lighthouse-report`) |
| Daily Copernicus + Deploy (push `main`) | `41829229503` | **PASS** (job `fetch-data` skippé — comportement `push` attendu) |
| Cloudflare Production (push `main`) | `41829229524` | **FAILURE — attendu et fail-closed** |

Détail du run de production `41829229524` sur `b589099c` :

| Job | Résultat |
|---|---|
| `build` (6 régions) | **failure** — `FAIL SATELLITE_PREDEPLOY region={mq,gp,florida,puntacana,rivieramaya,tulum} limit=900min reason=observation hors SLA (2906,4 min > 900 min)` |
| `mollie-live-gate` | **success** |
| **`certification-gate`** | **success** ← les deux checks requis (`test-frontend`, `perf`) sont verts **sur le SHA exact** |
| `deploy` / `deploy-pages` / `verify-fleet` / `post-deploy-verify` | **skipped** — rien n'a été publié |

→ **la porte de certification est désormais SAINE**. Le seul obstacle restant est
la SLA satellite (900 min) : dès que la grille NOAA du jour est publiée et
rafraîchie, le même SHA franchit toutes les portes. C'est ce que le
`workflow_dispatch` va déclencher.

Contrôle local équivalent sur le **SHA exact `b589099c`** (checkout de
`origin/main`, `npm run build` + `prepare-ftp` + `npm test` + budget bundle) :

| Contrôle | Résultat |
|---|---|
| `npm run build` | exit 0 |
| `node scripts/prepare-ftp.cjs` | exit 0 |
| `npm test` | **exit 0 — 144/144 fichier(s) de test OK** (141 + `client-analytics-privacy` + `lead-submit-analytics-sink` + `no-synthetic-seo-forecast` du fondateur) |
| `node scripts/check-bundle-budget.cjs` | **206,5 Ko gzip ≤ 210 Ko** ✓ |
| Exposition GA4 dans les 5 fichiers | **0** |
| Gardes fail-closed (`evaluateConditionsFreshness`, `isConditionsFresh`, `renderCleanBeachIndex`, `getSatelliteFreshness`, `suspendConditionTitle`) | **présentes** — vérifiées sur l'arbre fusionné, pas seulement sur le diff à deux points |
| Corrections de prix (`/offres/` : 4,99 € / 19,99 € / `?pass=p30` / `?pass=season`, pas de `/mois`) | **présentes** |

> Point de méthode : le diff à deux points `main → tête de PR #1142` laisse croire
> que le merge **supprime** `evaluateConditionsFreshness`, `renderCleanBeachIndex`
> et `getSatelliteFreshness` (la branche est 119 commits en retard). C'est un
> artefact du diff deux points : la fusion à trois points les **conserve**. Vérifié
> sur l'arbre réellement fusionné et sur le SHA mergé.

#### Trois merges de plus sur `main` — mesure, honnêteté du checkout, honnêteté de l'email

| PR | SHA | Objet |
|---|---|---|
| **#1255** | `61c9959d` (2026-11-04T12:41:06Z) | **Corrélation de session du funnel** — le tunnel n'était pas mesurable |
| **#1243** | `e7162cde` (2026-11-04T12:58:48Z) | **Checkout SOS bloqué si l'observation satellite n'est pas courante** |
| **#1265** | `fc6eb8cb` (2026-11-04T13:01:55Z) | **Emails clients conditionnés à une publication fraîche** + purge analytics en lecture seule par défaut |

**#1255 — pourquoi le tunnel n'était pas mesurable.** Le census Supabase des
30 jours (lecture seule) donnait `sg_pass_offer_view` = 3 324 lignes mais
`sg_lead_banner_submit` = 1 pour `sg_lead_banner_view` = 714. Deux causes
distinctes, corrigées :

| Symptôme | Cause | Correctif |
|---|---|---|
| `sid` présent dans **22 lignes sur 3 324** | le sink Supabase était appelé **avant** `sgCollectEvent`, qui est la fonction qui crée `sessionStorage.sg_sid` → au premier événement de l'onglet, le `sid` n'existait pas encore | sink Supabase déplacé **après** `sgCollectEvent` |
| `sg_lead_banner_submit` = 1 pour 714 vues | `submitLead()` faisait `if (navigator.sendBeacon(...)) return` → le sink `sg_email_submit` n'était **jamais** écrit quand le beacon réussissait (corrigé par #1142) | sink first-party **toujours** écrit, livraison Apps Script best-effort séparée |

#1255 attache aussi le `sid` **uniquement sous consentement explicite**
(`localStorage.sg_cookie_consent === "accepted"`) et exclut la sentinelle `"x"`
(que `_sgcSid()` renvoie quand `sessionStorage` est indisponible) du comptage de
session — sans cela, toutes les sessions sans stockage seraient comptées comme
**une seule** session fictive.

**#1243 — contradiction affichage/offre sur le checkout SOS.** Sur `main`,
l'interface affichait déjà « *Observation satellite absente, invalide ou trop
ancienne : aucun verdict actuel n'est publié* » — **et le bouton d'achat ouvrait
quand même le paiement**. On vendait l'accès à un verdict qui n'existait pas, en
pleine production servie avec une observation de 8 jours. Le garde est désormais
**avant** le `POST /api/mollie` : `observationCurrent !== true` → aucun paiement
ouvert, aucun tracking `sg_sos_checkout_start`, message honnête affiché. **En
régime sain (donnée fraîche), le comportement est strictement inchangé.**

**#1265 — des emails clients partaient avec des données périmées.** Mesuré sur
les 3 derniers runs `schedule` : `fetch-data` en **failure**
(`BLOCKED_STALE_SOURCE`) et `email-automation` en **success** — le job n'avait
aucune dépendance de `fetch-data` et partait en parallèle.

| Run | `fetch-data` | `email-automation` | Âge de l'observation |
|---|---|---|---|
| `41780985819` (2026-11-04T05:43Z) | **failure** | **success** | ~18 h |
| `41736428821` (2026-11-03T23:06Z) | **failure** | **success** | ~23 h |
| `41696164953` (2026-11-03T18:41Z) | **failure** | **success** | ~24 h |

Le job est maintenant conditionné à `needs.fetch-data.result == 'success'` **et**
`gate_outcome == 'success'` **et**
`publication_status ∈ {FRESH_AND_PUBLISHED, NO_NEW_OBSERVATION}` — les deux
sorties sont des **sorties de job réelles** (`fetch-data.outputs`, lignes 45-47
du workflow). Effet de bord assumé et documenté : la grille NOAA publiant une
observation par jour à 12:00:00Z pour une SLA de 900 min, l'email ne part plus
qu'aux crons où la donnée est fraîche (~2/jour au lieu de 4) — **2 emails justes
plutôt que 4 emails faux**. Réversible par `git revert`.

La purge `analytics_events` passe aussi en **lecture seule par défaut** : une
suppression exige désormais `--execute` **et** `--approved-by=<identifiant>`.

**Correctif de portabilité ajouté à #1265.** Son test
`tests/daily-copernicus-outbound-gate.test.cjs` cherchait
`workflow.indexOf('  email-automation:\n')` sur un fichier lu tel quel : en
checkout Windows (`\r\n`), l'index vaut `-1` et le test échoue alors que le
contenu est identique. Normalisation `\r\n → \n` ajoutée — **même correctif et
même précédent** que `tests/unit/morning-brief-freshness.test.cjs` (6 tests sur
107 dans `tests/unit` normalisent déjà CRLF). Sans ce correctif : 146/147 en
local ; avec : **147/147**. La CI Linux n'était pas affectée.

#### Deux merges de plus — priorité au palier récurrent, et la mesure du revenu ne se gèle plus

**#1098 (`393dc7a7`, 13:43:42Z) — le moteur récurrent était affiché en second.**

Le tableau `TIERS` de `src/PremiumModal.jsx` présentait **Brief 29 €/mois**
avant **Pro 79 €/mois**. Les trois paliers restent, **aucun prix n'est modifié**,
**aucun montant accepté n'est modifié** : seul l'**ordre** change.

| | Avant | Après |
|---|---|---|
| Ordre affiché | `brief` (29 €) → `pro` (79 €) → `territoire` | **`pro` (79 €) → `brief` (29 €) → `territoire`** |

Preuve après fusion : 3 paliers, `29 €/mois` / `79 €/mois` / `199 €/mois`
**intacts**, `featured:true` conservé sur Pro, nouveau test
`tests/unit/b2b-tier-order.test.cjs`. **Aucun** fichier de paiement, de
checkout ou d'email touché.

**#1271 (`90d083a1`, 14:00:55Z) — la mesure du revenu se gelait avec l'email.**

Effet de bord mesuré de #1265 : le step « Mollie MRR tracker » vivait dans le
job `email-automation`, désormais conditionné à une publication satellite
fraîche. La grille NOAA publiant **une observation par jour à 12:00:00Z** pour
une SLA de **900 min**, la garde ne passe qu'à ~00:00Z et ~18:00Z → quand la
donnée était périmée (le cas depuis 8 jours), le tracker **ne tournait plus**
et `scripts/automation/data/mollie-mrr.json` **se figeait**. Le MRR mesure
l'argent, pas la donnée satellite : c'était une erreur de catégorie, et la
mesure s'éteignait au moment exact où un incident commercial passerait
inaperçu.

Correctif : job `revenue-metrics` **autonome** (`needs: AUCUN`,
`if: github.event_name == 'schedule'`, `continue-on-error`), et
`mollie-mrr.json` **retiré** de la liste `git add` du job `email-automation`
(ownership exclusif → pas de double commit, pas de conflit de push).

| Contrôle (sur le SHA mergé `90d083a1`) | Résultat |
|---|---|
| `revenue-metrics.needs` | **aucun** (autonome) |
| `revenue-metrics.if` | `github.event_name == 'schedule'` |
| Tracker MRR encore dans `email-automation` | **non** |
| `mollie-mrr.json` encore commité par `email-automation` | **non** |
| Email / paiement dans le nouveau job | **aucun** |
| Garde de fraîcheur de `email-automation` | **inchangée** (`needs.fetch-data.outputs.gate_outcome == 'success'`) |
| `npm test` | **149/149 exit 0** (148 + `daily-copernicus-revenue-metrics`) |
| Budget bundle | **206,5 Ko ≤ 210 Ko** |

**CI réelle sur le SHA mergé `90d083a1`** (mergée sur `main` → push réel) :

| Run | ID | Résultat |
|---|---|---|
| CI Tests (push `main`) | `41843389922` | **PASS** |
| Perf Budget + Lighthouse (push `main`) | `41843390113` | **PASS** |
| Daily Copernicus + Deploy (push `main`) | `41843389417` | **PASS** |
| **Cloudflare Production (push `main`)** | `41843389301` | **FAILURE** — `FAIL SATELLITE_PREDEPLOY region=florida (3001.28 min > 900 min)` ; `certification-gate` **success**, `deploy`/`deploy-pages`/`verify-fleet`/`post-deploy-verify` **skipped** → **rien publié** |
| User Journey Audit (E2E) | `41843797473` | skipped (déclenché par le workflow_run) |

> **Effet de bord assumé et signalé :** le step « Revenue watch » (alerte interne
> par email d'un mouvement de revenu) reste dans `email-automation`, donc
> conditionné à la fraîcheur satellite — pour la même raison logique, il ne
> devrait pas l'être. Mais ce step **envoie un email** → modifier son
> comportement d'email relève d'une décision du fondateur. Il est laissé en
> l'état et signalé ici.

#### Contrôle local sur l'arbre complet (main + #1255 + #1243 + #1265 + #1098 + #1271)

| Contrôle | Résultat |
|---|---|
| `npm run build` | exit 0 |
| `node scripts/prepare-ftp.cjs` | exit 0 |
| `npm test` | **exit 0 — 147/147 fichier(s) de test OK** |
| `node scripts/check-bundle-budget.cjs` | **206,5 Ko gzip ≤ 210 Ko** (211 478 / 215 040 octets) ✓ |
| Exposition GA4 (5 fichiers) | **0** |
| `submitLead` sans `return` prématuré | **oui** |
| Sink Supabase après `sgCollectEvent` | **oui** |
| `sid` sous consentement explicite | **oui** |
| Sentinelle `"x"` exclue du comptage | **oui** |
| `email-automation` conditionné à la publication fraîche | **oui** (6 conditions) |
| Purge : `--execute` + `--approved-by` exigés | **oui** |
| Garde SOS avant le `POST /api/mollie` | **oui** |
| Gardes fail-closed (`evaluateConditionsFreshness`, `isConditionsFresh`, `renderCleanBeachIndex`, `getSatelliteFreshness`) | **présentes** |
| Prix (`/offres/` : 4,99 € / 19,99 € / `?pass=p30`, pas de `/mois`) | **présents** |

#### Le blocage est bien **amont** : la grille NOAA du 2026-11-04 n'est pas publiée

Interrogation directe de l'upstream le **2026-11-04T13:08:33Z**, sur les **deux**
datasets ERDDAP (et non un seul) :

| Dataset | Dernière observation | Âge | SLA 900 min |
|---|---|---|---|
| `noaa_aoml_atlantic_oceanwatch_AFAI_7D` | `2026-11-03T12:00:00Z` | 1 509 min (25,2 h) | **hors SLA** |
| `noaa_aoml_atlantic_oceanwatch_AFAI_1D` | `2026-11-03T12:00:00Z` | 1 509 min (25,2 h) | **hors SLA** |

Les deux datasets concordent : la grille du 2026-11-04 **n'est pas encore
publiée** par NOAA (publication historiquement observée vers 12:50Z). Ce n'est
donc **pas** un défaut du pipeline Sargasses — c'est un **retard de l'upstream**,
et le pipeline se met à la fenêtre dès que la grille paraît.

**Contrôle de validité de la méthode (exécuté le 2026-11-04T14:11Z).** Un 404
peut signifier « pas publié » **ou** « mauvaise requête ». La méthode est donc
validée par **deux points connus** sur le même axe temporel explicite
(`AFAI[(<instant>)][(15):(15)][(-59.5):(-59.5)]` sur `AFAI_7D`) :

| Point temporel interroge | HTTP | Lignes | Lecture |
|---|---:|---:|---|
| `2026-10-27T12:00:00Z` (valeur **observée en production**) | **200** | **1** | ✅ **publié** → la méthode est valide |
| `2026-11-03T12:00:00Z` (dernier connu) | **200** | **1** | ✅ **publié** → la méthode est valide |
| `2026-11-04T12:00:00Z` (attendu) | **404** | 0 | ❌ **non publié** |
| `2026-11-04T18:00:00Z` (attendu) | **404** | 0 | ❌ **non publié** |

La même requête a été rejouée sur `AFAI_1D` : **404** sur les deux points du
2026-11-04, avec `2026-10-27` et `2026-11-03` en 200 + 1 ligne.

→ La méthode **returns 200 avec des lignes là où la donnée existe** et **404
sans ligne là où elle n'existe pas**. Le 404 du 2026-11-04 est donc un
**absence réelle de publication**, pas un artefact de requête. **Le blocage est
confirmé comme étant amont (NOAA), pas dans le pipeline Sargasses.**

Le chemin de déblocage a été **validé de bout en bout**, sans rien deviner :

| Étape | Vérification |
|---|---|
| Le job qui rafraîchit **et publie** | `fetch-data`, conditionné à `if: github.event_name != 'push'` → **exécuté** en `workflow_dispatch` |
| Le payload publié | `git add public/api/copernicus/*/sargassum.json` (ligne 166 du workflow) → les **payloads régionaux** sont bien commités, pas seulement le fichier racine |
| La porte pre-deploy lit | `<ftpDir>/api/copernicus/sargassum.json`, produit par `prepare-ftp.cjs` à partir du payload régional |
| Le timestamp lu | `erddapTimestamp` = l'observation NOAA réelle — `refreshSatellitePayload` ne modifie que `dataAgeMinutes` et `stale`, **jamais** l'horodatage d'observation |
| Le déclencheur de la chaîne | `scripts/automation/trigger-production-deploy.cjs` → `ci-tests.yml` → `perf-budget.yml` → `cloudflare-production.yml` sur le **SHA exact** |
| La porte de certification | `certification-gate` **success** sur `b589099c`, `61c9959d` et `fc6eb8cb` — les deux checks requis (`test-frontend`, `perf`) sont verts sur le SHA exact |

Un **poll** automatique interroge NOAA toutes les 2 min — **sur les deux
datasets** (`AFAI_7D` et `AFAI_1D`) — et déclenche
`gh workflow run daily-copernicus.yml --ref main` à l'instant où la grille
devient plus récente que `2026-11-03T12:00:00Z`. Ce chemin est
`workflow_dispatch` : `email-automation` et `retry-on-failure` sont conditionnés à
`github.event_name == 'schedule'` → **skippés** → aucun email client, aucune vidéo,
aucun commit concurrent.

Le poll est **armé contre la course push/dispatch** (cause mesurée du refus du
2026-11-03) : avant tout dispatch, il attend `waitQuietMain()` —

| Condition de `waitQuietMain()` | Pourquoi |
|---|---|
| **aucun** run `Perf Budget + Lighthouse` en `in_progress`/`queued` sur `main` | le groupe `concurrency` est par **branche** : un run push sur `main` annule le run dispatché sur `main` |
| **aucun** run `push` créé sur `main` depuis moins de 120 s | laisse passer le temps de propagation des checks d'un push qui vient d'atterrir |
| **aucun** run `push` en vol au HEAD de `main` | le HEAD ne doit pas bouger entre l'attente et le dispatch |

**Publier de la documentation pendant la fenêtre de déploiement est sans
risque** — vérifié sur les déclencheurs et les groupes de concurrence réels :

| Workflow | Déclencheur `push` | Groupe `concurrency` | Conséquence |
|---|---|---|---|
| `perf-budget.yml` | `branches: [ main ]` **uniquement** | `perf-budget-${{ github.ref }}` + `cancel-in-progress: true` | un push sur une **branche** ne déclenche **rien** ; un run PR vit le groupe `refs/pull/N/merge`, **distinct** de `refs/heads/main` → **ne peut pas** annuler le run dispatché |
| `ci-tests.yml` | `branches: [ main ]` **uniquement** | *(aucun)* | un push sur une branche ne le déclenche pas |
| `cloudflare-production.yml` | `branches: [ main ]` **uniquement** | `cloudflare-production` + `cancel-in-progress: false` | **n'annule jamais** un run en cours |

→ Le seul déclencheur dangereux est un **push sur `main`**. C'est exactement
pourquoi le dispatch et la chaîne sont protégés, et pourquoi aucun push sur
`main` n'est effectué entre le dispatch et la fin du déploiement.

Après le dispatch, le script **surveille la chaîne** (`CI Tests` → `Perf Budget`
→ `Cloudflare Production`) et sort à la fin du run de production. Le poll ne fait
**aucune écriture directe en production** : il appelle le workflow fail-closed du
dépôt, exactement comme le fait son cron 4x/jour.

#### Déploiement — BLOQUÉ par une garde de fraîcheur (pré-existante, diagnose complète)

| Élément | Valeur |
|---|---|
| Run de déploiement | `41818452612` (Cloudflare Production, SHA `22ff4d8b`) → **FAILURE** |
| Étape en échec | `Pre-deploy satellite freshness gate (all six regions)` |
| Message | `FAIL SATELLITE_PREDEPLOY region=puntacana limit=900min reason=observation hors SLA (2825.20 min > 900 min)` |
| Étapes non atteintes | `certification-gate` → `deploy` → `deploy-pages` → `verify-fleet` → `post-deploy-verify` (jamais exécutées) |

**Ce n'est pas une régression du correctif de prix.** La même garde a fait échouer
**21 déploiements consécutifs** du 2026-11-03T00:50Z au 2026-11-04T14:01Z, y compris
des SHAs qui ne contiennent **aucun** changement de cette branche :

| Run | SHA | Région signalée | Âge de l'observation |
|---|---|---|---|
| `41790290141` | `ec49b167` (main **avant** cette branche) | florida | 2 590 min |
| `41816656514` | `c4f9821d` (PR #1259) | rivieramaya | 2 809 min |
| `41818452612` | `22ff4d8b` (**cette** branche) | puntacana | 2 825 min |
| `41839142457` | `c5359b77` (PR #1267, rapport) | tulum | 2 974 min |
| `41843389301` | `90d083a1` (**dernier** merge, #1271) | florida | 3 001 min |

#### Le tout dernier run de production (SHA `90d083a1`) — la garde est bien fail-closed

Le merge de #1271 (14:00:55Z) a déclenché un **push réel sur `main`** → la
chaîne complète s'est exécutée. C'est la preuve la plus récente que la garde
refuse proprement, sur le SHA le plus à jour :

| Job | Résultat |
|---|---|
| `scope` | **success** |
| `mollie-live-gate` | **success** |
| **`certification-gate`** | **success** — `test-frontend` et `perf` **verts sur le SHA exact `90d083a1`** |
| `build (florida)` | **failure** à l'étape 8 `Pre-deploy satellite freshness gate (all six regions)` |
| `build (mq / gp / tulum / puntacana / rivieramaya)` | **cancelled** (fail-fast de la matrice) |
| `deploy` · `deploy-pages` · `verify-fleet` · `post-deploy-verify` | **skipped** → **rien n'a été publié** |

Message exact de la garde :
`FAIL SATELLITE_PREDEPLOY region=florida limit=900min reason=observation hors SLA (3001.28 min > 900 min)`

→ La **porte de certification passe**, la **porte satellite refuse**, et
**aucune** étape de publication n'est atteinte. Le fail-closed est intact sur le
SHA le plus récent.

#### La production est **plus périmée** que le dépôt — 5 jours d'écart

Fait mesuré et précédemment non consigné : les deux sources de payload n'ont
**pas** le même horodatage.

| Source | `erddapTimestamp` | Âge au 2026-11-04T14:23Z | SLA 900 min |
|---|---|---:|---|
| **Payload commité dans `main`** (`public/api/copernicus/*/sargassum.json`, les 7 régions + racine) | `2026-11-02T12:00:00Z` | 3 021 min | hors SLA |
| **Production servie** (les 6 domaines) | `2026-10-27T12:00:00Z` | 11 645 min | hors SLA |

Les 7 payloads régionaux du dépôt portent **tous** `2026-11-02T12:00:00Z` — la
publication du 2026-11-02 a bien été committée par `fetch-data`, mais **jamais
déployée**, faute de fenêtre SLA. La production affiche donc une observation de
**5 jours plus ancienne** que celle déjà présente dans le dépôt.

Conséquence opérationnelle : dès que NOAA publiera la grille du
`2026-11-04T12:00:00Z`, le dispatch publishera une observation **fraîche** et la
porte passera **sans qu'aucune weakened garde soit nécessaire**. Il n'y a
**rien à corriger** côté garde : la garde a fait exactement son travail.

**Cause racine, mesurée sur l'upstream.** Le payload Copernicus engage dans le dépôt
porte `erddapTimestamp = 2026-11-02T12:00:00Z`. Interrogation directe de l'upstream
NOAA (`noaa_aoml_atlantic_oceanwatch_AFAI_7D` et `_1D`) le 2026-11-04T11:10Z :

| Dataset | Dernière observation | Âge | Verdict SLA 900 min |
|---|---|---|---|
| AFAI 7D | `2026-11-03T12:00:00Z` | 1 390 min (23,2 h) | HORS SLA |
| AFAI 1D | `2026-11-03T12:00:00Z` | 1 390 min (23,2 h) | HORS SLA |

Les 6 régions partagent la même grille globale NOAA. L'historique git du payload
commité confirme une cadence **d'une grille par jour, horodatée 12:00:00Z**
(24/10 → 25/10 → 26/10 → 27/10 → 29/10 → 02/11 → 03/11).

**Conséquence structurelle :** une publication **quotidienne** à 12:00Z ne peut pas
satisfaire une SLA de **900 min (15 h)** en permanence — l'âge de la dernière
observation balaie 0 h → 24 h dans la journée. La fenêtre où la garde passe est donc
**00:00Z → 03:00Z** (3 h/jour), et encore faut-il que la grille du jour soit déjà
publiée. Le cron `0 0 * * *` tombe dedans (le run du 2026-11-03T00:50Z a bien publié
`erddapTimestamp = 2026-11-02T12:00:00Z`, `dataAgeMinutes = 771`) ; les crons
`0 6`, `0 12`, `0 18` et tous les runs `push` tombent **dehors**.

**Pourquoi le pipeline ne rattrape pas.** Dans `daily-copernicus.yml`, le job
`fetch-data` (seul à rafraîchir **et publier** le payload) est conditionné à
`if: github.event_name != 'push'` → sur un push il est **skipped**. Sur `schedule` il
s'exécute mais se termine en `Copernicus publication status is BLOCKED_STALE_SOURCE`
(runs `41780985819` du 05:43Z et `41736428821` du 23:06Z) : la même SLA de 900 min
appliquée à la source. Résultat : le payload reste figé, la garde refuse, et le cycle
se répète depuis 2 jours.

**Chemin de déblocage honnête (aucun affaiblissement de la vérité produit).**
1. Attendre la publication de la grille NOAA suivante (le `2026-11-04T12:00:00Z` est
   attendu ; à 12:00Z l'âge repart de ~0 et la fenêtre SLA rouvre).
2. Re-dispatcher `Daily Copernicus + Deploy` (`workflow_dispatch`) : `fetch-data`
   s'exécute alors, publie le payload frais sur `main`, et le script
   `scripts/automation/trigger-production-deploy.cjs` déclenche explicitement
   `ci-tests.yml`, puis `perf-budget.yml`, puis `cloudflare-production.yml` sur le
   SHA exact. (Le `push` du commit de données ne déclenche **rien** : GitHub
   ignore les pushes faits avec le `GITHUB_TOKEN` — c'est la raison d'être de ce
   script.)
3. Vérifier `deploy` + `deploy-pages` + `verify-fleet` + `post-deploy-verify`, puis
   relire en production les surfaces corrigées (`/offres/`, `/premium/`, CGV).

**Pourquoi ce chemin a déjà échoué le 2026-11-03 à 00:51Z — et ce qui a changé.**
Le run de publication du 2026-11-03T00:50Z (`41555613035`) a **réussi** et a
déclenché la chaîne (`dispatch OK ci-tests.yml`, `perf-budget.yml`,
`cloudflare-production.yml`). Le déploiement a tout de même été refusé, pour
**deux** raisons mesurées — toutes deux résolues depuis :

| Cause mesurée | Preuve | État au 2026-11-04 |
|---|---|---|
| `test-frontend` **FAILED** : `133/134` — le test `region-seo-methodology-scope.test.cjs` affirmait `mq: stale/out-of-scope record must not become a current percentage` sur le payload **fraîchement publié** (fixture non déterministe) | run `41555735101`, log : `AssertionError [ERR_ASSERTION]: mq: stale/out-of-scope record must not become a current percentage` | **corrigé** par `8f902406` (#1241, 2026-11-03T04:29Z) : fixture stale déterministe. Le SHA `1583c36d` du run en échec ne contenait pas ce correctif. |
| `perf` **CANCELLED** : la porte a lu `predeploy: check "perf" conclu "cancelled" sur 1583c36d` — un run `perf-budget.yml` **push** sur un autre SHA (`31d3cbf6`, le commit « email state ») a **annulé** le run dispatché, car `perf-budget.yml` porte `concurrency: perf-budget-${{ github.ref }}` + `cancel-in-progress: true` (le groupe est par **branche**, pas par SHA) | runs `41555737760` (dispatch, `cancelled`) et `41555775379` (push, `success`) | **cause comprise, mais PAS éliminée par le seul `workflow_dispatch`.** Une première explication affirmait que le job `email-automation`, conditionné à `if: github.event_name == 'schedule'`, ne pousserait rien sur un dispatch — **cette affirmation a été réfutée par l'observation** : la course s'est **produite** le 2026-11-03 (le run dispatché a bien été annulé par un run push sur `refs/heads/main`). Le groupe de concurrence est par **branche**, donc **tout** run `perf-budget` push sur `main` annule le run dispatché sur `main`, quelle que soit l'origine du push. **Correctif réel :** le dispatch est désormais précédé d'une attente `waitQuietMain()` qui exige (a) **aucun** run `perf-budget` en `in_progress`/`queued` sur `main`, (b) **aucun** run `push` créé sur `main` depuis moins de 120 s, (c) **aucun** run `push` en vol au HEAD de `main`. Le commit de données lui-même ne déclenche **aucun** workflow (push `GITHUB_TOKEN`) — cette partie de l'explication initiale est confirmée. |

La porte de certification a donc les deux checks requis (`test-frontend`, `perf`)
au vert **sur le SHA exact**, et la garde satellite lit le payload **publié** dans
`<ftpDir>/api/copernicus/sargassum.json`, réécrit par `prepare-ftp.cjs` à partir du
payload régional — dont `erddapTimestamp` est l'observation NOAA réelle
(`refreshSatellitePayload` ne modifie que `dataAgeMinutes` et `stale`, **jamais**
l'horodatage d'observation).

**Ce qui n'a PAS été fait, volontairement.** La SLA de 900 min n'a **pas** été
abaissée et la garde n'a **pas** été contournée : une SLA relâchée rendrait possible
d'afficher « propre aujourd'hui » sur une observation de 24 h, ce que le produit
refuse explicitement. Changer la SLA ou le rythme du cron est une **décision
produit** (fenêtre de vérité), pas un correctif technique : elle est laissée à la
validation du fondateur, avec l'option triviale de décaler le cron `0 0/0 6/0 12/0 18`
vers la fenêtre 00:00Z–03:00Z.

#### État de la production au moment de la rédaction

`https://sargasses-martinique.com/` sert encore le **build précédent** (chunk eager
`assets/index-cLn0Pipx.js`, `version.json` = `{"v":"v221","date":"2026-10-12","b":"df18df5d"}`).
Contrôle en production des surfaces corrigées :

| Surface | `4,99 €` | `7,99 €` | `14,99 €` | `19,99 €` | `24,99 €` | `/mois` | `?pass=` |
|---|---|---|---|---|---|---|---|
| `/offres/` (live) | oui | **oui** | oui | non | **oui** | non | **non** |
| `/premium/` (live) | oui | non | oui | non | non | **oui** | non |
| `/a-propos/` (live) | non | **oui** | non | non | non | non | non |
| `/veilleur/` (live) | non | **oui** | non | non | non | **oui** | non |

→ les divergences D1/D2/D3/D4/D7 sont **bien présentes en production** et seront
corrigées dès que le déploiement passera la porte. `/api/mollie.php` répond `405` en
GET (POST-only, inchangé), `/api/b2b-trial.php` répond `405` et
`/api/create-checkout.php` répond `404` en GET : aucune écriture de paiement,
d'essai ou de remise n'a été tentée pour cette vérification.

#### La production est en plus dégradée sur la DONNÉE (8 jours de retard)

Contrôle du payload satellite **publié** sur les 6 domaines (lecture seule,
re-mesuré le 2026-11-04T14:23Z ; première mesure à 11:57Z) :

| Domaine | `source` | `erddapTimestamp` | Âge |
|---|---|---|---|
| sargasses-martinique.com | `erddap-live` | `2026-10-27T12:00:00Z` | **11 645 min (8 j)** |
| sargasses-guadeloupe.com | `erddap-live` | `2026-10-27T12:00:00Z` | 11 645 min |
| sargassummiami.com | `erddap-live` | `2026-10-27T12:00:00Z` | 11 645 min |
| sargassumpuntacana.com | `erddap-live` | `2026-10-27T12:00:00Z` | 11 645 min |
| sargassumcancun.com | `erddap-live` | `2026-10-27T12:00:00Z` | 11 645 min |
| sargazotulum.com | `erddap-live` | `2026-10-27T12:00:00Z` | 11 645 min |

Alors que `main` porte déjà `2026-11-02T12:00:00Z` (les 7 payloads régionaux +
la racine, tous identiques) : **les données sont publiées dans le dépôt mais
jamais déployées** — c'est exactement le défaut décrit en tête de
`scripts/automation/trigger-production-deploy.cjs` (« le commit de données était
publié mais JAMAIS déployé »).

**Impact commercial direct.** Le service vend un « verdict de ma plage **au
jourd'hui** » et des alertes. Avec une observation de 8 jours, la promesse n'est
plus tenable sur les 6 marchés. Le produit **dégrade honnêtement** — il ne
ment pas : `src/lib/format-freshness.mjs` recalcule la fraîcheur **au rendu**
depuis `erddapTimestamp` (`isSatelliteFresh12h`, porte 12 h ; `satelliteAgeHours`,
« jamais figé ») et `src/ChasseHome.jsx` n'affiche un verdict courant que si
`stale === false` **et** l'observation est fraîche. Aucune fausse mention
« propre aujourd'hui » n'est donc servie — mais le service est de fait dégradé,
ce qui prive la raison d'acheter un pass (verdict courant + alertes).

Le champ `stale` figé à `false` dans le payload publié est un **instantané
d'empaquetage** (`refreshSatellitePayload` ne touche que `dataAgeMinutes` et
`stale`, jamais `erddapTimestamp`) : il ne sert pas de preuve de fraîcheur côté
client, qui recalcule.

#### Rollback

`git revert 22ff4d8b` (repli du contenu) ou redéploiement d'un SHA antérieur — les
déploiements Cloudflare précédents sont conservés. Aucun changement de prix serveur,
de montant accepté, de remboursement ni d'email client n'est inclus dans ce
correctif : le rollback n'a donc aucun impact métier à défendre.

#### Mesures Cloudflare du chemin de paiement (2026-11-04T15:20Z–15:50Z) — reproductible

Toutes **lecture seule**. Aucun secret écrit, aucun paiement créé, aucune
transaction initiée.

| # | Appel | Résultat |
|---|---|---|
| 1 | `GET /accounts/{id}/workers/scripts` | 17 Workers, dont `sg-payments`, `sargagame-{mq,gp,florida,tulum,puntacana,rivieramaya}`, `b2b-api`, `outreach`, `supabase-proxy` |
| 2 | `GET /zones?name=sargasses-martinique.com` (× 6 zones) | 6 zones Sargasses trouvées |
| 3 | `GET /zones/{zone_id}/workers/routes` (× 6) | **18 routes par zone**, toutes identiques : `/api/mollie*`, `/api/b2b-*`, `/api/create-checkout*`, `/api/widget-token*`, `/api/track-*`, `/api/comps.php`, `/api/_ratelimit.php`, `/api/paypal*`, `/api/stripe-webhook.php`, `/api/retry-failed-payment.php`, `/api/_diag.php`, `/api/copernicus/forecast*`, `/collect.php`, `/b2b*`, `/unsubscribe*`, `/_cron/*` → **`sg-payments`** ; `/*` → Worker régional |
| 4 | `GET /accounts/{id}/workers/scripts/sg-payments/versions` | **10 versions**, toutes du **2026-10-01/02**, dernière `36fa827a-a39c-4156-9359-30fc383eb6c5` (n° 381), `source: wrangler`, handlers `fetch` + `scheduled`, bindings `MOLLIE_API_KEY`, `MOLLIE_PROFILE_ID`, `MOLLIE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_KEY`, KV `TRANSIENTS`, var `SUPABASE_URL` |
| 5 | `GET /api/mollie-webhook.php` (× 6 domaines) | `200 {"ok":true}` — **pas** la signature du PHP (`400 {"error":"id + type requis"}`) ni celle du Worker du dépôt (`405 {"error":"POST only"}`) → c’est `sg-payments` |
| 6 | `GET /public/api/mollie-webhook.php` (× 6) | `404 {"error":"not_found"}` **JSON** → le PHP n’est pas joignable (le Worker intercepte `/public/**`) |
| 7 | `POST /api/mollie.php` `{"action":"__payment_smoke__"}` (× 6) | **`500` `error code: 1101`** (exception Worker) — smoke **sans transaction**, celui du gate de déploiement du dépôt |
| 8 | `POST /api/create-checkout.php` et `/api/create-checkout` (× 6) | **`404 {"error":"not_found"}`** |
| 9 | `GET /api/zzz-inconnu` | `404 {"error":"api_route_not_migrated","path":"/api/zzz-inconnu"}` (JSON) |
| 10 | `GET /zzz-inconnu` (hors `/api/`) | `404` **HTML** (assets statiques) |

> Le point 5 est le plus important : il **discrimine** les trois implémentations
> possibles par la **forme exacte** de la réponse, sans rien supposer. Le point
> 4 est le second : il **démontre** que `sg-payments` n’existait pas en
> juin–juillet 2026, donc que les 6 ventes non livrées ont été traitées par le
> chemin PHP — celui dont la validation est prouvée cassée (R13).

#### Fusion des PR de revenu + état du déploiement (2026-11-04T17:05Z–18:10Z)

| PR | Commit | État |
|---|---|---|
| **#1272** — rapport de revenu (§2bis, R13→R17, actions recalibrées) | `2d134a9ff83cb903cad48064031705884edea8cc` | **MERGED** 2026-11-04T16:27:46Z |
| **#1275** — instrumentation du funnel B2B (écriture / lecture / dédoublonnage) | `02582af96a529c044521b7e16cbe56dc8bdfc596` | **MERGED** 2026-11-04T17:05:04Z |
| **#1274** — fulfillment : alias `p7` + fenêtre historique, logs sans identifiant, backfill fail-closed | `9a10faa3466950fda0f843f2a9955e446b17a323` | **MERGED** 2026-11-04T17:52:43Z |
| **#1277** — **[P1] scope MRR sur les enregistrements attribués à Sargasses** (corrige R18) | `df01afd9753994d23f683f1841bba41dccff79ac` | **MERGED** 2026-11-04T18:01:55Z |
| **#1276** — état final du rapport de revenu (§2ter, R18, NOAA, déploiement) | `a7c15774a92cba526d69f021f661cad0117eb680` | **MERGED** 2026-11-04T18:03:42Z |

CI **sur le SHA exact** (aucun échec restant) :

| PR | Run | Job | Résultat |
|---|---|---|---|
| #1272 | `41863240144` | `test-frontend` | **success** |
| #1272 | `41863240409` | `perf` · `lighthouse-report` | **success** · **success** |
| #1275 (1er run) | `41861559188` | `test-frontend` | **failure** — 149/150 : la CI Linux a `ext-curl`, les stubs du harness n’étaient pas installés |
| #1275 (après `331ec218`) | `41865005969` | `test-frontend` | **success** |
| #1275 | `41865005931` | `perf` · `lighthouse-report` | **success** · **success** |
| #1274 | `41853860648` / `41853860685` | `test-frontend` · `perf`+`lighthouse` | **success** · **success** · **success** |
| #1277 | `41880603266` / `41880603347` | `test-frontend` · `perf`+`lighthouse` | **success** · **success** · **success** |
| #1276 | `41877047614` / `41877047297` | `test-frontend` · `perf`+`lighthouse` | **success** · **success** · **success** |

> **Vérification locale de #1274 et #1277** (en plus de la CI) :
> - #1274 : `mollie-fulfillment-review` **29/29**, `mollie-backfill-failclosed` **42/42**, suite complète **`exit_code = 0`** (151 fichiers ; les 4 échecs initiaux étaient **environnementaux** — worktree frais sans `node_modules` ni `dist` — reproduits puis éliminés).
> - #1274 : **contrat vérifié par exécution réelle du Worker** (7/7), cf. §4bis.
> - #1277 : **attribution vérifiée par exécution** (20/20) + **calcul end-to-end** reproduisant 38,96 € / 17,98 $, cf. §2ter.

**Runs déclenchés par les pushes sur `main` (lecture seule) :**

| Run | Workflow | SHA | Résultat |
|---|---|---|---|
| `41867453289` | **Cloudflare Production** | `2d134a9f` | **failure** — `scope` ✅, `mollie-live-gate` ✅, `certification-gate` ✅, puis `build (rivieramaya)` ❌ et 5 legs annulées → `deploy`, `deploy-pages`, `verify-fleet`, `post-deploy-verify` **skipped** → **rien n’a été publié** |
| `41867453365` | Daily Copernicus + Deploy | `2d134a9f` | **success** — 6 builds régionaux ✅, `health-check` ✅ ; `fetch-data` **skipped** (`if: github.event_name != 'push'`), `revenue-metrics` **skipped** (`if: github.event_name == 'schedule'`) |
| `41881571937` | **Cloudflare Production** | `9a10faa3` | **failure** — refus **fail-closed** : `FAIL SATELLITE_PREDEPLOY region=gp limit=900min reason=observation hors SLA (3234.55 min > 900 min)` → `deploy`, `deploy-pages`, `verify-fleet`, `post-deploy-verify` **skipped** → **rien n’a été publié** |
| `41881571984` | Daily Copernicus + Deploy | `9a10faa3` | **success** — 6 builds ✅ ; `fetch-data` **skipped**, `revenue-metrics` **skipped** (événement `push`) |
| `41881571916` / `41881571851` | CI Tests / Perf Budget | `9a10faa3` | **success** / **success** |
| `41883581617` | **Cloudflare Production** | `df01afd9` | **failure** — même refus fail-closed satellite → **rien publié** |
| `41883581566` | Daily Copernicus + Deploy | `df01afd9` | **success** — `fetch-data` et `revenue-metrics` **skipped** |
| `41883581553` / `41883582217` | CI Tests / Perf Budget | `df01afd9` | **success** / **cancelled** (concurrence perf, run suivant déclenché) |

Message exact du refus (run `41867453289`, job `build (rivieramaya)`, étape 8) :

```
FAIL SATELLITE_PREDEPLOY region=rivieramaya limit=900min reason=observation hors SLA (3148.18 min > 900 min)
```

**Ce refus est fail-closed et voulu.** 3 148 min ≈ 52,5 h → le payload du
dépôt porte `2026-11-02T12:00:00Z`. La garde n’est **pas** affaiblie
(décision fondateur).

#### État NOAA ERDDAP — mesuré indépendamment (2026-11-04T17:09:33Z)

Sonde reproduisant **exactement** les URL et la méthode de
`scripts/fetch-sargassum-live.cjs` :

| Dataset | Requête | Dernier grid |
|---|---|---|
| `AFAI_7D` | `?AFAI[(last)][(14):(16)][(-61):(-58)]` | **`2026-11-03T12:00:00Z`** |
| `AFAI_1D` | `?AFAI[(last)][(14):(16)][(-61):(-58)]` | **`2026-11-03T12:00:00Z`** |

→ Le grid `2026-11-04T12:00:00Z` **n’est pas publié** 5 h après l’heure
nominale de publication NOAA. Aucun grid plus récent n’existe : le pipeline
**ne peut pas** produire un payload dans la SLA de 900 min, et **le
déploiement reste bloqué** — par une donnée amont, pas par un défaut de code.

Un agent de surveillance a été armé : il sonde les deux datasets toutes les
2 min et, dès la publication d’un grid plus récent que `2026-11-03T12:00:00Z`,
attend que `main` soit libre (aucun run perf en cours, aucun push de moins
de 120 s, HEAD stable), puis déclenche `workflow_dispatch` de
`daily-copernicus.yml --ref main` — c’est-à-dire **le pipeline conçu par le
dépôt**, avec ses gardes. **Aucune écriture directe en production.**
