# RAPPORT DE CYCLE 2 — P0 FULFILLMENT RECOVERY (SARGAGAME)

**Date** : 2026-11-04  
**Branche** : `fix/p0-mollie-fulfillment`  
**Commit** : `747af8376`  
**Statut** : prêt pour review — **AUCUN merge ni déploiement paiement/routage en production** (approbation explicite requise).

---

## 1. CAUSE DU MAUVAIS ROUTAGE (explication avec preuves)

| Élément | Constat |
|---------|---------|
| Projet Supabase | `rswdmjtdzrucqzzukfmd` (confirmé, RPC `sg_upsert_payment_grant` enregistré depuis le 21/10/2026, autorisé pour `service_role`, contrainte unique sur `payment_id`) |
| Workers régionaux récents | `sargagame-mq`, `-gp`, `-florida`, `-puntacana`, `-rivieramaya`, `-tulum` (Cloudflare) |
| Ancien Worker | `sg-payments` (CRÉÉ 2026-08-19, modifié 2026-10-02) |
| Routage CF production (6 domaines) | `/api/mollie*` → `sg-payments` ; `/*` → Worker régional |
| `sg-payments` webhook (`handleWebhook`, `workers/sg-payments/src/index.ts:1284`) | Attend `X-Mollie-Signature` HMAC (JSON signé). Insère en direct `payment_grants` avec colonnes `session_id` et `user_id` (absentes de la table). Ignore les erreurs Supabase. Écrit un marqueur KV `mollie_grant_*` AVANT le `supa(... POST)`. Ne reconnaît pas le pass `p7`. |
| Worker régional `workers/sargagame/index.js` | Contient l'appel au RPC `sg_upsert_payment_grant` (ligne ~51). Webhook attend `application/x-www-form-urlencoded` avec `id`. N'avait PAS de compatibilité `p7` ni d'erreurs Supabase visibles. |
| Six paiements vérifiés `paid` via Mollie LIVE | `tr_rgY7NvWRTZaeDS5vbDBUJ`, `tr_FfiGZtWSQWXB5b374A7UJ`, `tr_3nxkaEMuRfPM2TWLXQeTJ`, `tr_2Q9ubn2wUWA3CmoDM4eTJ`, `tr_r6JWpvCbAd4w29rTq5LTJ`, `tr_VzYFK5ihNua7Wq4fWyETJ` — **aucun grant dans le rapprochement** |

**Cause racine** : les webhooks Mollie des six domaines étaient routés vers l'ancien Worker `sg-payments`, qui n'implémente pas le fulfillment fiable (RPC `sg_upsert_payment_grant`). Le Worker régional — qui contient le bon contrat et le RPC — n'était pas cible des routes `/api/mollie*`. De plus, le Worker régional ne gérait pas l'alias historique `p7` ni ne consignait les erreurs Supabase.

---

## 2. CONTRATS MOLLIE ↔ WORKER — COMPATIBILITÉ

- Le Worker régional (`sargagame`) attend le **contrat classique Mollie Payments** : `application/x-www-form-urlencoded`, champ `id`. Il ne fait PAS de vérification HMAC (fail-open sur signature, cf. BUG-2026-001). C'est le contrat réellement utilisé par les liens/checkout Mollie actuels (`webhookUrl: .../api/mollie-webhook.php` en form-encoded).
- L'ancien Worker `sg-payments` attend un **JSON signé `X-Mollie-Signature`** — contrat différent, non interchangeable. Ne pas mélanger sans analyse.
- **Décision** : conserver le contrat form-encoded du Worker régional. Ne pas activer la signature HMAC sur ce Worker sans provisionner `MOLLIE_WEBHOOK_SECRET` (action serveur, voir BUG-2026-001).

---

## 3. MODIFICATIONS APPORTÉES (branche `fix/p0-mollie-fulfillment`)

### `workers/sargagame/index.js`

**A. Alias historique `p7` → `trip7` (uniquement pour les paiements déjà créés)**
- `LEGACY_PASS_ALIASES = { p7: "trip7" }` — consulté **uniquement** dans `validateMollieAmount` (webhook) et `grantB2CPassIdempotent` (payment_status).
- Jamais utilisé dans `create_payment` : les nouveaux achats continuent d'être validés contre `PASS_PRICES` uniquement (`p7` n'y est pas → rejeté "Prix invalide" 400).
- Montants historiques autorisés uniquement en validation webhook : `trip7` EUR 7,99 / USD 5,99 (`LEGACY_PRICES`). Aucun nouveau tarif public n'est modifié.
- Le grant écrit en DB passe toujours le code canonique `trip7` (pas de `p7` persistant).

