# AUTONOMOUS_TASKS.md — Backlog priorisé d'améliorations Sargagame

> Généré automatiquement après analyse complète du repo. 20 tâches priorisées (P0=critique, P1=haute, P2=moyenne, P3=nice-to-have).

---

## P0 — Critique (impact revenu/stabilité)

### 1. Corriger le timeout 3DS → paiement bloqué sur mobile
**Fichier:** `src/PremiumModal.jsx` (l. 1800-1900), `public/api/mollie.php`
**Problème:** Le retour `?mollie_return=1` ne gère pas les cas où `sessionStorage` est vidé par iOS Safari (bfcache) → utilisateur redirigé vers `/` sans confirmation paiement.
**Solution:** Lire `localStorage.getItem('sg_mollie_pending')` en fallback + stocker l'email dans `localStorage` AVANT redirect 3DS.

### 2. Éliminer le flash "toutes plages à 73" (scores identiques)
**Fichier:** `src/lib/score.js`, `src/Sargasses_PROD.jsx` (bootstrap)
**Problème:** Sans `beaches-weather.json`, toutes les plages ont la même météo → même score 73.
**Solution:** Vérifier que `beaches-weather.json` est préchargé AVANT le 1er render. Ajouter guard `if (!beachesWeather) return <Skeleton />`.

### 3. Cache-busting Service Worker → chargement infini post-deploy
**Fichier:** `public/sw.js`, `scripts/stamp-sw-hash.cjs`
**Problème:** Le SW sert l'ancien `index.html` pendant 25 min post-FTP (chunks pas encore uploadés).
**Solution:** `stamp-sw-hash` doit incrémenter `CACHE_NAME` à CHAQUE build + `skipWaiting()` + `clients.claim()`.

---

## P1 — Haute (conversion/UX)

### 4. A/B `capture_gate` → email avant paywall (levé principal)
**Fichier:** `src/Sargasses_PROD.jsx` (l. 13320-13330), `src/CaptureGateModal.jsx` (nouveau)
**Problème:** 60% des utilisateurs quittent au paywall sans donner d'email.
**Solution:** Intercepter `onPremiumClick("forecast_*")` → ouvrir modal email (sendBeacon) → puis paywall. Stocker `sg_email` → relance email auto si abandon.

### 5. Précharger `mollie.js` + `Stripe.js` au chargement (pas au clic)
**Fichier:** `src/PremiumModal.jsx` (l. 1460-1550), `src/main.jsx`
**Problème:** 2-3 s d'attente au clic "Payer" (chargement SDK).
**Solution:** `import()` lazy au `DOMContentLoaded` dans `main.jsx` → stocker promise dans `window.__paySdkReady`.

### 6. Remplacer `window.confirm`/`prompt` par modals accessibles
**Fichier:** `src/Sargasses_PROD.jsx` (l. 11530, 11564, 11633)
**Problème:** Bloquant, moche, non testable, échoue sur mobile PWA.
**Solution:** Créer `ConfirmModal.jsx` / `PromptModal.jsx` (ARIA, focus trap, ESC pour fermer).

### 7. Touch targets < 44px (WCAG AA) — 14 éléments
**Fichier:** `src/app-runtime.css`, `src/ChasseHome.jsx`, `src/Sargasses_PROD.jsx`
**Problème:** Boutons `✕` 32px, chips 36px, FAB 40px.
**Solution:** CSS global `.touch-target { min-height: 44px; min-width: 44px }` + appliquer aux 14 éléments.

### 8. Supprimer `dangerouslySetInnerHTML` (XSS surface)
**Fichier:** `src/VeilleurHero.jsx`, `src/ArenaOnboarding.jsx`
**Problème:** 2 occurrences injectent du HTML non sanitizé (contenu CMS futur).
**Solution:** Remplacer par composants React purs ou `DOMPurify.sanitize()`.

---

## P2 — Moyenne (perf/dette technique)

### 9. Bundle splitting : `three.js` (546 KB) hors chunk critique
**Fichier:** `vite.config.js`, `src/WorldView3D.jsx`
**Problème:** `three` + `three-stdlib` = 546 KB dans `index-*.js` (chargé eager).
**Solution:** `manualChunks: { three: ['three', 'three-stdlib'] }` + `lazyWithRetry` déjà en place → vérifier `build.rollupOptions.output.manualChunks`.

### 10. `Sargasses_PROD.jsx` = 1 MB monolithe → extraire composants
**Fichier:** `src/Sargasses_PROD.jsx` (15 746 lignes)
**Problème:** 1 seul fichier → re-render global à chaque `setState`, DX nulle, tests impossibles.
**Solution:** Extraire par domaine : `Header`, `HeroVerdict`, `BeachSheet`, `PremiumGate`, `MapView`, `Funnel`, `Account`, `Settings` → `lazy()` + `React.memo`.

### 11. `useMemo`/`useCallback` manquants → re-renders inutiles
**Fichier:** `src/Sargasses_PROD.jsx` (partout)
**Problème:** `onBeachClick`, `onPremiumClick`, `renderBeachPin` recréés à chaque frame.
**Solution:** Audit `why-did-you-render` + `useCallback` sur tous les handlers passés en props + `React.memo` sur feuilles.

