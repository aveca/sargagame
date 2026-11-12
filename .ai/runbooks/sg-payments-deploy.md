# Runbook — déploiement de la Worker `sg-payments` (autorisation propriétaire requise)

> **Ce document n'exécute rien.** C'est le paquet d'autorisation à lire, compléter
> et signer avant toute mise en production. Rien dans ce fichier n'a été exécuté
> par l'agent qui l'a écrit : ni `wrangler deploy`, ni `wrangler secret put`,
> ni migration SQL, ni paiement.
>
> - Worker cible : `sg-payments` — celle qui sert **réellement** les 6 domaines
>   sur `/api/*` (preuve live : `/api/b2b-paylinks.json` et `/api/mollie-pay`
>   répondent le code de `sg-payments` sur les 6 domaines).
> - Source à déployer : `workers/sg-payments/index.js` au SHA autorisé.
> - Config : `workers/sg-payments/wrangler.jsonc` (**sans `routes`**, sans secret,
>   sans `vars`, **avec le cron**).
> - PR de code associée : **#1423** (intégration #1406 + #1411 + #1418).
> - Runbook associé : `.ai/runbooks/mollie-live-cutover.md` (TEST → LIVE, mode,
>   test d'achat contrôlé).

---

## 0. Ce que ce déploiement change (à lire avant de signer)

La source du dépôt n'est plus la version live : elle intègre, en plus du live :

| Lot | Contenu | Effet live attendu |
|---|---|---|
| P0.118 §5/§6/§7 | bearer Namecheap en dur supprimé, signature webhook Next-gen, fulfillment durable via RPC | le Premium est livré et l'accès est révoquable |
| **#1406** | offre / montant / durée **résolus côté serveur**, `redirectUrl` + `webhookUrl` construits par le serveur (anti open-redirect), classification d'offre non falsifiable | plus d'escalade de privilèges ni de redirection hors flotte |
| **#1411** | `deliverProAccessEmail()` : email de livraison portant le lien `/pro/espace/?k=<jeton>`, idempotent ; garde-fou anti double abonnement ; chemin de webhook `/public/api/...` (404) → `/api/...` | **le client qui paie reçoit enfin son accès** |
| **#1418** | `/api/b2b-trial.php` et `/api/b2b-meeting.php` en **fail-closed** : rien n'est annoncé comme enregistré si le lead n'est pas confirmé par le sink | plus de faux succès « essai activé » sans prospect persisté |
| **diagnostic** | `GET /api/mollie-mode` : mode du backend Mollie (TEST/LIVE), sans transaction et sans jamais exposer la clé | vérifier le mode LIVE sur les 6 domaines sans créer de paiement |

> **Point de vigilance n°1** : le chemin de fulfillment dépend de la fonction SQL
> `public.sg_upsert_payment_grant`. **Si elle n'est pas appliquée en base, le
> webhook échoue → l'argent est encaissé et l'accès n'est PAS livré.** C'est le
> risque principal de ce déploiement, et il est entièrement évitable (étape 2.1).

> **Point de vigilance n°2** : le cron `0 6,18 * * *` porte les emails
> commerciaux (drip B2B à chaque déclenchement, alertes B2C en plus). Il est
> **déclaré explicitement** dans la config : sans cela, un déploiement peut
> laisser le déclenchement à la discrétion de la plateforme et les emails
> commerciaux cessent **silencieusement**.

---

## 1. Identité de la cible (source de vérité : `workers/sg-payments/PROVENANCE.md` + CLI)

| Élément | Valeur |
|---|---|
| Script | `sg-payments` |
| Compte | `abf2b92cf718313567b4b38eb9dda17f` |
| **Version live active (baseline de rollback)** | **`42470a47-b4f7-4296-89b0-c37cdb4f3574`** |
| Créée le | 2026-11-11T18:36:22.904Z (`Updated secret: MOLLIE_API_KEY`) |
| Nombre de déploiements | 10 |
| Runtime | `compatibility_date 2026-08-19`, handlers `fetch` + `scheduled` |
| Trafic | 100 % |
| KV | `TRANSIENTS` → `528c05c792e046029a84e2fdb84f4ae6` |

Bindings live (inchangés, aucun ajouté / supprimé / modifié) :

| Nom | Type |
|---|---|
| `MOLLIE_API_KEY` | secret_text |
| `MOLLIE_PROFILE_ID` | secret_text |
| `MOLLIE_WEBHOOK_SECRET` | secret_text |
| `RESEND_API_KEY` | secret_text |
| `SUPABASE_SERVICE_KEY` | secret_text |
| `SUPABASE_URL` | plain_text (`https://rswdmjtdzrucqzzukfmd.supabase.co`) |
| `TRANSIENTS` | kv_namespace (`528c05c792e046029a84e2fdb84f4ae6`) |

> `NAMECHEAP_MAIL_TOKEN` n'existe **pas** parmi les bindings live : le relais
> Namecheap est donc ignoré et la chaîne de secours prend le relais. L'ajouter
> est optionnel (voir 2.3).

---

## 2. Prerequis BLOQUANTS (à faire **avant** le déploiement)

### 2.1 Migrations SQL — `scripts/migrations/`

| Fichier | Rôle | Bloquant pour le déploiement ? |
|---|---|---|
| `001_idempotent_payment_grant.sql` | crée `public.sg_upsert_payment_grant(7 args)` | **OUI — bloquant** (sans elle : paiement encaissé, accès non livré) |
| `002_payment_grant_search_path.sql` | `SET search_path = ''` sur la RPC | **OUI — bloquant** (durcissement de la fonction appelée) |
| `003_b2b_leads_least_privilege.sql` | moindre privilège sur `b2b_leads` | non (recommandé, fenêtre séparée) |
| `004_b2b_lead_drip_claims.sql` | colonnes de claim du drip B2B | non (recommandé) |
| `005_b2c_alert_delivery_markers.sql` | marqueurs de livraison d'alerte | non |
| `006_public_table_least_privilege.sql` | moindre privilège tables publiques | non |
| `007_revoke_public_truncate.sql` | révocation `TRUNCATE` public | non |
| `008_internal_b2b_least_privilege.sql` | moindre privilège B2B interne | non |

Les scripts sont **idempotents** (`CREATE OR REPLACE`, `REVOKE`, `GRANT`) :
`001` et `002` peuvent être rejoués sans risque.

### 2.2 Vérifications de pré-vol (lecture seule)

1. La fonction existe avec la **signature exacte** (7 arguments, dans cet ordre) :
   `payment_id, pass, email, currency, expires_at, granted_at, metadata`.
2. `public.payment_grants` possède les colonnes `payment_id, type, pass, email,
   currency, expires_at, granted_at, metadata`.
3. La clé du binding `MOLLIE_API_KEY` est une clé **`live_*`**
   (une clé `test_*` ne livre **aucun** accès : `validatePaymentForFulfillment`
   exige `mode === "live"`). Vérification **sans lire la valeur** : voir
   `.ai/runbooks/mollie-live-cutover.md` §2.
4. `MOLLIE_WEBHOOK_SECRET` correspond bien à la clé du compte Mollie (sinon le
   webhook sort en 403 et **aucun accès n'est livré**).
5. Les variables du dashboard (`SUPABASE_URL`) sont présentes.

### 2.3 Secrets

`NAMECHEAP_MAIL_TOKEN` n'existe pas parmi les bindings live : ce n'est pas
nécessaire au déploiement (le fallback prend le relais), mais c'est nécessaire
si l'on veut retenir le provider Namecheap. Pose via
`wrangler secret put NAMECHEAP_MAIL_TOKEN` (prompt interactif — **jamais** en
argument de ligne de commande).

### 2.4 Routes / domaines

**Ne pas toucher aux routes.** Les 6 domaines sont des domaines personnalisés
posés **manuellement** dans le dashboard. `workers/sg-payments/wrangler.jsonc` ne
contient **volontairement aucune clé `routes`**, et le test
`tests/unit/sg-payments-wrangler-config.test.cjs` échoue si quelqu'un en ajoute
une. Le droit `Workers Routes:Edit` n'est pas de toute façon accordé au compte
de déploiement.

> **Attention — qui sert quoi (établi par sondes live le 2026-11-12) :**
>
> | Surface | Servi par |
> |---|---|
> | `/api/b2b-paylinks.json`, `/api/mollie-pay*`, `/api/b2b-trial.php`, `/api/b2b-meeting.php` | **`sg-payments`** (worker dédiée) |
> | Front + assets (`/`, `/meteo-*`, `/api/apple-pay-domain-association`, …) | workers **régionaux** `sargagame-<région>` (binding `ASSETS`) |
> | `*.pages.dev` | projets Pages = **miroirs** (aucun domaine custom) |
>
> Les projets Pages **n'ont aucun domaine personnalisé** : les 6 domaines de
> production ne sont donc **pas** servis par Pages. Publier le front = déployer
> les workers régionaux, **pas** les Pages.

---

## 3. Commande de déploiement (NE PAS EXECUTER SANS AUTORISATION)

```bash
# 0. Pré-flight : doit afficher le SHA autorisé
cd <repo> && git fetch origin && git checkout <branche|SHA> && git rev-parse HEAD
npx wrangler whoami

# 1. Simulation — ne déploie rien, valide config + bindings + taille
npx wrangler deploy --config workers/sg-payments/wrangler.jsonc --keep-vars --dry-run

# 2. Déploiement effectif (le SEUL point non réversible sans rollback)
npx wrangler deploy --config workers/sg-payments/wrangler.jsonc --keep-vars \
  --message "P0 chemin argent B2B (#1423) - duree catalogue + livraison email + ack fail-closed"
```

> `--keep-vars` est **obligatoire** : la config ne déclare aucun `vars`, donc
> sans ce drapeau les variables posées au dashboard (`SUPABASE_URL`) sont
> **effacées** et la Worker casse (Supabase injoignable). Les secrets ne sont
> pas concernés (conservés par construction).
>
> **Ne jamais passer `--route`** : les domaines sont gérés dans le dashboard.

### 3.1 Ce que le déploiement ne fait PAS

Il ne modifie **aucun** prix, **aucune** condition commerciale, **aucun** plan
B2B, **aucune** donnée scientifique, **aucune** route, **aucun** secret existant.
Le catalogue serveur est piloté par `B2B_PLANS` (source de vérité du dépôt).

---

## 4. Le front est un déploiement SÉPARÉ (et il est bloqué)

La Worker et les 6 sites sont deux pipelines distincts :

| | Worker `sg-payments` | Front des 6 domaines (workers régionaux) |
|---|---|---|
| Qui déploie | commande `wrangler` (manuelle, §3) | job `deploy` de `cloudflare-production.yml` |
| Gate | contrôle humain (§0-§2) | **gate ERDDAP** : SLA opérationnel 900 min |
| État au 2026-11-12 | non redéployé (live = `42470a47…`) | **bloqué** : observation live `2026-11-09T12:00:00Z`, âge **3836,6 min > 900 min** sur les **6** régions |

Conséquence : le **gate satellite est currently rouge pour toute la flotte**
(Punta Cana comprise). `build`, `deploy` et `deploy-pages` de
`cloudflare-production.yml` sont donc **skippés** sur un push sur `main`.

> C'est aussi une **protection** : le déploiement de `sg-payments` est
> **indépendant** du satellite (cette Worker n'a **aucun** binding d'assets :
> elle ne peut pas publier de donnée satellite périmée). Punta Cana reste
> bloqué tant que le SLA n'est pas respecté.

---

## 5. Vérification post-déploiement (à consigner dans le rapport de mission)

Toutes les sondes ci-dessous sont **non mutantes** : aucune ne crée de
transaction, aucun lead, aucun droit.

| # | Sonde | Attendu |
|---|---|---|
| 1 | `GET /api/mollie-health` sur les 6 domaines | `200` + `{"worker":"sg-payments"}` |
| 2 | `GET /api/mollie-mode` sur les 6 domaines | `{"ok":true,"mode":"live|test","api_mode":"…"}` — **mode du backend, sans transaction** |
| 3 | `GET /api/b2b-paylinks.json` sur les 6 domaines | `200` + `links.pro_annual` |
| 4 | `GET /api/mollie-pay?plan=pro_annual` sur les 6 domaines | `200` + formulaire email (aucun POST déclenché) |
| 5 | `POST /api/b2b-trial.php` `{email:"invalide"}` | `400 {"error":"invalid_email"}` — **aucun lead créé** |
| 6 | `POST /api/b2b-meeting.php` `{email:"invalide"}` | `400 {"error":"invalid_email"}` — **aucun rendez-vous créé** |
| 7 | `POST /api/mollie.php` `{action:"create_payment", pass:"inconnu", cents:1, cur:"EUR", email:"x@y.z"}` | `400` + `reason:"unknown_offer"` et **0 appel Mollie** |
| 8 | `GET /api/copernicus/sargassum.json` sur les 6 domaines | `200` (non-régression) |
| 9 | `npx wrangler versions list --name sg-payments` | nouvelle version active + **baseline `42470a47-b4f7-4296-89b0-c37cdb4f3574` toujours listée** (rollback possible) |
| 10 | `npx wrangler secret list --name sg-payments` | les **mêmes 5 noms** de secrets qu'avant (aucun secret perdu) |

> Le test d'achat **réel** (preuve de la livraison de l'accès) est **séparé** et
> **non exécuté** : voir `.ai/runbooks/mollie-live-cutover.md` §4. Il exige une
> autorisation distincte.

---

## 6. Rollback

```bash
# A. Rollback Cloudflare — restaure EXACTEMENT la baseline (le plus rapide)
npx wrangler versions list --name sg-payments
npx wrangler rollback 42470a47-b4f7-4296-89b0-c37cdb4f3574 --name sg-payments \
  --message "rollback P0 chemin argent B2B -> baseline 2026-11-11"

# B. Rollback code (si le commit doit être annulé)
git revert <sha-deploy> && git push origin <branche>
```

> Un rollback de la Worker **ne ré-accuse pas** les accès déjà capturés sans
> grant : c'est une écriture en base, hors périmètre de ce runbook.
>
> Le rollback **restaure le script**, pas les bindings : le binding KV et les
> variables du dashboard sont inchangés par construction (la config ne déclare
> ni `vars` ni `routes`).

---

## 7. Périmètre d'autorisation — à cocher

- [ ] **Autorisé** : merger la PR #1423 et déployer `sg-payments` au SHA exact autorisé.
- [ ] **Autorisé** : appliquer `001` + `002` en base (idempotents).
- [ ] **Autorisé** : poser `NAMECHEAP_MAIL_TOKEN` (optionnel).
- [ ] **NON autorisé par défaut** : bascule `MOLLIE_API_KEY` TEST → LIVE (voir
      `.ai/runbooks/mollie-live-cutover.md`).
- [ ] **NON autorisé par défaut** : paiement LIVE (test d'achat contrôlé).
- [ ] **NON autorisé par défaut** : tout changement de prix, de condition
      commerciale, de plan B2B, de route, de secret existant.
- [ ] **NON couvert** : la ré-accusation des `paid_no_grant` (écriture en production).
- [ ] **NON couvert** : la réactivation du B2B annuel (290/690/1990 €) — décision
      commerciale (catalogue validé), pas un correctif technique.
- [ ] **BLOQUÉ** : tout déploiement satellite / worker régional tant que le SLA
      ERDDAP (900 min) n'est pas respecté — **Punta Cana compris**.
