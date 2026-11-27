# Inventaire GitHub Actions — sargagame (10 nov 2026)

Fuseau indiqué : UTC. Les heures utilisateur (UTC+2) sont +2 h.

## Constat data / mails (avant correctif)

- Sites live : `erddapTimestamp` 2026-10-27T12:00:00Z, `updatedAt` 2026-10-28T17:29Z (~12–13 jours).
- Dépôt `main` : `erddapTimestamp` 2026-11-05T12:00:00Z, `updatedAt` 2026-11-06T20:19Z (~4 jours).
- Dernier fetch ERDDAP (run data-refresh 42712284522, 2026-11-09T22:29Z) : observation ~2026-11-08T12:00:00Z (2070 min, ~34,5 h) — **plus récente que le dépôt et que la prod**, mais refusée par le SLA 900 min.
- `data-refresh.yml` : 14 échecs schedule d’affilée ; dernier succès 2026-10-29.
- `daily-copernicus.yml` schedule : échec (même gate) ; les runs `push` « réussissent » car ils sautent le fetch.
- `cloudflare-production.yml` : le job `build` échoue sur `check-predeploy-satellite-freshness.cjs` (ex. run 42708581740, région florida, 6365 min > 900). Les données du 6 nov jamais déployées.
- Alertes B2C : 39 actives / 1 désinscrit, **0** ligne dans `b2c_alert_deliveries`. Le Worker n’envoie que si l’observation live a ≤ 900 min **et** qu’une plage suivie est moderate/avoid/high. Données live périmées = aucun envoi.
- `weekend-email.yml` : 5 derniers vendredis **cancelled** à ~15 min (timeout du job).

## Workflows `aveca/sargagame` (fichiers présents sur main)

| Workflow | Rôle | Planning | Dernier état connu (début nov 2026) | Verdict |
|---|---|---|---|---|
| data-refresh.yml | Fetch ERDDAP + commit data + dispatch deploy | 20 0/6/12/18 UTC | schedule = failure (SLA 900) | **fix** |
| daily-copernicus.yml | Fetch + emails internes + build push | 0 0/6/12/18 UTC | schedule = failure ; push = success (sans fetch) | **fix** (gate + dispatch si changed) |
| cloudflare-production.yml | Deploy Workers + Pages 6 domaines | push / dispatch | failure (predeploy SLA) | **fix** (éligibilité, pas le paywall) |
| sales-lifecycle-emails.yml | Mails vente (matin B2C, panier, expiry, digest) | 11:00 UTC daily ; 14:30 UTC daily ; lundi 13:00 UTC | nouveau | **ajouté** |
| weekend-email.yml | Bulletin vendredi aux abonnés Sheet | vendredi 12:00 UTC | cancelled (timeout 15 min) | **fix** (timeout 40) |
| ci-tests.yml | Tests unitaires / gate | push / PR / dispatch | utilisé | **keep** |
| perf-budget.yml | Budget perf | chaîne deploy | utilisé | **keep** |
| live-production-sentinel.yml | Surveille fraîcheur live | schedule | utile | **keep** |
| erddap-capture-window-monitor.yml | Sonde ERDDAP (lecture) | schedule | utile | **keep** |
| secret-scan.yml | Scan secrets | (dynamique / CI) | utile | **keep** |
| pages-code-only-release.yml | Release code sans changer l’observation live | dispatch | 2 failures manuelles | **keep** (manuel) |
| factory-cloud-runner.yml | Runner usine legacy | dispatch + double opt-in (déjà neutralisé) | inactif | **keep** (déjà disable schedule) |
| cine-atlas.yml / scene-clips.yml | Usine vidéo | dispatch only | inactif | **keep** (manuel, pas de cron) |
| smtp-test.yml / support-reply.yml / diagnose-fulfillment.yml / revoke-pass.yml / push-debug.yml / ga4-diagnose.yml | Outils manuels | dispatch | — | **keep** |
| provision-ga4.yml / provision-gsc.yml / provision-barbados.yml / apply-supabase-schema.yml / deploy-edge-function.yml / setup-mail-forwarders.yml | Provision one-shot | dispatch | — | **keep** (manuel) |
| daily-brief.yml / morning-brief.yml | Brief interne | schedule | secondaire vs sales-lifecycle | **keep** (interne) |
| relance-gap.yml | Relance leads capture | dispatch (send=false par défaut) | — | **keep** (manuel, pas de cold auto) |
| weekly-outreach.yml | Backlinks / social | mardi 10:00 UTC | hors mails clients | **keep** (pas d’email prospect auto ajouté) |
| weekly-seo-automation.yml / weekly-optimize.yml / weekly-ux-report.yml / seo-guard.yml | SEO / UX | schedule | non bloquant fraîcheur | **keep** |
| daily-social-reservoir.yml / release-social-reservoir.yml | Réservoir social | schedule / valve | — | **keep** |
| notify-photos.yml | Notif photos visiteurs | schedule / event | — | **keep** |
| check-mail-backlog.yml | IMAP → Gmail | schedule | support | **keep** |
| veilleurs.yml | Orchestration veilleurs | schedule | — | **keep** |
| agent-handoff.yml | Handoff agents | events | — | **keep** |
| ab-evaluator.yml | Eval A/B funnel | schedule | — | **keep** |
| generate-og-images.yml | Images OG | dispatch / path | — | **keep** |
| user-journey-audit.yml | Audit E2E live | schedule / dispatch | utile | **keep** |
| regional-beach-index-validation.yml | Validation index plages | PR / dispatch | utile | **keep** |
| ci-funnel / branch-policy / deploy-live / deploy-gh-pages / outreach / outreach-watchdog / weekly-pois / autopilot / tulum-seo / validate-code-only-stale-ui / prune-ghost-paylinks | Présents dans l’API Actions (IDs historiques) mais **absents du dossier** `.github/workflows` actuel | — | ne plus tourner depuis le fichier source | **rien à supprimer** (déjà hors arbre) |

