# REFONTE — RUNBOOK D'EXÉCUTION (handoff bulletproof · valable Opus OU Sonnet)

> **But : n'importe quel modèle (y compris Sonnet) peut continuer la refonte sans casser ni dériver.**
> Lire CE fichier + le tableau de bord en tête de `design/REFONTE-MASTER.md` + les specs `design/specs/*.md`.
> Mise à jour : 2026-06-16.

---

## 0 · MISSION + ÉTAT
- **Mission** : refonte A→Z, **couverture TOTALE** (chaque page, écran, élément, requête SEO) à la **barre HomeAZ**, **chaque changement en A/B**, sans jamais casser SEO/funnel.
- **Live en prod aujourd'hui** (SW v174, MQ+GP) : Accueil A→Z (`home_az`), Plan-B fiche (`pw_planb`), badge H2S fiche (`pw_h2s`), fiabilité par régime, **carte `map_world`** (`WorldMapView` region-aware A/B 50/50).
- **En cours** : fiche « plongée » (`pw_beach_dive`).
- **Avancement ~20 %.** Dashboard = haut de `design/REFONTE-MASTER.md` (le mettre à jour à chaque tick).

---

## 1 · CADENCE (chaque action, sans exception)
**proto validé → build dans le monolithe → VÉRIF navigateur → ship A/B réversible → push → cocher le dashboard.**
1 action concrète et COMPLÈTE par tick. Jamais un demi-truc. Jamais shipper non-vérifié.

---

## 2 · BASES VALIDÉES (NE PAS re-explorer · NE PAS purger · NE PAS re-décider)
| Surface | Fichier base | Note |
|---|---|---|
| Accueil (réf. de qualité/vibe) | `src/HomeAZ.jsx` + `src/home-az-assets.js` (généré par `scripts/build-homeaz.cjs`) | LIVE `home_az`. LA référence golden-hour. |
| Carte | `design/proto-map-v2.html` + `design/mq-outline.json` (vraie géo MQ, OSM) | base approuvée « déjà mieux ». À rendre interactive + porter. |
| Fiche plage | `design/proto-plage-plongee.html` (**PRÉFÉRÉE FONDATEUR — NE JAMAIS SUPPRIMER**) | + greffes de `design/proto-plage-v2.html` (Rocher Diamant, chip H2S). |
| Le QUOI (marque) | skill `sg-design-system` | palette, fonts, Veilleur, doctrine. |
| Le COMMENT (moteur) | skill `sg-svg-scene` | viewBox 800×600 slice, 1 rAF, pièges payés. |

---

## 3 · VÉRIFICATION — OBLIGATOIRE avant tout ship
⚠️ **L'app preview TIMEOUT** (rAF continu) → toujours vérifier via serveur local + Playwright.
```bash
# serveur (depuis le repo)
python -m http.server 8790 --bind 127.0.0.1   # (en background)
# Playwright : script .cjs DANS le repo (sinon 'Cannot find module playwright')
#   navigate http://127.0.0.1:8790/design/<proto>.html  (file:// BLOQUÉ)
#   waitForTimeout(1000) ; capter pageerror + console.error ; screenshot ; Read le png ; interagir (scroll/click)
# syntaxe JSX avant edit monolithe :
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"
# smoke build complet (intégration) :
npm run build   # attendre "built in", vérifier chunk + 136 pages + 0 erreur
```
**JUGER soi-même la capture** (la barre = HomeAZ). Si moche/illisible → corriger AVANT de montrer/ship.

---

## 4 · PORT A/B (intégrer un proto dans `Sargasses_PROD.jsx`)
- Flag : `abVariant("nom",["control","variant"],[poids,poids])` + override `?nom=1/0`. Modèles : `home_az` (l.~10188), `pw_planb`, `pw_h2s`, `landing_funnel`.
- **ADDITIF** : le control reste 100 % intact (jamais le remplacer, juste un 3e bras).
- Gros composant → `lazyWithRetry(()=>import("./src/X"))` (cf. `LazyHomeAZ`/`LazyMapView`).
- CSS à classes génériques → **Shadow DOM** (cf. HomeAZ : `host.attachShadow`, `<style>`.textContent, `createContextualFragment`, **jamais `innerHTML`** = hook sécurité bloque).
- Conversion = **`openPremium(source)` UNIQUE**, contextualisé (plage+verdict).
- **Tracking** : réutiliser les events `sg_*` à l'identique (sinon récidive `funnel_tracking_gap`).
- Deep-link `/plages/<slug>/` (136 pages) + funnel = **intacts**.

---

## 5 · GIT / DEPLOY
- `git pull --rebase` **AVANT** push (auto-commits data fréquents). Stash les docs WIP si rebase bloque.
- **JAMAIS `git add -A`** — stage fichier par fichier.
- **SW bump** : `public/sw.js` `CACHE_NAME = 'sargasses-vXXX'` à CHAQUE deploy de code.
- push `main` = déclenche `daily-copernicus.yml` (build + FTP ~50 min ; concurrency guard annule les runs en file). Minutes GH **illimitées**.
- Smoke EUR : **rebuild MQ d'abord**. Commits : finir par `Co-Authored-By: Claude ...`.

---

