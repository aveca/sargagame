# REFONTE MASTER — colonne vertébrale d'exécution
**On exécute du global au grain fin, action par action.** Source : IA workflow site-univers + KPI réels + skills `sg-design-system`/`sg-svg-scene`. Règles dures partout : strangler-fig (jamais casser SEO/funnel), additif + A/B + réversible + vérifié, slug=nom=SEO, aucune page sans 301, zéro image IA, doctrine calme, Le Veilleur **rassure ≠ surveille** (un seul objet = le satellite).

---

## 📊 TABLEAU DE BORD — COUVERTURE (maj à chaque tick · MONITOR FONDATEUR)
> **C'est ICI qu'on suit l'avancement.** La boucle met ce bloc à jour à chaque action. « Fini » = tout en ✅.
> Avancement global estimé : **~60 %** · maj 2026-06-16.

| Phase | Lot | État |
|---|---|---|
| — | Accueil A→Z (`home_az`) · Plan-B (`pw_planb`) · H2S (`pw_h2s`) · fiabilité régime | ✅ **LIVE prod** |
| A | Carte interactive **MULTI-SITES** (`WorldMapView` region-aware — vraie géo OSM 5 régions, pan/zoom/tap/scrub) — A/B `map_world` 50/50, `src/WorldMapView.jsx`, SW v174 | ✅ **LIVE prod** |
| A | Fiche « plongée » — `pw_beach_dive` 50/50, `src/BeachDive.jsx`, beats=6, factors=7, Veilleur v2, scroll+scrub, SW v175 | ✅ **LIVE prod** |
| B | Demo-gate email `capture_gate` 50/50 — intercept forecast intent → email gate → PremiumModal, SW v176 | ✅ **LIVE prod** |
| B | Canonical/hreflang + indexation (MQ ~3/30 · GP ~2/30) | 🔴 à faire |
| B | Copie paywall contextualisée `pw_modal_ctx` — beach name + score injectés dans hero + preuve PremiumModal, SW v177 | ✅ **LIVE prod** |
| C | Pages : prévisions · alertes · clean-list · zones · 5 stations · à-propos · fiabilité UI · conditions · widget | 🔴 à faire |
| C | Les 136 fiches plages (contenu/SEO) | 🔴 à faire |
| D | SEO requête par requête + nouvelles pages (`/près-de-moi`, `/aujourdhui`, zones) + OG + 301 legacy | 🔴 à faire |
| E | Dock · share-cards · baignade #5 · collecte #9 | 🔴 à faire |

**Comment monitorer :** ce tableau (avancement) · `git log` (chaque ship = 1 commit) · `/workflows` (workflows finis) · mes pings (concret live prod). **Fin = toutes les lignes ✅.**

---

## 0 · STRUCTURE GLOBALE
**UN monde SVG, UNE caméra, 3 profondeurs, une primitive `flyTo(lieu, profondeur)`.** (ArchipelView l.9474 = déjà FAR 0.32 / MID 0.82 / NEAR 2.6 ; StoryEngine = le mouvement ; deep-link slug = le téléporteur ; `openPremium` = la sortie unique.)
- **FAR** = carte / vue d'ensemble (home au repos, /carte, /previsions, hubs clean-list/conditions, +nouveau /aujourd'hui /près-de-moi).
- **MID** = côte / quartier (/plages/<zone>/).
- **NEAR** = la plage (fiche /plages|beaches|playas/<slug>/) — la BeachScene remplit l'écran, paywall au bord de la valeur.
- **Stations narratives** (StoryEngine, finissent en flyTo) · **Porte conversion unique** · **Confiance/viral/capture** · **Infra (legal/404/sitemaps/hreflang)**.

---

