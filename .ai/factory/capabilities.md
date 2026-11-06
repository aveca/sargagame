# Capacités de connexion Factory V3 — `aveca/sargagame`

> **Vérifié le 2026-11-06 10:50 UTC.** Relevé de faits **réellement observés**, pas de
> suppositions. Aucune valeur de secret n'est consignée ici : seuls des noms, des
> emplacements et des résultats de lecture.
>
> **Revérification en une commande** (lecture seule, aucun déploiement) :
> ```bash
> node scripts/factory-v3/probe-capabilities.cjs
> ```
> Code de sortie `0` = `CONNECTION_OK`. `--write-state` réécrit
> `scripts/factory-v3/state/config.json` (instantané machine-lisible).

---

## 1. Connexion GitHub

| Élément | Valeur vérifiée |
|---|---|
| Binaire | `C:\Program Files\GitHub CLI\gh.exe` (alias `gh`) |
| Version | `gh version 2.103.3 (2026-10-26)` |
| Protocole git | `https` |
| Compte authentifié | **`aveca`** — id `15622068`, type `User`, e-mail `yacovassaraf@gmail.com` |
| Stockage du jeton | **keyring** du système (`gh auth status` → `✓ Logged in to github.com account aveca (keyring)`) |
| Portées du jeton | `gist`, `read:org`, `repo`, `workflow` |

**Aucune nouvelle authentification n'a été créée.** `gh auth login` n'a pas été lancé : la
session existante suffit et est plus large que le minimum requis.

## 2. Identité et permissions sur le dépôt

| Élément | Valeur vérifiée |
|---|---|
| Dépôt | `aveca/sargagame` — **public**, non archivé, non désactivé |
| Branche par défaut | `main` |
| `permissions` | `admin: true`, `maintain: true`, `push: true`, `pull: true`, `triage: true` |
| Suffisant pour piloter Actions (read **et** write) | **OUI** |

Les permissions demandées sont donc couvertes :

| Permission requise | Comment elle est satisfaite |
|---|---|
| Actions — Read and write | `permissions.admin = true` sur le dépôt + portée `repo` |
| Contents — Read | `permissions.pull = true` + `GET /repos/aveca/sargagame` vérifié |
| Metadata — Read | `GET /api/user` et `GET /repos/aveca/sargagame` vérifiés |
| Actions variables — Read | `GET /repos/aveca/sargagame/actions/variables` vérifié |

## 3. Accès GitHub Actions (lecture)

| Élément | Résultat |
|---|---|
| Workflows listables | **56** (`GET /actions/workflows`) |
| Runs listables | **17 926** au total (`GET /actions/runs`) |
| Jobs d'un run | lisibles (`GET /actions/runs/{id}/jobs`) |
| **Logs d'un job** | **LISIBLES** — `GET /actions/jobs/{id}/logs` renvoie le texte brut (~59 Ko sur le run `42192193940`, job `127806661736`) |
| Secrets — **noms** | **50** listables (`GET /actions/secrets`). **Valeurs jamais lues** : l'API ne les retourne pas |
| Variables | **1** listable (`GET /actions/variables`) |

> Note d'implémentation : `gh api` refuse la sortie brute des logs CI à cause des codes
> ANSI. Il faut passer `--allow-escape-sequences` (sans `--include`).

### Variable Actions demandée

| Variable | Valeur lue | Créée | Modifiée |
|---|---|---|---|
| **`CLOUDFLARE_DEPLOY_ENABLED`** | **`true`** | 2026-10-03T20:22:15Z | 2026-10-03T20:22:15Z |

C'est l'unique variable du dépôt. Elle **ouvre** la porte `gate` du workflow
`pages-code-only-release.yml` — mais ne l'ouvre **pas** seule (voir §7).

### Workflow cible `pages-code-only-release.yml`

| Élément | Valeur vérifiée |
|---|---|
| Identifiant | `409119247` |
| Nom | `Pages Code-Only Release` |
| Chemin | `.github/workflows/pages-code-only-release.yml` |
| État | `active` |
| **Runs passés** | **0** — jamais déclenché |
| Déclencheur | `workflow_dispatch` uniquement, entrée `confirm_production` (booléen, requis, défaut `false`) |

Le fichier **n'existe pas** dans l'arbre de travail local de la branche
`feature/p0-commercial-conversion-20261105` (il est sur `main`) : le lire demande
`git show origin/main:.github/workflows/pages-code-only-release.yml` ou l'API Contents.

Chaîne du workflow lue : `gate` → `prepare` (matrice 6 régions) → `capture-rollback` →
`deploy-pages` (matrice 6 régions) → `verify` → `rollback` (si `deploy-pages` ou `verify`
échoue). Il utilise `secrets.CLOUDFLARE_API_TOKEN` et `secrets.CLOUDFLARE_ACCOUNT_ID`
(les deux existent) et cible les six projets Cloudflare Pages ci-dessous.

## 4. Accès Cloudflare (lecture)

| Élément | Valeur vérifiée |
|---|---|
| Outil | `wrangler` **4.127.1** |
| Auth | **OAuth** (session partagée de la machine) |
| Emplacement des identifiants | `C:\Users\user\AppData\Roaming\xdg.config\.wrangler\config\default.toml` |
| Compte | `abf2b92cf718313567b4b38eb9dda17f` |
| Portée utile | `pages (write)` → la lecture en découle ; `account (read)`, `zone (read)` |

