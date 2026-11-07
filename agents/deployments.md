# Déploiements

Relevé du 2026-11-07T16:20Z.

| surface | identifiant | source / version | horodatage | trafic |
|---|---|---|---|---|
| Worker régional des six domaines | `/version.json` | v221, build `df18df5d`, date publiée 2026-10-12 | GET 2026-11-07 sur les six domaines, après le run `42389099227` | inchangé. Jobs `deploy` et `deploy-pages` skipped |
| Cloudflare Production | run `42389099227` | SHA `18cb16d7e5cead728fea268039b72003a8497202` | terminé en failure | build MQ : `observation hors SLA (3121.42 min > 900 min)`. Tulum a échoué sur la même garde. Les autres builds ont été annulés |
| Worker `sg-payments` | non déployé par les agents | source sur `main` depuis `0da0d417` | — | verrou `20261107-sg-payments-deploy` tenu par y |
| Pages code-only | run `42227027205` | déploiement puis rollback le 2026-11-06 | 2026-11-06T13:37Z | `version.json` toujours v221 après coup |

Un push sur `main` qui n'est pas dans `paths-ignore` de `cloudflare-production.yml` peut lancer un déploiement de production. Ce fichier documentaire n'est pas dans cette liste d'exclusion.
