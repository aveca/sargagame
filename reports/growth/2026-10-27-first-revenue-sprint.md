# Rapport — Premier client payant (Sargagame)

**Date** : 2026-10-27
**Auteur** : agent growth
**Branche / PR** : `agent/growth/p0-widget-framing-20261027` → PR #1092 → merged sur `main`
**Commit** : `e8fa41f5a` fix(b2b): rendre le widget iframe encadrable (exemption /widget/embed)

## 1. Problème prouvé

Le livrable B2B payant (widget météo des plages à embarquer sur le site d'un hôtel, 79 €/mois ou 690 €/an, essai 30 j) est **bloqué à l'étape de l'essai / de l'usage** : le widget est un `<iframe src="https://<domaine>/widget/embed/?beach=...">` que le produit distribue aux hôtels (page `/pro/espace/` et emails B2B), mais une règle de sécurité globale l'interdisait.

**Racine** : régression introduite par le commit `e808c2cf5` (2026-10-11, `fix(csp): move frame-ancestors to HTTP headers`). Ce commit a fait passer `frame-ancestors 'none'` + `X-Frame-Options: DENY` du `<meta>` à l'en-tête HTTP via `public/_headers` (règle `/*`) et `public/.htaccess`, appliqué à **toutes** les routes, y compris `/widget/embed/`.

## 2. Éléments de preuve (mesurés en production, captures réelles)

### AVANT le correctif (production live)

- `https://sargasses-martinique.com/widget/embed/` répondait `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'`.
- Sur `/pro/espace/` (page de conversion B2B), l'aperçu du widget rendait `chrome-error://chromewebdata/` (cadre vierge) — preuve : script `espace-preview.cjs`, frame `chrome-error://chromewebdata/`, `blocked: [...] frame-ancestors 'none'`.
- Sur un site tiers intégrant le widget (reproduction réelle, `embed-repro.cjs`) : `iframeFramed: false`, console `error: Framing … violates … frame-ancestors 'none'`, le blocage. Chargement DIRECT du widget : fonctionne (`directLoadWorks: true`) → c'est bien l'encadrement qui était interdit, pas le widget.
- Funnel B2B (funnel-snapshot.json, 7 j) : `b2b_trial_activated: 0`, `b2b_space_open: 0`, `b2b_paylink_click: 0`, `conversion: 0`, `mollie_checkout_redirect: 0` — aucun essai ni paiement B2B n'aboutissait.

### APRÈS le correctif (déployé en production, vérifié)

- `https://sargasses-martinique.com/widget/embed/` ne répond plus ni `X-Frame-Options` ni `frame-ancestors 'none'` (exemption appliquée). Le reste du site (`/`) garde `DENY` / `frame-ancestors 'none'` (anti-clickjacking conservé).
- Reproduction tiers : `iframeFramed: true`, `iframeText` contient le contenu du widget ("Hôtel Les Salines / Mer propre / En direct …"), `consoleBlocking: []` (zéro erreur).
- `/pro/espace/` : l'iframe est maintenant `https://sargasses-martinique.com/widget/embed/?beach=plage-des-salines` (plus `chrome-error://chromewebdata/`), `blocked: []`.

### Captures et résultats visuels
Fichiers produits (pré-déploiement, état "avant") dans `scripts/automation/data/` et logs de probe :
- `shots/pro-espace-mobile.png`, `shots/pro-espace-desktop.png` (page de conversion B2B, avant)
- `shots/embed-repro-third-party-site.png` (site tiers intégrant le widget, avant)
- `shots/embed-direct-ok.png` (widget chargé directement, contrôle positif)
- Logs JSON : `embed-repro.log` (avant), `embed-repro-AFTER.log` (après), `espace-preview.log` (avant), `espace-preview-AFTER.log` (après), `probe.log` (pages /pro/).

## 3. Action réalisée

Un seul changement ciblé, aucun impact sur les paiements, les prix, les secrets ou les engagements contractuels.

**Fichiers modifiés** :
- `public/_headers` (Cloudflare Pages) : la règle `/*` pose le cadre global `frame-ancestors 'none'` + `X-Frame-Options: DENY`, puis les routes `/widget/embed` et `/widget/embed/*` détachent (`! `) ces deux en-têtes. Aucun autre chemin n'est embeddable.
- `public/.htaccess` (hébergement Apache classique) : `SetEnvIf Request_URI "^/widget/embed(/|$|\?)" sg_widget_embed=1`, puis `Header set … env=!sg_widget_embed` pour X-Frame-Options et CSP globale, et une règle CSP dédiée `env=sg_widget_embed` sans `frame-ancestors 'none'` pour le widget.
- `tests/unit/widget-framing-embeddable.test.cjs` : test de régression verrouillant la sémantique réelle (simulateur de fusion Cloudflare `_headers` + Apache `.htaccess`) : widget encadrable, reste du site non encadrable, espace Pro distribue bien l'iframe.

**Rollback** : révert du commit `e8fa41f5a` restaure le blocage global (zéro impact paiement/prix/secrets). Flag de rollback immédiat disponible.

## 4. Résultats des tests

- `tests/unit/widget-framing-embeddable.test.cjs` : 5/5 OK (widget sans DENY, widget sans frame-ancestors none, reste du site garde DENY, reste du site garde frame-ancestors none, espace Pro distribue l'iframe).
- `tests/unit/csp-analytics.test.cjs` : tous OK (pas de régression sur la sécurité des en-têtes existants).
- `tests/unit/csp-connect-openmeteo.test.cjs` : PASS (parité des origines, pas d'affaiblissement).
- CI sur PR #1092 : `test-frontend` pass, `perf` pass, `GitGuardian` pass. `lighthouse-report` resté pending (check annexe, non bloquant).
- `.htaccess` équilibré : 13 `<IfModule>` / 13 `</IfModule>`.

## 5. État réel du parcours commercial (hôtels / hébergements)

Parcours vérifié sur production (mobile + desktop) :
- `/pro/` (landing Pro) : 200, H1 unique, CTA "Offres & tarifs", pas d'overflow, pas d'erreur JS.
- `/pro/espace/` (espace self-serve) : formulaire email, sélection plage/hôtel, bouton "Activer mon essai 30 jours", boutons d'abonnement "79 €/mois" et "690 €/an", aperçu du widget fonctionnel (après correctif).
- `/pro/hotels/` : page hôtel avec CTA "Activer mon essai 30 j → voir mon espace Pro".

**Ce qui est vérifié** : l'essai 30 j s'active via `/api/b2b-trial.php` (émail, nom, plage, île), le paiement annuel via Mollie `create_subscription`, l'espace libère le widget sans crédit Sargasses.

**Ce qui reste à zéro (données disponibles, pas d'invention)** : `b2b_trial_activated`, `b2b_paylink_click`, `conversion`, `subscription_created` sont à 0 dans le dernier funnel (7 j). Aucun premier client payant B2B n'est encore encaissé à ce jour — c'est précisément l'objectif de la mission (premier client payant) qui reste à concrétiser une fois le livrable débloqué.

## 6. Données disponibles, manquantes, incertitudes

**Disponibles (repo, first-party)** :
- `scripts/automation/data/funnel-snapshot.json` (7 j, fin ~2026-10-21) : entonnoir complet, B2B tout à zéro.
- `scripts/automation/data/funnel-daily-report.json` (24 h, depuis 2026-10-01) : conversion 0, mollie_checkout_redirect 0.
- `scripts/automation/data/b2b-outreach.cjs`, `B2B_OFFER.md`, `B2B_EMAIL_TEMPLATE.md` : campagne et emails B2B prêts (non envoyés sans autorisation).
- `scripts/automation/data/b2b-grade-a-enriched.json`, `b2b-prospects-mq-001.csv`, `b2b-prospects-gp-001.csv` : liste de prospects qualifiés (MQ, GP).

**Manquantes / non accessibles dans cette session** :
- Google Search Console (impressions/clics SEO) — pas d'accès direct.
- GA4 (trafic reçu, événements d'achat) — pas d'accès direct.
- Paiements confirmés / revenus encaissés (Mollie live, Stripe legacy) — `mollie-config.php` est gitignoré, vit sur le serveur uniquement ; aucun chiffre de revenu actuel n'a pu être lu.
- Données de l'autopilot récentes — `.ai/autopilot/runs/` sont des fichiers non suivis, non exploités ici.

**Incertitudes** : volume de trafic réel sur `/pro/`, taux de clic sur les emails B2B, et tout chiffre de revenu ne sont pas vérifiables depuis cette session ; le rapport ne les transforme pas en chiffres actuels.

## 7. Vérification en production

Déploiement autorisé (modification d'interface/contenu, sans risque financier ni de sécurité, CI verte sur les checks bloquants, rollback documenté). PR #1092 mergeée sur `main`, déploiement auto Cloudflare Pages effectué et vérifié en production live :
- `/widget/embed/` : plus de `X-Frame-Options` ni `frame-ancestors 'none'` ✅
- `/` : garde `DENY` / `frame-ancestors 'none'` ✅ (anti-clickjacking conservé)
- Reproduction tiers : cadre affiché, zéro erreur console ✅
- `/pro/espace/` : iframe réelle, plus de `chrome-error://chromewebdata/` ✅

## 8. Prochain indicateur commercial à mesurer

`b2b_trial_activated` (essai 30 j activé) puis `b2b_paylink_click` / `subscription_created` (premier paiement B2B), sur la période post-déploiement, via `funnel-snapshot.json` et `funnel-from-supabase.cjs`. Objectif mission : premier client payant B2B (79 €/mois ou 690 €/an).

**Action d'acquisition préparée et réutilisable** : `scripts/automation/b2b-outreach.cjs` + `B2B_EMAIL_TEMPLATE.md` + liste `b2b-prospects-mq-001.csv` / `b2b-prospects-gp-001.csv` (deep-link `/pro/espace/?beach=…&name=…&partner=…`, UTM `utm_source=email&utm_medium=b2b_cold`). Aucun envoi d'e-mail n'a été effectué (attente autorisation).
