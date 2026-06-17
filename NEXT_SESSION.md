# NEXT_SESSION — sargagame

> **Reprise 2026-06-17 (Antigravity).** Phase B ✅ close. Phase C active : `/previsions/` et `/plages-sans-sargasses/` (CleanList) shippés en A/B.

## ▶️ REPRISE
1. Lire `design/REFONTE-EXECUTION.md` + tableau de bord `design/REFONTE-MASTER.md`.
2. **Prochaine action Phase C** : `/alertes/` (hub Premium) ou `/plages/<zone>/` (zones), stations, à-propos, fiabilité UI, conditions, widget, puis 136 fiches SEO.

## ✅ ÉTAT LIVE PROD (SW v196, dernier push `f5c180e4`)
- Accueil `home_az`, carte `map_world`, fiche `pw_beach_dive`, Phase B complète.
- **`/previsions/` landing A/B `prev_az` 50/50** live.
- **`/plages-sans-sargasses/` CleanList A/B `clean_list` 50/50** live (port du design HomeAZ, rail de cartes clean, satellite désignant, dynamic noscript build-time + cross-island rewrites).
- Playwright tests PASS pour les deux landings (`test-previsions-landing.cjs`, `test-clean-list.cjs`).

## 🟡 EN LOCAL (non pushé)
- Rien, workspace clean.

## Garde-fous
EUR/MQ-GP smoke d'abord · `stripe-config.php` jamais · SW bump par deploy · jamais `git add -A` · Shabbat ven 18h→sam 19h no-deploy.
