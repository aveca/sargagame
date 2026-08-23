# queue/ — File de jobs À LA DEMANDE (déclenche le calcul de ta machine)

TRIZ inversion : une « URL/commit qui fait bosser ta machine » **sans aucun port
ouvert**. Tu déposes un job ici (depuis ton phone via l'app GitHub, ou un commit) ;
ta machine, quand elle tourne, fait `git pull`, voit le job, l'exécute, et note le
résultat. Elle **sonde vers l'extérieur** — rien n'entre jamais dans le PC.

## Déposer un job (depuis le phone)
Crée un fichier `queue/<nom>.json` :
```json
{ "id": "2026-07-02-mq-1", "type": "render_brief", "payload": { "region": "mq" } }
```
Commit sur `main` (app GitHub mobile). Au prochain run de l'usine (`factory.cjs
--serve`, ou le run quotidien), le job est exécuté **une seule fois** (dédup par `id`).

## Sécurité (poka-yoke)
- `type` doit être un **handler nommé du catalogue fermé** (`scripts/local-factory/handlers.cjs`).
  Un type inconnu est **refusé** — la file ne peut PAS transporter de code/shell.
- `payload` = **données uniquement** (région, date…), jamais une commande.
- La machine ne modifie pas les fichiers commités (idempotence via `state/processed.json`, gitignored).

## Jobs disponibles (catalogue actuel)
| type | payload | effet |
|---|---|---|
| `render_brief` | `{ "region": "mq\|gp\|puntacana\|florida\|rivieramaya" }` | rend le Brief vidéo du jour (idempotent, garde-fou fraîcheur) |

Ajouter un job = ajouter une entrée dans `handlers.cjs` (revue sécurité obligatoire).

## Déclencher tout de suite (machine allumée)
`node scripts/local-factory/factory.cjs --serve`  ·  aperçu : `--serve --plan`

> La version « tap un bookmark sur le phone → instantané » (file Supabase + beacon
> de visite du site) est la v2, activée avec un `OPERATOR_TOKEN` — cf. la synthèse.
