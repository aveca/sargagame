# Les Veilleurs — orchestration cloud

Dix agents, **un par marché**, du rivage à l'abysse, empilés vers l'échelle 10 Md.
Ils **regardent** et produisent de l'intelligence datée ; ils **n'envoient rien**
(les envois restent aux workflows dédiés : `weekly-outreach`, drip, dunning).

## Modèle (ce que demandait le fondateur : série + parallèle, cloud)

```
schedule/dispatch
      │
      ▼
[orchestrateur]  ← SÉRIE (le chef de quart) : décide qui est « dû » aujourd'hui
      │  emits matrix
      ▼
[veilleur × N]   ← PARALLÈLE (GitHub Actions matrix, max-parallel 10)
      │  1 brief / marché → artifact
      ▼
[synthèse]       ← SÉRIE : rapatrie, compose DIGEST.md, commit
```

100 % GitHub Actions → tourne **même PC éteint** (fondateur mobile).
Défini dans `.github/workflows/veilleurs.yml`.

## Les 10 (source unique : `registry.json`)

| id | Veilleur | Marché | Statut | Cadence |
|---|---|---|---|---|
| sable | L'éclaireur du rivage | B2C voyageurs | live | quotidien |
| recif | Le concierge des côtes | Hôtels & resorts | emerging | mar+ven |
| prisme | Le cartographe des données | Licence data / API | emerging | mer+sam |
| digue | Le gardien municipal | Collectivités | greenfield | lun |
| amarre | Le notaire du littoral | Immobilier côtier | greenfield | mar |
| barometre | L'actuaire des marées | Assurance | greenfield | mer |
| sillage | Le pilote de flotte | Croisière/ports | greenfield | jeu |
| filet | La vigie des pêcheries | Pêche/aquaculture | greenfield | ven |
| courant | L'ingénieur des prises d'eau | Énergie/dessalement | greenfield | sam |
| abysse | L'oracle planétaire | Souverain/climat | greenfield | dim |

## Cerveau des greenfield

Les 6 verticales greenfield sont en **mode agent** : elles raisonnent via
`@anthropic-ai/sdk` **si** le secret `ANTHROPIC_API_KEY` existe dans le repo.
Sans clé → **recon déterministe** (brief depuis la donnée repo) + note.
C'est la seule action fondateur optionnelle pour passer le greenfield en vrai agent.

## Local

```bash
node scripts/veilleurs/orchestrator.cjs --dry --all   # voir la matrix des 10
node scripts/veilleurs/run-veilleur.cjs sable          # un brief → out/sable/
node scripts/veilleurs/synthesize.cjs                  # DIGEST.md
```

## Ajouter / retirer un marché

Éditer `registry.json` (une entrée). Aucun code à toucher : l'orchestrateur, la
matrix et la synthèse sont pilotés par le registre.
