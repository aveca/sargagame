# GitHub Pages Backup Solution — Analysis & Plan

## Status: ✅ Deployed (aveca.github.io/sargagame)

## Critical Issues Found

### 1. Missing Vite `base` Path (CRITICAL)
**File:** `vite.config.js:2524-2525`
```js
// base: '/sargagame/',  // COMMENTED OUT
```
**Impact:** All asset references use `/` instead of `/sargagame/` — JS/CSS/fonts fail to load.
**Fix:** Uncomment and make conditional:
```js
base: process.env.DEPLOY_TARGET === 'gh-pages' ? '/sargagame/' : '/',
```

### 2. No Client-Side Router (HIGH)
The app is a monolithic SPA (`Sargasses_PROD.jsx` ~14,673 lines) that reads `window.location.pathname` directly. No `react-router`.
**Impact:** Direct navigation to `/carte-sargasses/` returns 404.
**Fix:** Add SPA redirect in `404.html` (already done) + read `?route=` param in app.

### 3. Hardcoded Domain URLs (MEDIUM)
SEO meta tags point to `sargasses-martinique.com`:
- `<link rel="canonical">`
- `<meta property="og:url">`
- `<link rel="alternate" hreflang>`
- Structured data (JSON-LD)
**Impact:** Wrong canonical for GitHub Pages version.

### 4. PHP Endpoints Non-Functional (HIGH — Expected)
GitHub Pages is static hosting. These won't work:
- Payment processing (Mollie, Stripe, PayPal)
- Click/open tracking
- Server-side forecast computation
- B2B lead forms
**Mitigation:** Static JSON data works fine (sargassum, weather, beaches).

### 5. Service Worker Path Wrong (MEDIUM)
SW registered at `/sw.js` instead of `/sargagame/sw.js`.

## What Works on GitHub Pages
✅ Static JSON data (sargassum, weather, beaches, version)
✅ Boot skeleton (HTML/CSS inline, zero JS)
✅ Theme detection (dark/light)
✅ 404 page with SPA redirect
✅ SEO content (noscript fallback)

## Recommended Use Case
**GitHub Pages = Read-Only Backup** when FTP hosting is down:
- Users can see beach data and forecasts
- Payments and tracking are disabled
- Good enough for emergency access

## Test Email Content

**Subject:** Test GitHub Pages Backup — Sargasses Emergency Deploy

**Body:**
```
Bonjour,

Suite à l'incident FTP d'hôte (tous les serveurs HS), nous avons déployé 
une version de secours sur GitHub Pages :

🔗 https://aveca.github.io/sargagame/

Cette version permet :
✅ Consulter les données sargasses en temps réel
✅ Voir la carte et les plages
✅ Accéder aux prévisions 7 jours

⚠️ Fonctionnalités désactivées (hébergement statique) :
❌ Paiements (Mollie/Stripe/PayPal)
❌ Tracking clicks/opens
❌ Push notifications

Pour revenir sur l'hébergement principal :
1. Résoudre l'incident FTP chez l'hébergeur
2. Le deploy automatique se fera au prochain push main

Cordialement,
Le Veilleur
```
