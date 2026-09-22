# B2B Phase 2 — RUNBOOK d'exécution (SIRENE Martinique 972)

> État : **préparé, jamais exécuté**. Ce document est la procédure exacte à suivre
> quand les prérequis fondateur seront en place. Aucune commande de ce document
> n'a été lancée contre la production à la date de rédaction.

## 0. Prérequis (bloquants)

| # | Prérequis | Vérification READ-ONLY |
|---|---|---|
| 1 | `SUPABASE_ACCESS_TOKEN` régénéré + secret GH à jour | `gh run list --workflow=apply-supabase-schema.yml --limit 1` → runs postérieurs au 2026-09-20 présents |
| 2 | `apply-supabase-schema.yml` GREEN | dernier run `success` |
| 3 | Schéma présent en prod | probe READ-ONLY (voir §1) |
| 4 | `SIRENE_CONSUMER_KEY` / `SIRENE_CONSUMER_SECRET` dans l'env local (jamais Git) | présence uniquement (jamais d'affichage de valeur) |

Si un prérequis manque : STOP. Ne jamais contourner (pas de `.env` dérobé, pas de secret en CLI).

**Preflight automatisé (read-only, aucune valeur de secret affichée) :**

```bat
node scripts/automation/b2b-phase2-preflight.cjs
```

Exit 0 = `READY` (schéma GREEN + creds présents + 4 suites PASS + #710 DRAFT/OPEN).
Exit 1 = `NOT READY` avec la ligne exacte qui bloque.

## 0bis. Codes de sortie du CLI

| Code | Signification | Action |
|---|---|---|
| 0 | run nominal (dry ou execute) | poursuivre le runbook |
| 1 | fail-closed : secrets manquants (`--execute`) ou schéma absent (`probeSchema`) ou erreur fatale | STOP — corriger la cause, ne jamais contourner |
| 2 | `SIRENE_CONSUMER_KEY/SECRET` absents et pas de `--from-file` | STOP — attendre les credentials |
| 3 | import tronqué (`--max-pages` atteint) | décider : relancer avec plafond plus haut OU rester sur périmètre courant |

## 1. Vérification schéma (READ-ONLY)

```bat
gh run list --workflow=apply-supabase-schema.yml --limit 1
```

Attendu : `completed  success`. Si RED → STOP + rapporter run ID + log d'erreur exact.

Puis contrôle de présence (lecture seule, service key côté environnement uniquement) :
les tables `companies`, `company_establishments`, `prospect_scores` (+ 8 autres tables Phase 1)
et les colonnes Phase 2 (`ape_label`, `employee_range`, `is_micro_enterprise`, `creation_date`,
`source_updated_at`, `siege`, composantes de score 25/25/20/15/10/5).

## 2. Tests Phase 2 (local)

```bat
node scripts/tests/b2b-scoring.test.cjs          rem 42 assertions
node scripts/tests/sirene-import.test.cjs        rem 81 assertions
node scripts/tests/b2b-phase2-guards.test.cjs    rem 33 assertions
node scripts/tests/b2b-sales-engine-schema.test.cjs  rem 95 assertions
```

Attendu : 251/251 PASS, `exit 0` ×4. Tout échec → STOP, pas de dry-run réel.

## 3. Dry-run SIRENE réel (lecture API seule, zéro Supabase)

```bat
node scripts/automation/sirene-mq-import.cjs
```

Invariants à vérifier dans la sortie :
- `[sirene-import] DRY-RUN (aucune écriture) · dept=972 · source=sirene`
- `SUMMARY` : `dry_run:true`, `http_calls:0`, `by_status`, compteurs `fetched/normalized/invalid/deduped`
- pagination : `[sirene] page N` ; `total` annoncé par l'API cohérent avec le cumul
- **aucun** write PostgREST, **aucun** contact/email/téléphone, **aucune** valeur de secret

Rapport à produire : volume total, répartition A/F/unknown (entreprises ET établissements),
top 10 APE, nb de sièges, doublons détectés en flux, erreurs/429, cohérence vs attentes.

## 4. STOP — proposition d'execute (approbation explicite requise)

Commande proposée (NON lancée sans approbation) :

```bat
node scripts/automation/sirene-mq-import.cjs --execute --max-pages 1
```

| Paramètre | Valeur |
|---|---|
| Périmètre | 1 page curseur SIRENE, dept 972 |
| Volume max lu | 1000 établissements (page size fixe client) |
| Écritures max | ~1 POST `data_sources` + ≤5 POST batches `companies` + ≤5 POST batches `company_establishments` + PATCH éventuels |
| Objets créés max | ≤1000 établissements, ≤1000 entreprises, 1 source |
| Idempotence | rejouer la même commande → attendu **0 POST** (updates de maintenance seules) |
| Fail-closed | `probeSchema()` refuse si tables absentes ; secrets manquants → exit 1 avant toute écriture |

## 5. Conditions d'arrêt immédiat (pendant execute)

Schéma absent · réponse API inattendue · écriture hors périmètre · présence de
contact/email/téléphone dans les lignes · idempotence non vérifiée au second passage
(>0 insert) → STOP + rapport, aucun contournement.

## 6. Rollback

- Avant merge : fermer #710 (rien d'exécuté côté prod DB si execute jamais approuvé).
- Après execute contrôlé : les lignes sont des données légales SIRENE publiques ;
  suppression ciblée possible par `source='sirene'` si invalidation (décision fondateur).
