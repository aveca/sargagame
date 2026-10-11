# SARGAGAME_AUDIT_REPORT — 2026-10-11

> Audit QA autonome. Dépôt : `aveca/sargagame`. Aucune modification poussée, aucun déploiement, aucune transaction réelle.

## 1. Contexte et état du dépôt

| Élément | État observé | Preuve |
|---|---|---|
| Remote | `https://github.com/aveca/sargagame.git` | `git remote -v` |
| Branche au départ | `main` (HEAD `29eddf882`) | `git branch --show-current` |
| Divergence | local **2 commits ahead / 55 behind** `origin/main` (`7fcc91548`) | `git rev-list --left-right --count` |
| Arbre de travail | **sale** : ~8 189 lignes `git status --short` (majoritairement untracked : `.ai/`, audits, `tests/unit/wow-unlock-transition.test.cjs`…), 19 stashes préservés | `git status --short` |
| Branche de travail créée | `agent/qa/fix-mollie-return-antireplay-20261011` (2 commits locaux, NON poussée) | `git log` |
| Outils | Node 24.14.0 · npm 11.9.0 · Playwright 1.62.1 · PHP 8.4.22 (CLI) | `logs/` |
| Dernier déploiement prod réussi | `cloudflare-production.yml` — 2026-10-11T02:23Z (succès) | `gh run list` |

## 2. Inventaire des applicatifs (preuves)

- **Frontend** : Vite 5 + React 18 (`src/`, entry `src/main.jsx` → `Sargasses_PROD.jsx`), build = `npm run build` (dist/).
- **Régions** (`regions/*.json` + domaines) : mq=`sargasses-martinique.com`, gp=`sargasses-guadeloupe.com`, florida=`sargassummiami.com`, puntacana=`sargassumpuntacana.com`, rivieramaya=`sargassumcancun.com`, tulum=`sargazotulum.com`, barbados=`sargassumbarbados.com` (staging, DNS absent — attendu).
- **Déploiement prod** : Cloudflare Workers (`workers/sargagame/`, 1 worker par région, `run_worker_first:true`, garde dotfiles/.htaccess/_private). Matrice `cloudflare-production.yml` : mq, gp, florida, puntacana, rivieramaya — **tulum uniquement via `deploy-live.yml`**.
- **Backend** : Worker `sargagame` (mollie.php → Mollie API + Supabase `payment_grants`, webhook HMAC fail-closed, `/api/apple-pay-domain-association` allowlisté) ; workers annexes `b2b-api`, `outreach`, `sg-payments`, `supabase-proxy` ; PHP legacy (`public/api/*.php` — 37 fichiers, tous lint OK).
- **Services externes** : Supabase `rswdmjtdzrucqzzukfmd.supabase.co` (URL publique en vars), Mollie (clé en secrets GH/serveur — jamais affichée), Stripe (legacy lecture seule), Apps Script (beacon analytics), GA4, Clarity, Cloudflare Insights.
- **Variables sensibles** : présentes en secrets GH/`wrangler` vars, **jamais lues ni affichées** (conformité mission). À noter (déjà documenté NEXT_SESSION.md) : `webhook_secret` commenté dans le `mollie-config.php` FTP legacy, et ancienne clé live Mollie mentionnée dans un fichier gitignore — rotation recommandée cf. NEXT_SESSION.

## 3. Résultats clés

### Défauts confirmés et corrigés localement (branche `agent/qa/fix-mollie-return-antireplay-20261011`, non poussée)

