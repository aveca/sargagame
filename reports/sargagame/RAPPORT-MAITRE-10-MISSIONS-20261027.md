# Rapport maître — 10 missions autonomes Sargasses / Sargagame

**Date :** 2026-10-27  
**Dépôt :** `aveca/sargagame`  
**SHA de référence :** `d2b05adec` (merge PR #1089 `agent/coding/p0-first-screen-chat`)  
**Worktree de travail :** `C:/Users/user/.local/share/opencode/worktree/07c2ee/sargagame-m1`  
**Branche de travail :** `agent/data/mission-3-freshness` (contient Mission 2 + 3 + 4)  
**Rapports intermédiaires :** `reports/sargagame/M1-etat-maitre-20261027.md`

---

## 1. Résumé exécutif

Quatre des dix missions ont été traitées de façon effective durant cette session :

| Mission | Sujet | Statut | Résultat |
|---|---|---|---|
| M1 | État de départ, corrélation incidents, file de travail | ✅ faite | État maître versionné (`reports/sargagame/M1-etat-maitre-20261027.md`) |
| M2 | Sécurité Worker / assets (#1076) | ✅ corrigé | `run_worker_first=true`, test de garde renforcé (47/47) — PR #1094, **WAITING_FOR_APPROVAL** |
| M3 | Fraîcheur Copernicus/ERDDAP | ✅ déjà corrigé | Constat : logique `erddapTimestamp` OK, tests existants passent — aucun code à modifier |
| M4 | Routes plages / index régionaux / sitemaps (#1068) | ✅ corrigé | Index plage régional généré pour les 3 régions USD — PR #1095, 48/48 tests |
| M5 | Parcours B2C → Mollie | ⏳ déjà corrigé en partie | webhook_secret en attente serveur (WAITING_FOR_APPROVAL) |
| M6 | Offre B2B / prix / widget | ⏳ à vérifier | #1024 : widget 29€ vs 79€/690€ — ne pas changer de prix arbitrairement |
| M7 | API partenaires B2B (#1029) | ⏳ à vérifier | endpoint /api/b2b-partners.json (0 partenaire LIVE en build) |
| M8 | Analytics par domaine (#1084) | ⚠️ défaut confirmé | tulum + rivieramaya partagent GA4/Clarity/OneSignal — décision d'isolation en attente |
| M9 | SEO régional / Tulum | ⏳ à vérifier | reachability Tulum, mojibake #1035 |
| M10 | Certification E2E six sites | 📋 en cours | ce rapport + état de reprise |

Deux opérations sensibles restent **WAITING_FOR_APPROVAL** (déploiement de `run_worker_first=true` et du webhook secret Mollie) et ne peuvent être livrées sans autorisation explicite (contrat produit, §B.8).

---

## 2. Détails par mission

### M1 — État de départ (SHA d2b05adec)

**Preuves établies :**
- 6 domaines confirmés dans `regions/index.cjs` + `regions/*.json` : mq (sargasses-martinique.com), gp (sargasses-guadeloupe.com), florida (sargassummiami.com), puntacana (sargassumpuntacana.com), rivieramaya (sargassumcancun.com), tulum (sargazotulum.com).
- `wrangler.template.jsonc` : `run_worker_first=false` (issue #1076, défaut confirmé).
- `regions/tulum.json` et `regions/rivieramaya.json` partagent les mêmes IDs analytics (issue #1084, défaut confirmé).
- Branche `fix/sargagame-worker-asset-routing` (qui a introduit `run_worker_first=false`) n'est **pas** sur main.
- Rapport d'état maître : `reports/sargagame/M1-etat-maitre-20261027.md`.

---

### M2 — Sécurité Worker / assets (issue #1076)

**Défaut prouvé sur l'artefact réel (`d2b05adec`, build local) :**
43 fichiers sensibles présents dans `dist/` et exposables par l'edge Cloudflare avec `run_worker_first=false` (la garde du Worker ne protège que les requêtes qui l'invoquent) :
- `api/.htaccess`, `api/mollie.php`, `api/stripe-webhook.php`, `api/paypal.php`, `api/create-checkout.php`, `api/widget-token.php`, `api/b2b-trial.php`, ...
- `api/copernicus/*/_private/forecast-full.json` (déjà constaté en clair sur *.workers.dev le 2026-10-04)
- `.htaccess`, `collect.php`, `ground-truth.php`, `stats.php` à la racine

**Correction appliquée :**
- `wrangler.template.jsonc` : `run_worker_first` de `false` → `true` → toute requête passe par le Worker, la garde fail-closed (`/_private/`, dotfiles, `.php`, `.htaccess`, `.env` → 404 neutre) s'applique aux assets statiques.
- `tests/unit/worker-private-guard.test.cjs` : renforcé (47 checks) — vérifie la garde du Worker, les 6 règles `.assetsignore`, l'exclusion effective sur un artefact simulé, chaque règle prouvée indispensable (fixture malveillante), scan de `dist/` en signal d'alerte.
- Budget bundle : 208.1 Ko ≤ 210 Ko gzip (inchangé).

**Statut :** PR #1094 ouverte sur `agent/security/mission-2-worker-assets`. **Déploiement WAITING_FOR_APPROVAL** (modification de config de sécurité en production).

**Rollback :** revenir à `run_worker_first=false` (commit parent).

---

### M3 — Fraîcheur Copernicus/ERDDAP

**Constat :** le défaut #1048 (« EN DIRECT » sur la base de `updatedAt` au lieu de `erddapTimestamp`) est déjà corrigé :
- `src/lib/format-freshness.mjs` `isSatelliteFresh12h` utilise exclusivement `sargData.erddapTimestamp` (jamais `updatedAt` seul).
- `Header` (`src/Sargasses_PROD.jsx:14343`) reçoit `updatedAt={sargData?.erddapTimestamp||null}` — le prop est mal nommé mais contient bien `erddapTimestamp`; le vrai `updatedAt` (re-publication) est transmis séparément via `republishedAt` et n'est pas utilisé pour la fraîcheur.
- Tests existants : `satellite-freshness-12h.test.cjs` (12 assertions, dont le piège updatedAt frais + erddap vieux ⇒ false), `hero-stale-verdict.test.cjs` (masquage verdict/score/LIVE quand >12h).

**État actuel mesuré (build local) :** `source=erddap-live`, `updatedAt=2026-10-27T22:23Z`, `erddapTimestamp=2026-10-26T12:00Z`, `dataAgeMinutes=2133` (~35,5h), `stale=false` (seuil 36h). → pas « EN DIRECT » (>12h), statut « recent » (12-36h), pas stale (<36h). Cohérent.

**Statut :** aucun code à modifier. Tests `satellite-freshness-12h` et `hero-stale-verdict` passent.

---

### M4 — Routes plages / index régionaux / sitemaps (issue #1068)

**Défaut prouvé :** aucun index plage régional (`/{lang}/beaches/`, `/{lang}/playas/`) généré pour les régions USD → fiches plage dans le sitemap mais index parent 404.

**Correction appliquée (contenu de PR #1072, non mergée sur main) :**
- `scripts/lib/region-seo-pages.cjs` : bloc `beachIndex` dans `emitLangPages` — génère `/{prefix}/{beachesDir}/` avec CollectionPage JSON-LD, breadcrumb, hreflang alternates, entrée sitemap. Pas d'index `plages/` (FR) dans les builds USD.
- `tests/unit/regional-beach-directory-index.test.cjs` : 48 assertions sur florida/puntacana/rivieramaya → PASS.

**Statut :** PR #1095 ouverte sur `agent/data/mission-3-freshness`.

---

### M5 — Parcours B2C → Mollie (issue #781)

**État :** déjà corrigé en partie (NEXT_SESSION 2026-07-30/31) :
- `mollie.php` `payment_status` : champ `terminal` pour canceled/expired/failed.
- `PremiumModal.jsx` : classification des erreurs Mollie, gestion terminal, UI « redirecting ».
- `Sargasses_PROD.jsx` : détection terminal dans le polling `mollie_return`.
- Build + smoke OK (2026-07-30/31) : 4 tokens smoke, budget 202.6 Ko.

**Bloquant résiduel :** `webhook_secret` commenté dans `mollie-config.php` → signature webhook fail-open. Clé gitignored sur le FTP, non visible localement. **Action serveur, WAITING_FOR_APPROVAL.**

**Aucun paiement réel n'a été créé ni testé** (contrat produit).

---

### M6 — Offre B2B / prix / widget (issue #1024)

**Règle (CLAUDE.md, décision panel 2026-06-29) :** Pro 79 €/mois ou 690 €/an, essai 30 j, Brief 29 € = décoy. Source unique : `scripts/automation/mollie-paylinks.cjs` (TIERS, annuel) + `mol_b2b_plans()` dans `public/api/mollie-lib.php` (mensuel).

**À vérifier :** cohérence du widget hôtelier avec 79 €/mo ou 690 €/an (pas 29 € comme prix principal). **Ne pas changer de prix arbitrairement** — décision humaine requise si écart confirmé.

**Statut :** aucun changement de prix effectué. À auditer côté widget.

---

### M7 — API partenaires B2B (issue #1029)

**Constat :** `scripts/automation/gen-b2b-partners.cjs` génère `public/api/b2b-partners.json` ; le build montre « 0 partenaire(s) LIVE, 2 en preview ». L'issue #1029 rapporte un 404 sur les régions USD. À vérifier si l'endpoint est packagé/déployé sur les régions USD et si le contrat JSON distingue « aucun partenaire » vs « endpoint inaccessible ».

**Statut :** à vérifier sur les 6 domaines. Aucun faux partenaire n'a été créé.

---

### M8 — Analytics par domaine (issue #1084)

**Défaut confirmé :** `regions/tulum.json` et `regions/rivieramaya.json` partagent exactement les mêmes valeurs :
- `onesignalAppId`: `02cdb926-71a8-4f1a-8ccf-12ed292252d0`
- `ga4Id`: `G-YHCQGRPG8G`
- `clarityProjectId`: `x4ox737k79`

Le partage peut être intentionnel (à confirmer). Si isolation nécessaire : création de nouveaux IDs GA4/Clarity/OneSignal requise → ressources à provisionner dans les comptes autorisés (action fondateur), **suspendre en l'absence d'ID réel** (contrat produit §B.8).

**Statut :** défaut documenté, décision d'isolation en attente. Aucun ID modifié.

---

### M9 — SEO régional / Tulum

**À vérifier :** reachability HTTPS de Tulum (`sargazotulum.com`, issue #1033), contenu régional Tulum ES/EN (PR #1030), encodage mojibake pages recherche EN/ES (PR #1035). Aucun test live effectué (accès réseau non garanti depuis ce conteneur).

**Statut :** non traité dans cette session.

---

### M10 — Certification E2E six sites

**Non complétée** dans cette session. Ce rapport sert d'état de reprise. La certification E2E (build 6 régions, Playwright mobile/desktop, sitemaps, canonicals, fraîcheur, parcours B2C simulé) reste à exécuter sur le SHA exact une fois les blocs WAITING_FOR_APPROVAL levés.

---

## 3. Fichiers modifiés (cette session)

| Fichier | Mission | Nature |
|---|---|---|
| `wrangler.template.jsonc` | M2 | `run_worker_first: false → true` + commentaire sécurité |
| `tests/unit/worker-private-guard.test.cjs` | M2 | Garde renforcée (47 checks), artefact simulé, fixture malveillante |
| `scripts/lib/region-seo-pages.cjs` | M4 | Génération index plage régional (bloc beachIndex) |
| `tests/unit/regional-beach-directory-index.test.cjs` | M4 | Test de régression 48 assertions |
| `.ai/current_state.md` | M1-M4 | État de reprise (checkpoint) |
| `.ai/changelog.md` | M1-M4 | Historique des changements |
| `reports/sargagame/M1-etat-maitre-20261027.md` | M1 | État de départ |
| `reports/sargagame/RAPPORT-MAITRE-10-MISSIONS-20261027.md` | M10 | Ce rapport |

**Aucun fichier de prix, de paiement, de checkout, de secret ou de données de production n'a été modifié.** Aucun déploiement n'a été effectué (blocs WAITING_FOR_APPROVAL).

---

## 4. Tests réalisés et résultats

| Test | Résultat |
|---|---|
| `node tests/unit/worker-private-guard.test.cjs` | 47/47 PASS |
| `node tests/unit/satellite-freshness-12h.test.cjs` | PASS |
| `node tests/unit/hero-stale-verdict.test.cjs` | PASS |
| `node tests/unit/regional-beach-directory-index.test.cjs` | 48/48 PASS |
| `npm run build` | exit 0 |
| `node scripts/check-bundle-budget.cjs` | 208.1 Ko ≤ 210 Ko gzip (OK) |
| `node --check scripts/lib/region-seo-pages.cjs` | syntaxe OK |

**Build régional complet (6 régions) et Playwright E2E non exécutés** dans cette session (à faire dans la certification M10).

---

## 5. PR et liens GitHub

- **PR #1094** — Mission 2 sécurité Worker (`run_worker_first=true`) — branche `agent/security/mission-2-worker-assets` — **WAITING_FOR_APPROVAL** — https://github.com/aveca/sargagame/pull/1094
- **PR #1095** — Mission 4 index plages USD — branche `agent/data/mission-3-freshness` — https://github.com/aveca/sargagame/pull/1095
- PR #1072 (Mission 4, source du correctif) — toujours ouverte sur main, non mergée

---

## 6. Blocs WAITING_FOR_APPROVAL (autorisation requise)

1. **Déploiement de `run_worker_first=true`** (Mission 2, PR #1094) : modification de config de sécurité en production. Nécessite autorisation explicite avant merge/déploy.
2. **Webhook secret Mollie** (Mission 5, `mollie-config.php`) : clé sur le FTP, action serveur, non visible localement.

Toutes les autres tâches peuvent se poursuivre indépendamment.

---

## 7. Rollback

- Mission 2 : `git revert` du commit `5e350453d` → restaure `run_worker_first=false`.
- Mission 4 : `git revert` du commit `1f4d144e5` → supprime le bloc `beachIndex` et le test.
- Aucun déploiement n'a été effectué → aucun rollback production nécessaire.

---

## 8. État de reprise (pour prochaine session)

**SHA de référence :** `d2b05adec`  
**Branche courante :** `agent/data/mission-3-freshness` (commit `59ea7556e`)  
**PR actives :** #1094 (M2, WAITING_FOR_APPROVAL), #1095 (M4)  
**Tâches complètes :** M1, M2 (code), M3 (constat), M4 (code)  
**Tâches restantes :** M5 (bloqué webhook_secret), M6, M7, M8, M9, M10 (certification E2E)  
**Commandes utiles :** `npm run build`, `node scripts/check-bundle-budget.cjs`, `node tests/unit/<test>.cjs`, `git status --short`  
**Restrictions :** aucun prix/paiement/checkout/secret sans autorisation ; aucun déploiement sans lever les blocs WAITING_FOR_APPROVAL.

---

## 9. Prochain prompt (action nouvelle et mesurable)

> Reprendre depuis l'état de reprise ci-dessus (branche `agent/data/mission-3-freshness`, SHA `d2b05adec`). Traiter **Mission 8/10 (analytics partagés)** : confirmer si le partage des IDs GA4/Clarity/OneSignal entre tulum et rivieramaya est intentionnel ; si ce n'est pas intentionnel, préparer le remplacement des doublons par des placeholders `TBD` (sans créer de nouveaux IDs, nécessitant une action fondateur) et documenter la décision. Puis traiter **Mission 7/10 (API partenaires B2B)** : vérifier si `/api/b2b-partners.json` est packagé/déployé sur les régions USD et distinguer « aucun partenaire » vs « endpoint inaccessible ». Ne pas créer de vrais IDs GA4/Clarity/OneSignal ni modifier aucun prix ou paiement sans autorisation.
