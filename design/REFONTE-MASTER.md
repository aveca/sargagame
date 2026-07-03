# REFONTE MASTER — colonne vertébrale d'exécution
**On exécute du global au grain fin, action par action.** Source : IA workflow site-univers + KPI réels + skills `sg-design-system`/`sg-svg-scene`. Règles dures partout : strangler-fig (jamais casser SEO/funnel), additif + A/B + réversible + vérifié, slug=nom=SEO, aucune page sans 301, zéro image IA, doctrine de crise, boucle punitive H₂S/Budget (Serious Game).

---

## 📊 TABLEAU DE BORD — COUVERTURE (maj à chaque tick · MONITOR FONDATEUR)
> **C'est ICI qu'on suit l'avancement.** La boucle met ce bloc à jour à chaque action. « Fini » = tout en ✅.
> Avancement global estimé : **~91 %** · maj 2026-06-17.

| Phase | Lot | État |
|---|---|---|
| — | Accueil A→Z (`home_az`) · Plan-B (`pw_planb`) · H2S (`pw_h2s`) · fiabilité régime | ✅ **LIVE prod** |
| A | Carte interactive **MULTI-SITES** (`WorldMapView` region-aware — vraie géo OSM 5 régions, pan/zoom/tap/scrub) — A/B `map_world` 50/50, `src/WorldMapView.jsx`, SW v174 | ✅ **LIVE prod** |
| A | Fiche « plongée » — `pw_beach_dive` 50/50, `src/BeachDive.jsx`, beats=6, factors=7, Veilleur v2, scroll+scrub, SW v175 | ✅ **LIVE prod** |
| B | Demo-gate email `capture_gate` 50/50 — V2 Single-Field Magic Link (répare 0,35%), SW v201 | ✅ **LIVE prod** |
| B | Canonical/hreflang — infra saine (fixes 067a0611 · 2026-06-16) ; gap résiduel = autorité/crawl-budget (pas infra) | ✅ **infra OK** |
| B | Copie paywall contextualisée `pw_modal_ctx` — beach name + score injectés dans hero + preuve PremiumModal, SW v177 | ✅ **LIVE prod** |
| B | pw_hot_intent 50/50 — paywall in-scene golden-hour ancré plage (forecast_* sources), SW v190 | ✅ **LIVE prod** |
| B | /alertes/ auto-open paywall + copy Veilleur (a35a94ca, SW v192) | ✅ **LIVE prod** |
| B | CaptureGateModal copie honnête — brief gratuit (≠ 7j), CTA « Recevoir → » (9fe329c0, SW v193) | ✅ **LIVE prod** |
| B | screen-space labels carte · BottomNav Premium fix · freshness kill-switch (SW v188–191) | ✅ **LIVE prod** |
| E | Dock `dock_glass` 50/50 — pill sombre flottant golden-hour mobile+desktop, fix `openPremium("nav")` source, ⭐ masqué payants, SW v201 | ✅ **LIVE prod** |
| C | `/previsions/` landing golden-hour A/B `prev_az` 50/50 — ForecastChart + meilleur jour, noscript SEO, SW v195 | ✅ **LIVE prod** |
| C | `/plages-sans-sargasses/` (clean-list) golden-hour A/B `clean_list` 50/50 — dynamic noscript + CleanList page, SW v196 | ✅ **LIVE prod** |
| C | `/alertes/` (hub Premium) A/B `pw_alertes` 50/50 — Le Veilleur Personnel, capture email, AlertScene, SW v197 | ✅ **LIVE prod** |
| C | Pages : zones & 5 stations narratives (A/B `stations` 50/50, StoryEngine, redirections) | ✅ **LIVE prod** (SW v198) |
| C | Pages : à-propos golden-hour A/B `az` 50/50 · reliability.json endpoint · widget B2B charte · Conditions 6-filtres A/B · reliability-page V2 regime hero | ✅ **LIVE prod** (SW v199) |
| C | Les 136 fiches plages — fiche-dive A/B `ab_fiche_dive` 50/50 : scroll-plongée 6 stages + Veilleur v2 + données réelles (`__SG_BEACH__`) + reduced-motion plancher dur | ✅ **LIVE prod** (SW v200) |
| C | **Parité H2S sur la fiche-plongée (`pw_beach_dive`)** : beat-4 gagne le **disclaimer honnête** (« indice dérivé, pas une mesure de gaz, aucun capteur — consignes ARS/HCSP ») + **CTA alerte santé Premium** → `openPremium("h2s_health_alert")` (parité avec H2SBadge control, in-scene, FR/EN/ES). Comble la lacune honnêteté + porte de conversion sur 50 % du trafic fiche. SW v202 | ✅ **LIVE prod** |
| D | SEO requête par requête + nouvelles pages (`/près-de-moi`, `/aujourdhui`, zones) + OG + 301 legacy | ✅ **LIVE prod** |
| E | Share-cards · baignade #5 · collecte #9 | ✅ **LIVE prod** |
| Paywall | **Refonte COMIC/BD du PremiumModal** (A/B `pw_comic` 50/50, `?pwcomic=1/0`) — scène golden-hour + Veilleur, cases BD paper/ink, titre Anton chroma ; checkout Stripe **intact** ; proto `design/proto-paywall-comic.html` vérifié. SW v215 | ✅ **LIVE prod** (pivot 19/06) |