Aucun workflow utile n’a été effacé. Les crons dangereux (cold B2B, factory cloud, clips) étaient déjà sans schedule ou en dispatch only.

## Workflows `aveca/bot-wow` (liste seule, aucun changement)

| Workflow | Fichier |
|---|---|
| Real package candidate validation | package-candidate-validation.yml |
| Deploy Bot-Wow to GitHub Pages | pages.yml |
| UI quality and visual evidence | ui-quality.yml |
| Validate Bot-Wow | validate.yml |

## Relecture

Le journal « publication autorisée » ne contient plus la phrase `observation hors SLA`. Le workflow ne pose `BLOCKED_STALE_SOURCE` que si `verify-ftp-ready` sort en erreur **et** que cette phrase est dans le journal. Une observation plus récente, encore sous 7 jours, peut donc être commitée et déployée sans faire échouer le job.

Les e-mails du nouveau workflow affichent le pass 30 jours à **14,99 €** (MQ/GP) ou **$16.99** (US/MX/DO). La relance panier est limitée à **un** envoi (`--once`), plafonnée, et inclut les paniers Mollie. Aucun e-mail n'est envoyé à des prospects hôteliers.

## Après correctif (cette PR)

- Publier une observation **plus récente** que celle déjà commitée, même si elle dépasse 900 min, tant qu’elle a moins de 7 jours et n’est pas une régression / source dégradée / pic tout-vert.
- Le SLA 900 min reste le classement « frais » (`evaluateObservation.ok`).
- Déployer si l’artefact n’est pas plus vieux que le live (ou, si le live est injoignable, s’il a moins de 7 jours).
- Dispatch de production seulement si `publish.outputs.changed == true`.
- Nouveau workflow de mails vente, indépendant du gate satellite.
- Timeout du bulletin week-end porté à 40 min.
