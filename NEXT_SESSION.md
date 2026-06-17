# NEXT_SESSION — sargagame

> **Reprise 2026-06-17.** Phase C ✅ quasi-close (dashboard ~91 %). Dernier tick : **parité H2S sur la fiche-plongée** (disclaimer honnête + CTA alerte santé Premium).

## ▶️ REPRISE
1. Lire le tableau de bord `design/REFONTE-MASTER.md` (§5 backlog cochable) + `design/REFONTE-EXECUTION.md`.
2. **Prochaines actions non cochées (§5)** : façade `flyTo()` (PHASE 1, glue expérience continue) · flyTo(région,FAR) /carte + flyTo(FAR+filtre) clean-list/conditions + revalidation live /conditions (PHASE 2) · slug canonique resolver (PHASE 0) · fraîcheur /fiabilite + désambiguïsation /saison-* (PHASE 3, mesurer GSC avant 301).

## ✅ ÉTAT LIVE PROD (SW v202)
- Accueil `home_az`, carte `map_world`, fiche `pw_beach_dive` (+ **parité H2S** : beat-4 = disclaimer honnête + CTA `h2s_health_alert`), Phase B complète.
- `/previsions/` (`prev_az`), `/plages-sans-sargasses/` (`clean_list`), `/alertes/` (`pw_alertes`), stations, à-propos, conditions, 136 fiches SEO — tous A/B 50/50 live.

## 🟡 EN LOCAL (non pushé)
- Rien, workspace clean (hors dirs non-suivis backend/frontend/grill, hors projet).

## Garde-fous
EUR/MQ-GP smoke d'abord · `stripe-config.php` jamais · SW bump par deploy · jamais `git add -A` · Shabbat ven 18h→sam 19h no-deploy.