**Comment monitorer :** ce tableau (avancement) · `git log` (chaque ship = 1 commit) · `/workflows` (workflows finis) · mes pings (concret live prod). **Fin = toutes les lignes ✅.**

> Avancement global estimé : **~91 %** · maj 2026-06-18 (récolte A/B `pw_prelude`).

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
| Dock = **sélecteur de profondeur** (Carte/Plages/Premium) | chrome | ✅ **Fait** (v201) | onglet Premium = action (pas surligné — OK) |
| Paywall modal (Stripe on-site, pw_calm/constel) | conversion | existe (optimisé) | enrichir copie « veilleur surveille TA plage » + temps-réel |
| Live pill (EN DIRECT + heure réelle) · switch FR/EN/ES | chrome | existe | jamais de fake timestamp |
| Stations StoryEngine (beats + CTA→flyTo) | éducatif | existe, CTA à rebrancher | finir en flyTo, anti-cul-de-sac |
| Share-card + OG dynamiques (SVG→PNG sharp) | viral/SERP | VERROUILLÉ jusqu'à funnel sain | deep-link + visuel du lieu |
| Demo-gate email (aha-moment → 1 champ) | capture | ✅ **Fait** (v201) | répare 0,35% |

---

## 3 · SVG PAR SVG (scènes/assets)
- **Monde unifié 3 profondeurs** (FAR archipel / MID côte / NEAR plage = MÊME scène, caméra) — étendre ArchipelView, LOD/culling par profondeur (perf N×N).
- **Veilleur-satellite v2** — `design/proto-veilleur-clip-v2.html` (1 objet, œil mi-clos serein, 3 humeurs, snap couleur, transform corrigé). ✅ prêt.
- **Yole/bateau** — à dessiner (MQ yole ronde ; voilier USD). ✅ **Fait**
- **BeachScene** (9 archétypes, PRNG seedé) — existe, à brancher en NEAR.
- **Scènes StoryEngine** (DiscoveryStory, scan satellite, AlertScene, dérive) — existent.
- **Funnel scroll 5 beats** — `design/proto-home-funnel.html` (sticky réparé, cross-fade). ✅
- **OG par plage** (SVG→PNG) — ✅ **Fait** (généré par scripts).
- Pièges SVG (skill `sg-svg-scene`) : sticky (.scroller = Σspans + 1 viewport) ; transform de pose `translate(cx,cy) rotate()` sans translate parasite ; snap couleur humeur ; viewBox 800×600 slice ; 1 rAF + pause visibilitychange ; reduced-motion floor.

---

## 4 · PROBLÈME PAR PROBLÈME

### 4A · PROBLÈMES SARGASSES = LE PRODUIT (créativité = résoudre ÇA, pour les gens)
> Clarif fondateur 17/06 : « problème par problème » = être créatif pour résoudre les **problèmes liés aux sargasses** (la valeur, pour les gens), pas (que) ceux du site. Beaucoup de solutions = des **widgets/SVG déjà validés à IMPLÉMENTER un par un** dans leur surface.

