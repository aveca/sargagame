# NIGHT LOG — build autonome (nuit du 14→15/06/2026)

## ⏱️ SESSION 15/06 (loop DESIGN — chaque écran au niveau home) — worktree isolé `sargagame-mw`
**Verdict fondateur : « j'aime presque rien sauf la home » → l'anti-pattern = laisser un écran SOUS le niveau home. Audit visuel par preview_screenshot (mobile).**
- **DIAGNOSTIC visuel** : home/monde(Archipel)/carte/fiche(BeachScene v2) = **golden-hour, au bar** ✓ (BeachScene inc 0-7 + reveal + VisitPlan = faits, vérifiés à l'écran). Liste classique `BeachListView` = rendue mais **invisible** (Archipel `navWorld=true` rootMode la recouvre en permanence) → élévation écartée (pas de code invisible). **Le seul écran MAJEUR sous le bar = la PREMIUM par défaut** (mur sombre 3-cartes), car les traitements golden-hour étaient A/B-gatés à des minorités (pw_constel 15%, pw_beat 50%).
- **ÉLÉVATION premium → niveau home** (`77de1af3`) : promu la **scène-constellation golden-hour** en DÉFAUT (pw_constel 15%→85%) + le **forecast-lock beat** golden-hour inline en défaut (pw_beat 50%→85%), 15% holdout chacun (filet sécurité-revenu mesurable), `?pw...=0` force le holdout. AVANT/APRÈS capturé (mur sombre → Veilleur mascotte + soleil couchant + plages-points + « 10/10 propres » gravé + promesse/preuve). Paiement intouché. build+smoke+screenshot OK. SW v168.
- **PROCHAIN (design, continu)** : écrans transitionnels restants (onboarding, prélude « avant de payer », retour post-checkout) au niveau home ; handoff session forecast = disclaimer UI « alertes ~24h après l'obs satellite » + tisser `weekly[id].regimeConfidence` (preuve honnête par régime) dans fiche/premium. Promouvoir pw_calm (copy positive) en défaut. Ne PAS conclure « fini ».

## ⏱️ SESSION 15/06 (loop FIABILITÉ FORECAST — suite) — expo par régime + audit adversarial + 3 fixes — worktree isolé `sargagame-fcwt`
**Lane forecast (confidence.cjs / forecast.cjs / backtest-forecast.cjs uniquement). Suite du loop calme (÷23,6). ⚠️ Contention répétée sur le dir principal (une session parallèle a `reset --hard` mon tree 3×) → basculé en WORKTREE ISOLÉ `C:/Users/user/Desktop/Backup/sargagame-fcwt`, push `fc-reliability:main` fast-forward. Mon travail est sur origin/main, intact. Tout vérifié en node, PAS de build complet.**
- **Expo confiance par régime → app + pages** (`6cf4992b`) : `weekly[id].regime` + `regimeConfidence {cleanReliability, alertReliability}` + `forecast[].regime` ride dans `sargassum.json` (serialisé ligne 1365, vérifié) = l'app. Pour les PAGES (region-seo-pages.cjs lit `backtest-results.json`, pas le `forecast-accuracy.json` figé d'avril) : nouveau bloc render-ready `regimeReliability` {samples, cleanReliabilityPct, alertReliabilityPct, falseAlarmRatePct, headline fr/en/es} dans backtest-results.json (archive) + backtest-regime.json (reforecast). Remplace le global trompeur (`byHorizon.statusHitRate`) que les pages publient aujourd'hui. Câblage du rendu = lane parallèle (region-seo-pages.cjs hors scope), data = prête.
- **Audit adversarial 5 dimensions** (workflow `wekz252qz`, 6 agents, 483k tok) : les skeptics ont lu le DIR PRINCIPAL (reverté par la session // en pré-mes-changes) → finding « critical : le code n'existe pas » = **faux positif wrong-tree** (vérifié : origin/main A bien mon code — forecast.cjs 10 matches regime, `arrivalDetected = maxArrival >= regimeArrivalDetectThreshold(regime)` L473, confidence.cjs 239 lignes). Régime-classifier 0 finding, confidence-honesty « sound », 0 nondéterminisme. 2 findings DESIGN valides traités ↓.
- **3 fixes data-driven** (`6df90e4c`, additif, déterministe vérifié) :
  1. **Cohérence arrivée/bandeau** (forecast.cjs) : en calme un signal SOUS le seuil 0,12 est amorti (0,45) et ne bannière jamais ; un signal qui FRANCHIT le seuil = arrivée crédible à pleine force (gain 1,0) → bandeau « arrivée imminente » + AFAI prévue toujours d'accord (avant : un signal supra-seuil-mais-amorti pouvait allumer le bandeau tout en affichant clean). Neutre sur le backtest (aucune plage calme ne franchit 0,12 dans la fenêtre). Vérifié synthétique : calme+banc fort → bandeau ON + J+1 0,22/moderate, alerte plafonnée conf 30.
  2. **Plancher de confiance calme+propre** (confidence.cjs) : le backtest montre calme+propre ~100% fiable à tous les horizons mais la confiance affichée s'effondrait à 6-12% à J+4 → on CACHAIT notre propre fiabilité. Plancher conservateur horizon-décroissant 68→40 (bien sous le 100% mesuré — 1 mois calme ≠ permanence), SEULEMENT calme+propre, jamais > confiance jour-0, supprimé pour les plages mémoire. Le miroir du plafond alerte. Vérifié : J+1 68% … J+6 40% à 100% hit ; mémoire exemptée ; déterministe.
  3. **Chiffres bornés à leur fenêtre** (backtest-forecast.cjs) : `regimeReliability.window` + headline « (saison calme, 2026-05-16 → 2026-06-15) (sur N) » → jamais une garantie ouverte ; note oriente vers le reforecast (22) plutôt que le blend archive.
- **Garde-fou anti-régression** (`ab47e36b`) : `node scripts/automation/backtest-forecast.cjs --selftest` = 10 invariants codifiés (plancher calme+propre, plancher borné par conf jour-0, plafond alerte ≤30, cohérence bandeau/prévision, exemption mémoire, pas de floor 0,15 banni, expo par régime, déterminisme) sur inputs synthétiques, exit≠0 si violé. Protège la recalibration d'un revert accidentel (le tree a été reset 3× pendant le dev). À brancher en CI/pré-build.
- **Reste (handoff, hors scope)** : bandeau/disclaimer côté UI (Sargasses_PROD.jsx) « les alertes apparaissent ~24h après l'observation satellite » ; câbler le rendu `regimeReliability` dans region-seo-pages.cjs ; quand une vraie arrivée haute-saison arrive → re-dériver REGIME_RELIABILITY transition/high (aujourd'hui hand-set, aucune donnée).

