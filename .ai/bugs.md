# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

---

## 🟥 Non résolus

> Les cinq entrées ci-dessous sont des **défauts prouvés dans la Worker `sg-payments` LIVE** (version 381, 100 % du trafic de paiement, récupérée le 2026-11-04). Ils sont **corrigés dans une branche non déployée** (`feature/p0-mollie-durable-fulfillment-20261105`, Draft PR) : **ils sont donc toujours actifs en production** tant que la branche n'est ni mergée ni déployée.

### BUG-2026-122 Webhook Mollie Next-gen rejeté en 403 (signature `sha256=` non normalisée)

- **Date** : 2026-11-05 · **Sévérité** : **CRITICAL** · **Statut** : [ ] Ouvert — corrigé en branche, **non déployé**
- **Fichier** : `workers/sg-payments/index.js` → `verifyHmac` (live)
- **Description** : la version live comparait la signature **brute**. L'en-tête officiel Next-gen vaut `sha256=<hex 64>` : la longueur diffère → retour `false` → **HTTP 403 sur 100 % des webhooks officiels**. Le format Classique (hex nu) passait, le format officiel non. Aucun droit n'était donc servi pour les webhooks Next-gen.
- **Reproduction** : signature `X-Mollie-Signature: sha256=<hex>` sur un corps JSON Next-gen → 403 `invalid_signature`.
- **Correctif** : `normalizeMollieSignature` (retire `sha256=`, normalise la casse, refuse tout ce qui n'est pas 64 hex) + comparaison **à temps constant**. Test : `tests/unit/mollie-nextgen-classic-adapters.test.cjs`.

### BUG-2026-123 Webhook Mollie Classique : 500, paiement jamais honoré

- **Date** : 2026-11-05 · **Sévérité** : **CRITICAL** · **Statut** : [ ] Ouvert — corrigé en branche, **non déployé**
- **Fichier** : `workers/sg-payments/index.js` → `handleWebhook` (live)
- **Description** : le handler faisait `JSON.parse(raw)` sur un corps `application/x-www-form-urlencoded` → exception → **HTTP 500**. Le client avait payé, le droit n'était **jamais** servi, et le rejeu Mollie échouait de la même façon.
- **Reproduction** : POST `Content-Type: application/x-www-form-urlencoded`, corps `id=tr_…&event=payment.paid` → 500 `webhook_processing_error`.
- **Correctif** : `parseMollieWebhook` distingue les deux générations (Classique form-urlencoded / Next-gen JSON). Test : `tests/unit/mollie-nextgen-classic-adapters.test.cjs`.

### BUG-2026-124 Grant B2C écrit sur des colonnes inexistantes + marqueur KV posé avant l'écriture

- **Date** : 2026-11-05 · **Sévérité** : **CRITICAL** · **Statut** : [ ] Ouvert — corrigé en branche, **non déployé**
- **Fichier** : `workers/sg-payments/index.js` → `grantB2C` (live) · `supabase/schema.sql` (lignes 193–209)
- **Description** : (a) la version live POSTait `session_id` et `user_id` dans `public.payment_grants` — **ces colonnes n'existent pas** → PostgREST 400 → **aucun droit servi** ; l'helper `supa` renvoyait `null` sur erreur, donc l'échec était **indiscernable** d'un succès. (b) le marqueur KV était posé **avant** l'écriture durable : un marqueur sans droit durable = argent payé sans droit servi, **et plus de rejeu possible** (le webhook suivant était traité comme un doublon).
- **Reproduction** : `POST /rest/v1/payment_grants` avec `session_id` → 400 ; le marqueur `mol_b2c_pass_<id>` existe déjà au moment de l'échec.
- **Correctif** : passage par le RPC `public.sg_upsert_payment_grant` (7 arguments exacts), relecture + comparaison `type`/`pass`/`email`/`currency`, **puis** seulement le marqueur KV. Tests : `tests/unit/mollie-durable-fulfillment.test.cjs`.

### BUG-2026-125 Révocation B2B/B2C ineffective (colonne `status` inexistante)

- **Date** : 2026-11-05 · **Sévérité** : HIGH · **Statut** : [ ] Ouvert — corrigé en branche, **non déployé**
- **Fichier** : `workers/sg-payments/index.js` → `handleWebhook` (live) · `supabase/schema.sql`
- **Description** : la version live révoquait par `PATCH payment_grants { status: "revoked" }`. **`public.payment_grants` n'a pas de colonne `status`** → PostgREST 400 → un abonnement résilié ou remboursé **continuait d'accorder l'accès**.
- **Reproduction** : `PATCH /rest/v1/payment_grants?subscription_id=eq.…` avec `{status:"revoked"}` → 400 ; le grant reste valide.
- **Correctif** : révocation par expiration du grant via la colonne **réelle** `expires_at` (la ligne est conservée pour l'audit) ; idem pour `payment.refunded` en B2C. Test : `tests/unit/mollie-durable-fulfillment.test.cjs`.

### BUG-2026-126 Bearer Namecheap figé dans le dépôt public

- **Date** : 2026-11-05 · **Sévérité** : HIGH · **Statut** : [ ] Ouvert — corrigé en branche, **non déployé**
- **Fichier** : `workers/sg-payments/index.js` → `sendViaNamecheap` (live)
- **Description** : `var NAMECHEAP_BEARER = "sargagame-mail-2026"` — un credential d'envoi d'e-mail **figé dans le code source** de la Worker qui porte 100 % du trafic de paiement. Il est lisible par quiconque clone le dépôt, il n'est pas rotatif et il ne peut pas être révoqué individuellement. Le secret `NAMECHEAP_MAIL_TOKEN` **n'existe pas** parmi les bindings live : c'est précisément pourquoi le fallback en dur avait été introduit.
- **Reproduction** : `grep NAMECHEAP_BEARER` sur la source live → credential présent en clair.
- **Correctif** : bearer supprimé ; `env.NAMECHEAP_MAIL_TOKEN` obligatoire ; en son absence le relais est sauté et la chaîne de secours `sendpulse → brevo → resend` prend le relais (aucun e-mail perdu). **Conséquence assumée et documentée** : tant que le secret n'est pas ajouté aux bindings (hors §12), le trafic e-mail passe par Resend. Test : `tests/unit/mollie-durable-fulfillment.test.cjs`.

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