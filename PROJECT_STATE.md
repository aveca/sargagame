# SARGAGAME — état partagé

**Relevé : 2026-11-07T15:55Z.** Faits relus sur GitHub et sur trois domaines. Les rapports plus anciens ne sont pas une preuve. GitHub est la seule source commune : pas d'accès aux tâches internes ChatGPT ni OpenCode.

Dépôt : https://github.com/aveca/sargagame
Verrous : `agents/locks.md`
Déploiements : `agents/deployments.md`

## Vérité courante

| Élément | Valeur | Preuve |
|---|---|---|
| Branche par défaut | `main` | GitHub |
| HEAD au relevé | `9ce1e099e41d483db6287ebce51c34dcda63f4d1` | `git rev-parse origin/main` |
| Dernier commit | `veilleurs: digest 2026-11-07` | `git log -1` |
| Domaines de production | sargasses-martinique.com, sargasses-guadeloupe.com, sargassummiami.com, sargassumpuntacana.com, sargassumcancun.com, sargazotulum.com | matrice `cloudflare-production.yml` |
| Version servie | v221, date 2026-10-12, build `df18df5d` | GET `/version.json` 2026-11-07 sur Martinique, Miami et Tulum |
| #1327 | fusionnée, `efc2d666c` | tier inconnu ne retombe plus sur Pro |
| #1344 | fusionnée, `fa5f37f26` | URL annuelle seulement si `reachable===true` |
| #1294 | ouverte, en conflit, non fusionnée | doublon de fulfillment ; ne pas la merger |
| #1136 | ouverte, en conflit | ancien SOS ; ne pas la merger |
| #1328 | ouverte, `test-frontend` rouge (run `42188895063`) | pas de fusion tant que ce check n'est pas vert |
| #1307 | ouverte, en conflit | doublon de #1327 déjà dans `main` |

## Autres agents, dernières 24 h

Tous les commits GitHub de ce dépôt sont signés `aveca`. On les distingue par la branche.

| PR | Branche | État | Sujet |
|---|---|---|---|
| #1350 | `agent/coding/multi-repo-bridge-handoff-20261106` | mergée 2026-11-06T18:47Z | mémoire AUTOPILOT |
| #1349 | `agent/coding/multi-repo-bridge-20261106` | mergée 2026-11-06T18:10Z | relais multi-dépôts |
| #1348 | `fix/erddap-capture-window-monitor-20261106` | mergée 2026-11-06T18:01Z | moniteur ERDDAP lecture seule |
| #1347 | `agent/devops/ai-docs-handoff-20261106` | mergée 2026-11-06T17:08Z | diagnostic Copernicus |
| #1346 | `agent/devops/ai-docs-paths-ignore-20261106` | mergée 2026-11-06T16:45Z | pushes mémoire hors déclencheur prod |
| #1342 | `p0/sync-multi-repo-bridge` | fermée 2026-11-06T18:20Z | pont multi-dépôts, remplacé par #1349 |

Aucune PR ouverte n'a été mise à jour le 2026-11-07 avant ce relevé. Pas de verrou `agents/locks.md` préexistant.

## Chantiers de ce cycle

Pris dans `agents/locks.md` avant édition : état partagé, rebase/fusion de #1323, rebase/fusion de #1287, brouillon de remplacement des URLs de payment links. #1328 n'est pas repris : son check frontend est rouge. #1294 n'est pas reprise.