| # | Problème vécu (sargasse) | Solution créative / feature | Asset/widget (statut) | Où | Free/Prem |
|---|---|---|---|---|---|
| 1 | « Ma plage, envahie AUJOURD'HUI ? » (angoisse #1) | Verdict temps-réel + Le Veilleur scanne TA plage en direct | clip Veilleur (✅ widget) | hero NEAR | free (teaser) |
| 2 | « Où aller à la place ? » (plan B immédiat) | « Plages propres près de toi maintenant » + flyTo vers l'alternative | clean-list/carte (✅) · PlanBPanel fiche data `pw_planb` (✅) · **rail Plan-B « OÙ ALLER PLUTÔT » dans le détail comic ChasseDetail ✅ shippé** (`f54768f8`, avoid/moderate → 3 plages propres proches haversine best-first, `?planbcomic=0`) | FAR /près-de-moi · NEAR fiche · détail comic | free |
| 3 | « Et demain / mes vacances ? » (planning) | Prévision 7j/plage + « ton meilleur jour cette semaine » | ForecastChart (✅) · **Marée du Veilleur ✅ shippée** (arc houle golden-hour AFAI→vague + soleil sur le meilleur jour, `?arc=1`, PR #456) | NEAR /prévisions | Premium |
| 4 | **« Ça pue / c'est dangereux ? » (H2S)** | **ALERTE SANTÉ** : sargasse en décompo = H2S (œuf pourri) → risque respiratoire (asthme, bébés, femmes enceintes, âgés). Badge santé/H2S + « aère / ferme les fenêtres » riverains + seuils | **data ✅** (h2s.cjs + pipeline, commit 1d978b6c) · proto ✅ proto-h2s-health-index.html · badge `pw_h2s` ✅ data-fiche · **repère santé comic ✅ shippé dans ChasseDetail** (`H2sNote`, avoid/moderate, groupes sensibles, i18n, `?h2snote=0`) | ✅ **LIVE** (surface comic) | free badge / Prem alerte — **FORT & sous-exploité** |
| 5 | « Je peux me baigner ? enfants ? chien ? » | Indicateur baignade / kids-safe / animaux par plage | /conditions (✅) | NEAR | ✅ **Fait** |
| 6 | « Être prévenu AVANT que ça arrive » | Le veilleur personnel (alerte la veille du changement) | AlertScene (✅) · **porte premium « Le Veilleur personnel » dans WeekHub ✅ shippée** (`?whcta=0`, PR #406 — relie la promesse d'alerte du hub à `openPremium`) | /alertes · **WeekHub** | Premium (cœur) |
| 7 | Riverains/locaux (odeur, qualité de vie) | Alerte H2S géolocalisée + « calendrier de ton quartier » | flyTo MID ✅ | /près-de-moi | Premium |
| 8 | Hôtels/restos/locations (éco touristique) | Dashboard B2B + widget embeddable « état de la plage devant l'hôtel » + brief clients | /widget /resorts (✅) | B2B | revenu B2B |
| 9 | « C'est ramassé quand ? » + signaler un échouage | Community reports / Ground-Truth Snap + carte de collecte | Community overlay (✅) | NEAR /confirme | free (contrib) |
| 10 | Comprendre (pourquoi ça arrive, ce que ça devient) | DiscoveryStory ludique : ceinture → dérive → H2S → recyclage | StoryEngine (✅) | stations | free |
| 11 | Agir / valoriser / aider la région | SolutionsStory (engrais/biogaz/construction) + page « agir/soutenir » + lien fonds habitants | SolutionsStory (✅) + nouvelle /agir ✅ | station /nettoyer | free (mission) |
| 12 | « C'est fiable ? » (confiance) | Fiabilité PAR RÉGIME + transparence méthode | /fiabilite (✅) | /fiabilite | free |

→ Règle : chaque widget/SVG validé ci-dessus = à **retravailler + implémenter dans sa surface** (un par un), pas à re-montrer. Priorité produit : #1 #4(H2S) #2 #3 #6 (les plus vécus + différenciants).

### 4B · Problèmes site/conversion (hygiène d'exécution — bien aussi, mais ≠ le produit)
(chacun = la data + le fix)
1. **modal→CTA 2 %** (LE goulot revenu, 3414 modals → 72 CTA) → contextualiser le paywall (plage+verdict) + crier temps-réel. cta→redirect = 92 % (sain). 
2. **Capture email 0,35 %** (567 prompts → 2) → ✅ **Fait** : demo-gate à l'aha-moment, single-field glassmorphism (SW v201).
3. **Dismiss hero 61 %** (ceux qui restent : 42 s) → perso 1er paint (TA plage live).
4. **Indexation 3/30 MQ · 2/30 GP** → canonical/hreflang (tâche htaccess spinnée `task_d48a64ca`) = BLOQUANT avant modif pageShell.
5. **Fake freshness** → kill-switch <12h (skill), grep tous libellés.
6. **Stale `/conditions/`, `/articles/`** → revalidation JS live / 301 hebdo.
7. **Cannibalisation /saison-* MQ vs GP** → désambiguïsation titres (mesurer GSC avant 301).
8. **Cul-de-sac stations** (?decouverte/?solutions morts) → CTA→flyTo.
9. **Pièges SVG** (sticky void, transform hors-champ, snap couleur) → encodés skill, vérif navigateur.
10. **Veilleur « fait peur »** → 1 satellite, veille la mer (tranché). **Qualité « bof »** (filets/pas de bateau) → barre qualité + yole (tranché). ✅ **Fait**
11. **Goût** → A/B live + `ab-eval` (automatisé), jamais vibe-jugement. ✅ outil shippé.
12. **Dilution A/B** (≥25 flags conversion, ~1171 sessions/28j éclatées → aucun ne converge ; conversion non concluable à ce traffic, ~150k sessions/bras requis) → **RÉCOLTE avant tout nouveau test.** ▸ 18/06 : `pw_prelude` inliné à `direct`/control (prelude=0% n=210 vs direct=0,79% n=252 ; interstitiel = friction sans bénéfice), 1 slot libéré (commit 4ac9b820). Prochaines récoltes candidates (vérifier sample suffisant avant) : promouvoir `home_az` v1 (+573%, n=255) si l'échantillon tient ; retirer les bras morts (`nav_dive` n=25). Levier réel = SEO volume + capture email 0,35% + B2B, PAS un Nᵉ paywall.

---

## 5 · ACTION PAR ACTION (backlog ordonné, cochable)

> **🎯 PRIORITÉ ACTIVE (fondateur 16/06)** : **REFONTE COMPLÈTE de 2 surfaces, en EXPÉRIENCE SVG cohérente** — (1) **LA CARTE** (FAR, /carte-sargasses/, aujourd'hui src/MapView.jsx/Leaflet) et (2) **LES PAGES PLAGES individuelles** (NEAR, BeachSheet, deep-link /plages/<slug>/).
> Directives fondateur (dures) : **plus de SVG** (viser le monde SVG propriétaire, pas Leaflet-décoré ; Leaflet = substrat data seulement si perf l'exige, enveloppé SVG) · **plus d'interactions** (calmes, incidentes) · **liens + assets** (maillage interne riche + remplacer photos diurnes par scènes SVG golden-hour si ça sert) · **UNE expérience continue** home→carte→plage (même caméra, flyTo incassable) · **fluide + garder la VIBE d'ouverture du funnel** = l'accueil A→Z (src/HomeAZ.jsx) comme référence de grammaire visuelle.
> Workflow specs `wrbyee2gi` (explore code+assets → 3 directions SVG-first/surface → juge → spec buildable + plan assets/liens) en cours → à la complétion : BUILD proto standalone par surface → vérif navigateur (harnais) → port A/B (`map_refonte` / `beach_refonte`). Collecte #9 = ✅ Fait. (Baignade #5 ✅ Fait).
**PHASE 0 — réparer le FIL de conversion (avant d'embellir).** KPI : leak<10 %, 0 fake freshness, 0 href cassé, indexation en hausse.
- [x] Vérifier le leak CTA→redirect post same-tab (92 % = OK mesuré).
- [x] Kill-switch fake freshness → `formatFreshness` kill >12h + chip "vérif. en cours" (f3f5e02f).
- [ ] Slug canonique unique par plage/zone dans `beaches-list.json` + resolver partagé app+build (fin du regex drift).
- [x] `.htaccess` /fiabilite→/a-propos + cruft + weekend.html + sarg_carte 301 (067a0611).
- [x] Canonical/hreflang PASS — infra saine (voir `project_gsc_indexation_gap.md`), gap résiduel = autorité/crawl-budget.

**PHASE 1 — flyTo sur la porte NEAR (plus fort levier).** KPI : modal→CTA 2 %→≥5 %, verdict<1s, 0 perte SEO.
- [x] **Accueil A→Z BUILT + VÉRIFIÉ navigateur** (`design/proto-home-az.html`, 87KB) : funnel scroll + satellite v2 (1 objet, rassure) + yole + perso H1 daté EN DIRECT ; sticky épinglé partout, 5 beats + footer (e4=1.0) joignables, satellite centré, calme, reduced-motion.
- [x] **PORTÉ EN PROD derrière A/B `home_az` (30%)** — `src/HomeAZ.jsx` (moteur scroll porté ~1:1) + `src/home-az-assets.js` (CSS+markup byte-identiques au proto, généré par `scripts/build-homeaz.cjs`), monté en **Shadow DOM** (isolation CSS totale). Additif : control = GameFunnel/HeroVerdict intact, override `?home_az=1/0`. Câblé aux vraies portes (`openPremium`/`onOpen`/`onShowMap` + `track`) + sécurité (init KO → carte). **Fix FR « au Diamant » confirmé.** Vérif Playwright (vrai composant) : structure, gp 0→1, beats e0→e4, sticky shadow OK mobile+desktop, freshness honnête, conversion câblée, 0 erreur ; build vite OK (chunk HomeAZ 74.7KB). SW v172.
- [ ] Façade `flyTo()` devant Archipel/StoryEngine/slug-match (A/B nav_maree/navWorld, fallback gardé).
- [x] **Plan-B « où aller maintenant » (feature SARGASSES #2) SHIPPÉ au NEAR derrière A/B `pw_planb`** — `PlanBPanel` dans `BeachSheet` quand la plage est avoid/moderate : rail des plages PROPRES proches (data RÉELLE : status clean + haversine + score 0-100 ; 3 plus proches, best-first, ruban « le + sûr »), CTA « M'y emmener »→`onBeachClick`, event `sg_planb_pick`. Vignette SVG déterministe (zéro IA, zéro innerHTML), thème clair cohérent fiche. Additif, `?planb=1/0`. Vérif Playwright (ordre rang OK, clic câblé) + build vite OK. Réduit l'angoisse « journée gâchée ».
- [x] **Badge Indice santé / H2S (feature SARGASSES #4, le standout) SHIPPÉ au NEAR derrière A/B `pw_h2s`** — `H2SBadge` dans `BeachSheet` : badge LIBRE toujours visible (dial gradué faible/modéré/élevé) + panneau dépliable (pourquoi : algues/jours/baie-vent ; conseils RIVERAINS/VISITEURS/SENSIBLES kids-asthme-grossesse-seniors) + CTA **alerte santé Premium** → `openPremium('h2s_health_alert')`. Niveau = `beach.h2s` (pipeline, même formule `h2s.cjs`) sinon repli statut (jamais sous-estimé santé). HONNÊTE : « indice dérivé, pas une mesure de gaz, aucun capteur ». Remplace le warning binaire (control). i18n FR/EN/ES. Vérif Playwright (3 états + dépliage + CTA câblé) + build vite OK. La donnée graduée réelle arrive au prochain run pipeline (calme = faible partout, rassurant).
- [x] pw_beat = ForecastChart lock J2-7 in-scène, bras beat 85% (golden-hour + Veilleur, L2363-2521).
- [x] Copy Premium « le Veilleur surveille TA plage » — fiche : pw_hot_intent (a35a94ca) ; /alertes/ : auto-open paywall + editorial Veilleur (a35a94ca).
- [x] Demo-gate email à l'aha-moment — `capture_gate` 50/50 LIVE (SW v176, intercept forecast_* sources).
- [ ] **Parité preuve-moat manquante dans `WorldPaywall` (trust au point de décision)** _(déposé 2026-07-03 par la tâche growth-actions/conversion-track — NE PAS éditer le JSX depuis conversion-track, refonte-builder possède `PremiumModal.jsx`)_ : `WorldPaywall` reçoit le prop `recordProof` (`src/PremiumModal.jsx:553`) mais **ne le rend jamais** (grep : `recordProof` n'apparaît que dans sa signature sur tout le corps L553-895) — sa seule « preuve » est le clean-count live (`.pww-proof`, L837), PAS le track-record audité. `ComicPaywall` (**le même prop**, L2190) le rend en évidence (L1095-1096) : `%` fiabilité réel (`_recordProof`/`cleanReliabilityPct`) + « La seule carte qui publie **aussi ses erreurs** » + lien `/fiabilite/` « Vérifier le registre → » (gaté `?pwrel=0`). Résultat : dans l'arm World de l'A/B (rendu en **mode capture** `PAY_CAPTURE_ONLY` ou `?pwpass=0`), **LE moat — l'honnêteté auditée + les erreurs publiées — disparaît** de l'écran de décision, contre la doctrine storytelling temps 5. **Fix = ADDITIF, zéro copy neuve** (porte le bloc `.pwx-record` existant de ComicPaywall en variante `.pww-record`, mêmes tokens golden/ink, même gate `?pwrel=0`, lien `_relHref(lang)`) → pas de panel requis (copy déjà validée). Vérifié grep (parité 0 vs 3 occurrences). _(Note : `PassOffer` = paywall par défaut live et est déjà conforme — hedge 5-qualif L226-227 + lien « allez voir nos erreurs » L233-236 ; ce gap ne concerne que les arms capture/rollback.)_

**PHASE 2 — portes FAR/MID.** KPI : porte→NEAR +20 %, nouvelles pages indexées, 0 stale /conditions.
- [ ] flyTo(région,FAR) sur /carte ; dock = sélecteur profondeur.
- [x] flyTo(zone,MID) sur /plages/<zone>/ + event `sg_zone_click`.
- [ ] flyTo(FAR+filtre) sur clean-list/meilleures/conditions + revalidation live /conditions.
- [x] Créer `/sargasses-pres-de-moi/` (géo) + `/sargasses-aujourdhui/` (FR daté) — d0387568, +6 URLs sitemaps.

**PHASE 3 — stations + autorité + anti-cul-de-sac.** KPI : 0 page orpheline, CTR SERP +, hreflang PASS↑.
- [x] CTA stations → flyTo ; tuer ?decouverte/?solutions.
- [ ] Fraîcheur /fiabilite + désambiguïsation /saison-*.
- [x] 301 legacy (weekend ✅ · articles ✅ 9f34a0c8 · onboarding/neptunes/sarg_carte ✅ 2026-06-16).
- [x] OG dynamiques par plage (SVG→PNG).

**PHASE 4 (VERROUILLÉE — seulement si funnel sain).** KPI : email 0,35 %→≥2 %, share-cards si modal→CTA≥5 % tenu 2 sem.
- [ ] Déverrouiller share-cards · soigner capture · Bahamas (data≥2 sem) · widgets B2B depuis beaches-list.
- [ ] **Capture email ATONE — revoir l'opt-in form** _(flag auto conversion-track 21/06)_ : leads quasi-plats (213→213→213 du 17→19/06, +2 le 20/06 = +2 en 4 j), `funnel.emailSubmits` ~62-63/j stable, `stripe.emailAttributed` = 0 actif/€0. Le canal capture ne croît plus. Revoir l'opt-in (placement, copy, aha-moment, friction) côté `sargasses-refonte-builder` — NE PAS éditer le JSX depuis conversion-track.

**PHASE 5 — BACKLOG PLUS (workflows 21/06, source de vérité = `design/BACKLOG-PLUS-2026-06-21.md`).** Items NET-NEW vérifiés adversarialement (surface+substance). Chacun : build vert + vérif navigateur + A/B réversible + doctrine. Prends-en UN par run (le + haut non coché).
- [x] **Géoloc « Près de moi » RÉELLE** (P6) — shippé `9f8bbd83` (getCurrentPosition au tap, haversine, userPos passé à WorldMapView). cf. [[project_critical_backlog_shipped]].
- [x] **Recherche plage par NOM dans la carte-monde** (P7) — shippé `9f8bbd83` (SearchBar remontée dans le chrome Archipel/WorldMapView → tap = centerOn + onOpenBeach).
- [x] **Toast « plage propre la + proche » au close de fiche** (P9) — déjà câblé (`closeSheet`→`nextSuggestion`, l.13334). Re-routé hors gate view==='map'.
- [x] **Compteurs sur chips filtre liste** (P10) — shippé `c90d92c8` (Propres/Favoris/Éviter, chip grisé à 0).
- [x] **Plan annuel ANCRÉ in-app** (S4) — déjà fait : ComicPaywall boutons Mensuel/Annuel −33% (l.6530), défaut annuel MQ/GP.
- [x] **Capter l'email AVANT la carte** (S2) — vérifié : `submitLead(email,"onsite_checkout")` part l.7193 AVANT `elements.submit()`+`confirmSetup` (l.7196-7198) ; abandon récupérable (drip + `recover-abandoned-cart.cjs` Stripe-side).
- [x] **Rail Plan-B « OÙ ALLER PLUTÔT » dans le détail comic** (§4A #2) — shippé `f54768f8` : ChasseDetail sur plage avoid/moderate → 3 plages propres proches (clean + haversine même-île + score, best-first « le + sûr »), tap→onRelated, event `sg_chasse_planb_pick`, kill-switch `?planbcomic=0`. Vérifié (logique + Playwright composant réel + build vert).
- [x] **Porte premium « Le Veilleur personnel » dans WeekHub** (§4B #1 goulot modal→CTA · §4A #6 alerte · levier CRO n°1 du panel 2026-07-01, `ADD-whcta`) — 2026-07-02, PR #406 mergée+déployée. WeekHub **promettait** l'alerte (« tu seras prévenu le matin où ça bascule ») **sans aucune porte `openPremium`** (vérifié grep). Ajout d'une carte CTA sobre + positive (mascotte + « deviens celui qui ne se trompe jamais de crique ») → `openPremium("weekhub_alert")` (ferme le hub d'abord, track `sg_weekhub_premium_cta`), **cachée aux abonnés** (`isPremium`), kill-switch **`?whcta=0`** (défaut ON, PAS un flag A/B — anti-dilution). Wiring additif via `onPremium`/`isPremium` déjà props de `WorldMapView`. FR/EN/ES. Vérifié : esbuild + build (SW v217, 182 Ko ≤ 210) + rendu isolé Playwright 3 variantes (default=CTA+flux premium après close ; isPremium/whcta=0 = absent ; 0 err JS).
- [x] **🌊 La Marée du Veilleur — prévision dessinée en HOULE golden-hour** (§4A #3 « ton meilleur jour » · SUITE du Cadran du Veilleur, direction « le SVG est le produit ») — 2026-07-02, PR #456. NOUVEAU composant `MareeVeilleur` : dans `ForecastChart`, l'AFAI réel de chaque jour soulève la vague (jour propre = mer plate, échouage = houle qui monte), le meilleur jour de la semaine gagne le soleil, Le Veilleur veille la mer (humeur = statut du jour). 100 % data (afai/status), honnête (jour sans donnée = plat, jamais une houle fabriquée). Statique (doctrine calme) + reveal one-shot du liseré + hover d'un jour (aucun rAF). Rendu **À LA PLACE des barres derrière `?arc=1`** (défaut OFF = barres inchangées) — **observationnel, PAS un 3e A/B parallèle** (le Cadran `dataviz` tourne déjà sur la MÊME fiche → un 2e viz default-on cannibaliserait sa lecture, verdict juge). Lock/CTA/pw_beat/money-path inchangés. Proto `design/proto-maree-veilleur.html` vérifié navigateur (mobile 390 + desktop 560, semaines calme/houle/chargée, reduced-motion). Gate : esbuild OK, build vert, budget 186,4 Ko ≤ 210, smoke 4 tokens verts. **À valider à l'œil sur prod (fiche data, `?arc=1&mapdetail=0`) au prochain passage** — BeachSheet non déterministe en headless (même limite que le Cadran) ; **promouvoir en A/B quand le slot `dataviz` du Cadran se libère.**
- [x] **🌅 LE BRIEF DU MATIN — payload premium tangible** (§2 « Hero perso (H1 daté) » · §4A #1 verdict aujourd'hui · #6 Le Veilleur personnel/alerte) — **PORTÉ & LIVE 2026-07-03 (PR #519, `4831ac0b`)** : nouveau chunk lazy `src/BriefMatin.jsx` (9,7 Ko gzip, hors budget eager), monté via `createPortal(document.body)` + `sg-onink-scope` + `useSwipeClose` + 4 voies de sortie + focus-trap. Data 100 % réelle via `briefData` (plage vedette myBeach→favori→1re scorée : verdict/score/H2S hedgé/meilleur-jour min-afai/Plan-B haversine/fraîcheur ERDDAP réelle, 0 fabrication). Moteur `proto-veilleur-clip-v2` (1 rAF, veille la MER, reduced-motion floor). CTA→`openPremium("brief_morning")`. **Surface = deep-link `?brief=1`** (push/PWA/email) ; rollback `?brief=0`. Additif (funnel/EUR/SEO intacts, pas d'entrée carte, pas de flag A/B — anti-dilution). Gate : esbuild OK · build MQ vert · budget 191,7≤210 · smoke 4/4 · Playwright isolé 390px normal+reduced (dialog, CTA or survit au skin theme-comic, carte paper, Salines/51/amber, Veilleur on-screen, 0 err, floor OK). **SUITE** : promouvoir en entrée in-app / A/B quand la surface est tranchée ; brancher landing push-notif / start_url PWA sur `/?brief=1`.
  <details><summary>proto d'origine</summary>`design/proto-veilleur-brief-matin.html` (forge 2026-07-02). Scène golden-hour « Le Veilleur » (glyph/mood/toVB/1 rAF réutilisés de `proto-veilleur-clip-v2.html`) + **carte paper/ink BRIEF** = le brief quotidien pour TA plage : verdict (couleur+FORME-SVG+MOT, ambre→encre AA), score, « aujourd'hui », « ton meilleur jour », santé H₂S **hedgée** (« indice dérivé, pas une mesure »), **Plan-B** teal si non-propre (anti-cul-de-sac), **freshness RÉELLE** (>12 h → « vérification en cours »), fiabilité **hedgée** (« 76 % à 79 % selon la saison », jamais un 100 % nu), 1 CTA positif → `openPremium`. **100 % data-driven** `window.setBriefData({beach,region,score,status,bestDay,h2s,planB,ageHours})` → mappe sur `sargData`/`sargassum.json` au port ; **0 fabrication**. Vérifié navigateur (computed-style : 3 statuts, i18n FR/EN, 0 overflow 390, CTA 49 px, Veilleur centré on-screen, reduced-motion = card forcée visible). **Au port (refonte-builder, monolithe)** : flag rollback **`?brief=0`** ; card = `<div role="dialog">` **hors couche gestes** (`createPortal(document.body)` + `className="sg-onink-scope"`) + `useSwipeClose` + focus-trap + Échap (lois mobile). Candidat surface : hero NEAR / push-landing / email PWA.</details>
- [x] **⭐ Pins carte → DÉTAIL COMIC** (PRODUCT §8, item #1 fondateur « la carte doit déboucher sur plein de trucs ») — 2026-06-23. NOUVEAU `src/ComicDetail.jsx` (wrapper auto-suffisant : injecte le CSS `.lc-` désormais `export`é de ChasseHome + reconstitue `.lc-root`/`.lc-reduce`, rend `ChasseDetail` ; arène intouchée). Routé `WorldMapView`+`ArchipelView` `onOpenBeach`→`onMapBeach`→`comicBeach` sous `Suspense`+`ErrBound onError` (crash→fiche data). **Default ON, rollback `?mapdetail=0`** (PAS un flag A/B — récolte : 51 flags conversion déjà dilués). `onFull`=pont fiche data, `onPremium`=openPremium (porte conversion intacte). Vérifié Playwright (tap pin→`.lc-detail` fixed, vars résolues, verdict/score/7j/H2S/CTA/Veilleur, close OK, 0 err, rollback OK) + build vert. Fin de l'éjection vers le « scroll satellite » détesté.

---
_Vérif continue : `ab-eval.cjs` (verdict A/B auto) · skill `sg-svg-scene` (navigateur). Doc vivant — coché au fil de l'exécution._