## 6 · INTERDITS DURS (violer = casser le projet)
- ❌ `stripe-config.php` JAMAIS touché.
- ❌ Aucune page supprimée **sans 301**. `slug=nom=SEO` (ne JAMAIS renommer une plage).
- ❌ **Zéro image IA.** Doctrine calme (repos = tableau ; `prefers-reduced-motion` = plancher dur, early-return avant rAF).
- ❌ Le Veilleur = **UN seul satellite**, **rassure ≠ surveille** (ne fixe JAMAIS l'utilisateur, pas d'œil-HAL ; œil mi-clos serein).
- ❌ **Shabbat ven 18h → sam 19h : ne RIEN déployer** (GH Actions couvrent l'ops).
- ❌ **NE JAMAIS supprimer un proto sans certitude absolue** (leçon : `proto-plage-plongee` purgé par erreur → restauré depuis la trace workflow). En doute → GARDER.
- ❌ Pas d'agent-slop en prod : un proto produit par agent se **vérifie au navigateur + se refait à la main** s'il ne passe pas la barre, avant tout port.
- ❌ `feedback_forecast_floor_ban` : jamais de `cleanFloor` atlantique ; la re-teinte au scrub se branche UNIQUEMENT sur `forecast[].status/regime`.
- ❌ Pas de pop-up/carte flottante par-dessus la scène (`feedback_no_ui_in_ui`) : l'info vit DANS la scène.

---

## 7 · LE PLAN (phases ordonnées par LEVIER) — détail item par item dans `design/specs/*.md`
- **A · conversion** : carte interactive → `map_world` ; fiche plongée → `pw_beach_dive`.
- **B · levier #1 + SEO bloquant** : demo-gate email (capture 0,35 %) ; canonical/hreflang + indexation (MQ ~3/30, GP ~2/30) ; copie paywall contextualisée (modal→CTA 2 %).
- **C · balayage page par page** (barre HomeAZ, chacune A/B) : `/previsions/`, `/alertes/`, `/plages-sans-sargasses/`, `/plages/<zone>/`, stations `/comprendre` `/detection-satellite` `/danger-h2s` `/nettoyer` `/methode-carte`, `/a-propos/`, `/fiabilite/` (UI), `/conditions/`, `/widget/` ; puis shell + contenu SEO des 136 fiches.
- **D · SEO requête par requête** : titres+meta par requête réelle (GSC), désambiguïsation `/saison-*`, fraîcheur, sitemaps ; créer `/sargasses-pres-de-moi/`, `/sargasses-aujourdhui/`, zones `/plages/<commune>/`, OG dynamiques ; 301 legacy.
- **E · éléments** : dock profondeur, share-cards (si modal→CTA ≥5 %), baignade #5, collecte #9.

---

## 8 · CONTEXTE / POURQUOI (ne pas re-dériver)
- Goulot = **conversion** (modal→CTA **2 %**), PAS le trafic. **Capture email 0,35 % = levier #1.** Demande #1 (GSC) = **temps réel / aujourd'hui**. **EUR (MQ+GP) >> USD.** Carte = **25 % des clics**.
- **Goût = A/B live** (`node scripts/automation/ab-eval.cjs --days=28` + funnel Apps Script). **Jamais** faire valider des candidats au fondateur. **Ping fondateur UNIQUEMENT sur du concret live en prod.**

## 9 · MONITORING (pour le fondateur)
Dashboard en tête de `design/REFONTE-MASTER.md` (avancement, ✅/🟡/🔴) · `git log` (chaque ship) · `/workflows` (workflows finis) · mes pings. **« Fini » = tout ✅.**

---

## 10 · MULTI-SITES (la refonte couvre TOUS les sites, pas que MQ/GP)
**5 régions** (config : `regions/<id>.json` → `bbox`, `center`, `name`) :
| id | marché | plages (source) | géo |
|---|---|---|---|
| `mq` | Martinique (EUR) | `public/data/beaches-list.json` filtré `island==='mq'` | ✅ |
| `gp` | Guadeloupe (EUR) | `beaches-list.json` filtré `island==='gp'` | ✅ |
| `florida` | Floride/Miami (USD) | `regions/florida.json` `.beaches` (12) | ✅ |
| `puntacana` | Punta Cana / RD (USD) | `regions/puntacana.json` `.beaches` (12) | ✅ |
| `rivieramaya` | Cancún / Riviera Maya (USD) | `regions/rivieramaya.json` `.beaches` (12) | ✅ |

- **Géo côtière réelle** : `public/data/region-outlines/<id>.json` (path SVG + bbox + proj), généré par `scripts/build-region-outlines.cjs` (OSM→clip bbox→DP→projection). Régénérer si une `bbox` change : `node scripts/build-region-outlines.cjs [id]`.
- **RÈGLE D'OR MULTI-SITES** : toute surface refondue (carte, fiche, pages, éléments) doit être **REGION-AWARE** — lire la région active (build `__REGION__` / `REGION`/`IS_NEW_REGION` dans `Sargasses_PROD.jsx`, ou `?region=` côté proto), **JAMAIS hardcoder MQ**. Le build émet les variantes par région (`vite.config.js` + `__REGION__`).
- **VÉRIFIER chaque surface sur les 5 régions** avant ship (le proto carte le fait via `?region=`). Bench/labels : MQ a un relief sur-mesure ; les autres non (générique). EUR>>USD = prioriser MQ/GP mais livrer les 5.
