# 12 — P1 DATA AGENT — OG CARDS PIPELINE

Tu es le data/automation agent responsable de la génération et de la fraîcheur des cartes OpenGraph Sargagame.

## Mission

Automatiser la génération des OG cards pour toutes les plages couvertes par le dépôt et garantir qu'aucune carte attendue ne manque après une mise à jour des données.

État connu :

- script existant : `scripts/automation/generate-og-all.mjs` ;
- sortie : `public/assets/og/` ;
- cible historique MQ/GP : **136 plages × 3 langues = 408 cartes** ;
- pipeline data : `.github/workflows/daily-copernicus.yml`.

Ne suppose pas que 408 est encore le total global des régions. **Calcule la cible à partir de la source de vérité actuelle** et distingue clairement MQ/GP des nouvelles régions.

## Étape 1 — Auditer l'existant

Lire :

1. `CLAUDE.md`
2. `AGENTS.md`
3. `.ai/current_state.md`
4. `regions/index.cjs`
5. `regions/*.json`
6. `public/data/beaches-list.json`
7. `scripts/automation/generate-og-all.mjs`
8. `scripts/automation/generate-og-pilot.mjs` si présent
9. `.github/workflows/daily-copernicus.yml`
10. générateur SEO / pages plage / configuration OG existante

Déterminer :
- quelles régions doivent produire des cartes ;
- quelles langues sont réellement utilisées par région ;
- quel nommage de fichier est déjà consommé par les pages ;
- si des assets OG sont déjà générés pour certaines plages ;
- si les OG cards dépendent des données du jour.

## Étape 2 — Ne pas doubler l'architecture

Réutiliser `generate-og-all.mjs` autant que possible.

Ne crée pas un second moteur parallèle.

Si le script est insuffisant, rends-le :

- déterministe ;
- idempotent ;
- compatible multi-régions ;
- fail-fast sur données impossibles ;
- capable d'être appelé depuis CI.

## Étape 3 — Génération

La génération doit être branchée **après la mise à jour des données nécessaires au contenu OG** et avant le déploiement final.

Séquence cible :

```text
fetch data
  ↓
validate data
  ↓
compute target beaches × languages
  ↓
generate OG cards
  ↓
validate generated assets
  ↓
build/deploy
```

Ne lance pas la génération avant que les données qu'elle affiche soient disponibles.

## Validation automatique obligatoire

Créer ou réutiliser une gate qui calcule :

```text
expected_count
actual_count
missing_count
invalid_count
orphan_count
```

Règle minimale :

```text
missing_count = 0
invalid_count = 0
```

Pour chaque carte attendue, vérifier :

- fichier présent ;
- PNG lisible ;
- dimensions 1200×630 si c'est le contrat actuel ;
- taille > 0 ;
- langue correcte ;
- plage correcte ;
- statut/freshness cohérents avec la source de données ;
- aucune donnée sensible.

Les fichiers orphelins doivent être signalés et supprimés uniquement si le comportement actuel du dépôt l'autorise sans risque.

## Attention à la donnée

Une OG card est une représentation marketing de la donnée du jour.

Donc :

- ne jamais inventer un score/statut ;
- ne jamais afficher une prévision comme une observation ;
- conserver les qualificatifs de confiance quand le template les utilise ;
- afficher une date/heure de verdict cohérente avec la timezone du produit ;
- si la donnée manque, **ne pas générer silencieusement une fausse carte propre**.

Le comportement actuel de fallback du script doit être audité : un fallback `clean/80` automatique est potentiellement trompeur. Remplace-le par un échec contrôlé ou un état explicitement « données indisponibles » selon le contrat produit.

## Intégration CI

Modifier `.github/workflows/daily-copernicus.yml` uniquement si nécessaire.

Contraintes :

- le step doit être idempotent ;
- les erreurs de génération doivent être visibles ;
- ne pas masquer un échec avec `continue-on-error` si cela laisserait publier des OG obsolètes ;
- ne pas déclencher inutilement plusieurs générations identiques ;
- ne pas casser les étapes Copernicus existantes ;
- ne pas réintroduire FTP dans `deploy-live.yml` si ce flux a été séparé.

## Performance

La génération OG est une étape CI, pas du JS navigateur.

Elle ne doit donc pas augmenter le bundle eager.

Ne jamais importer le générateur OG dans l'application React.

## Tests

Exécuter au minimum :

```bash
node scripts/automation/generate-og-all.mjs
```

Puis la gate de validation créée/existante.

Puis :

```bash
npm run build
node scripts/check-bundle-budget.cjs
node scripts/ux-smoke.mjs
```

Vérifier au moins une plage réelle par région live et une langue par défaut.

## Definition of Done

- [ ] source de vérité région/plage/langue déterminée ;
- [ ] générateur unique réutilisé ;
- [ ] toutes les cartes attendues générées ;
- [ ] missing = 0 ;
- [ ] invalid = 0 ;
- [ ] données affichées vérifiées ;
- [ ] pipeline daily-copernicus intègre la génération au bon moment ;
- [ ] une panne de génération ne publie pas silencieusement des cartes incorrectes ;
- [ ] bundle navigateur inchangé ;
- [ ] build + smoke OK.

## Rapport imposé

```text
TASK: OG CARDS PIPELINE

REGIONS: [liste]
BEACHES: [N]
LANGUAGES: [liste]
EXPECTED: [N]
GENERATED: [N]
MISSING: [N]
INVALID: [N]
ORPHAN: [N]

SCRIPT: [fichier]
WORKFLOW: [fichier + step]
DATA SOURCE: [fichier(s)]

BUILD: [PASS/FAIL]
BUNDLE: [X Ko gzip]
SMOKE: [PASS/FAIL]
SAMPLE LIVE/STATIC CHECKS: [résultats]
ROLLBACK: [exact]
```

La mission n'est pas « le script termine avec exit 0 ». La mission est : **toute OG card publiée correspond à une plage réelle, une langue réelle et des données réelles.**