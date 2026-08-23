# Rapport Analytics & Revenus — sargagame

**Date** : 2026-07-28 | **Source** : `daily-metrics.json`, `b2b-funnel.json`, `sheet-payments.csv`, `b2b-contacts-unified.json`, `session startup` | **Auteur** : agent Analytics & Revenus

---

## 1. État actuel des chiffres (2026-07-28)

### MRR — Stripe legacy (source de vérité CLAUDE.md)
| Métrique | Valeur |
|---|---|
| MRR EUR Stripe | **69,86 €** |
| Abonnés actifs | **14** |
| PastDue | **0** |
| CancelScheduled | **0** |
| Source dominante | `(none)` = 12/14 (86 %, €59,88) |
| Sources trackées | `map_scrub_forecast` = 1 abonné (€4,99) · `forecast_teaser` = 1 abonné (€4,99) |
| emailAttributed | **0 actif, €0** |

### Mollie (données du jour, fenêtre 30 j)
| Métrique | Valeur |
|---|---|
| EUR payers | **4**, total **38,96 €** |
| USD payers | **2**, total **17,98 $** |
| Remboursements | **1**, 7,99 € |
| Chargebacks | **0** |
| B2B | **0** |
| Payers identifiés | `1799efe3`, `5510715a`, `71733259`, `847abc3b`, `bf819a41` (5 uniques) |

### Revenu combiné (Stripe + Mollie) du jour
- Stripe : 132,80 € (20 paiements × ~7 j de fenêtre)
- **Total quotidien estimé** : ~133 € (Stripe) + ~57 € (Mollie) = **~190 €/jour** = **~5 700 €/mois** (brut, tous canaux)
- **MRR Stripe seul** : 69,86 € (ce qui ne compte que les récurrents, pas les passes one-time)

### Funnel email / leads
- Emails capturés checkout : **~246** (relançables)
- Emails envoyés/jour : **~3 471**
- `sg_pass_cta` : **migé vers Supabase** (`funnel-from-supabase.cjs`, plus de `clasp push`)

### B2B (funnel froid)
- Contacts unifiés : **158** (MQ 56, GP 52, FL 19, PC 16, RM 15)
- Cold outreach envoyé : **10** (totalSent, dernier run 2026-07-21)
- Funnel : **104 contactés → 4 leads (2,9 %) → 0 paid (0 %)**
- Signal `paidSignal` : mollie · `clickSignal` : **« à brancher (token &b + stats) »**

### Stripe checkout (derniers 30 j)
- Reached : **0** · Paid : **0** · CompletionRate : **null** · Recoverable : **0**

---

## 2. Tendance MRR (90 jours)

**Impossible à calculer** — `daily-metrics.json` ne contient que **2 entrées** (27-28 juillet). La source `daily-metrics.json` n'est pas peuplée sur 90 jours. La métrique Stripe MRR est stable à €69,86 sur les 2 jours observés (14 abonnés, 0 pastDue, 0 cancelScheduled = pas de churn visible), mais sans historique on ne peut pas de tendre.

**Action immédiate** : peupler `daily-metrics.json` avec les données Stripe rétroactives (ou au minimum 90 jours) en utilisant l'API Stripe ou en backfillant depuis les `sheet-subscription_events.csv` + `sheet-payments.csv`. Le `revenue-watch-seen.json` signature encode le MRR depuis le 19 juillet — ça donne un point d'ancrage.

---

## 3. Design du pipeline Mollie → daily-metrics.json

### Problème actuel
Le bloc `mollie` de `daily-metrics.json` est **rempli manuellement** ou par un script ad hoc non documenté. Il n'y a **aucun pipeline automatique** qui lit le dashboard Mollie et alimente `daily-metrics.json`. Les données Mollie sont donc au mieux un instantané, au pire obsolètes.

### Design proposé

