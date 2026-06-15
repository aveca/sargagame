# NIGHT LOG — build autonome (nuit du 14→15/06/2026)

## ⏱️ SESSION 15/06 (reprise) — SUITE PRIORISÉE entièrement livrée (5/5)
**Audit multi-agents `wt4xn78g8` (4 auditeurs + verify adversarial + synthèse) → backlog ancré → implémenté incrément par incrément (build exit 0 + smoke EUR + DOM à CHAQUE push). Funnel Stripe intouché partout.**
- **#49 pan inertie + bords élastiques** (`bbcc8717`) — Archipel : le pan libre coast au relâché (décélération = continuation du geste, pas idle), bords résistent (overscroll borné drag + ressort retour). Monde jamais lançable hors écran. reduced-motion : vélocité=0. Vérifié DOM (séquence pointer, transform appliquée, 0 err).
- **Verdict du Jour — Devine-puis-Révèle dans la fiche** (`1ea5648d`) — A/B `pw_verdict_guess`, l'user devine le statut AVANT la donnée → engagement+série (clés dédiées `sg_vdj_*`, ne clobbe pas le jeu scroll). 1×/plage/jour, reveal one-shot scoped `vdjPop`, calme. Boutons share `missed` sur raté.
- **Design-system SCENE_TOKENS + `--sg-*`** (`ad27be9c`) — SCENE_TOKENS = source unique golden-hour ; BEACH_PHASE en DÉRIVE (byte-identique vérifié machine+DOM : day.sky rend exact) ; index.html émet golden en `--sg-*` → app + 136 pages SEO partagent la source ; REGION.sceneTheme = override marché prêt. Additif, 0 changement visuel défaut.
- **Purge anim `infinite` (#34)** (`cf6b3198`) — 52 lignes / 55 idle-loops → `1 both` (joue 1× à l'apparition puis fige). Couvre map/onboarding/paywall/scènes signature (sgms/sgas/sgst+doublon/gf)/WorldFeed/particules/chevron. GARDÉ : nuages golden-hour (bscCloud/sghDrift), spinner checkout, gf-scanline (interaction), reduced-motion. Vérifié DOM (6 classes → iteration-count:1).
- **Variantes share-card 'top' + 'missed'** (`8d48e572`) — chrome factorisé `_scChrome`/`_scShip`. 'top' = LA PLAGE DU JOUR (reco « vas-y », spoiler-free). 'missed' = défi raté « la mer m'a eu » (loss-aversion viral), SPOILER-FREE STRICT (dessine que le choix barré, jamais le vrai statut). Vérifié e2e DOM (raté→bouton→canvas→download, 0 err).

**SUITE (reprendre frais) :** brancher des CONSOMMATEURS des `--sg-*` (pages SEO noscript + scènes SVG via `var(--sg-*)`) + wire REGION.sceneTheme dans vite.config.js (override marché) · trigger 'top' aussi sur HeroVerdict/strip plage-du-jour · purge #34 reste = scènes signature en play-on-scroll IntersectionObserver (au lieu de `1 both` on-mount, raffinement) · MESURER pw_verdict_guess + uptake share via stats.php quand la donnée s'accumule. ⚠️ Stats key absente en local → `analyze-ux.cjs` only `--mock`. Vérif visuelle finale = écran fondateur.


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
