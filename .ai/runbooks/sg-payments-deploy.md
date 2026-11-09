# Runbook — déploiement de la Worker `sg-payments` (autorisation propriétaire requise)

> **Ce document n'exécute rien.** C'est le paquet d'autorisation à lire, compléter
> et signer avant toute mise en production. Rien dans ce fichier n'a été exécuté
> par l'agent qui l'a écrit : ni `wrangler deploy`, ni `wrangler secret put`,
> ni migration SQL, ni paiement.
>
> - Worker cible : `sg-payments` (celle qui sert **réellement** les 6 domaines
>   sur `/api/*` — preuve live : `/api/mollie-health` → `{"worker":"sg-payments"}`
>   sur les 6 domaines).
> - Source à déployer : `workers/sg-payments/index.js` @ SHA autorisé.
> - Config : `workers/sg-payments/wrangler.jsonc` (**sans `routes`**, sans secret,
>   sans `vars`).
> - PR de code associée : **#1370** (ouverte, **non mergée**).

---

## 0. Ce que ce déploiement change (à lire avant de signer)

La source du dépôt n'est pas « la version live + 8 correctifs » : c'est
**live v381 + durcissement §5/§6/§7 (mission P0.118) + correctifs E1→E8 (PR #1370)**.
Le déploiement remplace donc le script **en entier**.

| Lot | Contenu | Effet live attendu |
|---|---|---|
| §5 | Bearer Namecheap figé en dur supprimé | relais Namecheap ignoré si le secret n'est pas ajouté → fallback `sendpulse → brevo → resend` |
| §6 | Signature webhook Next-gen (`sha256=`), parsing Classique/Next-gen, idempotence par `id` d'événement, état lu depuis l'API Mollie | les webhooks officiels ne sont plus rejetés en 403/500 |
| §7 | Fulfillment durable via RPC `sg_upsert_payment_grant`, relecture + vérification de l'écriture avant le marqueur KV, révocation par `expires_at` (au lieu d'une colonne `status` inexistante) | **le Premium est enfin livré et l'accès est révoquable** |
| E1→E8 | Offre/montant/classification résolus côté serveur, redirect/host allowlistés, `profileId` envoyé, `sos` vendu, 6ᵉ domaine, `mode:test` distingué | plus d'escalade de privilèges ni de redirection hors flotte |

> **Point de vigilance n°1** : le chemin §7 dépend de la fonction SQL
> `public.sg_upsert_payment_grant`. **Si elle n'est pas appliquée en base, le
> webhook échoue → l'argent est encaissé et l'accès n'est PAS livré.** C'est le
> risque principal de ce déploiement, et il est entièrement évitable (étape 2.1).

---

## 1. Identité de la cible (source de vérité : `workers/sg-payments/PROVENANCE.md`)

| Élément | Valeur |
|---|---|
| Script | `sg-payments` |
| Compte | `abf2b92cf718313567b4b38eb9dda17f` |
| Version live récupérée | **381** |
| Version ID | `36fa827a-a39c-4156-9359-30fc383eb6c5` |
| SHA-256 de la source live | `74c1a56a1e669ab00519b02b280f46362eaaaf1b3bc4c0ec2492a9458c3d2791` |
| Runtime | `compatibility_date 2026-08-19`, handlers `fetch` + `scheduled` |
| Trafic | 100 % |
| KV | `TRANSIENTS` → `528c05c792e046029a84e2fdb84f4ae6` |

Bindings live (inchangés, aucun ajouté / supprimé / modifié) :
`MOLLIE_API_KEY`, `MOLLIE_PROFILE_ID`, `MOLLIE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
`SUPABASE_SERVICE_KEY` (secret_text) · `SUPABASE_URL` (plain_text) ·
`TRANSIENTS` (kv_namespace).

---

## 2. Prérequis BLOQUANTS (à faire **avant** le déploiement)

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
3. La clé Mollie du binding `MOLLIE_API_KEY` est une clé **`live_*`** (une clé
   `test_*` ne livre aucun accès : `validatePaymentForFulfillment` exige
   `mode === "live"`).
4. `MOLLIE_WEBHOOK_SECRET` correspond bien à la clé du compte Mollie (sinon le
   webhook sort en 403 et **aucun accès n'est livré**).
5. Les variables du dashboard (`SUPABASE_URL`) sont présentes.

### 2.3 Secrets

`NAMECHEAP_MAIL_TOKEN` **n'existe pas** parmi les bindings live : c'est
historiquement la raison du bearer figé en dur. Il n'est pas nécessaire au
déploiement (le fallback prend le relais), mais il est nécessaire si l'on veut
retenir le provider Namecheap. Pose via `wrangler secret put NAMECHEAP_MAIL_TOKEN`
(prompt interactif — **jamais** en argument de ligne de commande).

### 2.4 Routes / domaines

**Ne pas toucher aux routes.** Les 6 domaines sont des domaines personnalisés
posés **manuellement** dans le dashboard. `wrangler.jsonc` ne contient
**volontairement aucune clé `routes`** et le test
`tests/unit/sg-payments-wrangler-config.test.cjs` échoue si quelqu'un en ajoute
une. Le droit `Workers Routes:Edit` n'est pas de toute façon accordé au compte
de déploiement.

---

## 3. Commande de déploiement (À NE PAS EXÉCUTER SANS AUTORISATION)

```bash
# 0. Pré-flight : doit afficher le SHA autorisé
cd <repo> && git fetch origin && git checkout <branche|SHA> && git rev-parse HEAD
npx wrangler whoami

