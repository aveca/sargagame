# NEXT_SESSION — sargagame

> **⏹️ ARRÊT PROPRE 2026-06-16 (quota Opus ~99 %).** Session archivable. Tout est commité. Aucune tâche de fond active (boucle `/loop` non ré-armée = stoppée ; elle était de toute façon liée à la session ; workflows tous terminés ; serveurs dev locaux tués). La suite reprend sur **Sonnet** avec le prompt ci-dessous.

## ▶️ REPRISE (nouvelle session — Opus OU Sonnet)
1. **LIRE D'ABORD `design/REFONTE-EXECUTION.md`** (runbook bulletproof : cadence, vérif navigateur 8790+Playwright car l'app preview TIMEOUT, port A/B, git, INTERDITS, bases validées, **§10 MULTI-SITES**).
2. Puis le **tableau de bord** en tête de `design/REFONTE-MASTER.md` (avancement ✅/🟡/🔴) et les **specs page-par-page** `design/specs/*.md`.
3. Exécuter le prompt de reprise ci-dessous (= mandat complet, tous sites).

## ✅ ÉTAT À L'ARRÊT
**Live en prod (toutes régions, SW v173) :** Accueil A→Z (`home_az`), Plan-B fiche (`pw_planb`), badge H2S fiche (`pw_h2s`), fiabilité par régime.
**Protos VALIDÉS + vérifiés navigateur, prêts à porter (NE JAMAIS purger) :**
- `design/proto-map-v2.html` — carte **interactive MULTI-SITES** (`?region=mq|gp|florida|puntacana|rivieramaya`) : vraie géo OSM (`public/data/region-outlines/`), pan/zoom/pinch, tap plage→plongée flyTo + verdict + CTA, scrub des jours (J0 gratuit / J+1+ → openPremium), Veilleur data-driven. 5 sites vérifiés.
- `design/proto-plage-plongee.html` — **fiche NEAR « plongée » (PRÉFÉRÉE FONDATEUR)** : satellite-héros + scrollytelling verdict→preuve→prévision lockée. Greffes à intégrer depuis `design/proto-plage-v2.html` (Rocher du Diamant, chip H2S).
- Géo réelle des 5 régions : `public/data/region-outlines/*.json` (générée par `scripts/build-region-outlines.cjs`).
- Réf. de qualité/vibe : `src/HomeAZ.jsx` (+ `src/home-az-assets.js`).

**PROCHAINE ACTION = porter la carte en A/B `map_world` (region-aware), puis la fiche en `pw_beach_dive`, puis le reste (specs).**

## 🧭 MULTI-SITES (couvrir TOUS les sites, jamais hardcoder MQ)
5 régions : `mq`,`gp` (EUR, plages dans `public/data/beaches-list.json` filtré `island`) · `florida`,`puntacana`,`rivieramaya` (USD, plages dans `regions/<id>.json` `.beaches`). Config : `regions/<id>.json` (bbox/center/name). Géo : `public/data/region-outlines/<id>.json`. Toute surface = REGION-AWARE + vérifiée sur les 5 régions. EUR>>USD = prioriser MQ/GP mais livrer les 5.

## 🧩 BACKLOG (ordre par levier — détail dans `design/specs/<slug>.md`)
- **A** carte→`map_world` ; fiche→`pw_beach_dive`
- **B** demo-gate email (capture 0,35 %) ; canonical/hreflang+indexation ; copie paywall contextualisée
- **C** pages : previsions, alertes, clean-list, zones, 5 stations, a-propos, fiabilite, conditions, widget, 136 fiches
- **D** SEO requête-par-requête + nouvelles pages (/près-de-moi, /aujourdhui, zones /plages/<commune>) + OG + 301
- **E** dock, share-cards, baignade #5, collecte #9

