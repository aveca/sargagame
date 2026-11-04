# B2B deliverability — la SEULE action fondateur pour débloquer les clients

> Verdict du panel revenue (2026-07-02) : le funnel qui rapporte est le B2B, il **envoie déjà**
> (cold outreach + drip + followups dans `daily-copernicus.yml`), mais **tout part de
> `alerte@sargasses-martinique.com` partagé, sans domaine d'envoi B2B dédié**. Résultat :
> les emails de vente tombent en spam → ramper `CAP_NEW` = progresser sur **zéro délivré**.
> C'est le **multiplicateur de tout le reste** : rien ne convertit tant que ça n'arrive pas.

## Ce que Claude a déjà fait (aucune action requise)

- **Instrumentation du funnel B2B** (PR `feat/b2b-funnel-visibility`) : `sg_analytics_event()`
  (mollie-lib.php) écrit dans Supabase `analytics_events` (clé **publique** anon, zéro secret) :
  - `b2b_trial_started` — émis par `b2b-trial.php` à chaque essai lancé.
  - `b2b_trial_to_paid` — **RESTAURÉ le 2026-11-04**. La doc l'annonçait comme
    « émis par `mollie-webhook.php` » depuis le 2026-07-02, mais **aucun
    appelant ne l'émettait** : le taux essai→payé était donc 0 *par
    construction*, pas par absence de clients. L'émission est désormais
    branchée sur les deux encaissements B2B (mensuel via `subscription.paid`,
    annuel via `payment.paid`), déduplonnée par identifiant d'encaissement.
    ⚠️ Émis par le **chemin PHP du dépôt** ; voir plus bas « Le chemin de
    paiement EN PRODUCTION n'est pas ce fichier ».
  - `payment_rejected` — **AJOUTÉ le 2026-11-04**. Une signature Mollie valide
    refusée par la validation du webhook (HTTP 400) est désormais **visible** :
    c'est le compteur « argent encaissé sans accès servi ».
  - Lecture : `node scripts/automation/funnel-b2b-from-supabase.cjs` → **essais / payés / taux essai→payé / paiements refusés**.
    **Depuis le 2026-11-04, ce lecteur est EXÉCUTÉ** par le job `revenue-metrics`
    (autonome, hors garde de fraîcheur satellite) : son instantané
    `scripts/automation/data/funnel-b2b-snapshot.json` est commité à chaque run.
    Avant, le script existait mais n'était appelé par **aucun** workflow et son
    instantané n'a jamais existé.
  - `b2b_widget_activated` — toujours **non émis** (le widget est une iframe
    même-origine : l'hôte de l'hôtel n'est pas visible côté serveur). Reste une
    action à faire : passer au widget son host d'intégration.
- `b2b-cold-outreach.cjs:34` lit **déjà** `process.env.B2B_FROM` → **zéro code à écrire côté envoi.**

> ⚠️ **Point ouvert, à trancher par le fondateur (2026-11-04).** La validation
> du webhook (`validateMollieAmountPHP`) lit le montant via
> `$payment->amount->currency`, alors que le client Mollie du dépôt renvoie un
> **tableau** (`json_decode($response, true)`) : la lecture vaut `null` et
> **tout** paiement est refusé en HTTP 400. Vérifié par exécution PHP réelle
> sur le code livré (`tests/fixtures/b2b-payment-harness.php`) : un pass B2C à
> 14,99 €, un B2B mensuel à 79 € et un B2B annuel à 690 € sont **tous**
> refusés. La correction est d'une ligne (`$payment->amount['currency']`) mais
> elle modifie le chemin de paiement → **autorisation explicite requise**.

## 🔴 Le chemin de paiement EN PRODUCTION n'est pas ce fichier (mesuré le 2026-11-04)

L'instrumentation ci-dessus porte sur `public/api/mollie-webhook.php` (le **chemin
PHP du dépôt**). Ce chemin **n'est pas celui qui sert les 6 domaines en
production**. Routes Cloudflare lues via l'API (`GET /zones/{id}/workers/routes`) :

| Motif de route | Worker qui sert |
|---|---|
| `<domaine>/api/mollie*` | **`sg-payments`** |
| `<domaine>/api/b2b-*` | **`sg-payments`** |
| `<domaine>/api/create-checkout*` | **`sg-payments`** |
| `<domaine>/*` | `sargagame-mq` / `-gp` / `-florida` / `-tulum` / `-puntacana` / `-rivieramaya` |

Conséquences **mesurées en lecture seule** sur les 6 domaines :