### 12. CSS-in-JS (`style={{...}}`) → classes utilitaires (bundle + perf)
**Fichier:** `src/Sargasses_PROD.jsx` (100+ occurrences)
**Problème:** Styles inline → pas de déduplication, pas de cache, re-calcul style à chaque render.
**Solution:** Migrer vers `app-runtime.css` + tokens CSS (`--sg-*`) + classes BEM `.sg-btn--primary`.

### 13. `console.log` en prod (12 occurrences)
**Fichier:** `src/Sargasses_PROD.jsx`, `src/PremiumModal.jsx`, `src/BeachSheet.jsx`
**Problème:** Fuites données utilisateur (email, paymentId) dans console.
**Solution:** `if (import.meta.env.DEV) console.log(...)` ou logger structuré `sgLog(level, event, data)`.

---

## P3 — SEO/Croissance

### 14. Pages SEO manquantes : `/plages/[slug]/` + hreflang
**Fichier:** `vite.config.js` (génération), `scripts/automation/region-seo-pages.cjs`
**Problème:** 136 plages → seulement 40% ont page dédiée indexable.
**Solution:** Générer `/plages/[slug]/` + `/en/plages/[slug]/` + `/es/plages/[slug]/` + `hreflang` + `ItemList` JSON-LD.

### 15. Structured Data `Beach` + `Forecast` JSON-LD
**Fichier:** `src/BeachSheet.jsx`, `vite.config.js` (build)
**Problème:** Pas de `schema.org/Beach` / `WeatherForecast` → pas de rich snippets météo.
**Solution:** Injecter `<script type="application/ld+json">` dans `<Helmet>` par plage.

### 16. `robots.txt` + `sitemap.xml` dynamiques par région
**Fichier:** `scripts/prepare-ftp.cjs`, `public/robots.txt`
**Problème:** `robots.txt` statique → bloque `/en/`, `/es/` sur certains domaines.
**Solution:** Générer `robots.txt` + `sitemap-[region].xml` au build + `Disallow: /pro/ /admin/ /api/`.

---

## P4 — Sécurité/Conformité

### 17. CSP headers + `nonce` pour scripts inline
**Fichier:** `index.html`, `vite.config.js`, `public/.htaccess`
**Problème:** Aucun CSP → risque XSS si CDN compromis.
**Solution:** `Content-Security-Policy: script-src 'self' 'nonce-{RANDOM}' https://js.stripe.com https://js.mollie.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.mollie.com https://api.stripe.com;` + générer `nonce` par requête.

### 18. Supprimer clés API du bundle client (`@anthropic-ai/sdk`)
**Fichier:** `package.json`, `src/Sargasses_PROD.jsx` (import)
**Problème:** Clé Anthropic dans `node_modules` → bundle si importé.
**Solution:** Déplacer tout usage Anthropic vers Netlify Functions / Cloudflare Workers (server-only).

### 19. Rate-limit API publique (`/api/mollie.php`, `/api/create-checkout.php`)
**Fichier:** `public/api/_ratelimit.php`, `public/api/mollie.php`
**Problème:** Pas de rate-limit → abuse possible (création checkout en boucle).
**Solution:** `sg_rate_limit('checkout', 10, 60)` par IP + email + `X-Forwarded-For` headers.

---

## P5 — Nouvelles fonctionnalités (revenu)

### 20. Abonnement annuel "Saison" (B2C) + webhook `subscription.created`
**Fichier:** `public/api/mollie.php` (l. 153-218), `src/PremiumModal.jsx`
**Problème:** Seulement mensuel (79€/mois) → friction pour utilisateurs occasionnels.
**Solution:** Ajouter `plan: 'season_annual'` (199€/an) + webhook `subscription.created` → `localStorage.setItem('sg_premium_pass_end', Date.now() + 365*86400000)`.

---

## Ordre d'exécution recommandé

| # | Tâche | Temps estimé | Dépendances |
|---|-------|--------------|-------------|
| 1 | Timeout 3DS mobile | 2h | — |
| 2 | Flash score 73 | 1h | — |
| 3 | SW cache-busting | 1h | — |
| 4 | Capture gate email | 4h | 1 |
| 5 | Précharger SDK paiement | 2h | — |
| 6 | Modals accessibles | 3h | — |
| 7 | Touch targets 44px | 2h | — |
| 8 | XSS `dangerouslySetInnerHTML` | 2h | — |
| 9 | Bundle splitting three.js | 1h | — |
| 10 | Extraire composants monolithe | 8h | 9 |
| 11 | useMemo/useCallback audit | 4h | 10 |
| 12 | CSS-in-JS → classes | 6h | 10 |
| 13 | Supprimer console.log prod | 1h | — |
| 14 | Pages SEO plages | 4h | — |
| 15 | JSON-LD Beach/Forecast | 3h | 14 |
| 16 | robots.txt/sitemap dynamiques | 2h | — |
| 17 | CSP + nonce | 3h | — |
| 18 | Anthropic server-only | 2h | — |
| 19 | Rate-limit API | 2h | — |
| 20 | Abonnement annuel B2C | 4h | 1, 5 |

**Total estimé: ~5540-50h**

---

## Règles de travail

- **Une tâche à la fois** : ne passer à la suivante qu'après `npm run build && npm test` ✅
- **Commit atomique** par tâche : `git add -A && git commit -m "fix: <tâche> — <résumé>"`
- **Rollback immédiat** si `npm test` échoue : `git reset --hard HEAD~1`
- **Mise à jour AUTONOMOUS_TASKS.md** après chaque tâche (cocher, noter blocages, temps réel)