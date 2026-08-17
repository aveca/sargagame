# Visual/UX Agent Prompt — Sargasses Experience Audit

## Context
Sargasses = SaaS prévision sargasses (5 régions live, 136+ pages SEO). Core moat = **honnêteté** via Le Veilleur (mascotte qui "regarde la mer pour vous").

**Stack:** React 18 + Vite, SVG/WebGL hero scenes, 400+ hero videos MP4, 100+ OG images, comic panels, Cloudflare Pages + cPanel FTP deploy.

## Current State
- **Deploy/Infra:** ✅ 5/5 sites live, SSL Full, payments work (US domains), build 182.5 Ko
- **Data/Code:** ✅ Pipeline ERDDAP fresh, 34/34 Playwright pass
- **Experience:** ❌ **Broken** — assets exist but not wired into journey

## Assets Available (in repo)
```
/public/videos/hero/{beach}.mp4          → 400+ hero loops (poster + wide)
/public/images/og/                        → 100+ OG images per region
/src/BeachHeroVideo.jsx                   → Video component (poster→autoplay logic exists)
/src/BeachSheetComic.jsx                  → 3-panel comic intro (never triggered)
/src/BeachSheet.jsx / BeachSheetComic.jsx → Beach fiche components
/src/ChasseHome.jsx / ChasseDetail.jsx    → Narrative scroll pages
/src/PremiumModal/OnsiteCheckout.jsx      → Paywall (needs Le Veilleur voice)
/src/Sargasses_PROD.jsx                   → Main app (boot, map, routing)
/src/BeachHeroVideo.jsx                   → Video autoplay logic (poster→autoplay)
/src/app-runtime.css                      → Design tokens (golden-hour palette)
```

## Audit Scope — 12 Screens to Review

| Screen | File | Current State | Expected |
|--------|------|---------------|----------|
| **1. Boot/Loading** | `Sargasses_PROD.jsx` (boot skeleton) | Static skeleton, no Le Veilleur | Le Veilleur "wakes up" (eye blink, horizon scan) |
| **2. Home Hero** | `Sargasses_PROD.jsx` + `BeachHeroVideo` | Static SVG, no video | Le Veilleur scans horizon → hero video autoplays |
| **3. Map → Beach Tap** | `WorldMapView.jsx` + `BeachSheet` | Hard cut to fiche | "Le Veilleur dives" SVG/WebGL transition |
| **4. Beach Fiche** | `BeachSheet.jsx` / `BeachSheetComic` | Data loads instantly | 3-panel comic intro → then data |
| **5. Beach Video Hero** | `BeachHeroVideo` + `/videos/hero/` | Videos exist, don't play | Poster → autoplay muted on scroll/view |
| **5b. Scroll Story** | `ChasseHome` / `ChasseDetail` | Partial impl | Full scroll narrative (Le Veilleur narrates) |
| **6. Paywall** | `PremiumModal/OnsiteCheckout` | Generic Mollie | Le Veilleur: "I watched this beach for you..." |
| **7. Onboarding** | None | None | Le Veilleur introduces himself |
| **8. Scroll Pages (SEO)** | Various landing pages | Partial | Consistent Le Veilleur narrative |
| **8b. Carte Sargasses** | Dedicated page | Functional | Le Veilleur "scan" animation |
| **8c. Prévisions** | Landing | Functional | Le Veilleur "forecast" voice |
| **8d. B2B Landing** | `/sargasses-pour-hotels/` | Functional | Le Veilleur "pro" tone |

## Deliverables from Visual Agent

### 1. Visual Audit Report (Markdown)
- Screenshot/video of each screen (current vs expected)
- Asset utilization gaps (which videos/OG images unused)
- Motion gaps (missing transitions, timing)
- Copy gaps (Le Veilleur voice missing)

### 2. Motion Spec (for dev)
| Transition | Duration | Easing | Trigger |
|------------|----------|--------|---------|
| Boot → Hero wake | 800ms | ease-out | Boot complete |
| Hero video start | 300ms | ease-in | Hero visible |
| Map → Dive | 600ms | cubic-bezier | Beach tap |
| Dive → Comic | 400ms | ease-out | Dive complete |
| Comic → Data | 300ms | ease-in | Comic done |
| Fiche → Paywall | 500ms | ease-in-out | CTA click |

### 3. Asset Map
- Which hero videos map to which beaches
- Which OG images used where
- SVG scenes inventory (Le Veilleur poses, beach scenes)

### 4. Copy/Voice Guide
- Le Veilleur tone: "watches, doesn't scare" / "honest, not alarmist"
- Key phrases per screen

## Files to Review (Priority)
1. `src/Sargasses_PROD.jsx` (boot, hero, routing)
2. `src/BeachHeroVideo.jsx` (video logic)
2. `src/BeachSheetComic.jsx` (comic component)
3. `src/BeachSheet.jsx` / `BeachSheetComic.jsx` (fiche)
4. `src/ChasseHome.jsx` / `ChasseDetail.jsx` (scroll narrative)
4. `src/PremiumModal/OnsiteCheckout.jsx` (paywall)
5. `src/app-runtime.css` (design tokens, golden-hour palette)
6. `public/videos/hero/` (asset inventory)
6. `public/images/og/` (OG images)
6. `src/WorldMapView.jsx` (map, dive trigger)

## How to Test
```bash
npm run dev
# Visit http://localhost:5173/ (MQ) or /gp/ (GP)
# Test: boot → hero → map → beach tap → fiche → paywall
```

## Handoff
- Code agent (me) wiring journey in parallel
- Need visual spec + motion spec + asset map by [date]
- Will implement per spec

---
**Priority:** Home hero wake + Map dive + Beach comic + Video autoplay = 80% of experience value.