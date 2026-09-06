# Outreach 0-PC — Worker automation (cold email B2B + posts Facebook)

Fonctionne PC éteint : Cron Cloudflare → `workers/outreach` → Supabase → Resend / Meta.
État initial SÛR : `OUTREACH_ENABLED=false` + `OUTREACH_DRY_RUN=true` → **zéro envoi réel au deploy**.

## Architecture

```
Cron CF (4 schedules UTC, cf. wrangler.toml)
  └─► workers/outreach/index.js
        ├─► Supabase REST (service_role, secret worker) : outreach_contacts,
        │     outreach_events (append-only), social_posts
        ├─► Resend HTTP API (emails) — jamais en dry-run / kill-switch / sans secrets
        └─► Meta Graph API (posts) — idem
```

Pas de KV/D1 (Supabase = état serveur canonique). Pas de route custom
(workers.dev suffit ; l'admin passe par `?key=`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `workers/outreach/index.js` | Worker (jobs + endpoints) |
| `workers/outreach/wrangler.toml` | Nom, cron, vars (défauts sûrs) |
| `supabase/schema.sql` (§ OUTREACH) | Tables `outreach_contacts`, `outreach_events`, `social_posts` (idempotent) |
| `scripts/tests/outreach-queue.test.cjs` | 36 assertions, 100 % mocké (auto-découvert par `run-tests.cjs`) |
| `.github/workflows/outreach.yml` | CI (tests) + deploy + smoke (dry-run exigé) |

## Secrets requis (NOMS uniquement — `wrangler secret put <NOM>` une fois)

| Secret | Usage | Obligatoire pour |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | REST DB (jamais exposé) | tout |
| `ADMIN_KEY` | `?key=` admin, webhook, reply (`openssl rand -hex 32`) | admin/endpoints |
| `RESEND_API_KEY` | envois Resend | emails réels |
| `FB_PAGE_TOKEN` | publication Meta | posts réels |

## Vars (wrangler.toml, modifiables sans redéployer le code)

`OUTREACH_ENABLED`, `EMAIL_OUTREACH_ENABLED`, `FACEBOOK_OUTREACH_ENABLED`,
`OUTREACH_DRY_RUN` (true par défaut), `DAILY_EMAIL_LIMIT=10`,
`HOURLY_EMAIL_LIMIT=5`, `PER_DOMAIN_PER_DAY_LIMIT=1`, `MAX_BATCH_SIZE=10`,
`MAX_RETRIES=3`, `FOLLOWUP_DELAY_DAYS_1=4`, `FOLLOWUP_DELAY_DAYS_2=7`,
`SEND_HOUR_START/END` (heure locale destinataire), `ENABLED_CAMPAIGNS`,
`RESEND_FROM` (vide = envoi désactivé), `UNSUB_BASE` (URL publique du worker,
pour les liens opt-out ; vide = mention reply-STOP seule), `FB_MQ/GP_PAGE_ID`.

## Cron (UTC) → jobs

| Schedule | Job |
|---|---|
| `*/30 * * * *` | `process_email_queue` (STEP 0) |
| `20 * * * *` | `process_email_followups` (STEP 1-2) |
| `45 11 * * *` | `process_facebook_queue` (≈07:45 MQ) |

3 crons exactement (limite Free : 5/compte, sg-payments en utilise 2 — headroom
nul, Workers Paid requis pour tout cron supplémentaire). Pas de cron health :
chaque job écrit un heartbeat (couverture 30 min).

Séquence email : STEP 0 contact → +4j relance → +7j dernière. Arrêt immédiat :
réponse, opt-out, bounce, campagne désactivée, kill switch. Retry : réseau/429/5xx
avec backoff 1h/4h/24h (max 3) ; 422/invalide → `bounced` sans retry.

## Procédure de premier lancement (ordre strict)

1. `node scripts/tests/outreach-queue.test.cjs` → 36/36.
2. Appliquer `supabase/schema.sql` (§ OUTREACH) : auto via `apply-supabase-schema.yml`
   au push main (si `SUPABASE_ACCESS_TOKEN` valide), sinon SQL Editor (fondateur).
3. Provisionner les 4 secrets (`wrangler secret put …` dans `workers/outreach`).
4. Merger → `outreach.yml` déploie → smoke vérifie `/health` + `dry_run:true`.
5. Insérer 1–3 prospects RÉELS (SQL, champs minimaux : hotel/email/region/language).
6. Observer les logs `dry_run` (sélection correcte ?) via table `outreach_events`.
7. Passer `OUTREACH_DRY_RUN=false` + `OUTREACH_ENABLED=true` (+ canaux) via
   `wrangler deploy` après édition des vars (ou dashboard).
8. Vérifier 1–3 vrais envois (events `sent`, boîte de réception), puis monter
   les quotas progressivement. **Jamais de blast direct.**

## Dry-run / kill switch

- Dry-run : `OUTREACH_DRY_RUN=true` → logique complète, events `dry_run`
  avec prospect/étape/raison/horaire/provider, zéro appel externe, zéro avancement.
- Kill switch : `OUTREACH_ENABLED=false` (global) ou par canal → jobs logguent
  `skipped`, DB intacte. Testé (contrats 10-11).

## Admin / watchdog

- `GET /status?key=` : agrégats (statuts, envoyés jour/heure, erreurs, file,
  dernier heartbeat, FB) — **aucun email, aucun secret** (contrat 12).
- `POST /seed-social?key=&days=&regions=` : génère les posts (rotation
  déterministe 6 catégories × MQ/GP, anti-doublon jour).
- `POST /api/outreach/reply` : marquer réponse (stoppe la séquence).
- `POST /api/outreach/webhook` (header `x-outreach-key`, à coller dans Resend) :
  bounce/plainte → statuts.
- `GET /unsubscribe?email=&code=` : opt-out HMAC sans auth.
- Watchdog : workflow GH quotidien (à créer sur ce modèle) qui curl
  `/status?key=$ADMIN_KEY`, alerte si : pas de heartbeat > 90 min,
  erreurs 24h > seuil, file bloquée, token FB expiré (échecs code 190).

## Rollback

1. `OUTREACH_ENABLED=false` (vars + redeploy, ou dashboard) → arrêt immédiat.
2. `git revert <commit> --no-edit` + push → CI redéploie l'ancienne version.
3. Les lignes DB restent (audit) ; aucun envoi partiel possible (claim atomique).

## Risques connus (non bloquants)

- Réponses email lues par l'humain (pas d'IMAP worker) → marquage via `/reply`.
- `SUPABASE_ACCESS_TOKEN` expiré côté CI (BUG-2026-027) → fallback SQL Editor.
- Quotas Resend/domaine à surveiller les 1ers jours (reputation) ; volumes
  volontairement minuscules par défaut.