## 1 · PAGE PAR PAGE (24 types · action/priorité)
**P0 restyle** : `/` (home) · `/plages/<slug>/` (≈136 fiches) · `/carte-sargasses/` (+EN/ES/USD) · `/plages-sans-sargasses/` (+variants) · `/alertes/` (hub Premium).
**P0 keep** : Paywall (openPremium).
**P1 restyle** : `/previsions/` · `/plages/<zone>/` (zones) · `/saison-sargasses-<region>/` · stations éducatives (`/comprendre`,`/detection-satellite`,`/danger-h2s`,`/nettoyer`,`/methode-carte`) · `/fiabilite/` · `/a-propos/`.
**P1 keep** : `/meilleures-plages-<region>/` · `/sargasses-<region>-cette-semaine/`.
**P2 restyle** : `/conditions/<x>/` · `/widget/`.
**P2 keep** : bilans datés `/sargasses-<mois>-<an>/` · `/resorts|hoteles/<slug>/` · `/jeu/` · `/confirme/` · legal.
**P2 merge→301** : `weekend.html`,`onboarding.html`,`sarg_carte_satellite_app.html`,`/articles/*` · **redirect** : `neptunes_fury.html`.
**5 nouvelles** : `/sargasses-pres-de-moi/` (FR/EN/ES, géo) · `/sargasses-aujourdhui/` (parité USD 'today') · OG images dynamiques par plage (SVG→PNG) · (Bahamas `/staging/` VERROUILLÉ).
**9 redirects** : weekend→/previsions ; sarg_carte→/carte ; onboarding/neptunes→/ ; /articles/*→hebdo ; legacy communes/plage(s)→/plages/<slug> (déjà .htaccess) ; /fiabilite fallback→/a-propos ; ?decouverte/?solutions→stations.

---

## 2 · ÉLÉMENT PAR ÉLÉMENT (composants réutilisables)
| Élément | Où | Statut | Règle |
|---|---|---|---|
| Hero perso (H1 daté « TA plage aujourd'hui · EN DIRECT » + badge verdict/score + freshness réelle + CTA) | home + fiches | à câbler | resolver coarse 1er paint ; freshness <12h sinon « vérif en cours » |
| Scène golden-hour (ciel/soleil/mer/sable en plans parallaxe) | toutes profondeurs | existe (HeroScene/BeachScene) | calme au repos, profondeur PRO |
| **Le Veilleur-satellite** (1 objet, 3 humeurs data-driven, veille la mer) | partout (star) | v2 prêt | rassure≠surveille ; setVeilleurScore |
| Bateau/**yole** ronde colorée | scène (vie/échelle) | à ajouter | barre qualité PRO |
| Radeaux sargasse + barrage (clic) + faune (nudge) | scène | existe (funnel proto) | incident, non bloquant, sans score |
| Badge verdict + score 0-100 | hero/fiche | existe | source pipeline |
| Top-3 cartes plage (scroll-snap) + picker | verdict beat | existe | onOpenBeach |
| ForecastChart + **pw_beat** (lock J2-7 in-scène) | fiche NEAR | existe | surface paywall UNIQUE, openPremium('forecast_lock') contextualisé |
| Dock = **sélecteur de profondeur** (Carte/Plages/Premium) | chrome | à faire | onglet Premium = action (pas surligné — OK) |
| Paywall modal (Stripe on-site, pw_calm/constel) | conversion | existe (optimisé) | enrichir copie « veilleur surveille TA plage » + temps-réel |
| Live pill (EN DIRECT + heure réelle) · switch FR/EN/ES | chrome | existe | jamais de fake timestamp |
| Stations StoryEngine (beats + CTA→flyTo) | éducatif | existe, CTA à rebrancher | finir en flyTo, anti-cul-de-sac |
| Share-card + OG dynamiques (SVG→PNG sharp) | viral/SERP | VERROUILLÉ jusqu'à funnel sain | deep-link + visuel du lieu |
| Demo-gate email (aha-moment → 1 champ) | capture | à construire | répare 0,35% |

---

## 3 · SVG PAR SVG (scènes/assets)
- **Monde unifié 3 profondeurs** (FAR archipel / MID côte / NEAR plage = MÊME scène, caméra) — étendre ArchipelView, LOD/culling par profondeur (perf N×N).
- **Veilleur-satellite v2** — `design/proto-veilleur-clip-v2.html` (1 objet, œil mi-clos serein, 3 humeurs, snap couleur, transform corrigé). ✅ prêt.
- **Yole/bateau** — à dessiner (MQ yole ronde ; voilier USD). ⏳
- **BeachScene** (9 archétypes, PRNG seedé) — existe, à brancher en NEAR.
- **Scènes StoryEngine** (DiscoveryStory, scan satellite, AlertScene, dérive) — existent.
- **Funnel scroll 5 beats** — `design/proto-home-funnel.html` (sticky réparé, cross-fade). ✅
- **OG par plage** (SVG→PNG) — à créer. ⏳
- Pièges SVG (skill `sg-svg-scene`) : sticky (.scroller = Σspans + 1 viewport) ; transform de pose `translate(cx,cy) rotate()` sans translate parasite ; snap couleur humeur ; viewBox 800×600 slice ; 1 rAF + pause visibilitychange ; reduced-motion floor.

---

## 4 · PROBLÈME PAR PROBLÈME

### 4A · PROBLÈMES SARGASSES = LE PRODUIT (créativité = résoudre ÇA, pour les gens)
> Clarif fondateur 17/06 : « problème par problème » = être créatif pour résoudre les **problèmes liés aux sargasses** (la valeur, pour les gens), pas (que) ceux du site. Beaucoup de solutions = des **widgets/SVG déjà validés à IMPLÉMENTER un par un** dans leur surface.

| # | Problème vécu (sargasse) | Solution créative / feature | Asset/widget (statut) | Où | Free/Prem |
|---|---|---|---|---|---|
| 1 | « Ma plage, envahie AUJOURD'HUI ? » (angoisse #1) | Verdict temps-réel + Le Veilleur scanne TA plage en direct | clip Veilleur (✅ widget) | hero NEAR | free (teaser) |
| 2 | « Où aller à la place ? » (plan B immédiat) | « Plages propres près de toi maintenant » + flyTo vers l'alternative | clean-list/carte (✅) | FAR /près-de-moi | free |
| 3 | « Et demain / mes vacances ? » (planning) | Prévision 7j/plage + « ton meilleur jour cette semaine » | ForecastChart (✅) | NEAR /prévisions | Premium |
| 4 | **« Ça pue / c'est dangereux ? » (H2S)** | **ALERTE SANTÉ** : sargasse en décompo = H2S (œuf pourri) → risque respiratoire (asthme, bébés, femmes enceintes, âgés). Badge santé/H2S + « aère / ferme les fenêtres » riverains + seuils | **data ✅** (h2s.cjs + pipeline, commit 1d978b6c) · proto ✅ proto-h2s-health-index.html · **UI à intégrer (NEAR)** | NEAR + alerte | free badge / Prem alerte — **FORT & sous-exploité** |
| 5 | « Je peux me baigner ? enfants ? chien ? » | Indicateur baignade / kids-safe / animaux par plage | /conditions (✅) | NEAR | free |
| 6 | « Être prévenu AVANT que ça arrive » | Le veilleur personnel (alerte la veille du changement) | AlertScene (✅) | /alertes | Premium (cœur) |
| 7 | Riverains/locaux (odeur, qualité de vie) | Alerte H2S géolocalisée + « calendrier de ton quartier » | flyTo MID ⏳ | /près-de-moi | Premium |
| 8 | Hôtels/restos/locations (éco touristique) | Dashboard B2B + widget embeddable « état de la plage devant l'hôtel » + brief clients | /widget /resorts (⏳) | B2B | revenu B2B |
| 9 | « C'est ramassé quand ? » + signaler un échouage | Community reports / Ground-Truth Snap + carte de collecte | Community overlay (✅) | NEAR /confirme | free (contrib) |
| 10 | Comprendre (pourquoi ça arrive, ce que ça devient) | DiscoveryStory ludique : ceinture → dérive → H2S → recyclage | StoryEngine (✅) | stations | free |
| 11 | Agir / valoriser / aider la région | SolutionsStory (engrais/biogaz/construction) + page « agir/soutenir » + lien fonds habitants | SolutionsStory (✅) + nouvelle /agir ⏳ | station /nettoyer | free (mission) |
| 12 | « C'est fiable ? » (confiance) | Fiabilité PAR RÉGIME + transparence méthode | /fiabilite (✅) | /fiabilite | free |

→ Règle : chaque widget/SVG validé ci-dessus = à **retravailler + implémenter dans sa surface** (un par un), pas à re-montrer. Priorité produit : #1 #4(H2S) #2 #3 #6 (les plus vécus + différenciants).

### 4B · Problèmes site/conversion (hygiène d'exécution — bien aussi, mais ≠ le produit)
(chacun = la data + le fix)
1. **modal→CTA 2 %** (LE goulot revenu, 3414 modals → 72 CTA) → contextualiser le paywall (plage+verdict) + crier temps-réel. cta→redirect = 92 % (sain). 
2. **Capture email 0,35 %** (567 prompts → 2) → demo-gate à l'aha-moment, single-field (le plus gros levier vierge).
3. **Dismiss hero 61 %** (ceux qui restent : 42 s) → perso 1er paint (TA plage live).
4. **Indexation 3/30 MQ · 2/30 GP** → canonical/hreflang (tâche htaccess spinnée `task_d48a64ca`) = BLOQUANT avant modif pageShell.
5. **Fake freshness** → kill-switch <12h (skill), grep tous libellés.
6. **Stale `/conditions/`, `/articles/`** → revalidation JS live / 301 hebdo.
7. **Cannibalisation /saison-* MQ vs GP** → désambiguïsation titres (mesurer GSC avant 301).
8. **Cul-de-sac stations** (?decouverte/?solutions morts) → CTA→flyTo.
9. **Pièges SVG** (sticky void, transform hors-champ, snap couleur) → encodés skill, vérif navigateur.
10. **Veilleur « fait peur »** → 1 satellite, veille la mer (tranché). **Qualité « bof »** (filets/pas de bateau) → barre qualité + yole (tranché).
11. **Goût** → A/B live + `ab-eval` (automatisé), jamais vibe-jugement. ✅ outil shippé.

---

## 5 · ACTION PAR ACTION (backlog ordonné, cochable)

> **🎯 PRIORITÉ ACTIVE (fondateur 16/06)** : **REFONTE COMPLÈTE de 2 surfaces, en EXPÉRIENCE SVG cohérente** — (1) **LA CARTE** (FAR, /carte-sargasses/, aujourd'hui src/MapView.jsx/Leaflet) et (2) **LES PAGES PLAGES individuelles** (NEAR, BeachSheet, deep-link /plages/<slug>/).
> Directives fondateur (dures) : **plus de SVG** (viser le monde SVG propriétaire, pas Leaflet-décoré ; Leaflet = substrat data seulement si perf l'exige, enveloppé SVG) · **plus d'interactions** (calmes, incidentes) · **liens + assets** (maillage interne riche + remplacer photos diurnes par scènes SVG golden-hour si ça sert) · **UNE expérience continue** home→carte→plage (même caméra, flyTo incassable) · **fluide + garder la VIBE d'ouverture du funnel** = l'accueil A→Z (src/HomeAZ.jsx) comme référence de grammaire visuelle.
> Workflow specs `wrbyee2gi` (explore code+assets → 3 directions SVG-first/surface → juge → spec buildable + plan assets/liens) en cours → à la complétion : BUILD proto standalone par surface → vérif navigateur (harnais) → port A/B (`map_refonte` / `beach_refonte`). Baignade #5 + collecte #9 = **différées après** ces 2 refontes.
**PHASE 0 — réparer le FIL de conversion (avant d'embellir).** KPI : leak<10 %, 0 fake freshness, 0 href cassé, indexation en hausse.
- [ ] Vérifier le leak CTA→redirect post same-tab (mon pull : 92 % = ~OK) ; sinon corriger la race beacon.
- [ ] Kill-switch fake freshness (grep « vérifié/maj/en direct » → `formatFreshness(updatedAt)`).
- [ ] Slug canonique unique par plage/zone dans `beaches-list.json` + resolver partagé app+build (fin du regex drift).
- [ ] `.htaccess` /fiabilite→/a-propos (fallback) + curl tous les hrefs (tâche htaccess).
- [ ] Canonical/hreflang PASS (prérequis avant pageShell).

**PHASE 1 — flyTo sur la porte NEAR (plus fort levier).** KPI : modal→CTA 2 %→≥5 %, verdict<1s, 0 perte SEO.
- [x] **Accueil A→Z BUILT + VÉRIFIÉ navigateur** (`design/proto-home-az.html`, 87KB) : funnel scroll + satellite v2 (1 objet, rassure) + yole + perso H1 daté EN DIRECT ; sticky épinglé partout, 5 beats + footer (e4=1.0) joignables, satellite centré, calme, reduced-motion.
- [x] **PORTÉ EN PROD derrière A/B `home_az` (30%)** — `src/HomeAZ.jsx` (moteur scroll porté ~1:1) + `src/home-az-assets.js` (CSS+markup byte-identiques au proto, généré par `scripts/build-homeaz.cjs`), monté en **Shadow DOM** (isolation CSS totale). Additif : control = GameFunnel/HeroVerdict intact, override `?home_az=1/0`. Câblé aux vraies portes (`openPremium`/`onOpen`/`onShowMap` + `track`) + sécurité (init KO → carte). **Fix FR « au Diamant » confirmé.** Vérif Playwright (vrai composant) : structure, gp 0→1, beats e0→e4, sticky shadow OK mobile+desktop, freshness honnête, conversion câblée, 0 erreur ; build vite OK (chunk HomeAZ 74.7KB). SW v172.
- [ ] Façade `flyTo()` devant Archipel/StoryEngine/slug-match (A/B nav_maree/navWorld, fallback gardé).
- [x] **Plan-B « où aller maintenant » (feature SARGASSES #2) SHIPPÉ au NEAR derrière A/B `pw_planb`** — `PlanBPanel` dans `BeachSheet` quand la plage est avoid/moderate : rail des plages PROPRES proches (data RÉELLE : status clean + haversine + score 0-100 ; 3 plus proches, best-first, ruban « le + sûr »), CTA « M'y emmener »→`onBeachClick`, event `sg_planb_pick`. Vignette SVG déterministe (zéro IA, zéro innerHTML), thème clair cohérent fiche. Additif, `?planb=1/0`. Vérif Playwright (ordre rang OK, clic câblé) + build vite OK. Réduit l'angoisse « journée gâchée ».
- [x] **Badge Indice santé / H2S (feature SARGASSES #4, le standout) SHIPPÉ au NEAR derrière A/B `pw_h2s`** — `H2SBadge` dans `BeachSheet` : badge LIBRE toujours visible (dial gradué faible/modéré/élevé) + panneau dépliable (pourquoi : algues/jours/baie-vent ; conseils RIVERAINS/VISITEURS/SENSIBLES kids-asthme-grossesse-seniors) + CTA **alerte santé Premium** → `openPremium('h2s_health_alert')`. Niveau = `beach.h2s` (pipeline, même formule `h2s.cjs`) sinon repli statut (jamais sous-estimé santé). HONNÊTE : « indice dérivé, pas une mesure de gaz, aucun capteur ». Remplace le warning binaire (control). i18n FR/EN/ES. Vérif Playwright (3 états + dépliage + CTA câblé) + build vite OK. La donnée graduée réelle arrive au prochain run pipeline (calme = faible partout, rassurant).
- [ ] pw_beat = surface paywall unique au NEAR, `openPremium('forecast_lock')` contextualisé plage.
- [ ] Copy Premium = « le Veilleur surveille TA plage » (fiche + /alertes/).
- [ ] Demo-gate email à l'aha-moment (répare 0,35 %).

**PHASE 2 — portes FAR/MID.** KPI : porte→NEAR +20 %, nouvelles pages indexées, 0 stale /conditions.
- [ ] flyTo(région,FAR) sur /carte ; dock = sélecteur profondeur.
- [ ] flyTo(zone,MID) sur /plages/<zone>/ + event `sg_zone_click`.
- [ ] flyTo(FAR+filtre) sur clean-list/meilleures/conditions + revalidation live /conditions.
- [ ] Créer `/sargasses-pres-de-moi/` (géo) + `/sargasses-aujourdhui/` (FR daté).

**PHASE 3 — stations + autorité + anti-cul-de-sac.** KPI : 0 page orpheline, CTR SERP +, hreflang PASS↑.
- [ ] CTA stations → flyTo ; tuer ?decouverte/?solutions.
- [ ] Fraîcheur /fiabilite + désambiguïsation /saison-*.
- [ ] 301 legacy (weekend/onboarding/sarg_carte/neptunes/articles).
- [ ] OG dynamiques par plage (SVG→PNG).

**PHASE 4 (VERROUILLÉE — seulement si funnel sain).** KPI : email 0,35 %→≥2 %, share-cards si modal→CTA≥5 % tenu 2 sem.
- [ ] Déverrouiller share-cards · soigner capture · Bahamas (data≥2 sem) · widgets B2B depuis beaches-list.

---
_Vérif continue : `ab-eval.cjs` (verdict A/B auto) · skill `sg-svg-scene` (navigateur). Doc vivant — coché au fil de l'exécution._
