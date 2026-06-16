# NEXT_SESSION — sargagame

> **Reprise 2026-06-16 (Sonnet).** Phase B ✅ close. Phase C démarrée : `/previsions/` shippé local (pas encore push).

## ▶️ REPRISE
1. Lire `design/REFONTE-EXECUTION.md` + tableau de bord `design/REFONTE-MASTER.md`.
2. **Prochaine action Phase C** : `/plages-sans-sargasses/` (spec `design/specs/clean-list.md`) — porter `proto-planb-clean-nearby.html` en `src/CleanList.jsx` + A/B `clean_list`.
3. Puis : `/alertes/`, zones, stations, à-propos, fiabilité UI, conditions, widget, 136 fiches SEO.

## ✅ ÉTAT LIVE PROD (SW v194, dernier push `e7849ffb`)
Accueil `home_az`, carte `map_world`, fiche `pw_beach_dive`, Phase B complète (capture_gate, paywall ctx, dock_glass, etc.).

## 🟡 EN LOCAL (non pushé)
**`/previsions/` landing A/B `prev_az` 50/50** — composant `ForecastLanding` dans `Sargasses_PROD.jsx` :
- Route `/previsions/` + `/_gp/previsions/` détectée (`isPrevisions`).
- Variant `?prev_az=1` : golden-hour + Veilleur + ForecastChart 7j (heroPick) + « meilleur jour » + CTA carte.
- Control `?prev_az=0` : carte brute inchangée.
- Noscript SEO déjà en place (`vite.config.js` editorialContent `previsions`).
- SW bump **v195**. Playwright `scripts/test-previsions-landing.cjs` : PASS (variant 5 barres, control 0 landing).
- **À faire** : `git pull --rebase`, commit ciblé, push main → CI deploy ~50 min.

## Garde-fous
EUR/MQ-GP smoke d'abord · `stripe-config.php` jamais · SW bump par deploy · jamais `git add -A` · Shabbat ven 18h→sam 19h no-deploy.