| Sonde | Résultat live | Ce que ça prouve |
|---|---|---|
| `GET /api/mollie-webhook.php` | `200 {"ok":true}` | health-check du Worker `sg-payments` — **pas** le PHP (qui répondrait `400 {"error":"id + type requis"}`) |
| `GET /public/api/mollie-webhook.php` | `404 {"error":"not_found"}` (JSON) | le PHP **n'est pas joignable** : le Worker intercepte tout |
| `POST /api/mollie.php` `{"action":"__payment_smoke__"}` | **`500` — `error code: 1101`** (les 6 domaines) | le backend de paiement live **lève une exception** sur le smoke **sans transaction** du propre gate de déploiement du dépôt (`cloudflare-production.yml:436-448`) |
| `POST /api/create-checkout.php` | **`404 {"error":"not_found"}`** | l'endpoint Stripe appelé par `src/PremiumModal.jsx` (lignes 1704, 1966, 1984) **n'existe pas** en production |

Et l'historique de versions du Worker `sg-payments` (API Cloudflare) : **les
10 versions conservées datent toutes du 2026-10-01/02**, dernière
`36fa827a-a39c-4156-9359-30fc383eb6c5` (n° 381). Les 6 ventes payées non
livrées sont de **juin–juillet 2026** : elles **ne peuvent pas** avoir été
traitées par `sg-payments`, qui n'existait pas encore. Le trou de fulfillment
historique est donc bien celui du **PHP** décrit plus haut ; le trou
**actuel** est un Worker sans version dans le dépôt.

> 📌 **Ce qu'il faut savoir avant toute action.** La source autoritative de
> `sg-payments` **n'est pas dans ce dépôt** (cf. `.ai/current_state.md` :
> « la source autoritative du Worker `sg-payments` n'est NI [dans le dépôt] »).
> Et `workers/sargagame/index.js` — le Worker de **migration** du dépôt —
> n'implémente **que** le B2C : son webhook n'accepte que des identifiants de
> paiement (`tr_…`), **pas** les identifiants d'abonnement (`sub_…`), donc il
> **ne sait pas** livrer un abonnement B2B. Basculer les routes sans porter
> d'abord le fulfillment B2B de `sg-payments` **casserait les abonnements**.
> → **Récupérer ou porter la source `sg-payments` AVANT toute bascule de
> route.** Le basculement est un changement de chemin de paiement →
> **autorisation explicite requise**.

## L'action fondateur (≈ 20 min, une fois) — DNS + 1 secret

L'envoi B2B passe par **Resend** (cf. `mol_b2b_trial_email`, `cfg.resend_key`). Pour un domaine dédié :

1. **Choisir un domaine/sous-domaine d'envoi B2B** dédié (n'expose pas la réputation d'`alerte@`) :
   - option simple : un **sous-domaine** de l'existant, ex. `pro.sargasses-martinique.com` ;
   - option marque : un domaine neuf type `veilleur-pro.com`.
2. **Dans Resend → Domains → Add domain**, saisir ce domaine. Resend affiche 3 enregistrements DNS à créer chez le registrar (Namecheap) :
   - **SPF** (`TXT` sur le sous-domaine) : `v=spf1 include:resend.com ~all` (ou la valeur exacte donnée par Resend).
   - **DKIM** (`TXT`/`CNAME` `resend._domainkey…`) : coller la valeur exacte de Resend.
   - **DMARC** (`TXT` sur `_dmarc.<domaine>`) : `v=DMARC1; p=none; rua=mailto:dmarc@<domaine>` (démarrer en `p=none`, monter vers `quarantine` après ~2 semaines propres).
3. Attendre la **vérification verte** dans Resend (propagation DNS, quelques minutes à quelques heures).
4. **Poser le secret** `B2B_FROM` = l'adresse d'envoi sur ce domaine, ex. `Le Veilleur <pro@pro.sargasses-martinique.com>` :
   - GitHub → repo `aveca/sargagame` → Settings → Secrets and variables → Actions → **New repository secret** `B2B_FROM`.
5. **Warm-up** : ne PAS relancer `CAP_NEW` à fond tout de suite. Monter progressivement **5 → 8 → 12 / jour** sur ~2 semaines en surveillant bounces/spam. Le code lit `B2B_FROM` automatiquement au prochain run planifié.

## Après ça (Claude, sans action fondateur)

- Ramper l'outreach une fois le domaine chaud + surveiller la délivrabilité via `funnel-b2b`.
- Étendre la séquence outreach à 4 touches value-first (constat-plage → relance → `/fiabilite/` → mini-étude PDF auto).
- Combler l'**activation** : email post-essai « votre snippet `<script>` + votre widget live sur VOTRE plage » (le widget posé = le prédicteur de conversion).
- Câbler `b2b_widget_activated` (faire passer au widget son host d'intégration → signal d'intention #1).

**Cible : 3–5 hôtels payants en 60 j** = plus que tout gain B2C réaliste sur la même fenêtre.