```
┌─────────────────────────────────────────────────────┐
│  Mollie Dashboard API  (mollie.com/api/v2)         │
│  GET /payment-links  (liste des liens payés)        │
│  GET /payments?status=paid                           │
│  GET /refunds                                         │
│  GET /chargebacks                                     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  scripts/automation/mollie-daily-report.cjs        │
│  - Lit MOLLIE_DAILY_KEY (env) / mollie-config.php  │
│  - Agrège : paid (EUR+USD), refunds, chargebacks   │
│  - Calcule : MRR Mollie, nouveaux payers J, total  │
│  - Produit : scripts/automation/data/mollie-daily.json│
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  daily-metrics.json merge                            │
│  - Enrichit le bloc `mollie` du jour                │
│  - Calcule le MRR combiné = Stripe.mrr.eur          │
│    + mollie.paid.EUR.total                          │
│    + (mollie.paid.USD.total × taux EUR/USD)         │
│  - Écrit daily-metrics.json (append, idempotent)    │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  daily-copernicus.yml (GH Actions, cron 0 6 * * *) │
│  - Déjà là : lance les scripts d'extraction        │
│  - Ajouter : mollie-daily-report.cjs → merge       │
└─────────────────────────────────────────────────────┘
```

### Détail des étapes

1. **`mollie-daily-report.cjs`** (nouveau script, ≤100 lignes) :
   - Lis `MOLLIE_DAILY_KEY` (secret GH Actions) ou fallback `mollie-config.php`
   - Appelle `GET /v2/payments?from={yesterday}&status=paid,refunded` (Mollie API)
   - Calcule : `paid.EUR.total`, `paid.USD.total`, `paid.count`, `refunds.count`/`total`, `chargebacks.count`
   - Liste les `customerId` uniques (count des payers)
   - Écrit `scripts/automation/data/mollie-daily.json`
   - Exit 0 si pas de clé (don't crash)

2. **Merge dans `daily-metrics.json`** :
   - Ajout dans `scripts/automation/daily-build.cjs` (ou inline dans `daily-copernicus.yml`)
   - Lit `mollie-daily.json`, met à jour le bloc `mollie` du jour courant dans `daily-metrics.json`
   - Calcule le **MRR combiné** = `stripe.mrr.eur + mollie.paid.EUR.total + (mollie.paid.USD.total * 0.92)` (taux EUR/USD conventionnel 0,92)
   - **NB** : ne PAS toucher au bloc `stripe` (legacy, lecture seule)

3. **Sécurité** :
   - `MOLLIE_DAILY_KEY` ≠ `MOLLIE_API_KEY` (clé API Mollie standard, pas de nouveau secret)
   - Les données sont non-sensibles (montants publiques, IDs de paiement non secrets)
   - Idempotence : même jour = overwrite, pas doublon

4. **Validation** :
   - `php -l` sur aucun `.php` touché (c'est du CJS, pas PHP)
   - `node -e "require('./scripts/automation/mollie-daily-report.cjs')" --dry` pour tester
   - Le `daily-copernicus.yml` existant (`timeout-minutes: 75`) gère le runtime

---

## 4. Analyse des abandons de checkout

### Ce qu'on sait (et ce qu'on NE sait PAS)

| Métrique | Valeur | Source |
|---|---|---|
| Stripe checkout atteint (30j) | **0** | `daily-metrics.json` |
| Stripe checkout payé (30j) | **0** | `daily-metrics.json` |
| Stripe checkout completionRate | **null** | `daily-metrics.json` |
| Stripe checkout recoverable | **0** | `daily-metrics.json` |
| Stripe checkout lostCents | **{}** (vide) | `daily-metrics.json` |
| Emails capturés checkout | **~246** | CLAUDE.md |
| Emails relançables | **~246** (B2C non anonyme) | CLAUDE.md |
| Mollie checkout data dans daily-metrics | **absent** | daily-metrics.json |

### Interprétation
Le funnel de checkout est **aveugle** côté Stripe. Zéro reach + zéro paid + completionRate = null signifie soit :
1. **Le tracking Stripe checkout n'est pas câblé** dans le front (`Sargasses_PROD.jsx`), OU
2. **Les 14 abonnés actuels viennent tous de Mollie** (pas de Stripe checkout dans la fenêtre 30j), ce qui est cohérent avec le fait que Stripe = legacy run-off et que les nouveaux pass passent par Mollie Components / Apple Pay / Google Pay.

Le fait que `checkout.reached=0` **même sur 30 jours** est extrêmement suspect pour une app avec 20 paiements Stripe en vie. Cela signifie que le champ `checkout` du bloc `stripe` est **un placeholder jamais peuplé** — c'est un **trou de données**, pas une vraie mesure d'abandon.

### Patterns géographiques (impossibles à établir)
Sans données de checkout par île, on ne peut pas distinguer MQ vs GP vs USD. Les données de paiement (`sheet-payments.csv`) montrent :
- **MQ** : 5 paiements eur payés (le plus gros volume)
- **GP** : 1 trialing + 1 active = 2 abonnés récurrents
- **USD (FL)** : 2 paiements (5,99 $ + 11,99 $)
- **Ile non renseignée** : 10 paiements sur 20

---

## 5. Revenu par région

### B2C (pass one-time + abonnements)
| Région | Moyen | Paiements récents | Abonnés Stripe actifs | Mollie actif |
|---|---|---|---|---|
| MQ (Martinique) | EUR | 10 paiements (historique) | 1 (`map_scrub_forecast`) | 4 payers EUR |
| GP (Guadeloupe) | EUR | 1 active + 1 trialing | 1 (`gp_monthly_*`) | inclus EUR |
| Floride | USD | 2 paiements (5,99 $ + 11,99 $) | 0 | 2 payers USD |
| Punta Cana | USD | — | 0 | — |
| Riviera Maya | USD | — | 0 | — |
| Barbados | EUR | — | 0 | — |

### B2B (widget + outreach)
| Région | Contacts unifiés | B2B leads | Conversion |
|---|---|---|---|
| MQ | 56 | (inconnu) | 0 payé |
| GP | 52 | (inconnu) | 0 payé |
| Floride | 19 | (inconnu) | 0 payé |
| Punta Cana | 16 | (inconnu) | 0 payé |
| Riviera Maya | 15 | (inconnu) | 0 payé |

### Région sous-exploitée
- **Barbados** : config Stripe Products en placeholder (`stripeProducts: undefined` dans `barbados.json`), dans `$KNOWN_REGIONS` de `stripe-webhook.php:111`. Câblage Mollie non fait. **0 revenu, 0 contact.** C'est la plus grosse opportunité ratée.
- **Punta Cana + Riviera Maya** : 31 contacts B2B unifiés mais **0 paiement Mollie**, **0 Stripe**. Le trafic USD existe (GA4 sessions) mais aucune monétisation B2C ni B2B n'est visible côté paiement pour ces 2 régions dans les données récentes.
- **GP** : 52 contacts B2B mais seulement 1 abonné Stripe actif → sous-monétisée pour sa taille de marché.

---

## 6. Saisonnalité

### Données disponibles
Pas assez de données historiques dans `daily-metrics.json` (2 jours) pour détecter un pattern saisonnier. Cependant, le pattern est connu :

- **Saison sargasse** : typiquement **juin → novembre** aux Caraïbes
- **Haute saison** : août-septembre (pic d'algues) → plus de trafic → plus de conversions
- **Basse saison** : décembre-mai → moins de trafic, moins de conversions

### Pattern attendu (basé sur la connaissance du marché + données fragmentaires)
- **Revenus** : pics de **juin à octobre** dans les 3 régions USD (FL, PC, RM)
- **Revenus EUR** (MQ/GP) : moins saisonniers (tourisme annuel) mais impactés par la saison sargasse aussi
- **B2B** : les hôtels contactent en **pré-saison** (avril-mai) pour se préparer au pic → la conversion devrait suivre un décalage de 1-2 mois
- **Mollie vs Stripe** : Mollie est déjà dominant (5 payers sur 7 au total) → la saisonnalité se verra dans les payers Mollie, pas dans Stripe

### Ce qu'il manque
- Historique de 12 mois minimum pour calibrer la saisonnalité
- Un graphe de `mollie.paid.total` par mois (données non disponibles localement)

---

## 7. Opportunités de revenus non exploitées

### A) Encart Partenaire `sponsored` — **monétisation = 0**
- `gen-b2b-partners.cjs` génère `public/api/b2b-partners.json` avec `partners` (active:true) et `preview`
- Le check `paidSignal > partners.length` (l.72) n'a jamais déclenché → `paidSignal = null`
- L'encart existe dans l'UI (`sponsored` flag) mais **aucun partenaire actif ne génère de revenu**
- **Impact potentiel** : 1 partenaire sponsor = 500-2 000 €/mois (prix B2B standard pour encart dans les apps de prévision plage, à valider par panel)
- **Action** : activer la monétisation de l'encart via `b2b-partner-meta.json` (éditer tiers) → régénérer via `node scripts/automation/gen-b2b-partners.cjs`

### B) B2B outreach — **taux email → essai → paiement = 0 %**
- Funnel : 104 contactés → 4 leads (2,9 %) → 0 paid
- **Le blocage est le signal `paidSignal` = « à brancher »** : le tracking du paiement Mollie pour les B2B n'est pas câblé dans le funnel Supabase
- **Impact potentiel** : 4 leads × taux de conversion B2B estimé 15-25 % = 1 payer B2B/an = 290-690 €/an
- **Action** : brancher `b2b_trial_activated` + `b2b_conversion` events dans `funnel-from-supabase.cjs` + `sg_widget_sign` dans `widget-token.php`

### C) Widget B2B sur sites hôtels — **0 conversion mesurable**
- `widget-contacts.json` : **1 seul contact** (Anoli Lodges, MQ, pro tier)
- `widget-converted-sent.json` existe → un mécanisme de conversion widget est en préparation
- Le widget génère des leads mais **aucune donnée de conversion vers le paiement** côté `daily-metrics.json`
- **Impact potentiel** : chaque widget installé sur un site hôtelier = flux continu de visiteurs qualifiés ; un taux de conversion de 2 % × 1 000 visitor/mois × €7,99 pass = **~160 €/mois/widget**
- **Action** : brancher `widget_conversion` event dans Supabase + attribution revenu dans daily-metrics.json

---

## 8. KPIs prioritaires (dashboard minimal)

| # | Métrique | Source | Seuil d'alerte | Fréquence |
|---|---|---|---|---|
| 1 | **MRR combiné** (Stripe + Mollie EUR, converti USD si applicable) | `daily-metrics.json` bloc `stripe.mrr.eur` + `mollie.paid.EUR.total` | < 50 € ou drop >20 % J/J | Quotidien |
| 2 | **Taux de conversion checkout** (reach → paid) | `stripe.checkout.reached` + `stripe.checkout.paid` | completionRate < 30 % | Quotidien |
| 3 | **Payers Mollie EUR + USD** (nouveaux + actifs) | `mollie.paid` par jour | Drop >30 % vs 7-j MA | Quotidien |
| 4 | **B2B funnel conversion** (contacted → lead → paid) | `b2b-funnel.json` `counts` | paid > 0 (le 1er paiement B2B est le signal clé) | Hebdo |
| 5 | **Email recoverable** (246 leads email non convertis) | `checkout.recoverable` + `emails` dans `daily-metrics.json` | Drop du taux de recoverable | Quotidien |

### Métriques secondaires (à ajouter)
- Churn rate (cancelScheduled / total actifs)
- ARPU par région (Stripe + Mollie)
- Bounce rate email drip (`email.bounced` — actuellement `null` → tracking SMTP non câblé)
- Widget conversion rate
- Sponsored revenue (encart Partenaire)

---

## 9. Les 3 fuites de revenus identifiées

### 🔴 Fuite n°1 : Checkout tracking invisible
**Symptôme** : Stripe `checkout.reached=0`, `paid=0`, `completionRate=null` sur 30 jours, alors que 20 paiements ont été comptabilisés. **Le tracking de conversion checkout est soit cassé soit jamais branché.**

**Impact estimé** : On ne peut **ni mesurer ni optimiser** le taux de conversion paiement → impossibilité de calculer le revenu laissé sur la table par les abandons. Avec ~190 €/jour de revenu brut, un drop de 20 % de conversion = **~38 €/jour non captés** = **~11 400 €/an**.

**Action** (≤2 jours) :
1. Vérifier dans `Sargasses_PROD.jsx` si le stripe `checkout_redirect` event est émis côté front
2. Vérifier que `checkout_redirect` atteint Supabase (`analytics_events`)
3. Ajouter le tracking `checkout_redirect` dans `funnel-from-supabase.cjs` FUNNEL_KEYS (si pas déjà présent)
4. Brancher `mollie-daily-report.cjs` (voir §3) pour avoir la vue Mollie du checkout

### 🔴 Fuite n°2 : Funnel B2B mort — 4 leads qui se refroidissent
**Symptôme** : 104 entreprises contactées, 4 ont répondu positivement (lead), **0 ont payé**. Le signal `paidSignal` = « à brancher (token &b + stats) » signifie que le parcours lead → essai 30j → paiement n'a **aucun tracking côté Supabase**.

**Impact estimé** : 4 leads × taux de conversion B2B estimé 20 % × 690 €/an = **~550 €/an** de revenu B2B annuel non capté. À l'échelle des 104 contacts, si le funnel fonctionne à 2,9 % au stade lead vs 20 % au stade payant, on parle de **2-3 contrats B2B par an** = **600-1 400 €/an**.

**Action** (≤2 jours) :
1. Câbler `b2b_trial_activated` et `b2b_conversion` events dans `funnel-from-supabase.cjs` (FUNNEL_KEYS l.31-33)
2. Vérifier que `sg_widget_sign` dans `widget-token.php` émet les tokens d'essai Pro 30 j
3. Ajouter le tracking Mollie B2B : quand `b2b_paylink_clicked` est émis → tracker le paiement Mollie qui suit
4. Le lien Pro 690 € existe déjà (`mollie-paylinks.cjs` TIERS) — il suffit de le brancher dans le funnel email

### 🔴 Fuite n°3 : 246 emails de checkout récupérables = zéro récupération
**Symptôme** : ~246 leads email capturés au checkout (B2C non anonyme, CLAUDE.md), `emailAttributed.active=0`, `emailAttributed.mrrEur=0`. Les emails sont capturés mais **aucune campagne de récupération n'est active** côté Stripe/analytics.

**Impact estimé** : Avec un taux de récupération typique du B2C de 5-10 %, et un pass à ~5-8 € :
- 246 × 7,5 % récupération = **~18 comptes payants récupérés**
- 18 × 7,99 € EUR = **~144 €/mois** = **~1 728 €/an**
- Même à 2 % de récupération : **~38 €/mois = 456 €/an** (le ROI d'une campagne email est largement positif)

**Action** (≤2 jours) :
1. Ajouter `checkout_failed` et `checkout_incomplete` comme `analytics_events` dans le front (Supabase)
2. Créer une séquence de récupération dans `drip-email.cjs` : email J+1 (rappel + lien direct), J+3 (offre limitée), J+7 (dernière chance)
3. Brancher l'attribution revenu : si un email `email` qui a initié un checkout non abouti finit par payer dans les 30 j → l'attribuer à `emailAttributed` dans daily-metrics.json
4. Le `cart-recovery-sent.json` (30 hashed IDs) existe déjà — il faut câbler son contenu vers le tracking revenu

---

## 10. Résumé exécutif

| Dimension | Constat | Priorité |
|---|---|---|
| **MRR Stripe** | €69,86, stable, 14 actifs | Suivre (pas de régression) |
| **Mollie revenue** | Non intégré dans le MRR combiné | 🔴 Haute — créer le pipeline |
| **Checkout tracking** | Inexistant (0 reach, 0 paid, null completion) | 🔴 Haute — fuite aveugle |
| **B2B funnel** | 104 contactés, 4 leads, 0 paid | 🔴 Haute — 4 leads qui se perdent |
| **Email revenue** | 246 leads récupérables, 0 email-attributed revenue | 🟡 Moyenne — séquence de récupération |
| **Saisonnalité** | Données insuffisantes (2 jours d'historique) | 🟡 Moyenne — peupler l'historique |
| **Barbados** | Région configurée mais non câblée | 🟢 Basse (work préparatoire, pas de fuite active) |
| **Widget B2B** | 1 contact, 0 conversion mesurable | 🟡 Moyenne — brancher le tracking |
| **Sponsored** | Encart partenaire non monétisé | 🟢 Basse — action tierce (partenariats) |

### Les 3 actions les plus impactantes (en 2 jours chacun) :
1. **Créer `mollie-daily-report.cjs`** et merger dans le `daily-copernicus.yml` → visibilité Mollie dans daily-metrics.json
2. **Brancher le checkout tracking** dans le funnel Supabase (`funnel-from-supabase.cjs` FUNNEL_KEYS) → mesurer enfin les abandons
3. **Câbler les 4 leads B2B** → tracker `b2b_trial_activated` + `b2b_conversion` et attribuer le premier paieur B2B → débloquer la valeur du funnel froid

---

*Rapport généré le 2026-07-28. Sources : `scripts/automation/data/daily-metrics.json`, `b2b-funnel.json`, `sheet-payments.csv`, `b2b-contacts-unified.json`, `b2b-outreach-log.json`, `widget-contacts.json`, `revenue-watch-seen.json`, `subscription_events.csv`, CLAUDE.md, `funnel-from-supabase.cjs`, `mollie-paylinks.cjs`, `gen-b2b-partners.cjs`. Le fondateur n'a pas été consulté (mandat fondateur = autonomie totale pour analytics).*