# 1. Simulation — ne déploie rien, valide config + bindings + taille
npx wrangler deploy --config workers/sg-payments/wrangler.jsonc --keep-vars --dry-run

# 2. Déploiement effectif (le SEUL point non réversible sans rollback)
npx wrangler deploy --config workers/sg-payments/wrangler.jsonc --keep-vars
```

> `--keep-vars` est **obligatoire** : la config ne déclare aucun `vars`, donc
> sans ce drapeau les variables posées au dashboard (`SUPABASE_URL`) sont
> effacées et la Worker casse. Les secrets ne sont pas concernés (ils sont
> conservés par construction).
>
> **Ne jamais passer `--route`** : les domaines sont gérés dans le dashboard.

### 3.1 Ce que le déploiement ne fait PAS

Il ne modifie **aucun** prix, **aucune** condition commerciale, **aucun** plan
B2B, **aucune** donnée scientifique, **aucune** route, **aucun** secret existant.
Le catalogue serveur est une **copie verbatim** de `public/api/mollie.php`.

---

## 4. Le front est un déploiement SÉPARÉ (et il est bloqué)

La Worker et les 6 sites sont deux pipelines distincts :

| | Worker `sg-payments` | Front des 6 domaines |
|---|---|---|
| Qui déploie | commande `wrangler` (manuelle, §3) | workflow `cloudflare-production.yml` / `daily-copernicus.yml` |
| Gate | contrôle humain (§0-§2) | **gate ERDDAP** : `operationalSlaMinutes: 900` → `BLOCKED_STALE_SOURCE` si la source dépasse 15 h |
| État au 2026-11-08 | non déployé | **bloqué** (source ERDDAP ~1959 min > 900) → `build`/`deploy`/`deploy-pages` skipped |

Conséquence : **certaines corrections live sont déjà dans `main` mais pas
publiées** :

- l'affichage du prix effectif USD (`$13.79` avec « base $11.99 ») ;
- la page `/premium/` (catalogue eur/usd, « Obtenir l'accès 30 jours »,
  « sans reconduction automatique ») au lieu de la page legacy (« S'abonner
  4,99 €/mois » qui débite 14,99 € en EUR sur les 4 domaines USD).

Déployer la Worker **sans** publier le front laisse donc l'écart
« $11.99 affiché / $13.79 débité » visible sur 4 domaines. L'ordre recommandé :
**publier le front d'abord** (quand le gate ERDDAP passe), **puis** la Worker.

---

## 5. Vérification post-déploiement (à consigner dans le rapport de mission)

| # | Sonde | Attendu |
|---|---|---|
| 1 | `GET /api/mollie-health` sur les 6 domaines | `{"ok":true,"worker":"sg-payments"}` |
| 2 | `POST /api/mollie.php` `{action:'create_payment', pass:'inconnu', cents:1, cur:'EUR', email:'x@y.z'}` | `400` + `{"error":"Prix invalide","reason":"unknown_offer"}` et **0 appel Mollie** (vérifier les logs Worker) |
| 3 | `POST /api/mollie.php` `{action:'create_payment', pass:'p30', cents:1499, cur:'EUR', email:''}` | `400` + `reason:'invalid_email'` (email obligatoire hors SOS) |
| 4 | `POST /api/mollie.php` `{action:'payment_status', paymentId:'<id de test>'}` | `paid:false`, `mode:'test'` |
| 5 | `GET /api/copernicus/sargassum.json` sur les 6 domaines | `200` (non-régression Worker) |
| 6 | **Paiement LIVE ≤ 1 €** (autorisation explicite requise, issue #1357) | `payment_grants` : 1 ligne `b2c_pass` + **accès Premium réellement ouvert** sur le site |
| 7 | `npx wrangler versions list` | version live = SHA autorisé, version 381 conservée (rollback possible) |

> La sonde 6 est le **seul** test qui prouve la livraison du Premium. Elle
> implique un paiement réel : elle exige une autorisation séparée et ne peut
> pas être remplacée par un paiement de test (un paiement `mode:test` ne livre
> rien, c'est voulu).

---

## 6. Rollback

```bash
# A. Rollback Cloudflare — restaure EXACTEMENT la version live 381 (le plus rapide)
npx wrangler versions list
npx wrangler rollback <VERSION_ID_381>          # < 1 min, aucun build
# ou, si la version est introuvable :
npx wrangler rollback <VERSION_ID_PRECEDENTE>

# B. Rollback code (si le commit faut etre annulé)
git revert <sha-deploy> && git push origin <branche>
```

Un rollback de la Worker **ne ré-accuse pas** les accès déjà captés sans
grant : c'est une écriture en base, hors périmètre de ce runbook (constaté :
6 `paid_no_grant` au 2026-11-04, dernier encaissement 2026-07-19).

---

## 7. Périmètre d'autorisation — à cocher

- [ ] **Autorisé** : merger la PR #1370 et déployer `sg-payments` au SHA exact autorisé.
- [ ] **Autorisé** : appliquer `001` + `002` en base (idempotents).
- [ ] **Autorisé** : poser `NAMECHEAP_MAIL_TOKEN` (optionnel).
- [ ] **NON autorisé par défaut** : paiement LIVE (sonde 6).
- [ ] **NON autorisé par défaut** : tout changement de prix, de condition commerciale,
      de plan B2B, de route, de secret existant.
- [ ] **NON couvert** : la ré-accusation des 6 `paid_no_grant` (écriture en production).
- [ ] **NON couvert** : la réactivation du B2B annuel (290/690/1990 €) — décision
      commerciale (catalogue validé), pas un correctif technique.
