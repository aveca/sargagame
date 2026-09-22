# REVENUE RESCUE REPORT — Sargagame
**Date : 2026-09-22 · Agent : revenue-rescue · Sources : `daily-metrics.json` (2026-08-23 → 2026-09-21), endpoint funnel Apps Script live, GA4 (via daily-metrics), Mollie API (via daily-metrics), Stripe (via daily-metrics), code repo (checkout/paywall/pricing), `.ai/bugs.md`**

---

## EXECUTIVE DIAGNOSIS

Sargagame ne génère pas €0 par manque de produit. Le produit existe, est live sur 5 domaines (HTTP 200, 0,3-0,5 s), la donnée satellite est fraîche (ERDDAP, 6 h), et **l'intention d'achat existe** : 116 ouvertures de checkout mesurées sur 30 jours.

Le revenu est €0 pour trois raisons, par ordre d'impact :

1. **Le dernier kilomètre est mort.** Sur 30 jours : 116 ouvertures du checkout on-site → **0 paiement Mollie**. La vérité serveur le confirme : l'API Mollie (non falsifiable par le tracking front) rapporte **0 paiement sur 30 jours, dernier paiement réel : 2026-07-19** — soit **65 jours sans aucun paiement** via la caisse active. L'historique du code montre que le checkout a été cassé à plusieurs reprises (bouton « Commencer » muet sur les 5 domaines après le split PremiumModal ; `createToken` gardé par mounts, BUG-2026-039). **Tant que ce bug n'est pas prouvé mort en production par un paiement réel, tout le reste est du bruit.**
2. **Le trafic réel est microscopique.** GA4 : ~12 sessions/jour sur MQ, GP cassé (0 session/393 users = propriété mal câblée). Les « 5 222 sessions/30 j » du tracker interne sont gonflées (agents, probes CI, tests E2E tournent contre la prod). Même avec un checkout parfait à 10 %, ce volume produit ~€50-150/mois. **Le plafond est le trafic, pas seulement la conversion.**
3. **Le B2B — seul canal capable de générer du revenu significatif immédiatement — est à zéro et bloqué.** 0 client B2B, data model mergé mais tables NON créées en prod depuis le 2026-09-03 à cause d'un token Supabase expiré (BUG-2026-027, fix = 2 minutes côté fondateur, en attente depuis **19 jours**). Aucune prospection n'a commencé.

**Réponse à la question fondatrice** — *pourquoi personne ne sort sa carte ?* — Ceux qui essaient (116 en 30 jours) n'y arrivent pas ou abandonnent au moment de payer ; et il n'y en a presque pas parce qu'il n'y a presque personne sur le site.

**Scénarios du test €0** : **E (checkout bloque)** = prouvé/fortement suspecté · **A (pas assez de visiteurs qualifiés)** = prouvé · **F (comptabilisation)** = partiellement vrai (funnel endpoint aveugle, `payments_real` menteur, GA4 GP cassé) — mais l'API Mollie directe lève le doute : le revenu est bien 0. **B/C/D** : indécidables à ce volume. **G (B2B prioritaire)** = vrai par construction du pricing (1 client Pro 79 €/mo > 5 pass B2C).

---

## EVIDENCE (données réelles, rien d'inventé)

