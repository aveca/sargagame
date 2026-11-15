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

### BUG-2026-012 SUPABASE_SERVICE_KEY absent → verify_subscription lookup_failed

- **Date** : 2026-11-15 · **Sévérité** : HIGH (bloque Phase 0.7 encaissements hôteliers — persistance des abonnements)
- **Fichier** : `public/api/mollie-lib.php` (mol_supabase_mirror), `public/api/mollie.php` (verify_subscription)
- **Description** : `SUPABASE_SERVICE_KEY` n'est défini ni dans `mollie-config.php` (gitignoré) ni en variable d'environnement locale. Conséquence : `mol_supabase_mirror()` skip silencieusement (grant Pro non persisté en Supabase) et `verify_subscription` retourne `lookup_failed` (récupération cross-device des passes/abonnements cassée). Fix partiel appliqué sur `mol_supabase_mirror` : il charge désormais sa propre config via `@include` (supprime la dépendance fragile à `global $cfg`, cohérent avec BUG-2026-011 dans mollie.php), mais la clé reste absente → mirror toujours désactivé en local.
- **Reproduction** : `mollie.php?action=verify_subscription&email=x@y.com&kind=b2b_pro` → `{active:false, reason:"lookup_failed"}`.
- **Plan** : fondateur ajoute `supabase_service_key` dans `mollie-config.php` (ou `SUPABASE_SERVICE_KEY` en env) — valeur service_role Supabase, NE JAMAIS committer. Puis re-test : `verify_subscription` doit retourner `{active:true, kind:"b2b_pro",...}` pour un email ayant un grant non expiré.
- **Statut** : [ ] En attente secret fondateur

---

## 🟩 Résolus

### BUG-2026-004 Paiement Mollie monte fail (nothing"

- **Date** : 2026-07-29 done · **Fix** : soft via l'effet `preaurer

### BUG-2026-005 Error : msg nul; en bloc frib(La protection!)

- **Date** : 2026-07-31 done : réparé → `errMsg` au lieu de `msg` qui était undefined.    

### BUG-2026-006. terminé en regrouper: Mol duplicates et status.

- **Date** : 2026-07-30 done → and field to web.

---

## Checklist fondateur P3 — secrets manquants (Phase 0.7 encaissements hôteliers)

> Aucun envoi d'email ni aucun contact sans autorisation explicite du fondateur. Cette checklist recense les secrets à provisionner ; elle ne déclenche aucun envoi.

| # | Secret | Variable / emplacement | Où le récupérer | Pourquoi nécessaire | Comment tester | Conséquence d'absence |
|---|--------|------------------------|-----------------|---------------------|----------------|-----------------------|
| 1 | Mollie API key (test) | `api_key` dans `mollie-config.php` ou `MOLLIE_API_KEY` env | Mollie dashboard → Developers → API keys (test_) | Créer paiements/abonnements B2B (79€/mois, 690€/an) | `getMollieClient()` instancié ; appel API Mollie retourne 2xx | `mollie.php`/`mollie-webhook` ne peuvent appeler l'API → pas de création de paiement ni de webhook |
| 2 | Mollie webhook secret | `webhook_secret` dans `mollie-config.php` ou `MOLLIE_WEBHOOK_SECRET` env | Mollie dashboard → Webhooks → Secret (whsec_…) | Vérifier la signature HMAC des webhooks (fail-closed : 503 si absent, 403 si invalide) | POST sur `/api/mollie-webhook.php` → 503 si absent ; signature invalide → 403 ; signature valide → 200 + grant | Webhook indisponible → aucun grant Pro activé, pas de persistance, pas de révocation |
| 3 | Supabase service_role key | `supabase_service_key` dans `mollie-config.php` ou `SUPABASE_SERVICE_KEY` env | Supabase dashboard → Settings → API → service_role key | `verify_subscription` (récupération cross-device) + `mol_supabase_mirror` (persistance des grants Pro et passes B2C) | `verify_subscription?email=…&kind=b2b_pro` → `{active:true,…}` si grant connu ; sinon `lookup_failed` | Pas de persistance Supabase des abonnements ; pas de récupération cross-device ; `lookup_failed` (fallback Stripe préserve l'UX B2C) |
| 4 | Resend key | `resend_key` dans `mollie-config.php` | Resend dashboard → API Keys | Emails de confirmation d'essai B2B (`mol_b2b_trial_email`) et welcome | Envoi d'un email de test via Resend → livré | Pas d'email de confirmation à l'hôtel (l'essai 30j s'active quand même, best-effort) |
| 5 | Stripe LIVE key | legacy, hors périmètre P0 Mollie | Stripe dashboard | Lecture seule des abonnements Stripe existants (pas d'encaissement neuf) | N/A (legacy) | N/A (hors périmètre P0) |

**Règle** : aucun de ces secrets n'est committer. `mollie-config.php` est gitignoré ; les valeurs réelles doivent être injectées par le fondateur sur chaque serveur (FTP) ou via les secrets de déploiement.

## Flux agent

1. Bug détecté → ajouter au plan (haut faite)
2. Assigner → [coding_agent] or relevant
3. Fix → lien PR / commit → @move to résolu().

---

> ***Début de session : toujours scanner ce fichier.***