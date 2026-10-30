# Code-Only Release — Rollback Procedure

## Contexte
Une release code-only ne doit modifier aucun fichier scientifique ou data-bearing.
Tous les fichiers protégés doivent être identiques entre le build actuel et le
snapshot déployé en production.

## Fichiers protégés (invariance obligatoire)

| Fichier | Description |
|---------|-------------|
| public/api/copernicus/sargassum.json | Données satellite live (source: erddap-live) |
| public/api/copernicus/history.json | Historique des observations |
| public/api/copernicus/forecast-full.json | Prévisions complètes |
| public/api/copernicus/forecast-archive.json | Archive des prévisions |
| public/api/copernicus/sargassum-grid.json | Grille satellite |
| public/api/copernicus/sargassum-banks.json | Bancs de sargasses |
| public/api/copernicus/caribbean-afai.json | Données AFAI Caraïbes |
| public/api/copernicus/track-record.json | Historique de performance |
| public/api/copernicus/forecast-accuracy.json | Précision des prévisions |
| public/api/copernicus/climatology.json | Climatologie régionale |
| public/api/copernicus/mq/sargassum.json | Données régionales MQ |
| public/api/copernicus/mq/history.json | Historique régional MQ |
| public/api/copernicus/gp/sargassum.json | Données régionales GP |
| public/api/copernicus/gp/history.json | Historique régional GP |
| public/api/copernicus/_private | Données privées J+2-7 |

## Vérification pré-déploiement

1. **Build local**: `npm run build`
2. **Génération du manifest**: `node scripts/code-only-manifest.cjs <deployed-sha>`
3. **Comparaison byte-for-byte**: Chaque fichier protégé doit avoir le même hash SHA-256
4. **Tests**: `npm test` doit passer à 100%
5. **Budget bundle**: ≤ 210 Ko gzip eager

## Rollback

Si une différence est détectée sur un fichier protégé:

```bash
# Revenir au dernier commit connu bon
git revert <bad-commit> --no-edit
git push origin main

# Le déploiement automatique se déclenche (main → build → FTP → health-check)
# Rollback effectif en < 15 min
```

## Vérification post-roll-back

1. Vérifier que les hash SHA-256 des fichiers protégés correspondent au déployé
2. Vérifier que `npm test` passe
3. Vérifier que le bundle budget est respecté
4. Contrôles HTTP sur les 6 domaines (homepage, API, sitemap)

## Gate de déploiement

Le déploiement code-only est autorisé uniquement si:
- [ ] Tous les tests passent (npm test → 106/106)
- [ ] Le build réussit (npm run build → exit 0)
- [ ] Le bundle gzip ≤ 210 Ko
- [ ] Tous les fichiers protégés ont des hashs identiques au déployé
- [ ] Le rollback est documenté et testé
- [ ] Aucune donnée scientifique n'est modifiée

## Metadata-only correction (séparée)

Une correction des métadonnées publiques (dataAgeMinutes, stale, freshness reason)
dans public/api/copernicus/sargassum.json est une modification de donnée et
nécessite une approbation explicite avant publication.