## ⏱️ SESSION 15/06 (loop CONVERSION — écrans React in-app) — worktree isolé `sargagame-mw`
**Lane conversion (Sargasses_PROD.jsx/src//sw.js uniquement). ⚠️ 2 sessions loop partageaient le dir principal (social-share l'a basculé sur `loop/social-share-generators`) → je travaille désormais dans un WORKTREE ISOLÉ `C:/Users/user/Desktop/Backup/sargagame-mw` (node_modules symlinké, build OK), push `mw-deeplink:main` fast-forward. Ne touche jamais les fichiers des sessions parallèles (forecast: confidence/forecast.cjs ; social: scripts/automation/*share* ; architecte: region-seo-pages/scene-svg/UX_BUILD_BRIEF).**
- **Deep-link `/beaches/` `/playas/`** (`c78b704d`) : l'auto-open fiche ne matchait que `/plages/` (FR) → trafic Google EN/ES (régions USD) atterrissait sur une fiche jamais ouverte. Regex étendu aux 3 préfixes + slug aligné sur slugify SEO (strip dash tête+queue). Vérifié unit-test (regex 3 préfixes + slug==slugify sur accents/apostrophes/parenthèses) + build + smoke. SW v167. Cherry-pické sur main via worktree (commit avait atterri par erreur sur la branche social partagée).
- **BILAN backlog conversion (mien)** : paywall = 4 A/B déployés (pw_scene/pw_calm/pw_constel modal + pw_beat in-scène forecast-lock) → **mesure en cours, 0 signal (volume lent, deploy propage)** ; CTA→redirect 92% sain (track() utilise déjà sendBeacon+queue localStorage = pas de race) ; →pay réel = `payments_real` Stripe-truth (attribution par-variant bloquée par garde-fou « pas toucher stripeUrlWith ») ; Ground-Truth Snap = prématuré (brief : après funnel prouvé). → **ATTENTE EXTERNE** : re-mesurer modal→CTA par variant quand le signal s'accumule (J+1+), garder le meilleur via A/B.

## ⏱️ SESSION 15/06 (loop FIABILITÉ FORECAST) — fausses alertes saison calme ÷23,6, confiance PAR RÉGIME
**Lane forecast (confidence.cjs / forecast.cjs / backtest-forecast.cjs uniquement — rien touché des autres sessions). Plan 90j #3 : réparer le défaut qui rend la donnée RÉFUTABLE. Tout vérifié en node, PAS de build complet.**

- **MESURE (le défaut, chiffré au niveau paire/régime)** — backtest re-mesuré sur archive 30j + history 31j. Découverte centrale : **sur toute la fenêtre mai→juin 2026 l'observation réelle est TOUJOURS propre (max AFAI 0,130 < 0,15) = saison calme pure, zéro vraie arrivée**. Le « 80 % justes » global = un BLEND qui MENT : en régime calme, prédiction **propre = 100 % fiable** (2422/2422) mais prédiction **ALERTE = 0 % fiable** (0/638 — chaque alerte calme était fausse). Pires plages = pile-ou-face : gp-caravelle 25 %, gp-sainte-anne 52 %, diamant 56 %.
- **DIAGNOSTIC (paires, jamais un floor global)** — les 519 fausses alertes (re-forecast code AVANT) tracent TOUTES à l'injection `arrival-banks` sur 5 plages sud/est exposées (gp-sainte-anne, gp-caravelle, gp-vieux-fort, pt-marin, gp-pt-chateaux) : 303 taguées `banks-drift` + 216 = l'ÉCHO persistant de cette injection les jours suivants. Co-driver mineur : `satellite-trend` extrapolant une pente montante sur du bruit d'eau calme.
- **CORRECTION (additive, déterministe, AUCUN floor — l'inverse : on baisse)** :
  - `confidence.cjs` : `classifyRegime` (calme/transition/high d'après le niveau OBSERVÉ récent de la plage, pas le calendrier) + table de fiabilité empirique `REGIME_RELIABILITY` + `regimeAdjustedConfidence` (plafonne la confiance d'une alerte en régime calme à 30 — elle ne peut JAMAIS s'afficher fiable ; les prédictions propres gardent leur confiance horizon-décroissante).
  - `forecast.cjs` : régime par plage → **gain d'arrivée régime-conditionné** (calme 0,45 / transition 0,85 / high 1,0) + **seuil `arrivalDetected` relevé en calme** (0,12 vs 0,05) : un banc offshore ne peut plus, à lui seul, faire basculer une plage tranquille en alerte. Pente de trend POSITIVE amortie en calme (les pentes descendantes/dispersion passent intactes). Auto-correcteur : un day-0 qui monte vraiment sort la plage du régime calme → physique pleine restaurée. Physique 100 % préservée en transition/high.
  - Exposé pour l'app + pages : `weekly[id].regime` + `weekly[id].regimeConfidence {cleanReliability, alertReliability}` + `forecast[].regime`. → on peut afficher « saison calme : prévisions propres très fiables, alertes peu fiables » au lieu d'un % global trompeur.
- **RE-BACKTEST (preuve chiffrée, même instrument = banks courants tenus constants)** — nouveau mode `node scripts/automation/backtest-forecast.cjs --reforecast` re-exécute le code COURANT sur les inputs historiques (l'archive = outputs figés, n'aurait pas mesuré un changement de code). **Fausses alertes calme 519 → 22 (18,4 % → 0,8 %) = ÷23,6** ; hit 81,6 % → 99,2 %. Les 22 résiduelles = cas-frontière (predAfai 0,15-0,17, réel 0,09-0,12), **toutes à confiance ≤ 30** (signalées peu fiables, pas affirmées). Mode archive enrichi d'un split PAR RÉGIME (jamais le global seul). Sortie : `data/backtest-regime.json`.
- **Garde-fous respectés** : zéro `cleanFloorFor>=0.15 atlantic` (mécanisme inverse), aucun chiffre global publié sans son split régime, déterministe (2 runs identiques byte-à-byte vérifiés), rétro-compat 4-arg (`beaches=null`) testée. Signature `buildHonestForecast` inchangée → 0 impact sur les 4 call-sites pipeline. Reste possible : capturer un archive de bancs daté pour un backtest d'arrivée 100 % fidèle (proxy banks-courants documenté).

## ⏱️ SESSION 15/06 (reprise) — SUITE PRIORISÉE entièrement livrée (5/5)
**Audit multi-agents `wt4xn78g8` (4 auditeurs + verify adversarial + synthèse) → backlog ancré → implémenté incrément par incrément (build exit 0 + smoke EUR + DOM à CHAQUE push). Funnel Stripe intouché partout.**
- **#49 pan inertie + bords élastiques** (`bbcc8717`) — Archipel : le pan libre coast au relâché (décélération = continuation du geste, pas idle), bords résistent (overscroll borné drag + ressort retour). Monde jamais lançable hors écran. reduced-motion : vélocité=0. Vérifié DOM (séquence pointer, transform appliquée, 0 err).
- **Verdict du Jour — Devine-puis-Révèle dans la fiche** (`1ea5648d`) — A/B `pw_verdict_guess`, l'user devine le statut AVANT la donnée → engagement+série (clés dédiées `sg_vdj_*`, ne clobbe pas le jeu scroll). 1×/plage/jour, reveal one-shot scoped `vdjPop`, calme. Boutons share `missed` sur raté.
- **Design-system SCENE_TOKENS + `--sg-*`** (`ad27be9c`) — SCENE_TOKENS = source unique golden-hour ; BEACH_PHASE en DÉRIVE (byte-identique vérifié machine+DOM : day.sky rend exact) ; index.html émet golden en `--sg-*` → app + 136 pages SEO partagent la source ; REGION.sceneTheme = override marché prêt. Additif, 0 changement visuel défaut.
- **Purge anim `infinite` (#34)** (`cf6b3198`) — 52 lignes / 55 idle-loops → `1 both` (joue 1× à l'apparition puis fige). Couvre map/onboarding/paywall/scènes signature (sgms/sgas/sgst+doublon/gf)/WorldFeed/particules/chevron. GARDÉ : nuages golden-hour (bscCloud/sghDrift), spinner checkout, gf-scanline (interaction), reduced-motion. Vérifié DOM (6 classes → iteration-count:1).
- **Variantes share-card 'top' + 'missed'** (`8d48e572`) — chrome factorisé `_scChrome`/`_scShip`. 'top' = LA PLAGE DU JOUR (reco « vas-y », spoiler-free). 'missed' = défi raté « la mer m'a eu » (loss-aversion viral), SPOILER-FREE STRICT (dessine que le choix barré, jamais le vrai statut). Vérifié e2e DOM (raté→bouton→canvas→download, 0 err).

**VÉRIF ADVERSARIALE finale** (`wsowe2wzx`, 5 reviewers + synthèse) : 3/5 dimensions clean (funnel-Stripe intouché, doctrine calme, pan-correctness). 3 findings traités (`70f2ef0e`) : [MED régression que j'avais introduite] AlertScene (storyboard 9s du pitch premium) figeait sur opacity:0 après la purge #34 → keyframes réécrites pour tenir l'état LIVRÉ visible (joue 1× puis fige visible) ; [LOW] panBounds normalisé min<=max (plus de boucle rAF sur aspect-ratio extrême) ; [LOW] nom centré dans la carte share 'top'. INFO : MethodScene = dead code (jamais rendue), même souci latent si un jour wirée.

**MÉGA-LOOP — construire chaque écran au niveau home (data-driven, ultracode/workflows) :**
- ⚠️ **Session ARCHITECTE parallèle** dans le même dossier : possède `UX_BUILD_BRIEF.md` (pas encore créé) + pages SEO statiques + édite le pipeline forecast (`confidence.cjs`/`forecast.cjs`/`backtest-results.json` en non-staged). NE JAMAIS écraser leur travail non-committé — stash/restore autour de mes push. Moi = écrans React in-app.
- **Cycle paywall (15/06)** — DATA : analyze-ux 14j → FUNNEL_MODAL alerte #1 (MQ 0%/GP 2,6%) ; funnel modal→CTA = 2% (3418 modals). **Workflow design `w5ti5ja71`** (3 concepts divers → jury North Star) → gagnant **« Ta côte, sous l'œil »** (constellation golden-hour). Catch jury : `reliableHorizon=3` → interdit de vendre 6 jours ; preuve = observables du jour only. **CONSTRUIT** (`3c83c707`, A/B `pw_constel` 15%) : le paywall = la HOME réincarnée — plages = points lumineux sur mer golden-hour, Veilleur humeur data-driven, étoile-guide = top beach, compte propre LIVE gravé, sparkline near-term, promesse calme-positive 1re pers. + preuve du jour. CTA/paiement intouché. Vérifié DOM (pcSky + 10 dots + guide + compte + promesse + preuve, scenePay supprimé, 0 err). **À RE-MESURER** : modal→CTA `pw_constel:constel` vs control (J+1, volume lent). **Prochain écran (data)** : CARTE in-app (25% clics Clarity) OU re-mesure pw_calm/pw_constel si signal.
- **Cycle forecast-lock BEAT (15/06)** — brief `UX_BUILD_BRIEF.md` lu (existe) : je possède les écrans React in-app (#4 paywall in-scène + #5 carte-fog + fix deep-link) ; l'architecte possède les héros SEO/hub/resort (#1-3) + `scene-svg.cjs`. DATA : modal→CTA 2% inchangé, cta→redirect 92% (sain, le « leak 50% » mémoire = corrigé), `pw_constel`/`pw_calm` 0/0 (deploy propage). Mandat backlog #1 explicite = **paywall = BEAT du scroll sur forecast-lock, PAS un modal**. **CONSTRUIT** (`02d1eca7`, A/B `pw_beat`) : le forecast-lock révèle inline une scène golden-hour de l'horizon prévu (statuts réels, near-term net/lointain estompé, honnête) + Veilleur + promesse positive + preuve `firstConf%` + CTA→checkout. Vérifié DOM (lock → beat inline, AUCUN modal, 0 err). ⚡ La session forecast parallèle a rendu le forecast HONNÊTE par régime (`weekly[id].regimeConfidence`, ÷23,6 fausses alertes calme) → preuve future encore plus crédible. **Prochain** : re-mesure pw_beat/pw_constel (J+1) ; sinon fix deep-link SEO `/beaches//playas/` FR-only (L10103) pour ouvrir la fiche au trafic EN/ES.

**LOOP DATA-DRIVEN (détecter→prioriser→construire→re-mesurer) :**
- **Cycle 1 (15/06)** — DONNÉE : funnel live `modal→CTA = 2%` (74/3416 modals) = FUITE #1 ; `session→lock = 0,5%` (122/22371) = ennui ; analyze-ux (clé `stats-keys.json` MAINTENANT présente, 5 régions) alerte #1 = FUNNEL_MODAL MQ 0% / GP 2,6%, angle « value-prop POSITIVE en saison calme ». MQ live = 100% propres → `_allCalm`. **FIX** : hero premium **calme-adaptatif** A/B `pw_calm` (`c5c8407d`) — en saison calme le hero pivote « avant que ça tourne » → « Sache où sera la mer DEMAIN » (vend la prévision = ce que le free n'a pas, sans peur). Vérifié DOM (forecast-lock → modal → hero calme rendu). **À RE-MESURER** (J+1, volume lent) : modal→CTA segmenté `pw_calm:calm` vs `:control` via re-curl funnel. **Prochain cycle** : si modal→CTA pas encore de signal (volume), attaquer la 2e fuite `session→engagement 0,5%` (ennui) — Verdict du Jour (`pw_verdict_guess`) déjà lancé, mesurer ; sinon étendre le calme-adaptatif à la carte 02/preuve.

**LOOP autonome roadmap (reprise 15/06 soir, désormais piloté par la donnée) :**
- ✅ `REGION.sceneTheme` wiré (`43a20cf9`) : override `--sg-*` par marché dans vite.config.js (cascade après base, MQ/GP early-return). Arc design-token COMPLET (source→émission→override). Inerte tant qu'aucune région ne le définit (slot prêt). Vérifié unit-test + build MQ sans override + smoke.
- ⏭️ PROCHAIN : polir les ÉCRANS du funnel (entrée→monde→plage→premium→checkout→retour), additif + A/B + calme, en enrichissant la scène golden-hour. Tokens CONSOMMÉS dans les scènes SVG = à faire via `style={{fill:var(--sg-*)}}` (PAS l'attribut `fill=`, var() n'y marche pas) là où le retint marché a du sens — non prioritaire vs polish visible.

**SUITE (reprendre frais) :** brancher des CONSOMMATEURS des `--sg-*` (pages SEO noscript + scènes SVG via `style={{fill:var(--sg-*)}}`) · trigger 'top' aussi sur HeroVerdict/strip plage-du-jour · purge #34 reste = scènes signature en play-on-scroll IntersectionObserver (au lieu de `1 both` on-mount, raffinement) · MESURER pw_verdict_guess + uptake share via stats.php quand la donnée s'accumule. ⚠️ Stats key absente en local → `analyze-ux.cjs` only `--mock`. Vérif visuelle finale = écran fondateur.


## ⏱️ SESSION 15/06 (jour+nuit) — scène-spine + funnel + alerte UX + grammaire
**Tout déployé, build+smoke vert + vérifié DOM à chaque push.**
- **Scène satellite+plage = colonne vertébrale** (réponse au feedback "t'as retiré le svg de l'accueil") : le HeroScene était intact mais enterré sous l'Archipel dots → ajout MER golden-hour + horizon + reflet dans le monde (palette BEACH_PHASE, phase-adaptive) → les plages scintillent sur l'eau (`6ad88adf`). + **Lecture du Jour** : le Veilleur narre la vraie data (counts live), saison calme = état désirable (`f6bc4eb4`).
- **Funnel réarmé** (audit widget-factory wabg4gb8s) : sg_conversion+forecast_lock au tracking, panier abandonné réarmé, parrainage réarmé, engagement_50s tué (`a52c7519`, `95452d93`).
- **Buzz** : buildShareCard(variant) + Veille-Card de Série (Wordle de la mer) sur WorldBonus (`719cec93`).
- **Régression scroll corrigée** : scroll = visite plage-à-plage (pas zoom), boucle, escapable, cul-de-sac Solutions tué (`5f4b82fd`, `bfdf1212`). Grammaire affinée par workflow wwrqblnxu (escape clavier, double-tap nommé).
- **ALERTE UX temps réel** (mandat "nous alerter quand bloqués/s'ennuient/funnel") : détection rage-click (`sg_friction`) + `analyze-ux.cjs` qui sort un backlog trié + angle de fix (svg/marketing/code) → [[reference-ux-alert-loop]] (`711aca4c`, `ea6230f3`).
- **Trip Pass USD A/B** + funnel par-région + Florida SEO + La Marée #1-4a (plongée/calme/dock/scroll) — plus tôt dans la session.

**SUITE PRIORISÉE (reprendre frais, tout additif+gated+vérifié) :** #49 pan inertie+rubber-band (med, anim) → Verdict du Jour interactif dans la fiche (Devine-puis-Révèle, buzz 80) → design system SCENE_TOKENS+CSS custom-props → purge anim infinite (#34) → top-reco/verdict-raté share variants. ⚠️ Vérif visuelle réelle = écran fondateur (preview headless gèle les anims + screenshot HS). Refs : [[reference-la-maree-du-veilleur]] [[reference-widget-factory-week]] [[reference-ux-alert-loop]].



Mandat fondateur : autonomie totale. Construire une VRAIE UI/UX produit A→Z, SITE FINI.
END-TO-END : refonte produit COMPLÈTE, CHAQUE ÉCRAN en SVG, du 1er clic au dernier, du 1er
scroll au dernier — un parcours unifié et fini. Chaque plage = scène SVG unique/adaptative
(image+data) + visite virtuelle & plan ancrés dans les problèmes réels des habitants/sociétés.
Penser workflow/process/multi-agents/test.

## Règles de sécurité (autonome, le fondateur dort)
- Chaque incrément : `npm run build` (exit 0) + `node scripts/tmp-wf-results/notrial-smoke.cjs eur` (OK) AVANT tout commit.
- Additif / non destructif. Ne jamais casser le funnel Stripe (le smoke le protège).
- Doctrine CALME absolue ([[feedback-calm-no-idle-motion]]) : au repos = tableau, zéro boucle.
- Zéro dépendance, SVG inline, instantané. Pas d'images/vidéo.
- Push main = auto-deploy. Rebase `-X theirs` si race sur JSON générés.
- FB groupe = source de RÉFÉRENCE seulement (ne pas reproduire posts/photos ; créer du SVG original).

## Roadmap (incréments shippables) — OBJECTIF : SITE FINI END-TO-END
0. [EN COURS] Spec per-beach via workflow `wdiiae0wd` (archétypes data→SVG + modèle plan).
1. [ ] **Blueprint produit END-TO-END** (workflow à lancer APRÈS wdiiae0wd) : chaque écran en SVG,
       chorégraphie parcours 1er→dernier clic/scroll, transitions, langage unifié, build order. (tâche #38)
2. [ ] BeachScene v2 — scène unique/adaptative par plage (seed id + archétype + afai/status/coast). Calme. (#35)
3. [ ] Visite virtuelle + plan d'action par plage, ancré problèmes réels, i18n. (#36)
4. [ ] Implémenter écran par écran selon le blueprint : entrée → monde → plage → plan → solutions → premium → checkout → retour. Parcours unifié, scène v2 en hero. (#37)
5. [ ] Purge ~60 anims `infinite` app-wide restantes. (#34)
6. [ ] Mécaniques calmes addictives (recherche w0ey41mt0) : Lecture du Jour, pan-snap vélocité, Devine-puis-Révèle, carte-partage sans lien.
7. [ ] (signalé, décision fondateur) retirer Leaflet ; repackaging pricing ; fiabilité saison calme.

## Analytics — anti-bloqué / anti-ennui / anti-caché (piloter par la donnée)
Sources demandées : Google Sheet "Sargasses Emails" (gid 737335470) + GA4 (a276662454p530818426).
- ⚠️ La feuille contient des EMAILS (PII) → NE PAS aspirer/exposer ; n'utiliser que l'agrégat.
- ⚠️ GA4 web UI non récupérable en headless (login) → utiliser le **funnel endpoint** (même backend, action=funnel) + Clarity (mémoire). Wirer la GA Data API plus tard si besoin.
- Funnel live (14/06, snapshot) : sessions 21327 · premium_modal_open 3433 · premium_modal_cta 76 → **modal→CTA = 2 % (FUITE #1)** · forecast_lock_click 119 → **session→lock = 0,6 % (engagement faible = ennui)** · cta→redirect 89 % (bon). ⇒ Le blocage est AVANT le CTA : parcours pas assez engageant/clair.
- OBJECTIF refonte : remonter modal→CTA et session→engagement. Chaque écran doit donner envie de cliquer/scroller (jamais bloqué, jamais caché, jamais ennuyeux).
- Boucle nuit : re-curl funnel à chaque cycle, noter la dérive des taux ici.

## Mécanisme d'orchestration
- Chaînage par workflows background : à la complétion → je suis ré-invoqué → j'implémente+vérifie+ship → je lance le suivant.
- État persistant ici + mémoire projet. Si la session s'arrête, reprendre = lire ce fichier + `git log`.

## Journal des commits de la nuit
- 7187fe62 — Veilleur draggable (drag rigolo, radar suit, rebond)
- 43e10eb0 — FIX CLICS (pointer-capture) + monde calme + Veilleur parle + parallaxe fond
- 74161ab7 — landing = tableau calme (fin du clignotement accueil)
- 2f0c258a — engagement CONTINU par écran → GA4 (mesure l'ennui : dwell/actions/idle/scroll/bored)
- 8064b631 — BeachScene INCRÉMENT 0 : scène fiche calme (11 boucles tuées)
- 0de0cf36 — BeachScene fondation : PRNG seedé + archetypeOf 9 archétypes (dump 136 OK)
- 8bd36563 — TRACKING FIRST-PARTY indépendant (sans GA/Sheets) : /collect.php + /stats.php
  same-origin sur notre host + client SDK. ⏳ vérif PHP live en cours (bg bwshcuo3n) — si
  PHP non exécuté sur l'origine → pivot Cloudflare Worker (site déjà derrière Cloudflare).
  Clé stats = sg-data/.statskey (par FTP). Voir [[reference-first-party-analytics]].
- 1b96aa08 — BeachScene v2 RENDU (INCRÉMENT 3) : chaque plage = scène SVG unique (relief +
  palmiers procéduraux seedés par archétype). Validé : Diamant/Salines/La Datcha distincts.
- e694590b — BeachScene INCRÉMENT 4 : eau teintée par l'AFAI réel (data-driven, honnête).
- fb590591 — VisitPlan : le plan par plage DANS la fiche (ancré problèmes réels, i18n), pas un popup.
- TRACKING PHP confirmé LIVE (collect.php 204 / stats.php 403). Plus de dépendance Google.
- 7b5d3f56 — RETRAIT LEAFLET (full-SVG) : LazyMapView monté seulement si !navWorld ; switch de
  plage recâblé sur [data-beach] ; ArchipelView rootMode (pas de ✕). Vérifié : 0 leaflet-container,
  clic+switch OK. Reste : supprimer src/MapView.jsx + dep leaflet + CSS après mesure de ?nav=map.
- e694590b — BeachScene INCRÉMENT 4 : eau teintée par l'AFAI réel (data-driven, honnête).
- fb590591 — VisitPlan : le plan par plage DANS la fiche (ancré problèmes réels, i18n), pas un popup.
- 09853046 — A/B pw_scene : paywall = continuation golden-hour (Veilleur + promesse en haut),
  shell ONLY, checkout Stripe intouché. Cible la fuite modal→CTA 2%. ?pwscene=1/0 en QA.
  → À MESURER via stats.php (modal→CTA pw_scene:1 vs :0) quand la data s'accumule.
- 2bee456d — unité visuelle : 1 seule couleur de statut partout (7 stragglers alignés sur stMod/stClean).
- bb419de2 — unité visuelle : 1 seul Veilleur (miVeil gagne l'antenne) + figé au repos (calme).
- 52d8021e — reveal one-shot des scènes à l'ouverture (UNITÉ VISUELLE COMPLÈTE : statut+Veilleur+reveal).
- 6bfc8a49 — calme : fige le pulse 'pub' du CTA forecast-lock (chemin conversion).
- RESTE 🟢 : S2b seed premium dans le tour (engagement 0,6%) ; reste des boucles idle #34 (gf-*,
  sol-belt, sg-eta-badge — surfaces secondaires) ; suppression définitive MapView.jsx + dep leaflet
  après mesure ?nav=map ; MESURER pw_scene (modal→CTA) via stats.php.
- f0e83fb9 — carte de partage spoiler-free SANS lien (canvas, effet Wordle, croissance virale).
- 6bfc8a49 — fige le pulse 'pub' du forecast-lock.
- FIABILITÉ : vérifiée SOLIDE en live (16/4/0, Diamant moderate = signalement communautaire légitime,
  PAS une fausse alerte). NE PAS retoucher.

## 🌙 NUIT 2 — MANDAT ÉLARGI (fondateur me laisse la nuit, 15/06)
Appliquer le pattern « jeu SVG + contenu (free+premium) + déblocage de NOS données + capture d'intention/KPI »
à **TOUTES les étapes du funnel** : chaque écran/panneau/display = SVG bien construit, plus détaillé.
- Design en cours : `w2pty2tdy` (Solutions-game spec) → à exécuter dès réception.
- Inputs déjà en main : blueprint end-to-end `w8zvw5wdo` (S0-S6 + chrome), spec BeachScene `wdiiae0wd`,
  direction valeur `w0ey41mt0`.
- Boucle nuit : workflow complète → j'implémente (panneaux + unlock + intent + contenu 2 tiers) → vérifie
  (build+smoke+preview) → commit → suivant. Calme : anim à l'interaction, jamais idle. Funnel Stripe intact.
- Tiers : FREE = état du jour toutes plages + jeu Solutions éducatif + carte partage + 1er palier méthode.
  PREMIUM = forecast J+1→J+6 + alertes + brief matin + data profonde des solutions + assets exclusifs.

## NUIT 2 — commits
- 4af92d23 — fondation déblocage + capture d'intention (sgUnlock/sgIntent, funnel-wide).
- 0c990ef0 — jeu Solutions INC1 : instrumentation sg_sol_tap (transforme/tri/debat) = heat des solutions.
- d3f32777 — SEO pages MÉTÉO MQ+GP (profil #1 data-mining : cluster "meteo" >110 clics/sem en hausse) + FAQ schema + sitemaps.
- Specs nuit 2 : `reference_solutions_game_spec` (jeu data-unlock, buildOrder INC1✅..INC7) + `project_unexpected_profiles` (5 profils chiffrés).
- 3ac0ec38 — jeu Solutions INC2 : déblocage progressif + barre HUD X/8 (StoryEngine onBeat + niveau monotone g/s, reveal one-shot). Vérifié 1/8→7/8 au scroll.
- RESTE nuit 2 (bien speccé, reprendre frais) : Solutions INC3 cartes-données live (AFAI/confidence/breakdown du JSON) → INC4 Sol*Scene→jeu actif + faits réels + 6e voix → INC5 vidéo NASA médaillon → INC6 payoff+CTA double → INC7 patch collect/stats.php. Data-mining : freemium email tier (45% des actions modal = email), bulletin/voix SEO, B2B substrat (105 hôtels regions/resorts/*.json), GP rage-bug (re-vérifier post-refonte monde). Specs : [[reference-solutions-game-spec]] + [[project-unexpected-profiles]].

## LUNDI — CHANTIER USA/USD (démarré, scope `wtubn4gfe`) (tâche #41)
**Verdict honnête (21 640 sessions) :** l'argent USD n'est PAS dans le B2C actuel — le checkout USD MARCHE, 98% des gens qui VOIENT l'offre la refusent. 3 causes structurelles : (1) abo mensuel vs touriste 5j, (2) l'EUR convertit (15/15) grâce au « 0€ aujourd'hui / essai 7j » dont le USD est PRIVÉ (`noTrial:true`), (3) concurrent gratuit dominant au MX + tout-vert tue l'argument alerte. L'argent EST dans le **B2B Resort Dashboard** (105 hôtels mappés, substrat 90% là, 1 contrat = 20-60× un abo) MAIS bute sur la fiabilité saison calme + vente humaine.

**Audit infra SEO USD = SAINE** (pas le goulot) : `scripts/lib/region-seo-pages.cjs` génère hubs (forecast/today/map/season/methodology/semáforo-ES/press) + pages plages (FAQPage) + resorts long-tail + maillage (hubLinks+nearby+network) + sitemap + hreflang self/x-default + accuracy backtest live. IndexNow (`submit-indexnow.cjs`) + GSC (`config.cjs`) couvrent TOUTES les régions. → générer + de sous-pages (#18) n'est PAS le levier.

**Shippé ce commit (décision-free) :**
- `regions/florida.json` : `seo.homeTitle`/`homeDesc` MANQUANTS (PC/RM les avaient) → ajoutés. Racine FL ne partait plus battue.
- `public/stats.php` : **breakdown funnel PAR RÉGION** + filtre `?region=florida`. Avant : histogramme sessions/région seulement → aveugle. Maintenant par région : { sessions, funnel modal_open→cta→redirect→email, rates session_to_modal/modal_to_cta/cta_to_redirect/session_to_email, bored_rate, avg_dwell, top_events }. Le prérequis « piloter par région » du plan. Testé synthétiquement (FL modal-only vs RM funnel complet).

**DÉCISIONS FONDATEUR PRISES (14/06) :** (1) chantier = **3 fronts en parallèle, je priorise**. (2) USD = **Trip Pass 7j en A/B** ✅ (vs essai gratuit / abo-seul). RESTE à décider : pricing B2B (badge gratuit → Resort Watch 99-149$/mo → marque 299-499$) + pilote brief gratuit 5-10 hôtels Bávaro ; ordre régions (reco PC-EN d'abord vs mémoire MX>DR).

**Shippé commit 2 — Trip Pass 7j USD A/B (tâche #42) :**
- App `Sargasses_PROD.jsx` : `LINK_TRIP`/`PRICE_TRIP` (depuis `REGION.paymentLinks.tripPass`/`pricing.tripPass`) · A/B `pw_trippass` (override `?pwtrip=1/0`) · carte Trip Pass calme sous le CTA abo dans PremiumModal · CTA `startTripPass` = **chemin séparé** (ZÉRO contact effectivePlan/stripeLinkFor — funnel protégé intact, smoke EUR vert) · persistance `sg_premium_pass_end` **time-boxée 7j** (un one-time ≠ accès à vie) · handler retour `?pass=trip` AVANT le bloc générique (sinon session_id poserait sg_premium permanent) · `isPremium` honore pass_end.
- `regions/{puntacana,rivieramaya,florida}.json` : `pricing.tripPass:"$5.99"` (mid de la fourchette approuvée, ajustable).
- `scripts/create-region-payment-links.cjs` : prix **one-time** (mode=payment) + Payment Link `metadata.plan=trip` redirect `?pass=trip`, écrit `paymentLinks.tripPass`. **PAS exécuté** (compte Stripe LIVE partagé).
- État : **INERTE en prod** tant que `paymentLinks.tripPass` n'existe pas (gate sur le lien). GO-LIVE = `node scripts/create-region-payment-links.cjs <region>` (LIVE) → rebuild USD → screenshot réel via `?pwtrip=1`. **Go fondateur requis pour le run LIVE.** SW v144.

**RESTE chantier (décision-free, codable) :** repositionner value-prop USD sur planif-séjour/7j (survit au tout-vert, A/B-gate) · MVP technique Resort Dashboard depuis substrat · CTA « For hotels/Para hoteles » intent-only · audit perf/fit mobile USD · fix sur-prédiction saison calme PHASE 0bis (SANS floor 0.15 — [[feedback-forecast-floor-ban]]).

## ÉTAT (≈31 commits NUIT 1) — la transformation produit de base est COMPLÈTE & cohérente
Full-SVG (Leaflet out) · monde unifié 'même monde' · plages uniques (9 archétypes) · plan in-scène ·
paywall-scène (A/B pw_scene) · tracking first-party (collect/stats.php, sans Google) · engagement continu ·
unité visuelle (1 Veilleur, 1 statut, reveal) · calme · carte de partage virale.
**Le prochain pas N'EST PLUS du code (ajouter des features = 'ajouter des briques' = l'anti-pattern).**
C'est : (1) MESURER (pw_scene modal→CTA, uptake carte, fiabilité fresh-archive) via stats.php sous quelques
jours ; (2) décisions BUSINESS du fondateur (pricing : pass voyage + annuel + B2B hôtel). Voir
[[project-value-direction-research]]. Restes mineurs : #34 boucles idle écrans secondaires ; suppression
définitive MapView.jsx après mesure ?nav=map.
- … RESTE 🟢 (safe, validation multi-écrans requise) : BeachScene reveal one-shot ; token statut
  unique + fusion des 2 Veilleur ; dégraisser les 5 FABs (après absorption Solutions/Découverte).
  🔴 (sign-off fondateur — REVENU) : retrait Leaflet (recâbler pin-switch/suggestions d'abord),
  refonte paywall en continuation de scène (fuite modal→CTA 2%), clôture A/B en cours.

## Specs/recherches produites (à exécuter)
- `tasks/wdiiae0wd.output` — spec BeachScene v2 + VisitPlan (buildOrder 8 incréments ; faits 0,1,2 ; reste 3-7). Mémoire [[reference-beachscene-v2-spec]].
- `tasks/w0ey41mt0.output` — direction valeur + mécaniques calmes addictives. [[project-value-direction-research]].
- workflow `w8zvw5wdo` — blueprint produit END-TO-END (en cours) : écrans + chorégraphie + build order. Au retour → exécuter.

## Découvertes / décisions
- Bug clic majeur résolu (pointer-capture re-route le click) — [[reference-pointer-capture-click-pitfall]].
- Leaflet encore monté SOUS l'Archipel (soupe de calques) → à retirer.
- Verdict valeur : le SVG = acquisition, pas le levier de paiement — [[project-value-direction-research]].
