# Déploiements

Relevé du 2026-11-07T16:15Z. Le déploiement `sg-payments` ci-dessous est celui déclaré par y vers 16:04Z. Les GET ont été refaits ensuite.

| surface | identifiant | source / version | horodatage | trafic |
|---|---|---|---|---|
| Worker régional des six domaines | `/version.json` | v221, build `df18df5d`, date publiée 2026-10-12 | GET 2026-11-07 sur les six domaines, après le run `42389099227` | inchangé. Jobs `deploy` et `deploy-pages` skipped |
| Cloudflare Production | run `42389099227` | SHA `18cb16d7e5cead728fea268039b72003a8497202` | terminé en failure | build MQ : `observation hors SLA (3121.42 min > 900 min)`. Tulum a échoué sur la même garde. Les autres builds ont été annulés |
| Worker `sg-payments` | version 382 `575c2bbb-a33b-45db-9156-453f11522db0`, déploiement `08f46a03-ccff-437f-9cdd-1bb4d9be9c39` | source `18cb16d7e`, SHA-256 `fcf4e3331a8033817ef5aedc793b1f730bea74b7c7110bbe642e12f4436ec469` | 2026-11-07 ~16:04Z | 100 %. 7 bindings conservés, crons inchangés. Rollback : version 381 `36fa827a-a39c-4156-9359-30fc383eb6c5`. Achat réel non validé |
| Supabase `sargagame` | projet `rswdmjtdzrucqzzukfmd` | migrations 002–008 appliquées et vérifiées ; 001 ignorée, déjà présente | 2026-11-07 ~16:04Z | déclaré par y |
| `GET /api/mollie-health` | HTTP 200 `ok:true`, `worker:sg-payments` | six domaines | relu après 16:04Z | pas une preuve d'achat |
| `GET /api/mollie-webhook.php` | HTTP 200 `ok:true` | six domaines | relu après 16:04Z | pas une preuve d'achat |
| Pages code-only | run `42227027205` | déploiement puis rollback le 2026-11-06 | 2026-11-06T13:37Z | `version.json` toujours v221 après coup |

Un push sur `main` qui n'est pas dans `paths-ignore` de `cloudflare-production.yml` peut lancer un déploiement de production. Ce fichier documentaire n'est pas dans cette liste d'exclusion.
