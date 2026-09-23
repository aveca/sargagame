# FOUNDER ACTIONS — REVENUE RESCUE (2026-09-22)

3 actions humaines, par ordre d'impact. Total : ~45 min. Tout le reste est déjà fait ou automatisé.

> **§0 TypeSafe/Jev (routeur d'intention landing)** : clé absente de l'environnement local. Activation (5 min, 1 fois) :
> 1. `wrangler secret put TYPESAFE_API_KEY` dans `workers/sg-payments/` (coller la clé)
> 2. Dashboard Cloudflare → Workers Routes : ajouter `*/api/jev-intent*` → worker `sg-payments` sur les 6 zones (mq, gp, miami, puntacana, cancun, tulum)
>
> Sans ça, tout fonctionne exactement comme aujourd'hui : l'endpoint répond 404 → le client garde la recherche déterministe (vérifié en prod 2026-09-22). Kill switch : retirer la route OU `?jev=0`.

---

## 1. PAIEMENT TEST RÉEL — 5 domaines (~75 € total, 20 min)

**La sonde E2E a déjà prouvé** (2026-09-22, mobile + desktop, 5/5 domaines) : paywall → CTA → overlay → 5 iframes Mollie montées → bouton Payer. **Aucun vrai paiement n'a encore validé la boucle complète depuis le 19/07** (65 jours).

Prix **vérifiés en prod** le 2026-09-22 (recap de commande, sonde read-only) — le CTA hero vend le **Pass 30 jours** :

| # | Domaine | Prix affiché attendu (exact) |
|---|---------|---|
| 1 | sargasses-martinique.com | **14,99 €** (Pass 30 jours) |
| 2 | sargasses-guadeloupe.com | **14,99 €** |
| 3 | sargassummiami.com | **$13.79** (= $11.99 + 15 % surcharge saison juin→nov) |
| 4 | sargassumcancun.com | **$13.79** |
| 5 | sargassumpuntacana.com | **$13.79** |

⚠️ Si le recap affiche un AUTRE montant (ex. 4,99 € ou $5.99), ne pas payer : me le signaler = bug pricing, pas le test.

**Parcours** : ouvrir le site → cliquer un jour de prévision verrouillé (ou `?paywall=1`) → CTA « Voir la prévision 7 jours » → email + 4 champs carte → Payer → 3DS éventuel → retour.

**À chaque paiement, noter** :
- [ ] paiement apparait `paid` dans le dashboard Mollie
- [ ] retour sur l'app = premium débloqué (prévision 7 j accessible)
- [ ] la veille (J+1) : la ligne apparaît dans `daily-metrics.json` bloc `mollie.paid`

**Si UN SEUL échoue** : me renvoyer domaine + heure + message affiché (ou « rien ne se passe ») + mobile/desktop. Je corrige ce domaine en priorité absolue, rien d'autre ne bouge entre-temps.

## 2. B2B — activation complète (token + GO envoi)

### État vérifié 2026-09-22 (ce qui existe DÉJÀ et fonctionne)

| Composant | État |
|---|---|
| Landing B2B `/sargasses-pour-hotels/` (MQ+GP) | ✅ live |
| Tunnel essai 30 j (email → token → espace) | ✅ vérifié en code (B2BModal → b2b-api worker) |
| **Paylinks Mollie live** : Pro 690 €/an (EUR) / 790 $ · Brief 290 € / 390 $ · Territoire 1 990 € | ✅ live, webhookés (`b2b-paylinks.json`, vérifié en prod) |
| Scripts outbound (`b2b-outreach.cjs`, dry-run, preflight) | ✅ existent, jamais activés en envoi réel |
| Protocole de prospection + critères | ✅ `B2B_PROSPECT_HUNT.md` |
| Endpoint trial + espace Pro | ✅ live via worker b2b-api |

### ⚠️ Prix B2C « fantômes » encore live dans Mollie (paylinks créés en juillet)

`trip 4,99 €/$ · sejour 12,99 €/9,99 $ · saison 19,99 €/14,99 $` — si un de ces liens traîne dans un vieil email ou une page, on peut recevoir un paiement à un prix abandonné. **À faire** (2 min, dashboard Mollie) : désactiver ces 6 paylinks pour ne garder que Pro/Brief/Territoire + laisser le checkout on-site seul canal B2C. (Je peux le faire via API avec `MOLLIE_API_KEY` sur ton GO — suppression de liens, pas de pricing in-app.)

### Étape 1 — Token Supabase — OBSOLÈTE 2026-09-23 (schema live, ne plus demander en priorité)

Lecture prod 2026-09-23 : tables B2B peuplées (`b2b_prospects`=2, `b2b_contacts`=1, `b2b_scores`=1, `b2b_concierge`=1, `b2b_events`=13). Le bottleneck B2B est les VENTES (0 trial→paid, 0 `b2b_payments`), pas le schéma. Ne régénérer le token + `apply-supabase-schema.yml` QUE pour une future migration (RLS/policies) — jamais comme prérequis commercial.

### Étape 2 — Premières ventes (ne demande AUCUN token, aujourd'hui)

La prospection humaine ne dépend d'aucune infra :
1. `B2B_PROSPECT_HUNT.md` → critères + séquence courte prête.
2. Cible semaine : 15 hôtels/conciergeries **Martinique côte Atlantique** (Le François, Le Vauclin, Sainte-Luce) — ceux qui doivent répondre « quelle plage aujourd'hui ? » à leurs clients.
3. Message = B2B_EMAIL_TEMPLATE.md adapté (1 contact, pas de séquence agressive). Offre : **essai 30 j** (tunnel live) ; closing : Pro 79 €/mo ou 690 €/an (paylink live).
4. Log : `scripts/automation/data/b2b-outreach-log.json` (format existant).

### Étape 3 — Automatisation machine (optionnel, APRÈS preuve humaine)

Le pipeline d'envoi massif (worker outreach) demande 2 secrets GH absents (`OUTREACH_WORKER_URL`, `OUTREACH_ADMIN_KEY`) — ne pas activer avant d'avoir 3+ réponses humaines prouvant l'offre. Vérification pré-activation : `npm run outreach:preflight`.

## 3. DISTRIBUTION QUOTIDIENNE — 10 min/jour (le seul levier trafic immédiat)

Les drafts sont générés chaque nuit par région : `scripts/automation/data/verdict-du-jour/YYYY-MM-DD-<region>.md`.
Chaque fichier contient 5 blocs prêts à copier-coller : FACEBOOK / WHATSAPP / INSTAGRAM / REDDIT / EMAIL.

**Rituel quotidien (à partir d'aujourd'hui)** :
1. Ouvrir le draft MQ du jour + le draft GP du jour.
2. Poster le bloc FACEBOOK dans 1-2 groupes locaux (plages/tourisme Martinique, puis Guadeloupe) + bloc WHATSAPP dans 1 groupe.
3. 1×/semaine : REDDIT (r/martinique, r/guadeloupe — utile, pas spam : données réelles du jour).

**Mesure** : les liens portent `utm_source=social&utm_campaign=verdict_jour` → le trafic et les conversions seront visibles dans GA4 et le funnel (`session_start` avec utm). Critère de décision à 14 j : si ≥ 1,5× le trafic actuel → continuer/doubler ; sinon pivot canal.

## Ce qui est déjà fait côté code (cette session)

- Funnel Apps Script déployé **@44** : rates calculés sur `sg_pass_cta` (l'event réel) — avant, le dashboard affichait 0 % CTA à vie (jauge cassée). Vérifié live : `pass_cta=208 / 28 j`.
- Beacon front étendu (`sg_payment*`, `sg_onsite_checkout_opened`) → après le prochain déploiement, le funnel verra **ouverture checkout → paiement → échec** : le goulot money-path devient visible quotidiennement.
- Sonde prod rejouable à volonté : `PROBE_PROD=1 BASE=https://<domaine> npx playwright test tests/e2e/prod-money-path-probe.spec.ts` (ne pollue pas les analytics).