| ID | Gravité | Défaut | Correctif local | Vérif |
|---|---|---|---|---|
| MP-1 | **P1** | Anti-replay absent au retour Mollie 3DS : `sg_mollie_pending` purgé seulement de sessionStorage (localStorage conservé) + aucun marqueur `sg_mollie_done_<id>` → revisite de `/?mollie_return=1` = re-grant du pass + re-track `sg_conversion` (extension indéfinie du pass possible) | `src/Sargasses_PROD.jsx` : marqueur idempotence + purge des 2 stockages (commit `168ee3b55`) | T5 E2E rouge → **vert** ; smoke + build + bundle verts après |
| AP-1 | **P1** | `/.well-known/apple-developer-merchantid-domain-association` → **404 prod sur les 6 domaines** (fichier présent en dist local ; l'allowlist worker ne couvre que `/api/apple-pay-domain-association`, qui répond 200). Apple Pay invérifiable → indisponible au checkout | `workers/sargagame/index.js` : réécriture explicite chemin canonique → asset déployé + garde `.well-known` fail-closed (commit `ac40caaeb`) | `node --check` OK ; **nécessite déploiement pour vérif prod** |
| TU-1 | **P1** | `sargazotulum.com/data/region-outlines/tulum.json` → **404 prod** ; fichier présent localement mais **jamais commité** (untracked) → carte Tulum sans contour (0 maplabel observé) | ajout du fichier au repo (même commit) | `Test-Path` local OK ; **nécessite déploiement** |

### Défauts confirmés, NON corrigés (décision produit requise)

| ID | Gravité | Défaut | Pourquoi pas corrigé |
|---|---|---|---|
| MP-2 | **P1 (décision produit)** | `?pass=pNN` **sans `session_id`** accorde immédiatement un pass premium (ex. `?pass=p120` = 120 jours). Reproduit en local (probe `p0-pass-grant.cjs`, capture) ; présent aussi dans le bundle prod actuel (`origin/main` + asset live vérifié). MAIS le design `comps.php` documente les liens `?pass=` comme **cadeaux volontairement honor-system**. Tension test T4 (contrat 2026-08-23 : « pas de grant sans session_id ») vs design actuel | Changement d'intention produit + risque funnel/cadeaux → à trancher par le fondateur. Option proposée : exiger `session_id` OU jeton signé HMAC pour les liens cadeaux |
| AN-1 | **P2** | CSP trop stricte : bloque `r.clarity.ms`/`o.clarity.ms` (Clarity KO) et `static.cloudflareinsights.com` (beacon RUM KO) sur tous les domaines ; erreurs console permanentes | Ajustement CSP aux headers worker — requiert validation seo/analytics + déploiement |
| AN-2 | **P2** | `sg_track_queue`/beacons Supabase `analytics_events` en `ERR_ABORTED` en contexte Playwright (probable blocage réseau/CORS intermittent) — métriques partiellement aveugles | À investiguer avec accès observabilité Supabase/CF |
| TU-2 | **P2** | Affichage « DONNÉE EN RETARD » sur homepage MQ desktop alors que `sargassum.json` `updatedAt` est frais (2026-10-10T21:51Z) — probablement basé sur `erddapTimestamp` satellite plus ancien ; affichage honnête mais à vérifier | Comportement de fraîcheur à qualifier (produit) |

### Défaillances de tests (harnais, PAS le produit)

| Test | Cause démontrée | Statut |
|---|---|---|
| `tests/unit/wow-unlock-transition.test.cjs` (1/220) | Fichier **untracked local**, absent d'`origin/main` ; teste un split `src/PremiumModal/` jamais intégré (le dossier est orphelin hors `VeilleurMark` ; `PremiumModal.jsx` est le paywall live et n'importe plus `OnsiteCheckout`) | Artifact local, pas une régression produit |
| T1 money-path (`aria-label="Commencer maintenant"`) | Sélecteur obsolète : le CTA existe en **texte** (« Commencer maintenant → », vérif. capture prod) après une étape « Voir le prix → » ; le paywall live n'a pas cet aria-label | Harnais à mettre à jour |
| T4 money-path (grant sans session_id) | Contrat aspirant jamais mergé, en conflit avec le design cadeaux `?pass=` (→ MP-2) | Décision produit d'abord |
| funnel-payment (events `sg_session_start`) | Le harnais wrappe `window.track`, **qui n'a jamais existé** (le `track` de l'app est un export ESM ; les events critiques sont poussés dans `localStorage.sg_track_queue`) | Harnais à réécrire sur `sg_track_queue` |
| T2/T3/T6 | déjà `test.fixme` documentés dans le repo | Connu |

## 4. Points positifs vérifiés

- Les **6 domaines prod répondent 200**, titres/i18n corrects, cartes rendues (MQ 53 labels, GP 83, Miami 20, Punta Cana 12, Cancún 20 ; Tulum 0 → voir TU-1).
- **Pipeline données frais** : `sargassum.json` `updatedAt=2026-10-10T21:51Z` sur tous les domaines (jour J).
- Paywall live OK sur prod (GP mobile) : Pass 30 j 14,99 €, CTA, mentions Mollie/sans engagement (capture).
- Gate de ship complet **vert après correctifs** : build exit 0, bundle 206.5 Ko ≤ 210 Ko, PHP 37/37 lint OK, ux-smoke 4/4 tokens, tests unitaires 174/220 (échec = artifact local uniquement).
- Webhook Mollie : signature HMAC **fail-closed** (503 si secret absent) côté Worker — bon.
- Aucun secret affiché ; aucune donnée client créée ; aucune transaction réelle.

## 5. Ce qui reste à faire (ordre conseillé)

1. **Fondateur** : autoriser push + merge de `agent/qa/fix-mollie-return-antireplay-20261011` (MP-1 + AP-1 + TU-1) → déploiement auto, puis re-vérifier `/.well-known/apple-developer-merchantid-domain-association` (200) et `tulum.json` (200) en prod.
2. Trancher MP-2 (`?pass=` sans preuve) — décision produit (garde cadeaux vs hardening).
3. Corriger la CSP (Clarity + Insights) — perte d'observabilité marketing.
4. Réparer/retirer les harnais obsolètes (committer une version à jour de `money-path-regression.spec.ts` T1/T4 ou les supprimer ; idem funnel-payment).
5. Rattraper le retard local : `main` local = 55 commits derrière `origin/main`.