## 📋 PROMPT DE REPRISE (à coller dans la session Sonnet)
```
Tu reprends la refonte du site Sargasses. SITES À COUVRIR (tous, jamais hardcoder MQ) :
Martinique (mq), Guadeloupe (gp) [EUR] + Floride/Miami (florida), Punta Cana (puntacana),
Cancún/Riviera Maya (rivieramaya) [USD]. Tu n'es peut-être pas Opus : suis les docs À LA
LETTRE, n'improvise pas, vérifie TOUT au navigateur, ne casse rien.

1) LIS D'ABORD design/REFONTE-EXECUTION.md (runbook : cadence, vérif navigateur via serveur
   8790 + Playwright car l'app preview TIMEOUT, port A/B, git, INTERDITS, bases validées,
   §10 MULTI-SITES). Puis le tableau de bord en tête de design/REFONTE-MASTER.md et les specs
   design/specs/*.md (1 par page/élément : flag A/B + fichiers/lignes réels).

2) MULTI-SITES : config = regions/<id>.json (bbox/center/name). Plages : mq/gp dans
   public/data/beaches-list.json (filtré island), USD dans regions/<id>.json .beaches. Géo
   côtière réelle = public/data/region-outlines/<id>.json (générée par
   scripts/build-region-outlines.cjs). TOUTE surface refondue = REGION-AWARE (build __REGION__
   / IS_NEW_REGION dans Sargasses_PROD.jsx) + vérifiée sur les 5 régions.

3) ÉTAT : live prod (toutes régions) = home_az, pw_planb, pw_h2s. Protos validés à porter =
   design/proto-map-v2.html (carte interactive MULTI-SITES, ?region=, vérifiée) +
   design/proto-plage-plongee.html (fiche, PRÉFÉRÉE FONDATEUR). NE JAMAIS purger ces protos.

4) PROCHAINE ACTION = porter design/proto-map-v2.html dans Sargasses_PROD.jsx derrière A/B
   map_world, REGION-AWARE (charge public/data/region-outlines/<REGION>.json + plages de la
   région) : cadrer/promouvoir ArchipelView (~l.9725), peau golden-hour + vraie géo + lagon,
   pan/zoom/tap-plongée/scrub ; control = MapView Leaflet 100% intact ; deep-link 136 pages +
   events sg_* identiques ; openPremium contextualisé. Vérifier : esbuild + npm run build
   (0 erreur, 136 pages) + 8790+Playwright sur mq ET gp ET une USD. SW bump. git pull --rebase
   puis push. Cocher le tableau de bord.

5) PUIS suivre les specs : fiche pw_beach_dive (proto-plage-plongee + greffes proto-plage-v2,
   region-aware), demo-gate email, canonical/hreflang (toutes régions/langues), copie paywall,
   puis chaque page (previsions/alertes/clean-list/zones/stations/a-propos/fiabilite/conditions/
   widget/fiche-seo) selon design/specs/<slug>.md, puis SEO + éléments (dock, share-cards,
   baignade, collecte). Chaque page = region-aware + A/B + vérifiée sur les 5 sites.

RÈGLES DURES : tout ADDITIF + A/B + réversible, control intact ; stripe-config jamais touché ;
aucune page sans 301 ; slug=nom=SEO ; zéro image IA ; Veilleur=1 satellite rassure≠surveille ;
doctrine calme + reduced-motion floor ; Shabbat ven18h→sam19h no-deploy ; jamais git add -A ;
jamais purger un proto sans certitude ; EUR (MQ/GP) prioritaire mais LIVRER les 5 sites ;
en doute → ne pas déployer/supprimer, vérifier au navigateur. Goût = A/B live (les users
tranchent), jamais faire valider des candidats au fondateur. Ping le fondateur UNIQUEMENT sur
du concret live en prod. Mets à jour design/REFONTE-MASTER.md à chaque item.
```

## 🚧 Garde-fous (rappel, détail dans REFONTE-EXECUTION.md §6)
EUR/MQ-GP intouchables (smoke EUR rebuild MQ d'abord) · `stripe-config.php` jamais touché · aucune page sans 301 · slug=nom=SEO · SW bump par deploy · grouper les pushes · JAMAIS `git add -A` · `git pull --rebase` avant push · Shabbat ven 18h→sam 19h no-deploy · doctrine calme + reduced-motion floor · Veilleur=1 satellite rassure≠surveille · zéro image IA · vérifier tout href par curl · ne jamais purger un proto sans certitude.
