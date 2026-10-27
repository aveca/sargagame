# Rapport Mission 1/10 — État de départ vérifié de aveca/sargagame

**Date :** 2026-10-27  
**Dépôt :** `aveca/sargagame`  
**SHA de référence :** `d2b05adec` (merge PR #1089 `agent/coding/p0-first-screen-chat`)  
**Branche de travail :** `sargagame-m1` (worktree isolé, issu de `main`)  
**Worktree :** `C:/Users/user/.local/share/opencode/worktree/07c2ee/sargagame-m1`

---

## 1. Contexte et périmètre confirmé

6 domaines régionaux confirmés dans le code (`regions/index.cjs` + `regions/*.json`) :
| Région (id) | Domaine public | Langue | Devise | Statut |
|---|---|---|---|---|
| `mq` | sargasses-martinique.com | fr | EUR | Core, live |
| `gp` | sargasses-guadeloupe.com | fr | EUR | Core, live |
| `florida` | sargassummiami.com | en | USD | Non-core |
| `puntacana` | sargassumpuntacana.com | en | USD | Non-core |
| `rivieramaya` | sargassumcancun.com | es | USD | Non-core |
| `tulum` | sargazotulum.com | es | USD | Non-core |

Barbade est préparée mais NON live (`regions/barbados.json`, résidus Stripe).

Déploiement : build Vite → `dist/` → `scripts/prepare-ftp.cjs` → dossiers FTP par région → upload manuel/FTP. Cloudflare Worker (`workers/sargagame/index.js`) sur `workers.dev` + routes domaines custom configurées manuellement dans le dashboard. `wrangler.template.jsonc` avec `run_worker_first: false`.

Outils vérifiés : terminal Git/Node/PHP, esbuild, `npm run build`, `npx esbuild`, `php -l`, Playwright (Chromium), `check-budget-budget.cjs` (seuil 210 Ko), `ux-smoke.mjs` (4 tokens), tests unitaires Node (`tests/unit/`).

---

## 2. Revalidation des issues prioritaires (contrat Mission 1)

### #1076 — `run_worker_first=false` / exposition assets sensibles — DÉFAUT CONFIRMÉ

**Preuve :** `wrangler.template.jsonc` lignes 12-18 : `"run_worker_first":false`.  
Le Worker (`workers/sargagame/index.js` lignes 243-251) contient une garde fail-closed (`/_private/`, dotfiles, `.php`, `.htaccess`, `.env` → 404 neutre), mais elle n'est invoquée **QUE quand le Worker est appelé**. Avec `run_worker_first=false`, Cloudflare sert les assets statiques compatibles directement par l'edge **sans invoquer le Worker** → un fichier `/api/.htaccess`, `/.htpasswd`, `/_private/forecast-full.json` déposé dans les assets serait servi en clair, contournant la garde.

**Constat supplémentaire :** le test `tests/unit/worker-private-guard.test.cjs` (lignes 57-62) accepte `run_worker_first=false` et vérifie uniquement la présence textuelle de `public/.assetsignore`. Il ne vérifie **pas** que l'arteifact déployé (`dist/` / dossier FTP) exclut effectivement ces fichiers. Un fichier sensible présent dans `dist/` passerait le test.

**Propriété :** issue #1076 ouverte. Branche candidate `fix/sargagame-worker-asset-routing` (commit `5de79b8b3`) existe mais n'est **pas** sur main (merge-base non ancêtre).

→ Action : Mission 2 (sécurité Worker/assets).

### #1084 — IDs analytics partagés Tulum / Riviera Maya — DÉFAUT CONFIRMÉ

**Preuve :** `regions/tulum.json` et `regions/rivieramaya.json` partagent exactement les mêmes valeurs :
- `onesignalAppId`: `02cdb926-71a8-4f1a-8ccf-12ed292252d0`
- `ga4Id`: `G-YHCQGRPG8G`
- `clarityProjectId`: `x4ox737k79`

Le partage peut être intentionnel (à confirmer) ; a priori une isolation par domaine est attendue pour l'attribution du funnel (Mission 8).

→ Action : Mission 8 (analytics).

### #1024 — Widget hôtelier 29 € vs page canonique 79 €/690 €

CLAUDE.md (bloc maître, ligne 19 + 291) : pricing B2B arrêté par panel 2026-06-29 : **Pro 79 €/mois ou 690 €/an** (essai 30 j), Brief 29 € = decoy. Source unique : `scripts/automation/mollie-paylinks.cjs` (TIERS) pour l'annuel, `mol_b2b_plans()` dans `public/api/mollie-lib.php` pour le mensuel. Le widget doit afficher 79 €/mo ou 690 €/an, pas 29 €/mo comme prix principal.

→ Action : Mission 6 (B2B/offre/prix). À vérifier côté widget sans choisir de prix arbitraire.

### #1068/#1072 — Index plages `/beaches/` ou `/playas/` 404 régions USD

PR #1072 présentée comme correctif. État à revalider sur main. À traiter en Mission 4 (routes SEO).

### #1056/#1058 — Données sargassum.json périmées (>900 min)

À mesurer sur les 6 domaines (erddapTimestamp vs updatedAt, stale). À traiter en Mission 3 (freshness).

### #781/#715/#716 — PR checkout conflictuelles, chute onsite→Mollie

NEXT_SESSION.md documente des corrections déjà mergées (mollie.php `terminal`, PremiumModal erreurs, Sargasses_PROD terminal status). Build + smoke OK (2026-07-30/31). Reste : `webhook_secret` commenté dans `mollie-config.php` (fail-open) — clé gitignored sur FTP, pas visible localement → `WAITING_FOR_APPROVAL` (action serveur).

→ Action : Mission 5 (checkout B2C), partie sensible bloquée à l'approbation.

---

## 3. Tableau signal → preuve → statut → propriétaire → prochaine action

| Signal | Preuve récente (SHA/fichier/lignes) | Statut | Propriétaire / PR | Dépendance | Prochaine action |
|---|---|---|---|---|---|
| #1076 assets sensibles servis en clair | `wrangler.template.jsonc:18` `run_worker_first:false` ; `workers/sargagame/index.js:243-251` garde contournable | DÉFAUT CONFIRMÉ | Mission 2 | — | Renforcer test sur artefact + `.assetsignore` déployé ; préparer retour `true` si non prouvé sûr |
| #1084 IDs partagés Tulum/Riviera Maya | `regions/tulum.json:38-40`, `regions/rivieramaya.json:38-40` IDs identiques | DÉFAUT CONFIRMÉ | Mission 8 | — | Confirmer intention ; isoler GA4/Clarity/OneSignal par domaine |
| #1024 prix widget 29€ | CLAUDE.md B2B pricing (79/690) vs widget à vérifier | À vérifier | Mission 6 | Décision panel | Auditer widget, ne pas changer de prix arbitrairement |
| #1068 index plages USD 404 | PR #1072 à revalider | À vérifier | Mission 4 | — | Vérifier PR #1072 état/diff/live |
| #1056/#1058 données périmées | À mesurer sur 6 domaines | À mesurer | Mission 3 | — | Mesurer fraîcheur erddapTimestamp/updatedAt/stale |
| #781 checkout Mollie | NEXT_SESSION.md 2026-07-30/31 (fixes mergés) | Corrigé en partie | Mission 5 | Approbation serveur (webhook_secret) | Préparer PR, bloquer déploiement sensible |

SHA de référence pour toutes les missions : `d2b05adec`.

---

## 4. Premier choix d'action

La Mission 2 (sécurité Worker/assets, #1076) est le risque le plus élevé et vérifiable immédiatement : risque de fuite de fichiers privés (`.htaccess`, `.htpasswd`, `_private/`, `.php`) sur les 6 domaines via Cloudflare edge avec `run_worker_first=false`. Aucune correction n'est sur main. Je prépare le correctif et les tests sur l'artefact, en laissant le déploiement de la config sécurité `WAITING_FOR_APPROVAL` si besoin.

La Mission 1 se termine sur cette action concrète (pas un audit qui s'arrête à une checklist).

---

**État de reprise :** branche `sargagame-m1`, SHA `d2b05adec`, rapport `reports/sargagame/M1-etat-maitre-20261027.md`. Prochaine action : Mission 2 (sécurité Worker/assets).
