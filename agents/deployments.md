# Déploiements

Relevé du 2026-11-07T15:55Z. Aucun déploiement n'a été lancé dans ce cycle au moment de ce fichier.

| surface | identifiant | source / version | horodatage | trafic |
|---|---|---|---|---|
| Worker régional des six domaines | champ `worker` de `/version.json` | v221, build `df18df5d`, date publiée 2026-10-12 | GET 2026-11-07 sur Martinique, Miami, Tulum | version identique sur les trois sondes |
| Worker `sg-payments` | non relu dans ce cycle | source proposée par #1323, non déployée tant que la PR n'est pas sur `main` et qu'un `wrangler deploy` n'est pas prouvé | — | inconnu tant qu'une lecture Cloudflare n'est pas faite |
| Pages code-only | run `42227027205` | déploiement puis rollback le 2026-11-06 | 2026-11-06T13:37Z | `version.json` toujours v221 après coup |

Un push sur `main` qui n'est pas dans `paths-ignore` de `cloudflare-production.yml` peut lancer un déploiement de production. Ce fichier documentaire n'est pas dans cette liste d'exclusion.
