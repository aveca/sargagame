# Outreach 0-PC — Checklist d'activation fondateur (~30 min, 100 % réversible)

État actuel : code GREEN, worker live en dry-run OFF, **zéro envoi réel**.
Ne passez à l'étape suivante que si la précédente est verte.

---

## Étape A — DB (5 min)

Supabase Dashboard → SQL Editor → New query → copier **uniquement le bloc
`§ OUTREACH`** de `supabase/schema.sql` (tables `outreach_contacts`,
`outreach_events`, `social_posts`) → Run. Attendu : `Success, no rows returned`
(ré-exécutable sans risque : tout est `if not exists`).

Vérification attendue : Table Editor montre les 3 tables (vides).

> Pourquoi manuel : le token CI `SUPABASE_ACCESS_TOKEN` est expiré (job
> `Apply Supabase schema` en 401) — à régénérer séparément un jour.

## Étape B — Secrets Cloudflare (5 min)

Dashboard Cloudflare → Workers → **outreach** → Settings → Variables :
`Add variable` → type **Secret** → coller la valeur (ne jamais la mettre
dans un fichier, un email ou Git) :

| Secret | Où l'obtenir |
|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → `service_role` |
| `ADMIN_KEY` | Terminal : `openssl rand -hex 32` (gardez-le dans votre gestionnaire) |
| `RESEND_API_KEY` | Resend → API Keys → Create (permission Send uniquement) |
| `FB_PAGE_TOKEN` | Meta Developers → votre app → token Page, permissions `pages_manage_posts`, `pages_read_engagement` (seulement si Facebook voulu, sinon ignorez) |

## Étape C — Variables (5 min)

Même écran → Variables **texte** (modifiables sans redéployer le code) :

| Variable | Valeur initiale recommandée |
|---|---|
| `RESEND_FROM` | `SargaGame Pro <pro@sargasses-martinique.com>` (domaine **vérifié** dans Resend → Verified) |
| `UNSUB_BASE` | `https://outreach.m4ngo.workers.dev` |
| `FB_MQ_PAGE_ID` / `FB_GP_PAGE_ID` | IDs numériques des Pages (vide = Facebook désactivé) |
| `OUTREACH_ENABLED` | `false` (pour l'instant) |
| `OUTREACH_DRY_RUN` | `true` (pour l'instant) |
| `EMAIL_OUTREACH_ENABLED` / `FACEBOOK_OUTREACH_ENABLED` | `false` (pour l'instant) |
| Quotas (`DAILY_EMAIL_LIMIT=10`…) | laisser les défauts |

Cliquer **Save** puis **Deploy** (redéploie avec les nouvelles vars).

## Étape D — GitHub watchdog (2 min)

Repo → Settings → Secrets → Actions → New secret :
`OUTREACH_WORKER_URL` = `https://outreach.m4ngo.workers.dev`, `OUTREACH_ADMIN_KEY`
= même valeur qu'en B (jamais committée). Puis Actions → `Outreach watchdog` →
`Run workflow` : attendu SUCCESS (skip gracieux si secrets absents).

## Étape E — Preflight (2 min, sur votre PC)

```cmd
set OUTREACH_WORKER_URL=https://outreach.m4ngo.workers.dev
set OUTREACH_ADMIN_KEY=<votre-clé>
npm run outreach:preflight
```

Attendu : Worker PASS · DB PASS · Resend CONFIGURED · Admin PASS · Security PASS.
Meta peut rester NOT CONFIGURED (Facebook viendra plus tard).

## Étape F — Dry-run (48 h, zéro action)

1. Insérez **1 prospect réel** (Supabase → `outreach_contacts` → Insert row :
   `hotel_name`, `email`, `region`=MQ, `language`=fr, `status`=`ready`, le reste
   par défaut). Jamais de base importée.
2. Mettez `OUTREACH_ENABLED=true` (vars, Save+Deploy), `DRY_RUN` reste `true`.
3. Après 2 cycles Cron (1 h) : `npm run outreach:verify-dry-run` → attendu
   **DRY RUN VERIFIED** (sélection loggée, 0 envoi, statuts intacts).
4. Gate : `npm run outreach:gate` → PASS = feu vert procédural (pas technique).

## Étape G — Premier email (5 min, supervisé)

1. `OUTREACH_DRY_RUN=false` (Save+Deploy), `MAX_BATCH_SIZE=1` (déjà 10 max,
   le batch réel = 1 prospect dû).
2. Attendez le prochain Cron (≤ 30 min) OU déclenchez via Dashboard → Workers →
   outreach → Triggers (exécution manuelle impossible sur cron — attente requise).
3. Vérifiez : `npm run outreach:verify-dry-run` doit maintenant ÉCHOUER sur
   `zéro envoi` (normal : 1 vrai envoi) ; contrôlez dans Supabase
   `outreach_events` (`kind=sent`, `provider_message_id` présent) et votre
   boîte de test (adresse du prospect = la vôtre pour ce 1er test —
   **utilisez votre propre email pro comme prospect n°1**).
4. Au moindre doute : `OUTREACH_ENABLED=false` (arrêt immédiat, loggé).

## Étape H — Facebook (plus tard, séparément)

Seulement après email validé : `FACEBOOK_OUTREACH_ENABLED=true` + Page IDs +
token vérifiés (`npm run outreach:preflight` → Meta CONFIGURED), seed via
`POST /seed-social?key=&days=1`, 1 post, vérifiez `provider_post_id`, puis
désactivez en cas d'anomalie.

## Rollback (toujours disponible)

`OUTREACH_ENABLED=false` → arrêt immédiat. `git revert` + push → CI redéploie.
Événements DB conservés (audit). Kill switch testable à tout moment (remettre
`false`, attendre un Cron, constater `skipped`).
