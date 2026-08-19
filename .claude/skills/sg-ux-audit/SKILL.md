---
name: sg-ux-audit
description: >
  Audit UX complet du site Sargages via Playwright : enregistrement vidéo, screenshots,
  capture console, métriques performance. À charger quand l'utilisateur demande un
  audit UX, une analyse de site, des vidéos du site, des screenshots, « vérifie le site »,
  « check le site », « UX audit », « record the site », ou quand on travaille sur le funnel,
  le paywall, la carte, le responsive, ou le cookie banner.
---

# Audit UX vidéo + screenshot — Sargages

## Commandes rapides

```powershell
# Audit local (Vite dev server automatique)
node scripts/ux-audit.mjs --region mq --port 8799

# Audit site live (pas de serveur local)
node scripts/ux-audit.mjs --region mq --url https://sargasses-martinique.com

# Toutes les régions d'un coup
node scripts/ux-audit.mjs --all

# Mode verbose (logs détaillés)
node scripts/ux-audit.mjs --region mq --verbose
```

## Sortie

Chaque audit produit un dossier dans `tests/ux-recordings/<region>_<timestamp>/` :
- `video.webm` — vidéo complète de la session (interactions + navigation)
- `report.json` — rapport structuré (issues, métriques, scores)
- `console.json` — tous les logs console (errors, warnings, info)
- `screenshots/` — screenshots à chaque étape clé

## Quand utiliser

| Situation | Action |
|-----------|--------|
| Après un push de code | Audit MQ + GP (régions principales) |
| Avant un deploy | Audit complet 5 régions |
| Bug signalé par un user | Audit ciblé sur la zone concernée |
| Refactor UI | Avant/après avec vidéo |
| Nouveau composant | Screenshot + vérification responsive |
| Funnel / paywall | Walkthrough complet du parcours conversion |
| Cookie banner / bottom nav | Vérification overlap + z-index |
| Performance | LCP, CLS, INP via report.json |

## Méthodologie d'analyse

### 1. Vidéo (record until closed)
La vidéo capture TOUT : les animations, les transitions, les clics, les scrolls.
Après l'audit, **lire la vidéo** pour juger :
- Fluidité des animations (60fps ? jank ?)
- Temps de réponse aux clics
- Transitions de page/onglet
- Comportement du map (pan, zoom, pins)
- Apparition du paywall
- Cookie banner → bottom nav overlap

### 2. Screenshots (automatiques à chaque étape)
- `homepage.png` — état initial (data chargée ? verdict visible ?)
- `map.png` — carte avec pins et labels
- `list.png` — vue liste des plages
- `beach-detail.png` — fiche plage ouverte
- `paywall.png` — panneau premium
- `bottom-nav.png` — barre de navigation bas
- `cookie-banner.png` — bannière cookies

### 3. Console errors
Trier par sévérité :
- **CRITICAL** : `window.Mollie.setProfileId`, `Maximum call stack`, `undefined is not`
- **MEDIUM** : `referral_claim` PHP retourné, network failures vers APIs externes
- **INFO** : GA analytics abort (attendu en headless)

### 4. Métriques performance (report.json → performance)
- **LCP** (Largest Contentful Object) : cible < 2500ms
- **CLS** (Cumulative Layout Shift) : cible < 0.1
- **INP** (Interaction to Next Paint) : cible < 200ms
- **TBT** (Total Blocking Time) : cible < 200ms

### 5. Vérifications critiques

#### Funnel conversion
```
Carte → clic pin → fiche plage → CTA premium → paywall → checkout
```
Chaque transition doit être < 500ms, sans flash blanc.

#### Bottom nav
- z-index : nav (1040) > cookie banner (1025) — OK
- `padding-bottom` sur le contenu principal : `calc(70px + max(16px, env(safe-area-inset-bottom)))`
- Le nav ne doit JAMAIS être clippé par le viewport

#### Cookie banner
- Position : `fixed`, `bottom: 0`
- Ne doit PAS intercepter les clics du bottom nav (z-index correct)
- Doit être dismissable (Accepter/Refuser)

#### Responsive
- iPhone 12 (390×844) = device principal
- Labels visibles sur carte (déclutter : labels propres masqués si toutes propres)
- Texte ≥ 12px (micro), ≥ 15px (body)
- Touch targets ≥ 44px

#### Data freshness
- "DONNÉE EN RETARD" = CRITICAL
- Timestamp < 12h = OK
- Timestamp > 12h = WARNING

## Pièges connus

### Headless artifacts
- **LCP élevé** : en headless Vite, le LCP est biaisé (HMR, Babel transpile) — juger la logique, pas le chiffre
- **rAF throttlé** : ~1fps en headless → les animations rampent = artefact de capture
- **forcedColors Windows** : le rendu peut être délavé — forcer `forcedColors: 'none'` + `colorScheme: 'dark'`
- **GA analytics abort** : les requests Google Analytics échouent en headless = normal

### Dev vs Production
- `window.Mollie.setProfileId` : script Mollie pas chargé en dev = expected
- Network failures vers APIs externes (Supabase, GA) = expected en local
- Vite HMR peut causer des re-renders = artefact

### Sélecteurs CSS
- Les pins carte sont des `<g>` SVG avec `data-beach` attribute
- Les labels sont `.sg-maplabel`
- Le bottom nav est `.sg-bottom-nav`
- Le cookie banner est `.sg-cookie-banner` ou `.sg-v2-cookie-banner`
- Le paywall est `.sg-v2-paywall-panel`

## Multi-sprint

Pour un audit complet, lancer 3 sprints :

```powershell
# Sprint 1 : MQ + GP (régions principales, ~60s chacune)
node scripts/ux-audit.mjs --region mq
node scripts/ux-audit.mjs --region gp

# Sprint 2 : FL + PC + RM (régions secondaires)
node scripts/ux-audit.mjs --region florida
node scripts/ux-audit.mjs --region puntacana
node scripts/ux-audit.mjs --region rivieramaya

# Sprint 3 : Live site (production, pas de Vite)
node scripts/ux-audit.mjs --region mq --url https://sargasses-martinique.com
```

## Format de sortie attendu (exemple)

```
=== AUDIT: mq ===
Issues: 1 critical, 2 warnings, 1 medium
  [CRITICAL] Maximum call stack size exceeded (useFrustrationDetection.js:9)
  [WARN] No beach labels visible on map (declutter: all clean)
  [WARN] Could not find clean beach count (timing)
  [MEDIUM] Cookie banner may overlap bottom nav (14px)

Performance:
  LCP: 15620ms (headless artifact — dev server)
  CLS: 0.02
  Score elements: 53

Video: tests/ux-recordings/mq_1787152892037/video.webm
Report: tests/ux-recordings/mq_1787152892037/report.json
```