**B. Fulfillment fiable — jamais de succès sans écriture Supabase vérifiée**
- `grantB2CPassIdempotent` résout le pass canonique, appelle le RPC `sg_upsert_payment_grant` (idempotent par `payment_id` via `ON CONFLICT DO NOTHING`).
- Erreur RPC (500/401/404 PGRST202) → log `[mollie-webhook] Supabase grant RPC failed` (paymentId masqué, status + code uniquement, **aucune PII ni secret**) → HTTP 503 `grant_sync_failed` (ou `rpc_unavailable` pour 404/PGRST202). **Pas de faux succès.**
- Réseau Supabase/Mollie en panne → 503, pas de grant silencieux.
- Rejeu du webhook : le RPC est idempotent (contrainte unique `payment_id`) → absence de double grant.
- Aucun marqueur KV définitif n'est écrit avant confirmation du grant (le Worker régional n'écrit pas de marqueur KV de grant du tout ; l'idempotence repose sur la contrainte DB).

**C. Fonctionnalités B2B et autres endpoints préservés**
- `create_payment`, `create_subscription`, `payment_status`, `verify_subscription`, `widget-token`, `b2b-trial`, apple-pay, etc. inchangés.
- `payment_status` accorde aussi le legacy `p7` via le RPC.

### `tests/unit/mollie-fulfillment-cycle2.test.cjs` (nouveau, 20 cas, tous verts)
payé → grant ; rejoue idempotent ; non-payé/open/pending/canceled → pas de grant ; devise incorrecte ; pass inconnu ; `p7` EUR 7,99 → grant canonique `trip7` 7j ; `p7` USD 5,99 → grant ; `p7` mauvais montant → rejet ; `trip7` EUR 4,99 → grant ; fraude 0,01 € → rejet ; RPC 500 → 503 puis retry succès ; RPC 401 (service role invalide) → 503 sans succès ; RPC 404 PGRST202 → 503 `rpc_unavailable` ; réseau Supabase/Mollie down → 503 ; Mollie 404 → 404 ; contrat JSON signé → 415 (rejeté par le régional) ; `create_payment` avec `p7` → 400.

### `scripts/automation/backfill-mollie-grants.cjs` (nouveau, DRY RUN par défaut)
- Re-contrôle LIVE chaque paiement chez Mollie (GET /v2/payments/{id}).
- Vérifie remboursements/chargebacks, pass, montant, email depuis `payment.metadata`.
- Vérifie l'absence de grant existant (Supabase `payment_grants` par `payment_id`).
- Prépare un grant idempotent (7 ou 30 jours à compter de la **délivrance effective**, pas de la date de paiement).
- Rapport JSON sans PII (emails masqués/hashed, domaines uniquement).
- Ne écrit en Supabase **que** avec `--apply --confirm-backfill=YES-I-HAVE-APPROVED`.

---

## 4. PLAN DE ROUTAGE CLOUDFLARE (tâche 4 — non appliqué)

**Routes actuelles (6 domaines)** :
- `/api/mollie*` → Worker `sg-payments` (ancien, pas de fulfillment RPC fiable)
- `/*` → Worker régional `sargagame-<region>` (contient le RPC, bon contrat)

**Routes proposées (après approbation uniquement)** :
| Route | Worker cible | Justification |
|-------|-------------|---------------|
| `/api/mollie-webhook` | `sargagame-<region>` | Implémente le RPC `sg_upsert_payment_grant` + fulfillment fiable |
| `/api/mollie-webhook.php` | `sargagame-<region>` | Alias historique front PHP, même cible |
| `/api/mollie` / `/api/mollie.php` (création paiement) | `sg-payments` **conservé** | Préserver les parcours de création ; tests requis avant tout changement |
| `/api/mollie-health` | `sg-payments` | Conservé (health check spécifique) |
| `/*` | `sargagame-<region>` | inchangé |

**Rollback** : restaurer les routes `/api/mollie-webhook*` vers `sg-payments` dans le dashboard Cloudflare (réversible instantanément). Branche git `fix/p0-mollie-fulfillment` conservée pour re-déployer le Worker régional si nécessaire.

**Tests de non-régression** : exécuter `tests/unit/mollie-fulfillment-cycle2.test.cjs` + les tests unitaires existants (`mollie-webhook-p03`, `mollie-payment-logic`) sur les 6 domaines avant/après changement de routage.

---

## 5. BACKFILL DES SIX CLIENTS (prêt, lecture seule)

Les 6 paiements (4× `p7`, 2× `p30`, juin-juillet 2026) ont des périodes d'accès écoulées.

**Plan de délivrance** : droits de 7 ou 30 jours à compter de la **délivrance effective** (exécution du backfill approuvé), et non de la date de paiement initiale. Chaque durée est présentée dans le rapport généré par `scripts/automation/backfill-mollie-grants.cjs` (`scripts/automation/data/backfill-mollie-grants-report.json`).

