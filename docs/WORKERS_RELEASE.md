# Release Workers — runbook (architecture « Workers first »)

> Document de référence pour **déployer les six Workers régionaux** de Sargagame.
> Écrit le 2026-11-07 (mission P0 « Workers first, freshness, PHP exposure »).
> **Aucune release n'a été exécutée depuis ce document** : il décrit la
> procédure, son ordre exact des garde-fous et son rollback.

---

## 1. Architecture : pourquoi les Workers, pas les Pages

Les **six domaines publics** sont servis par **six Workers** Cloudflare
(`sargagame-<region>`), via des routes catch-all `<domaine>/*` et un binding
`ASSETS` vers le dossier régional préparé.

Les **six projets Pages** (`*.pages.dev`) sont **secondaires** : ils ne
portent **aucun domaine personnalisé**. Une publication|Pages-only ne peut
donc pas atteindre les six domaines publics — c'est ce qui a fait échouer la
release code-only du run `42227027205` (12 défauts bloquants
`stale-current-decision` relevés par le gate `verify`).

| Région | Domaine public | Worker | Projet Pages (secondaire) |
|---|---|---|---|
| `mq` | `sargasses-martinique.com` | `sargagame-mq` | `sargagame` |
| `gp` | `sargasses-guadeloupe.com` | `sargagame-gp` | `sargagame-gp` |
| `florida` | `sargassummiami.com` | `sargagame-florida` | `sargagame-florida` |
| `puntacana` | `sargassumpuntacana.com` | `sargagame-puntacana` | `sargagame-puntacana` |
| `rivieramaya` | `sargassumcancun.com` | `sargagame-rivieramaya` | `sargagame-rivieramaya` |
| `tulum` | `sargazotulum.com` | `sargagame-tulum` | `sargagame-tulum` |

`barbados` est hors-ligne (`live: false`) : il ne fait pas partie de la flotte.

> **Preuve de routage (niveau bord, pas API).** Le 2026-11-07, les six
> domaines ont répondu HTTP 200 avec un payload identifiant le Worker
> (`worker: "<region>"`), et 4/4 routes inspectées sont Worker-only. La lecture
> des **objets de routage Cloudflare** (`pages_domains_list`,
> `workers_domains_list`, `workers_routes_list`, `zones_list`) n'a **pas** pu
> être faite : le scope OAuth du MCP l'exige, et cette autorisation n'a pas
> été accordée. La preuve d'attachement au niveau API reste donc **à produire**.

---

## 2. Le pipeline de release (ordre réel des jobs)

Tout se joue dans `.github/workflows/cloudflare-production.yml`. Les jobs sont
**sérialisés par `needs`** : l'ordre ci-dessous n'est pas décoratif, il est
le contrat.

| # | Job | Rôle | Condition de passage |
|---|---|---|---|
| 1 | `scope` | Détermine si le run est un parcours de **production** (`production: true`). `push` sur `main`, `workflow_dispatch` sur `main`, ou `workflow_run` du workflow Copernicus réussi sur `main`. | `production == 'true'` |
| 2 | `build` | Build des 6 régions + contrôles. Contient le **gate de fraîcheur 900 min** (les six régions) : `Pre-deploy satellite freshness gate`. | build + gate frais |
| 3 | `certification-gate` | `node scripts/CHECK_certification_status.cjs --mode deploy --wait-ms 1200000` : exige `test-frontend` **et** `perf` **verts sur le SHA EXACT** qui va être déployé. Attente bornée (20 min) pour éviter la course gate ↔ CI. | checks verts sur le SHA déployé |
| 4 | `mollie-live-gate` | Exige `MOLLIE_API_KEY` en mode **`live_*`**, `SUPABASE_SERVICE_KEY` et `MOLLIE_WEBHOOK_SECRET` non vides. **Les valeurs ne sont jamais affichées.** | secrets présents et live |
| 5 | `deploy` | Pour chaque région : `Build region` → `Prepare domain site (prepare-ftp)` → `Validate deploy HTML CSP` → `Guard regional data separation` → `Generate Wrangler config` → **`Recheck satellite freshness immediately before Worker deploy`** → `Deploy Worker` (`wrangler deploy --strict`) → `Configure Worker secrets` → `Smoke test` → `Verify deploy fingerprint` → `Payment API smoke`. | deploy + empreinte + smoke |
| 6 | `deploy-pages` | Publication **secondaire** `*.pages.dev` (artefact code-only, sans PHP). Contient son propre **`Recheck satellite freshness immediately before Pages deploy`**. | idem |
| 7 | `post-deploy-verify` | Contrôles HTTP réels sur les domaines live : accessibilité, artefact `v`/`b`, fraîcheur des données, cohérence région ↔ plages, paramètres régionaux/GA4, `?sos=1`, contrat paiement (`__payment_smoke__` → 400 attendu). | toutes les preuves réelles |
| 8 | `verify-fleet` | Cohérence de la flotte + gardes SEO en live. | flotte cohérente |