| Preuve | Valeur | Source |
|---|---|---|
| Paiements Mollie sur 30 j | **0** (`paid:{}`) | API Mollie via daily-metrics 2026-09-21 |
| Dernier paiement Mollie | **2026-07-19** (65 jours) | idem (`lastPaidAt`) |
| Stripe legacy | 14 abos actifs, **MRR 69,86 €** (lecture seule, hors caisse active) | champ `stripe` |
| Revenu cumulé historique | ~142,78 € / 22 paiements (lifetime) | daily-metrics |
| Funnel 30 j (events internes) | 5 222 sessions → 1 236 modals → 170 CTA → **116 checkout ouverts → 0 redirect Mollie → 0 conversion** | daily-metrics, agrégé |
| GA4 réel | MQ : 12 sessions/j ; GP : **0 session / 393 users** (câblage cassé) | champ `ga4` |
| Funnel endpoint Apps Script | `premium_modal_cta: 0` cumulé — **l'event lu (`sg_premium_modal_cta`) a été supprimé du front le 2026-08-18** (le vrai CTA = `sg_pass_cta`). Le « tableau de bord revenu » est partiellement aveugle | endpoint live + `Sargasses_PROD.jsx:1982` |
| Checkout cassé, historique | Bouton « Commencer » muet sur 5 domaines (split PremiumModal), `createToken` gardé par mounts (BUG-2026-039, PR #682), bugs z-index paywall (UX-QA-006) | `OnsiteCheckout.jsx` header, `.ai/tasks.md`, `.ai/bugs.md` |
| Emails | 609 collectés, 5 769 envoyés, open 1,02 % / clic 30 (tracking pixel douteux) | daily-metrics |
| B2B | 0 client, 0 paiement (`mollie.b2b: 0`), tables non créées (BUG-2026-027 ouvert depuis 19 j) | daily-metrics, bugs.md |

> Note méthodo : les jours à pics (25/08 : 69 opens ; 15/09 : 24 opens) correspondent vraisemblablement aux sessions de test des agents (fix bouton muet, A13) → le vrai volume humain de checkout est inférieur à 116, ce qui **aggrave** le diagnostic trafic sans enlever le diagnostic paiement.

---

## FUNNEL (30 jours, events internes — sauf mention contraire)

| Étape | Volume | Conversion étape | Problème probable |
|---|---|---|---|
| VISITOR (réel, GA4) | ~400-500/mois, tous domaines confondus (est. haute) | — | Trafic quasi nul ; GP non mesuré |
| SESSION interne | 5 222 | — | Gonflé par agents/probes |
| BEACH INTENT (lock click) | 383 | 7,3 % | OK structurellement |
| PREMIUM MODAL OPEN | 1 236 | 23,7 % sess. | OK |
| OFFER/CTA CLICK (`sg_pass_cta`) | 170 | 13,8 % des modals | Faible mais non nul → valeur pas rejetée par tous |
| CHECKOUT ONSITE OPENED | 116 | 68 % des CTA | OK |
| **PAYMENT SUCCESS (Mollie API)** | **0** | **0,0 %** | **LE TROU. Technique (checkout mort/intermittent) ou paiement refusé non géré. Dernier succès : 19/07.** |
| CUSTOMER (B2C nouveau) | 0 / 65 j | — | — |
| B2B (trial→paid) | 0 | — | Aucun outbound ; infra bloquée par un token expiré |

Mesure manquante pour trancher E proprement : pas de compteur fiable `payment_failed` / `payment_expired` côté webhook dans les métriques quotidiennes (seul `SG_FUNNEL_EVENTS` front existe ; le funnel endpoint lit encore l'ancien nom de CTA).

---

## TOP REVENUE BLOCKERS (max 5)

1. **[E — P0] Paiement réel non prouvé vivant en prod depuis 65 jours.** 116 ouvertures → 0 succès ; historique de régressions money-path (bouton muet 5 domaines, createToken). **Un paiement test réel de bout en bout n'a jamais été documenté post-fixes.**
2. **[A — P0] Trafic qualifié ~10-15 sessions humaines/jour.** À ce niveau, aucune optimisation de paywall ne produit de revenu significatif. SEO seul ne sauvera pas le trimestre.
3. **[G — P0] B2B inexistant ET sabordé par une action fondateur de 2 min non faite depuis 19 j** (`SUPABASE_ACCESS_TOKEN` 401 → tables Phase 1 non créées → Phase 2 impossible → 0 prospection).
4. **[D — P1] Pricing incohérent entre surfaces** : Trip Pass 4,99 € (code), « dès 7,99 € » (home), Pass 14,99 €/30 j (paywall), mensuel 4,99 €, USD 5,99/11,99/19,99 + surcharge saisonnière. Un utilisateur ne peut pas raconter combien coûte le produit → friction de décision (non mesurable à ce volume, mais hygiene commerciale bloquante pour scaler).
5. **[F — P1] Mesure revenu dégradée** : endpoint funnel lit un event supprimé (CTA = 0 fake), `payments_real` menteur, GA4 GP cassé. Décisions prises sur des jauges fausses.

---

## PRICING ANALYSIS

- **actuel** : Pass 30 j 14,99 € / 11,99 $ (+15 % juin-nov US) · Trip Pass 7 j 4,99 € (EUR, code) / 5,99 $ · mensuel 4,99 € · annuel 49 € · B2B Pro 79 €/mo ou 690 €/an, Brief 29 €/mo (decoy).
- **incohérences constatées** : 5 prix B2C différents affichés selon la surface (`HomeAZ` « dès 7,99 € » vs paywall 14,99 € vs regions `tripPass: 4,99 €`). Aucun prix unique mémorisable.
- **valeur perçue** : le produit vend implicitement « technologie satellite » ; la vendable est « quelle plage choisir aujourd'hui et demain ».
- **alternative gratuite** : groupes Facebook locaux, bouche-à-oreille hôtel, regarder la plage. Gratuit et social. La raison de payer = **prévision 7 j par plage + alternatives** (personne d'autre ne le fait), mais ce n'est pas ce que les pages mettent en avant en premier à ce stade de l'analyse (1 236 modals → 170 CTA = 13,8 % : l'offre n'est pas rejetée massivement, l'échantillon ne permet pas d'accuser le prix).
- **verdict** : **ne PAS baisser le prix par réflexe.** Le problème mesuré est en amont (checkout + trafic). Test prix : n'a de sens qu'après paiement prouvé vivant ET trafic en hausse.

---

## CHECKOUT ANALYSIS

Concret, issues du code :
- **Fragilité démontrée** : le chemin paiement a été cassé 3× en 5 semaines (bouton muet tous domaines après refactor ; `createToken` monté/guard BUG-2026-039 ; paywall sous la fiche z-index). Chaque refactor UI touche le money-path → architecture monolithe = risque récurrent.
- **Parcours** : ouverture modal → CTA → étape identité (email) → montage 4 iframes Mollie → token → paiement → webhook → entitlement. Nombreuses validations silencieuses possibles (email invalide, consentement, champs non montés) — un message d'erreur vient seulement d'être rendu visible (PR #713, 2026-09-21, pas encore mesuré).
- **Abandon non mesuré côté échec** : `sg_checkout_abandon` existe ; **pas de compteur d'échec Mollie** (carte refusée, 3DS échoué) dans les métriques quotidiennes → impossible de distinguer « cassé » de « refusé ».
- **Confiance** : paiement on-site Mollie Components = bonne approche ; mais perspective utilisateur : petit domaine inconnu, 4 champs carte… les signaux de réassurance (E11 trust row, recap commande #711) viennent d'être mergés, non mesurés.
- **Verdict** : checkout **suspect jusqu'à preuve du contraire** — exactement le critère de la mission. Preuve requise : 1 paiement réel tracé OFFER→CHECKOUT→WEBHOOK→ENTITLEMENT→ANALYTICS.

---

## B2C PLAN — premiers paiements

**Principe : on ne touche plus au produit avant d'avoir prouvé la caisse.**

1. **Étape 0 (bloquant absolu)** : paiement test réel fondateur (carte réelle, Trip Pass 4,99 €) sur **chacun des 5 domaines**, mobile + desktop. Critère binaire : paiement `paid` dans Mollie + `sg_conversion` remonté + accès premium effectif. Si échec → fix money-path = seule priorité du repo.
2. **Expérience E1 — Trip Pass une page, un prix** (après épreuve 0) : une seule offre B2C « Pass Séjour — 7 jours, X €, paiement unique », promesse « Sachez quelle plage choisir pendant votre séjour ». Hypothèse : simplicité → conversion CTA→checkout. Métrique : `sg_pass_cta`/modal, `sg_conversion`/checkout. Décision à 500 sessions réelles ou 3 semaines.
3. **Distribution immédiate hors SEO** : posts verdicts quotidiens (le `verdict-du-jour.cjs` produit déjà les drafts FB/WA/Reddit — **personne ne les publie**) + ciblage voyageurs en séjour via groupes FB Martinique/GP, location saisonnière. Hypothèse : trafic chaud et daté (semi-urgence plage) > trafic SEO générique.

---

## B2B PLAN — premiers prospects → premiers clients

La cible : toute entreprise qui doit répondre « quelle plage est propre aujourd'hui ? » (hôtels, conciergeries, villas, taxis/excursions, nautique). Produit vendu : **« vos clients savent quelle plage choisir chaque matin »** — pas une API.

**Blocage P0 à lever (fondateur, 2 min)** : régénérer `SUPABASE_ACCESS_TOKEN` (BUG-2026-027, ouvert 2026-09-03) OU coller le bloc B2B de `supabase/schema.sql` dans le SQL Editor.
**Workaround immédiat, sans attendre le token** : la prospection ne requiert aucune table — `B2B_PROSPECT_HUNT.md` (critères, séquences) et `verdict-du-jour.cjs` existent. Un tableur suffit pour 100 prospects.

Plan 100 prospects Martinique (mois 1) :

| Semaine | Volume | Action | Cible |
|---|---|---|---|
| S1 | 40 contacts | Hôtels/conciergeries MQ côte Atlantique + Sud — email court + appel J+3 | 5 réponses, 2 démos |
| S2 | 30 contacts | Villas/conciergeries GP + agences d'excursion | 3 réponses, 1 démo |
| S3 | 30 contacts | Relances + taxis/nautique + offices de tourisme | 2 essais 30 j |
| S4 | — | Conversion essais → Pro 79 €/mo | **1-2 clients payants = 79-158 € MRR** |

Ratios à mesurer (aucun connu à ce jour) : contacté→répondu, répondu→démo, démo→essai, essai→payé. Un client B2B = 5-16 pass B2C de revenu. C'est le canal le plus rapide vers le premier euro récurrent.

---

## 7-DAY PLAN

| Jour | Action | Owner | Done = |
|---|---|---|---|
| J1 (23/09) | **Paiement test réel sur les 5 domaines** (Trip Pass 4,99 €, mobile+desktop) + tracé webhook→entitlement→analytics. Verdict écrit : vivant/mort par domaine | Fondateur (carte) + agent | Table 5×2 remplie dans `.ai/bugs.md` ou preuve verte |
| J1 | **Régénérer `SUPABASE_ACCESS_TOKEN`** (ou coller le SQL) → tables B2B créées | Fondateur (2 min) | `apply-supabase-schema.yml` vert |
| J2 | Si checkout mort : fix money-path minimal + CI gate. Si vivant : documenter le taux référence | coding-agent | Paiement vert sur 5 domaines |
| J2 | Liste 40 premiers prospects MQ (hôtels/conciergeries côte Atlantique) — tableur partagé | growth-agent | 40 lignes avec source |
| J3 | Envoi 15 premiers emails B2B (séquence courte existante, zéro spam) | fondateur/humain | 15 envoyés, log |
| J3 | **Fix mesure** : endpoint funnel lisant `sg_pass_cta` (pas l'event supprimé) + compteur échec paiement Mollie dans daily-metrics | data-agent | `modal_to_cta` réel visible |
| J4-5 | 25 emails B2B + publication quotidienne verdict-du-jour FB/groupes (drafts déjà générés) | humain + automation | 7 posts publiés, 15+15 emails |
| J6-7 | Point hebdo chiffré : paiements réels, réponses B2B, trafic GA4 (réparer propriété GP) | growth-agent | Revue données, décision itération |

## 30-DAY PLAN — objectifs commerciaux

| Objectif | Cible 30 j | Ratio plancher |
|---|---|---|
| Checkout prouvé vivant (5 domaines) | 100 % | Bloquant J2 |
| Paiements B2C réels | 3-10 (trafic actuel) | Mesure référence |
| Prospects B2B contactés | 100 | — |
| Réponses B2B | ≥ 8 (8 %) | <3 % → offre à revoir |
| Démos/essais B2B | ≥ 3 | — |
| **Clients B2B payants** | **1-2 (79-158 € MRR)** | **Critère de vérité G** |
| Trafic GA4 réel | ×2 via posts quotidiens | Mesure acquisition repeatable |
| GA4 GP réparé + funnel events honnêtes | fait | Bloquant pour décider |

## METRICS (définitions exactes, sources)

- `revenue_mollie_30d`, `last_paid_at` — API Mollie (vérité caisse)
- `stripe.mrr`, `stripe.active` — Stripe (legacy)
- `checkout_open → paid` = `onsiteCheckoutOpened` / Mollie `paid` — daily-metrics + Mollie
- `sg_pass_cta` / `sg_premium_modal_open` — Supabase funnel (après fix nommage)
- `payment_failed_rate` — **à créer** dans daily-metrics (webhook Mollie statuts)
- B2B : `contacted / replied / demo / trial / paid` — pipeline manuel puis `outreach` (après token)
- GA4 sessions réelles par domaine — après réparation propriété GP

## IMMEDIATE ACTIONS (max 3)

1. **P0 — LE PAIEMENT TEST RÉEL.** Fondateur : 1 paiement 4,99 € par domaine (×5), mobile + desktop. Si un seul échoue → tout le repo s'arrête jusqu'au fix. *(Preuve requise : 116 ouvertures → 0 paiement, 65 jours sans caisse.)*
2. **P0 — LE TOKEN SUPABASE (+ lancer les 40 premiers prospects B2B).** 2 minutes pour débloquer l'unique canal à revenu significatif, bloqué depuis 19 jours. Prospection démarrable cette semaine avec zéro code.
3. **P0 — PUBLIER CE QUI EST DÉJÀ PRODUIT.** Les verdicts du jour (FB/WA/groupes locaux) sont générés chaque jour et jamais publiés ; les emails existent. 10 min/jour de distribution humaine = le seul levier trafic immédiat gratuit.

---

*Prochaine étape : validation fondateur des 3 actions → j'implémente le plus petit changement nécessaire (fix money-path ou fix mesure funnel selon résultat du paiement test), je déploie, je mesure.*