> **Le jeton OAuth expire (~1 h).** Après expiration, l'API Cloudflare renvoie **401** alors
> que la session est valide. Remède : lancer `npx wrangler whoami` (rafraîchit et réécrit
> `default.toml`) **avant** d'utiliser le jeton. C'est ce que fait désormais
> `probe-capabilities.cjs`. Sans cette précaution, la lecture Cloudflare échoue en 401/429.

### Les six projets Pages de production — tous lisibles

| Projet | Statut | Dernier déploiement production | Date |
|---|---|---|---|
| `sargagame` | LISIBLE | `1b3e7476-bbda-4399-889b-3dfb62c57a57` | 2026-10-28T17:32:26Z |
| `sargagame-gp` | LISIBLE | `b6ca6cd7-2a97-4445-b043-1ef1b60296e1` | 2026-10-28T17:32:47Z |
| `sargagame-florida` | LISIBLE | `ceb44241-693a-4f70-9a7d-df9fb4e36eb6` | 2026-10-28T17:32:59Z |
| `sargagame-puntacana` | LISIBLE | `72a9703e-555f-46cb-a8f6-1e3eb06b3846` | 2026-10-28T17:32:26Z |
| `sargagame-rivieramaya` | LISIBLE | `0a682214-c0dc-4508-98a6-c5ce3a24996c` | 2026-10-28T17:32:22Z |
| `sargagame-tulum` | LISIBLE | `ca978533-ab92-437c-862e-52e101abbc5c` | 2026-10-28T17:32:14Z |

Les six projets sont servis par `main` (pas de branche `production` séparée) et leurs
déploiements sont **synchronisés** (même source `164d70f` pour les six).

## 5. Garde-fou de déploiement — pourquoi un merge sur `main` déploie

C'est le point le plus important pour les prochaines missions.

| Workflow | Se déclenche sur push `main` ? | `paths-ignore` |
|---|---|---|
| `cloudflare-production.yml` | **OUI** | `AGENTS.md`, `.github/workflows/daily-copernicus.yml`, `.github/workflows/cloudflare-production.yml` |
| `daily-copernicus.yml` | **OUI** | `AGENTS.md`, `.github/workflows/daily-copernicus.yml`, `.github/workflows/cloudflare-production.yml` |
| `ci-tests.yml` | OUI (CI seulement) | — |
| `perf-budget.yml` | OUI (CI seulement) | — |

**Conséquence : merger sur `main` un changement qui touche autre chose que `AGENTS.md` ou
ces deux fichiers de workflow déclenche `cloudflare-production.yml`, donc un déploiement de
production (front statique + Worker).** Pendant une phase de simple connexion, il faut donc
**pousser une branche et ouvrir une PR sans merger**.

En revanche, la CI de PR (`ci-tests.yml`, `perf-budget.yml`) est **sûre** : elle construit,
teste et audite, mais ne déploie pas.

## 6. Ce qui n'a **pas** été fait

- Aucun workflow déclenché (`workflow_dispatch`), aucun déploiement.
- Aucun checkout, aucun paiement, aucun e-mail, aucun secret créé/modifié/lu en valeur.
- Aucun Worker touché. Aucun D1/R2/Supabase écrit. Aucune migration. Aucun DNS. Aucun cache purgé.
- Aucun changement sur les autres dépôts.
- Aucune nouvelle authentification GitHub ; aucune permission modifiée.

## 7. Réutilisation

Pour une mission ultérieure :

1. **Vérifier la connexion** : `node scripts/factory-v3/probe-capabilities.cjs` (sortie `0`).
2. **Lire l'état** : `scripts/factory-v3/state/config.json` → `capabilities`.
3. **Déclencher un workflow autorisé** : via `gh workflow run <fichier> --repo aveca/sargagame -f <input>=<valeur>`.
   Pour `pages-code-only-release.yml`, les trois conditions du job `gate` sont cumulatives :
   `github.ref == refs/heads/main` **ET** `inputs.confirm_production == true` **ET**
   `vars.CLOUDFLARE_DEPLOY_ENABLED == 'true'`. Les deux dernières sont **déjà vraies** ; il ne
   reste que le dispatch sur `main` avec `confirm_production: true`.
4. **Surveiller** : `gh run list --repo aveca/sargagame` puis `gh run watch <id>`.
5. **Cloudflare** : rafraîchir d'abord le jeton (`npx wrangler whoami`) avant toute lecture.

## 8. Observation hors périmètre (à traiter séparément)

Au 2026-11-06, les six sites live sont servis par un déploiement du **2026-10-28**, soit
**202 commits derrière `main`**. Le run `Cloudflare Production` `42192193671` sur `main`
`5382a829c` est en **échec**. La chaîne de déploiement paraît donc **bouchée depuis ~9 jours**.

Cette observation est **signalée, pas corrigée** : elle sort du périmètre de la mission de
connexion (aucun déploiement autorisé, aucun checkout, aucun Worker). Elle appelle une
mission dédiée de diagnostic du workflow `cloudflare-production.yml`.
