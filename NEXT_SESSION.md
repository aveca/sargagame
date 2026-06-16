# NEXT_SESSION — sargagame

> **👉 HANDOFF CANONIQUE (Opus OU Sonnet) : lire D'ABORD `design/REFONTE-EXECUTION.md`** (runbook bulletproof : cadence, vérif navigateur, port A/B, git, INTERDITS, bases validées) + le **tableau de bord** en tête de `design/REFONTE-MASTER.md` (avancement) + les **specs par page** dans `design/specs/*.md`. Bases validées à NE PAS purger : `design/proto-map-v2.html` (carte) + `design/proto-plage-plongee.html` (fiche, **préférée fondateur**) + `src/HomeAZ.jsx` (réf. qualité). Règle d'or : proto→build→**vérif navigateur (8790+Playwright, l'app preview timeout)**→ship A/B→push→cocher.*

*MODE : BOUCLE AUTONOME A→Z (depuis le 17/06). Mission = refondre/orchestrer le SITE + l'APP + l'EXPÉRIENCE + résoudre les PROBLÈMES SARGASSES, de bout en bout, en autonome, sans redemander de validations de goût. Backbone d'exécution = `design/REFONTE-MASTER.md` (cochable). Détail/raison = memory `project_funnel_program_2026.md`.*

## ▶️ REPRISE IMMÉDIATE (toute nouvelle session fait ça, zéro confirmation)
1. Lire `design/REFONTE-MASTER.md` (le plan : global → page → élément → svg → §4A problèmes SARGASSES → §4B hygiène site → §5 backlog action-par-action en 5 phases).
2. **Re-armer la boucle autonome** (ScheduleWakeup sentinel `<<autonomous-loop-dynamic>>`, pacing dynamique) ET vérifier le cron quotidien (CronCreate `57 8 * * 0-5`, session-only → le **recréer** s'il a disparu).
3. **Avancer le backlog §5** : conversion (§4B) d'abord, PUIS produit (§4A) — prendre la prochaine action non cochée, construire + **vérifier au navigateur** (skill `sg-svg-scene` : serveur local `127.0.0.1:8799` + Playwright ; l'app preview timeout), **ship A/B réversible**, cocher le doc.
4. Vérifier l'état des workflows en cours (ne pas dupliquer). KPI = `node scripts/automation/ab-eval.cjs --days=28` + funnel.

## 🟢 EN COURS (lancés le 17/06)
- **`wphs4qc9q`** — build ACCUEIL A→Z (keystone : fusion funnel scroll + Veilleur-satellite v2 + yole + perso, build→critique→fix). À la complétion : vérifier navigateur + porter en A/B `home_az`.
- **`w9a1gc4bq`** — batch FEATURES SARGASSES §4A en protos validés + specs (#4 santé/H2S, #2 plan-B près-de-moi, #5 baignade, #9 collecte). À intégrer une par une dans leurs surfaces.
- Boucle live (ScheduleWakeup) + cron quotidien `c5d43da5` (heartbeat/bilan, expire 7 j).

## 🧭 RÈGLES FONDATEUR DE CETTE PHASE (gravées dans les skills, à ne pas re-dériver)
- **Le SVG est VALIDÉ → le levier = ORCHESTRER + PRODUIRE DU VOLUME**, pas micro-itérer un élément. Coder beaucoup, bien, beau, utile. Quand une pièce passe la barre → l'assembler et avancer.
- **« Problème par problème » = les problèmes des SARGASSES (le produit, pour les gens, §4A)**, pas le site. Standout créatif = **#4 SANTÉ/H2S** (sargasse en décompo → H2S, risque respiratoire ; indice DÉRIVÉ honnêtement, jamais une fausse mesure).
- **Le Veilleur RASSURE ≠ surveille** : UN SEUL OBJET = le satellite, il veille la MER (ne fixe pas l'utilisateur). Proto : `design/proto-veilleur-clip-v2.html`.
- **Qualité PRO** : un vrai bateau (yole MQ), lumière/profondeur/reflets, zéro élément cheap. ZÉRO image IA.
- **Goût = A/B LIVE + `ab-eval`** (reporting automatisé via tracking first-party : `stats.php` `ab_breakdown` + `ab-eval.cjs`). Ne JAMAIS faire valider des candidats/brouillons au fondateur — shipper 1-2 variantes viables, les vrais users tranchent. Ping le fondateur seulement sur du concret livré.
- Technique d'unification = **un monde SVG, 3 profondeurs FAR/MID/NEAR, `flyTo(lieu, profondeur)`** (étendre Archipel+StoryEngine, ne pas réécrire).

## 🛠️ Skills & outils de la phase
`sg-design-system` (le QUOI : marque, doctrine, qualité) · `sg-svg-scene` (le COMMENT : moteur, pièges payés, vérif) · `ab-eval.cjs` (verdict A/B auto) · protos validés dans `design/` (proto-home-funnel, proto-veilleur-clip-v2). Tâche htaccess SEO spinnée (`task_d48a64ca`).

## 🚧 Garde-fous (intouchables)
EUR/MQ-GP intouchables (smoke EUR : **rebuild MQ d'abord**) · porte de conversion UNIQUE = `openPremium` · jamais casser SEO/funnel · **aucune page supprimée sans 301**, slug=nom=SEO · jamais toucher `stripe-config.php` · SW bump à chaque deploy code · grouper les pushes · JAMAIS `git add -A` (stage fichier par fichier) · `git pull --rebase` avant push (auto-commits data fréquents) · jamais d'email en clair dans les logs · **Shabbat ven 18h→sam 19h : ne rien déployer** (GH Actions couvrent l'ops) · doctrine calme (repos=tableau, reduced-motion plancher) · valider tout href par curl avant ship.

## ⚖️ Décisions user en attente
GO/NO-GO Bahamas (conditionné ventes USD réelles, Stripe) · packs plugins métier (bio/finance/marketing…) à couper via `/plugin` (bundlé app, non prunable en config) · Cloudflare token · share-cards déverrouillées seulement si modal→CTA ≥5% tenu 2 sem.