### Points de vigilance

- **Le gate de fraîcheur est DOUBLE** : une fois dans `build` (les six
  régions), une fois **juste avant** `wrangler deploy` dans `deploy`, et une
  fois juste avant le déploiement Pages. Un garde-fou unique « en amont » ne
  protège pas d'une observation qui devient périmée pendant le build.
- **`vars.CLOUDFLARE_DEPLOY_ENABLED == 'true'`** est requis par le job
  `deploy` : sans cette variable, le run construit et contrôle mais **ne
  déploie pas**.
- **Un `HTTP 200` n'est pas une preuve de fraîcheur ni de paiement.** Le
  `Smoke test` du job `deploy` ne vérifie que le code HTTP ; la preuve de
  fraîcheur est `Verify deploy fingerprint` + `post-deploy-verify`, et la
  preuve de paiement est `Payment API smoke` (un `POST` de contrat qui doit
  être **refusé en 400**, jamais un 200 de « ça marche »).
- **Les secrets** (`MOLLIE_API_KEY`, `SUPABASE_SERVICE_KEY`,
  `MOLLIE_WEBHOOK_SECRET`) sont (re)posés **après** chaque déploiement
  Worker : un déploiement qui échoue avant cette étape laisse le Worker
  précédent en place, avec ses secrets.

---

## 3. Pré-requis avant de lancer

1. **L'observation satellite est dans le SLA (900 min).**
   `scripts/autopilot/check-predeploy-satellite-freshness.cjs` porte
   `MAX_AGE_MINUTES = 900` et **refuse** tout déploiement quand l'observation
   est plus ancienne. Ce garde-fou est **fail-closed et ne doit pas être
   abaissé** : c'est le contrat honnêteté du produit (le verdict courant est
   suspendu au-delà du SLA).
   *Au 2026-11-07, l'observation live datait du 2026-10-27T12:00:00Z (âge
   ≈ 16 128 min, ≈ 17,9× le SLA) : toute release était donc refusée par ce
   garde-fou, indépendamment de tout autre problème.*
2. **La CI est verte sur le SHA exact** (`test-frontend` + `perf`).
3. **Les secrets de paiement live** sont configurés dans le dépôt.
4. **`vars.CLOUDFLARE_DEPLOY_ENABLED == 'true'`.**
5. **Le payload Copernicus publié** est cohérent avec les régions (le
   `Guard regional data separation` refuse le mélange de plages).

---

## 4. Procédure

```bash
# 0. Partir d'un main à jour et lisible
git fetch origin main
git checkout main && git pull --ff-only
git log -1 --format='%H %s'            # SHA candidat

# 1. Vérifier les pré-requis LOCAUX (build, budget, contrat de fraîcheur)
npm ci
npm run build
node scripts/check-bundle-budget.cjs    # ≤ 210 Ko gzip eager
node scripts/automation/freshness-contract-check.cjs --base http://127.0.0.1:4173
node scripts/automation/user-journey-audit.cjs --base-url http://127.0.0.1:4173

# 2. NE PAS lancer la release à la main depuis une branche :
#    la release se déclenche par push sur main, ou par le dispatch
#    scripts/automation/trigger-production-deploy.cjs (utilisé par le
#    workflow Copernicus après publication des données).
```

Un déploiement manuel, si strictement nécessaire :

```bash
gh workflow run cloudflare-production.yml --ref main
```

> Le job `scope` n'accepte le `workflow_dispatch` **que sur `main`** : un
> dispatch depuis une branche effectue le build et les contrôles, mais
> **aucun déploiement** (parcours explicitement « NON APPLICABLE »).

---

## 5. Preuves : ce qu'un run prouve, et ce qu'il ne prouve pas

Un run réussi fournit, **par région** :

