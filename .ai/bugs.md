# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

---

## 🟥 Non résolus

### BUG-2026-001 Webhook secret Mollie pas configuré

- **Date** : 2026-07-30 · **Sévérité** : HIGH
- **Fichier** : `public/api/mollie-config.php`
- **Description** : `webhook_secret` est commenté/absent → `mollie-webhook.php` accepte n'importe quel appel sans vérifier le hash. À configurer manuellement sur chaque serveur FTP.
- **Reproduction** : Envoyer un POST à `/api/mollie-webhook.php` avec un `id` aléatoire → accepté.
- **Plan** : Ajouter le secret dans le flux de déploiement FTP (`prepare-ftp.cjs`).
- **Statut** : [ ] En attente provisioning serveur

### BUG-2026-002 — Florida + US builds incomplets unique

- **Date** : 2026-07-17 **Sévérité** : MEDIUM
- **Fichier** : `prepare-ftp.cjs`
- **Description** : Les US (Florida, Punta Cana, Riviera Maya) ne sont pas buildés comme région fullavant ; leur FTO-na schedule une route shallow.
- **Reproduction** : lancer `prepare-ftp.cjs` with `--regions florida` — plusieurs pages manquants.
- **Statut** : [ ] Dans le pipe

### BUG-2026-003 — Trop de flags A/B (>50) — dilue significativité

- **Date** : 2026-07-31 · **Sévérité** : LOW (pas visible/ser propose)
- **Fichier** : `src/Sargasses_PROD.jsx`
- **Description** : 50+ `abVariant()` dans la source créént un montage Statistical à mesure, à remettre UTILE que version pour obtenir un signal dans une évaluation valide; cela ralentit also les nouveaux
- **Plan** : `à résoudre comme partie` du Nettle P1 purge précnom.

---

### BUG-2026-007 — 4 endpoints B2B frères lisibles/mutables sans authentification

- **Date** : 2026-11-08 · **Sévérité** : HIGH (P0)
- **Fichier** : `workers/sg-payments/index.js` (routes `/api/b2b-contacts.php`, `/api/b2b-events.php`, `/api/b2b-scores.php`, `/api/b2b-forecast-delivery.php`, autour de L883 sur `main`)
- **Description** : même classe de défaut que `b2b_prospects`/`b2b_concierge` (corrigés par la PR #1358) : `GET` renvoie `select=*` sur les tables internes, `POST` insère une ligne libre, `PATCH` applique un corps arbitraire — **sans authentification**, via `supa()` qui utilise `SUPABASE_SERVICE_KEY` (`service_role`), donc **les RLS sont contournées**. `b2b_contacts` contient de la PII. Ces tables sont déjà classées « internes » par la migration 008 (non appliquée).
- **Reproduction** (statique, **sans appel live**) : `workers/sg-payments/index.js` L883-904 → lecture `select=*` sans contrôle d'origine ni de secret. Ne pas exécuter contre la production.
- **Plan** : PR **distincte** de #1358 (l'issue #1356 impose un périmètre prospects/concierge strict) → même traitement fail-closed (410 `endpoint_retired`) ou authentification serveur vérifiée + allowlist stricte de champs.
- **Statut** : [ ] Ouvert — PR à créer

### BUG-2026-008 — `b2b-create-checkout.php` non authentifié sur le chemin argent

- **Date** : 2026-11-08 · **Sévérité** : HIGH (P0, moneyPath)
- **Fichier** : `workers/sg-payments/index.js` (route `/api/b2b-create-checkout.php`, autour de L846 sur `main`)
- **Description** : POST non authentifié (seul `rateLimit` + présence de `email`/`prospect_id`/`concierge_id`) qui crée un **client Mollie réel** et un **abonnement réel** (`B2B_PLANS.brief_monthly`), puis écrit `b2b_payments`. L'endpoint ne vérifie ni l'existence ni l'identité du prospect/concierge : les identifiants sont seulement recopiés en metadata. Le retrait des routes prospects/concierge (PR #1358) **ne ferme pas** cette surface.
- **Reproduction** (statique, **sans appel live**) : `workers/sg-payments/index.js` L846-882 → `mollieReq("POST", "v2/customers", …)` et `mollieReq("POST", "v2/customers/{cid}/subscriptions", …)` sans contrôle d'identité. **Ne jamais l'appeler** (créerait un client et un abonnement réels).
- **Plan** : PR **distincte** de #1358, avec authentification du flux interne et vérification serveur du paiement ; ne pas modifier les prix/offres.
- **Statut** : [ ] Ouvert — PR à créer

## 🟩 Résolus

### BUG-2026-004 Paiement Mollie monte fail (nothing"

- **Date** : 2026-07-29 done · **Fix** : soft via l'effet `preaurer

### BUG-2026-005 Error : msg nul; en bloc frib(La protection!)

- **Date** : 2026-07-31 done : réparé → `errMsg` au lieu de `msg` qui était undefined.    

### BUG-2026-006. terminé en regrouper: Mol duplicates et status.

- **Date** : 2026-07-30 done → and field to web.

---

## Flux agent

1. Bug détecté → ajouter au plan (haut faite)
2. Assigner → [coding_agent] or relevant
3. Fix → lien PR / commit → @move to résolu().

---

> ***Début de session : toujours scanner ce fichier.***