**État** : script en DRY RUN. Aucun insert Supabase n'a été effectué. Le paiement sans email nécessite une corrélation manuelle (session/analytics/client Mollie) avant toute délivrance.

**Autorisation requise** : `--apply --confirm-backfill=YES-I-HAVE-APPROVED` + validation des 6 grants réels dans Supabase.

---

## 6. TESTS (résultats)

| Suite | Résultat |
|-------|----------|
| `tests/unit/mollie-fulfillment-cycle2.test.cjs` | 20/20 ✅ |
| `tests/unit/mollie-webhook-p03.test.cjs` | PASS ✅ |
| `tests/unit/mollie-payment-logic.test.cjs` | PASS ✅ |
| `npx esbuild workers/sargagame/index.js --bundle=false` | OK ✅ |
| `node -c scripts/automation/backfill-mollie-grants.cjs` | OK ✅ |

Aucun paiement de test réel. Environnement sandbox (mocks fetch) utilisé pour les simulations.

---

## 7. AUDIT DE SÉCURITE CIBLÉ (tâche 7)

L'ancien Worker `sg-payments` utilise `MOLLIE_WEBHOOK_SECRET` (variable d'environnement Wrangler, **pas de secret codé en dur détecté** dans le code lu pour la verification HMAC). Valeur non reproduite dans ce rapport ni dans les commits. Pas de rotation/révocation effectuée (approbation requise). Le secret n'est pas accessible depuis ce contexte.

---

## 8. PERMISSIONS REQUISES

| Ressource | Permission | Usage |
|-----------|-----------|-------|
| Cloudflare dashboard | Modifier les routes Workers des 6 domains | Routage `/api/mollie-webhook*` → `sargagame-<region>` (après approbation) |
| Cloudflare Workers | Déployer `workers/sargagame/index.js` sur les 6 workers régionaux | Fulfillment corrigé |
| Mollie API (LIVE) | `MOLLIE_API_KEY` (lecture GET /v2/payments) | Re-contrôle backfill + tests |
| Supabase | `SUPABASE_SERVICE_KEY` + EXECUTE `sg_upsert_payment_grant` | Écriture grants (backfill --apply) |
| GitHub | Créer PR (pas de merge auto — paiement/routage) | Review humaine |

---

## 9. ACTIONS DE PRODUCTION REQUISSANT L'APPROBATION

Aucune de ces actions n'a été exécutée.

1. **Tester le routage** sur un domaine (ex. MQ) : pointer `/api/mollie-webhook` + `/api/mollie-webhook.php` vers `sargagame-mq`, vérifier webhook payé → grant.
2. **Déployer** `workers/sargagame/index.js` sur les 6 workers régionaux (wrangler).
3. **Étendre** le routage aux 5 autres domaines après validation MQ.
4. **Exécuter le backfill** : `node scripts/automation/backfill-mollie-grants.cjs --apply --confirm-backfill=YES-I-HAVE-APPROVED`.
5. **Confirmer les 6 grants** dans Supabase `payment_grants` (livraison réelle).
6. **Créer la PR** (manuellement, pas d'outils GitHub disponibles ici) : `fix/p0-mollie-fulfillment` → `main`. **Ne pas merger sans approbation ChatGPT + utilisateur** (touche au paiement et au routage).

**Procédure de création de PR** (outils github indisponibles dans cette session) :
```bash
git push origin fix/p0-mollie-fulfillment
# puis créer la PR sur GitHub vers main, titre : "fix(p0-mollie-fulfillment): regional worker grants via RPC + legacy p7 compatibility"
```

---

## 10. CRITÈRES DE RÉUSSITE — ÉTAT

- [x] Cause du mauvais routage expliquée avec preuves (ancien Worker `sg-payments` cible des `/api/mollie*`).
- [x] Contrats Mollie et Worker identifiés comme non interchangeables ; contrat form-encoded conservé.
- [x] Code de fulfillment corrigé (RPC, fail-closed, logs non-PII, idempotence, pas de faux succès KV).
- [x] Anciennes ventes `p7` prises en charge sans modifier les tarifs actuels (create_payment rejette `p7`).
- [x] Tests d'idempotence et d'échec passent (20 cas + 2 suites existantes).
- [x] Backfill des 6 transactions prêt et auditable (DRY RUN, rapport sans PII).
- [x] Plan de modification live et rollback documentés.
- [ ] Six grants réels confirmés dans Supabase (bloquant — attend backfill approuvé).

**Ne déclare pas les six ventes livrées tant que les six grants réels ne sont pas confirmés.**