| Preuve | Où |
|---|---|
| Le SHA exact déployé est celui qui a passé la CI | `certification-gate` + `Verify deploy fingerprint` (compare le `(v, b)` réellement servi) |
| Le Worker répond en HTTP 200 sur son domaine | `Smoke test` |
| Les secrets de paiement sont posés | `Configure Worker secrets` + `mollie-live-gate` |
| Le contrat de paiement refuse une requête smoke | `Payment API smoke` (400 attendu) |
| Les données live sont fraîches et cohérentes avec la région | `post-deploy-verify` |
| La flotte est cohérente | `verify-fleet` |

**Ne prouve PAS** : qu'un paiement a réellement été encaissé (il faut une
transaction réelle de test), ni que les données scientifiques sont *juste*
(le pipeline ERDDAP reste la source unique), ni l'attachement API des domaines
aux Workers (voir §1).

---

## 6. Rollback

### 6.1 Rollback applicatif (recommandé)

```bash
git revert <bad-commit> --no-edit
git push origin main          # déclenche le re-deploy automatique (< 15 min)
```

Le pipeline de déploiement est **idempotent et rejouable** : un revert
rejoue exactement la même chaîne de gates. Un rollback **doit** passer par
les gates (pas de `wrangler deploy` manuel hors pipeline) : c'est la seule
façon de conserver la traçabilité (traces `scripts/traces/`, empreintes,
post-deploy-verify).

### 6.2 Rollback Pages (secondaire)

Le workflow `pages-code-only-release.yml` dispose de son propre mécanisme :
`scripts/automation/pages-code-only-rollback.cjs capture` (avant publication)
puis `... rollback` (après échec). Le run `42227027205` a exercé ce chemin
avec succès (rollback vert, production intacte).

### 6.3 Ce qu'il ne faut PAS faire

- Ne pas abaisser `MAX_AGE_MINUTES` pour « débloquer » une release : le
  garde-fou protège le contrat produit, pas le confort de l'opérateur.
- Ne pas déployer manuellement un Worker hors du pipeline : cela casse la
  traçabilité et peut laisser les secrets non posés.
- Ne pas supprimer une route pour « tester » une autre architecture : le
  routage est couvert par le contrat de la mission (6 domaines, Workers
  conservés, aucune route supprimée).

---

## 7. Autorisations fondateur requises

| # | Autorisation | Pourquoi elle est requise | Effet si accordée |
|---|---|---|---|
| 1 | **Lever ou assouplir le gate de fraîcheur 900 min** | L'observation live est hors SLA (≈ 17,9×) ; le gate refuse toute release. Abaisser le garde-fou exposerait le produit à afficher un verdict courant sur une donnée périmée — le défaut exact que la mission combat. | Permet une release, au prix de l'honnêteté produit. **Recommandation : ne pas le faire ; densifier la publication à la place.** |
| 2 | **Fusionner la cadence dense Copernicus** (`*/15 0-2 * * *`) | Chaque tick dense qui publie une observation dispatche `cloudflare-production.yml` → jusqu'à 12 déploiements dans la fenêtre de capture. | Plus de fraîcheur (donc des verdicts corrects), au prix du volume de déploiements. |
| 3 | **Arbitrage architecture A/B** | A) attacher les six domaines aux projets Pages et supprimer les routes catch-all Workers ; B) rester en Workers (option retenue par la mission). | A impliquerait une migration de routage et de secrets ; B ne demande qu'une release Workers. |
| 4 | **Scopes OAuth Cloudflare (MCP)** | `pages_domains_list`, `workers_domains_list`, `workers_routes_list`, `zones_list` exigent une autorisation utilisateur : l'attachement des domaines au niveau API n'a pas pu être prouvé. | Permet de transformer la preuve de routage « niveau bord » en preuve « niveau API ». |
| 5 | **Exécution d'un backfill Mollie** | 6 ventes non livrées (cf. `.ai/tasks.md`). | Nécessite une exécution autorisée et un double contrôle. |

---

## 8. Références

- Workflow : `.github/workflows/cloudflare-production.yml`
- Workflow Pages (secondaire) : `.github/workflows/pages-code-only-release.yml`
- Gate de fraîcheur : `scripts/autopilot/check-predeploy-satellite-freshness.cjs`
- Certification : `scripts/CHECK_certification_status.cjs`
- Déclenchement après publication : `scripts/automation/trigger-production-deploy.cjs`
- Contrat de décision (fail-closed) : `scripts/automation/lib/detail-decision-ui.cjs`
- Audit parcours : `scripts/automation/user-journey-audit.cjs`
- Données : `docs/DATA-PIPELINE.md`
- Opérations : `docs/OPERATIONS.md`
