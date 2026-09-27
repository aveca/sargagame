# B2C OFFER ARCHITECTURE LAB — Pricing / Offer Architecture

**Date :** 2026-09-27
**Mission :** B2C Monetization / Offer Architecture Lab
**Statut :** LAB (recherche + architecture + garde-fous — aucun montant débité modifié)
**Docs liés :** `.ai/plans/B2C-OFFER-RESEARCH.md` (benchmark), `.ai/plans/COASTAL-LAB.md` (trust layer)
**Règle du lab :** ce document ne contient ni score, ni ranking, ni "winner". Options + compromis uniquement.

---

## 1. CURRENT PRICING TRUTH (code + paiements = source de vérité)

### 1.1 Table complète des sources de prix

| SOURCE | PRODUIT | PRIX | DEVISE | FACTURATION | RÉEL / LEGACY | UTILISÉ PAR | CONFLIT ? |
|--------|---------|------|--------|-------------|---------------|-------------|-----------|
| `public/api/mollie.php` `$passPrices` (serveur, allowlist anti-tamper) | `p30` | 14.99 / 11.99 | EUR / USD | one-time 30j | **RÉEL — débité** | `create_payment` | Non — référence |
| `public/api/mollie.php` `$passPrices` | `trip7` | 4.99 / variable* | EUR / USD | one-time 7j | **RÉEL — chargeable** | `create_payment` | **Oui** — voir §2.1 |
| `public/api/mollie.php` `$passPrices` | `season` | 19.99 / variable* | EUR / USD | one-time 210j | **RÉEL — chargeable** | `create_payment` | **Oui** — voir §2.2 |
| `public/api/mollie.php` (branche `!$pass`) | B2B annual (hosted) | plausibilité 0–300 | EUR/USD | one-time | **RÉEL** | `create_payment` source `b2b_annual` | Non |
| `public/api/mollie-lib.php` `mol_b2b_plans()` | `pro_monthly` / `brief_monthly` | 79 / 29 | EUR | recurring monthly | **RÉEL** | `create_subscription` | Non |
| `public/api/mollie-lib.php` `mol_b2b_plans()` | `pro_monthly_usd` / `brief_monthly_usd` | 89 / 39 | USD | recurring monthly | **RÉEL** | `create_subscription` | Non |
| `scripts/automation/mollie-paylinks.cjs` TIERS | `brief_annual` / `pro_annual` | 290 / 690 | EUR | one-time annual (hosted link) | **RÉEL** | `b2b-paylinks.json` (auto-réparé #212) | Non |
| `src/lib/pass-price.js` `PASS_CENTS` | `p30` base | 1499 / 1199 | EUR / USD | one-time 30j | **RÉEL — miroir front** | `PassOffer`, `OnsiteCheckout`, `StayTrajectory` | Non (miroir exact) |
| `src/lib/pass-price.js` `seasonalCents` | surcharge USD +15% juin→nov (hors trip7) | calculé | USD | au débit | **RÉEL** | affichage + serveur (§1.3) | Non (miroir exact) |
| `src/PassOffer.jsx` `PASS` | `p30` seul produit servi | 1499 / 1199, 30j | EUR / USD | one-time | **RÉEL — live** | paywall | Non |
| `src/ga4-ecommerce.js` `PLAN_META` | `p30` 14.99, `trip7` 4.99, `season` 19.99, `p30_usd` 11.99, `trip7_usd` 5.99 | EUR / USD | one-time | **Labels analytics uniquement** | GA4 `purchase`/`begin_checkout` | **Oui** — voir §2.3 |
| `src/ga4-ecommerce.js` `PLAN_META` | `p7` 7.99 (EUR) | EUR | one-time 7j | **MÉTADONNÉE MORTE** | rien (aucun sender) | **Oui** — voir §2.4 |
| `src/ga4-ecommerce.js` `PLAN_META` | `pro_monthly` 79, `pro_annual` 690, `brief_monthly` 29 | EUR | recurring/one-time | **Labels analytics** | GA4 B2B | Non (conforme) |
| `scripts/automation/blast-mollie-offer.cjs:44-45` | `p7` 7.99/5.99, `p30` 14.99/11.99, `saison` 19.99/19.99 | EUR / USD | one-time | **Copy email (blast)** | emails Mollie | **Oui** — voir §2.4 + §2.5 |
| `scripts/automation/funnel-b2b-from-supabase.cjs:9` | "86 pass à 7,99€" (équivalence Pro 690€) | EUR | métrique interne | **Commentaire code** | équivalence revenue | **Oui** — base 7,99 stale (§2.4) |
| `regions/florida.json` (+puntacana, rivieramaya) `paymentLinks` | `monthly` / `yearly` / `tripPass` (buy.stripe.com) | Stripe | recurring/one-time | **LEGACY run-off** | rien (ne pas étendre) | Non (gelé) |
| `CLAUDE.md` §16 | "B2C pass one-time EUR 7,99/14,99/24,99" | EUR | one-time | **DOC STALE** | — | **Oui** — voir §2.1 + §2.2 |
| B2B docs (`B2B_OFFER.md`, emails) | Brief 29€/mo·290€/an, Pro 79€/mo·690€/an, USD 39/89$/mo·390/790$/an, Territoire 1990€/an (TIERS), Territory dès 199€/mois (copy) | EUR / USD | mixed | **RÉEL (annuel+mEU)** | paylinks + mol_b2b_plans | Partiel — voir §2.6 (hors scope B2C, flaggé) |

\* USD `trip7`/`season` = `null` côté serveur → fallback plausibilité (0.50–50). Donc `trip7_usd` 5.99 (GA4) passe la validation ; `season` USD 19.99 passe aussi (puis +15% saison appliqué au débit).

### 1.2 Source of truth actuelle (par domaine)

| Domaine | Source of truth |
|---------|-----------------|
| Montants B2C débités | `mollie.php` `$passPrices` (serveur) — **seule autorité de charge** |
| Montants B2C affichés | `pass-price.js` `PASS_CENTS` + `seasonalCents` (miroir, contrat testé) |
| Produit B2C servi | `PassOffer.jsx` `PASS = {p30}` (seul) |
| Montants B2B monthly débités | `mol_b2b_plans()` (repo, pas config) |
| Montants B2B annual débités | `mollie-paylinks.cjs` TIERS → `b2b-paylinks.json` |
| Labels analytics (non-billing) | `ga4-ecommerce.js` `PLAN_META` |
| Docs produit B2B | `B2B_OFFER.md` + CLAUDE.md §B2B |

### 1.3 Règle de cohérence vérifiée (USD seasonal)
Front envoie `cents` de BASE (1499/1199…) ; serveur valide la base puis applique +15% USD juin→nov (hors trip7) ; front affiche `seasonalCents()` = même +15%. **Affiché = débité. Cohérent.** Ne pas casser cette symétrie.

---

## 2. PRICING INCONSISTENCIES (faits, pas de correction aveugle)

### 2.1 CONFLIT `trip7` : 4.99 (serveur) vs 7.99 (docs/emails)
- **Serveur chargeable :** `trip7` EUR **4.99** (`mollie.php:102`).
- **Stale :** `CLAUDE.md` §16 "EUR 7,99" · `blast-mollie-offer.cjs` `p7: '7.99'` · `funnel-b2b-from-supabase.cjs` "86 pass à 7,99€".
- **Impact :** aucun débit erroné aujourd'hui (seul `p30` est servi par le front). Risque = toute future UI trip7 copiant 7.99 depuis les docs serait rejetée (`Prix invalide`).
- **Action :** ne pas toucher au serveur. Corriger les docs/emails vers 4.99 (tâche éditoriale, pas money-path).

### 2.2 CONFLIT `season` : 19.99 (serveur) vs 24.99 (CLAUDE.md)
- **Serveur chargeable :** `season` EUR **19.99**, 210j (`mollie.php:103`).
- **Stale :** `CLAUDE.md` §16 "24,99".
- **Impact :** idem — latent uniquement.
- **Action :** corriger CLAUDE.md §16 vers la grille serveur (éditorial).

### 2.3 `PLAN_META.season`/`trip7` : labels analytics, pas billing
- `ga4-ecommerce.js` `season: 19.99`, `trip7: 4.99` = conformes serveur. OK, ne pas toucher.
- Ces valeurs ne débitent rien (GA4 `purchase` event payload uniquement).

### 2.4 Clé fantôme `p7` (7.99) : non chargeable
- `PLAN_META.p7 = 7.99€` + `blast-mollie-offer` `p7` : **aucun sender** dans `src/` (seul `PASS.key="p30"` est envoyé). Si un front envoyait `pass:"p7"`, le serveur répondrait `Prix invalide` (clé absente de `$passPrices`).
- **Action :** ne pas ressusciter `p7`. Si un 7j est un jour servi, la clé canonique est **`trip7` à 4.99** (serveur). `p7` = résidu à purger (éditorial, GA4 + blast).

### 2.5 Mismatch latent `saison` vs `season`
- `PremiumModal.jsx:152` mappe `item.pass === "saison" ? 210` (jours d'accès, affichage).
- Serveur exige `pass === "season"` pour la validation prix. Un payload `pass:"saison"` serait rejeté.
- **Latent** (seul `p30` envoyé aujourd'hui). **Règle canonique : clé unique `season`** (anglais, comme serveur). À verrouiller dans `src/lib/offers.js` + contrat test.

### 2.6 B2B : points flaggés hors scope (ne pas toucher ici)
- `Territory dès 199€/mois` (copy drip-b2b) : aucune clé `territory_monthly` dans `mol_b2b_plans()` → offre copy sans backend. B2B-side, à signaler à la track B2B, pas à ce lab.
- `regions/*/paymentLinks` (Stripe buy.stripe.com) : legacy run-off, ne pas étendre, ne pas supprimer (historique).
- `TASK-PAYLINKS` (rivieramaya+tulum) : rivieramaya a déjà son bloc ; reste tulum — legacy de toute façon, stale.

---

## 3. BENCHMARK → IMPLICATIONS (résumé, détail : `B2C-OFFER-RESEARCH.md`)

| Pattern marché | Acteurs | Implication Sargagame |
|----------------|---------|----------------------|
| Court gratuit / long payant + alertes + favoris | Surfline, Windy, AllTrails | J+0/J+1 free → J+2/J+7 + "ta plage bascule" + favoris illimités = cœur Watch |
| Trial sur annual, monthly cher assumé | Surfline, AllTrails | Trial 7j sur Watch Annual ; Monthly au prorata supérieur, assumé |
| Weekly/trip ~€5 = price point voyage | Komoot €4.99, Flighty $4.99 | Trip 7j 4.99€ déjà aligné marché — ne pas le bouger |
| One-shot personnalisé ~$19 | Sargassum Report ($19, humain, 450+ clients) | "Mon Séjour" auto à coût ~0 = marge structurelle |
| Premier usage complet > trial à activer | Flighty ("free on first flight") | Premier trip = Watch offert, puis conversion |
| Ne jamais retirer du one-time acheté | Komoot (contre-exemple, backlash) | Watch s'ajoute, ne remplace jamais Trip |
| Gratuits locaux non monétisés | SargaTrack, FanGass | Ne pas concurrencer le J+0 ; différencier forecast + fiabilité + alternatives |
| Zones annual | $25–60/yr (Windy 25-35, AllTrails 36, Komoot 60, Surfline 120) | Watch Annual €20-30/yr crédible |

---

## 4. OFFER MODELS EXPLORED (A–F, compromis, pas de ranking)

### MODEL A — Free + Trip Pass (statu quo structuré)
- **Contenu :** Free actuel + `p30` (14.99/11.99) + `trip7` (4.99) + `season` (19.99) ré-exposés proprement.
- **Valeur :** friction minimale, code serveur déjà prêt, zéro billing récurrent.
- **Friction :** faible (one-time, Apple/Google Pay natif existant).
- **Complexité technique :** faible — front seul (PassOffer multi-produits) + contrat test.
- **Complexité Mollie :** nulle (allowlist existante).
- **Récurrent :** zéro.
- **Confusion :** moyenne si 3 pass affichés sans hiérarchie (p30 vs trip7 vs season).
- **Compatibilité :** SEO ✓ (free intact) · Beach Object ✓ (J+7 gated = déjà le cas) · Trip Planner ✓ · alertes ~ (pas de monitoring continu) · Coastal Lab ✓ (entrée free).

### MODEL B — Free + Trip Pass + Watch Monthly
- **Contenu :** A + `watch_monthly` (prix hypothèse §13 mission, ex. ~2.99–4.99€/mo) : favoris + surveillance + alertes "bascule" + forecast complet + alternatives + historique.
- **Valeur :** la récurrence est justifiée par le monitoring (job continu réel : "surveille mes plages"), pas par du contenu.
- **Friction :** moyenne (abonnement = engagement ; hosted checkout Mollie existe déjà pour B2B).
- **Complexité technique :** moyenne — favoris existent (`sg_fav`), alertes existent (cloche), mais l'entitlement récurrent B2C (grant `b2c_watch`, expiry, cross-device) n'existe pas.
- **Complexité Mollie :** moyenne-forte — nouveaux plans `watch_monthly[_usd]` dans `mol_b2b_plans()`-équivalent B2C OU nouveau registre ; webhook `subscription.*` → grant type `b2c_watch` ; `verify_subscription` B2C ; revoke on canceled/expired.
- **Récurrent :** oui, le seul vrai MRR B2C du lab.
- **Confusion :** forte si mal positionné ("pourquoi payer chaque mois pour une appli vacances ?") → le copy doit vendre la surveillance, pas le contenu.
- **Compatibilité :** SEO ✓ · Beach Object ✓ (WATCH = recurring sur TODAY/J+7/alternative) · Trip Planner ✓ (inclus ou addon) · alertes ✓ (cœur) · Coastal Lab ✓ ("Monitor this beach").
- **GAP bloquant :** §7 — aucune infra B2C recurring aujourd'hui.

### MODEL C — Free + Trip Pass + Watch Monthly + Watch Annual
- **Contenu :** B + `watch_annual` (~19.99–29.99€/an, hypothèse) : même feature set, -30/40% vs 12× monthly, trial 7j sur annual uniquement.
- **Valeur :** capte les résidents/expatriés/saisonniers (usage annuel réel aux Antilles/Floride).
- **Friction :** faible à l'achat (un paiement), engagement annuel.
- **Complexité technique :** même que B + 1 plan. Trial = grant 7j sans carte (token éphémère, pattern existant `sg_sample_until`/trial B2B à réutiliser).
- **Complexité Mollie :** même que B (annuel = subscription 12 mois OU one-time 365j ? — décision §7 : subscription recommandée pour le retry/renewal natif).
- **Récurrent :** oui (annualisé).
- **Confusion :** moyenne (monthly vs annual = pattern connu, cf. Surfline "monthly is most expensive, assumé").
- **Compatibilité :** identique B.

### MODEL D — Free + Trip Pass + Watch + Personalized Report ("Mon Séjour")
- **Contenu :** C + `mon_stay` one-shot (~9.90–19.90€ hypothèse) : destination + dates + hôtel/zone + plages préférées → synthèse auto (données existantes uniquement).
- **Valeur :** ARPU ponctuel élevé, coût marginal ~0 (vs $19 humain chez Sargassum Report).
- **Friction :** faible (one-time, formulaire court).
- **Complexité technique :** moyenne — génération synthèse (templates + forecast + alternatives + marine + evidence), page de rendu, delivery (in-app + email). Aucune donnée à inventer : tout existe.
- **Complexité Mollie :** faible — one-time `create_payment` avec nouvelle clé allowlist (`mon_stay`, montant fixe) + grant lecture seule (pas d'expiry complexe : accès au rapport, pas au produit).
- **Récurrent :** non (mais ré-achetable par séjour = quasi-récurrent comportemental).
- **Confusion :** faible si positionné "avant le séjour" vs Watch "pendant/toute l'année".
- **Compatibilité :** SEO ✓ (landing dédiée possible) · Beach Object ✓ (source) · Trip Planner ✓ (input) · Coastal Lab ✓ (upsell contextuel "analyse ce séjour").

### MODEL E — Free + Micro-plan "1 beach"
- **Contenu :** micro one-shot (~0.99–1.99€ hypothèse) : 1 plage, 7j, alertes sur cette plage uniquement.
- **Valeur :** ticket d'entrée minimal, conversion douce vers Watch.
- **Friction :** très faible… mais friction de paiement > valeur perçue (saisir une carte pour €1 = abandon probable).
- **Complexité technique :** moyenne (même entitlement que Trip, scopé 1 beach).
- **Complexité Mollie :** faible (allowlist + grant scopé) mais ratio coût Mollie (fixes par transaction !) / prix = destructeur de marge. **À noter : les frais fixes Mollie (~€0.25-0.30 + %) rendent le micro-paiement anti-économique.**
- **Récurrent :** non.
- **Confusion :** forte (1 beach vs trip vs watch = 3 granularités à expliquer).
- **Compatibilité :** Beach Object ✓ mais scope à maintenir partout (gating par beach_id).
- **Compromis dominant :** marge + confusion > valeur d'acquisition. Documenté, non recommandé en l'état (hypothèse, pas verdict).

### MODEL F — Free + Progressive Watch tiers (1 / 5 / unlimited plages)
- **Contenu :** Watch décliné par quota de plages surveillées.
- **Valeur :** segmentation prix (léger vs power user).
- **Friction :** moyenne (choix du tier).
- **Complexité technique :** forte — quotas à enforcer partout (favoris, alertes, forecast), UX de "quota atteint", upgrade paths.
- **Complexité Mollie :** forte — 3 plans × 2 devises = 6 plans + webhook mapping.
- **Récurrent :** oui.
- **Confusion :** forte (l'utilisateur ne sait pas combien de plages il "consomme").
- **Compatibilité :** alertes ~ (quotas), tout le reste = surcoût.
- **Compromis dominant :** complexité >> gain à ce stade (base payante ~0). Documenté pour réexamen post-traction.

---

## 5. FEATURE / VALUE MATRIX (conceptuelle)

| Feature | FREE | TRIP (one-time) | WATCH (monthly/annual) | MON STAY (one-time) |
|---------|------|-----------------|------------------------|---------------------|
| Carte + état aujourd'hui | ✓ | ✓ | ✓ | (source) |
| Photo + Beach Object de base | ✓ | ✓ | ✓ | (source) |
| Aperçu forecast (J+0/J+1) | ✓ | ✓ | ✓ | (source) |
| Forecast J+2→J+7 | aperçu/lock | ✓ (durée pass) | ✓ | ✓ (fenêtre séjour) |
| Confiance / fiabilité | ✓ (preuve) | ✓ | ✓ | ✓ |
| Alternatives | ✓ (1 plan B) | ✓ (complet) | ✓ | ✓ (recommandations) |
| Trip Planner | aperçu | ✓ | ✓ | ✓ (input) |
| Favoris | lim
...[truncated 13588 chars]