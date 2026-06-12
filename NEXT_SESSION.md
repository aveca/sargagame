# NEXT_SESSION — sargagame

*Session 42 (vendredi 2026-06-12, journée + soirée — reprise SEMAINE PROCHAINE, suite en Sonnet jusqu'à mardi pour préserver le quota Fable 5). Détail narratif : memory `project_session42_done.md`. Dernier commit : 3bffffe.*

## 🧭 DIRECTION ACTÉE PAR LE USER (à relire avant toute décision produit)
1. **Qualité et cohérence avant expansion** — Bahamas GELÉ en `regions/_staging/`. GO conditionnel acté 12/06 : *« on lancera la semaine pro si on a des ventes »* → vérifier les ventes USD (vérité Stripe, PAS le funnel) avant de dérouler LAUNCH-BAHAMAS.md.
2. **« Une expérience bluffante de bout en bout, un produit rendu fini »** (12/06 soir, réf Zenly) : l'interface se CONSTRUIT en vectoriel — le hero photo a été REMPLACÉ par une scène SVG (HeroScene), la méthode est un scrollytelling (ScrollStory). **Les photos réelles restent la matière des cards / fiches plage / SEO** — plus du hero. Jamais d'assets IA pour représenter les plages ; le footage spatial réel domaine public (NASA) est OK avec crédit.
3. Le produit en une phrase : *« est-ce que ma plage est propre aujourd'hui — et demain ? »* Gratuit = carte ; Payant = veilleur (prévision 7j + brief matin + alertes). Tout chantier sert ces 3 lignes.
4. `design/DESIGN-KIT.md` = SOURCE DE VÉRITÉ design (doctrine, inventaire, phase 2, garde-fous).

## 🟢 Shippé session 42 — vague 1 (journée : audit + kit)
- **Audit « tout ce qui cloche »** (17 agents, 10 findings, 0 réfuté) — TOUT traité :
  - 🔴 RGPD : emails en clair dans les logs Actions publics → logId(hash8) partout + **510 logs purgés** (vérifier via `gh api .../logs` → 404, PAS `gh run view` qui a un cache local).
  - 🔴 Méthodo USD publiait les chiffres d'avril → branchée sur backtest-results.json quotidien (78 % réels, vérifié live).
  - Payment Links USD no-trial (6 liens recréés, vérité API) · GP /es/ « Sargazo Guadalupe » + composite GP-first · hreflang 47/47 · fb-posts purgés · parité webhook en CI.
- **brand-icons.cjs + BrandIcon** (14 icônes maison, MIROIR à synchroniser) — fin des emojis OS sur landing/CTA/reliability/about/month. Étalonnage héros (devenu sans objet sur le hero, reste sur les cards si besoin).
- **DepthFlow v2** (release 451 Mo, 76 plages) — ⚠ les loops ne servent PLUS le hero (démonté 12/06 soir) ; réemploi possible fiches/about.
- **Audit hebdo étendu aux 5 domaines** (GA4 property-id via Admin API, zéro secret en plus) + pages santé USD + GA4 dans la série KPI quotidienne.

## 🟢 Shippé session 42 — vague 2 (soirée : l'expérience de bout en bout)
*Trois paliers poussés dans l'ordre, le train CI final `27442671225` (commit 3bffffe) livre l'état complet — health check SW intégré au workflow.*
1. **Film satellite Sentinel-6** (d37cddd) : footage réel NASA/JPL (mission Copernicus, domaine public, crédit courtoisie affiché), 16 s / 4,5 Mo, `public/videos/sentinel6.mp4` + poster. Désormais en **médaillon « LE VRAI — NASA/JPL »** dans le beat 2 de la ScrollStory. Alternatives 4K vérifiées : memory `reference_satellite_footage.md`.
2. **ScrollStory** (0f42f91) : la méthode = scrollytelling plein cadre, scène vectorielle sticky ~430vh, scroll natif piloté par vars CSS `--b1..--b5` + fenêtres `--bNo` recalculées en rAF (transforms/opacity only). 5 temps : orbite → scan (médaillon NASA) → dérive J+1→J+3 → verdict 06:00 (pastille PROPRE tamponne le brief) → choix + CTA carte. Tracking `sg_story_beat` 1-5.
3. **HeroScene** (3bffffe) : le hero home = scène vectorielle golden-hour (gabarit Shinkai du jeu) — sargasses qui dérivent à l'horizon, repérées depuis l'espace (satellite, faisceau, échos teal), oiseaux, glitter, écume. **Dolly-in au scroll** (var `--hs`, couches ciel<mer<plage) : on « avance dans la baie ». Verdict/CTAs inchangés (cœur de conversion). LCP sans fetch média. SW v65.
4. **Landing personnalisée par l'heure locale + retour accueil** (dernier push, SW v66) : HeroScene en **4 phases horaires** (aube 5-8 / jour 8-17 : ciel bleu, baigneurs, parasol+serviette, bateau de collecte au travail / golden 17-20 / nuit : lune+cratères, ciel étoilé dense, glitter argent-teal, faisceau satellite renforcé) — palette+vie par tokens, override QA `?ph=dawn|day|golden|night` (capturé au chargement du module : les effets de l'app NETTOIENT la query string avant le mount). **Bouton logo (disque or) dans le rail header = rejouer l'atterrissage** (clear sg_hero_seen + setShowHero, track sg_landing_replay). L'heure device ≈ heure plage (PC users locaux).
- QA : 5/5 beats capturés desktop + B2/B4/B5 mobile, hero mobile+desktop+dolly vérifiés, SMOKE EUR OK ×4 (un par build).

## ⚙️ Règles techniques apprises (scrollytelling — à respecter dans toute itération)
- **Composer dans x 262-538 du viewBox 800** : le crop `slice` portrait mobile ne montre que la bande centrale. Tout élément narratif essentiel doit y vivre.
- **`autoPlay muted playsInline` obligatoire** sur les `<video>` montés dynamiquement : un `play()` déclenché par l'IO rate le mount (l'élément n'existe pas encore).
- **`preview_screenshot` scrolle la page lui-même** : tous les « resets de scroll » mystérieux venaient de l'outil. QA scroll = scrub + lecture des vars CSS dans le MÊME eval, capture dos-à-dos.
- Scroll-driven = vars CSS sur le conteneur + `calc()` dans les transforms enfants ; JAMAIS de setState par frame ; scroller = `closest('[role="dialog"]')` (le wrapper du landing scrolle, pas window).
- `transformBox:"fill-box" + transformOrigin:"center"` pour animer un élément SVG dans un groupe translaté.

## ⚠️ REPRISE (lundi ou +)
1. **Éval A/B pw_cta_order + pw_prelude** : cron local lundi 09h35 — si poste éteint, lancer à la main (z-test, n≥100/bras, RECOMMEND-only, vérité Stripe). PREMIÈRE éval après 8 semaines — décision importante.
2. **Vérifier le train final** `27442671225` (3bffffe) live sur les 5 domaines : SW v65, hero vectoriel, ScrollStory (scroller la home !), médaillon NASA. Le health check CI a déjà validé le SW si le run est vert.
3. **Ventes USD → GO/NO-GO Bahamas** (point Direction 1).
4. **Clarity J+3-7** : re-mesure post-fixes clics (baseline 11/06 : MQ 54 rage/746 dead, GP 347/2225) + **impact ScrollStory/HeroScene** (sg_story_beat funnel, hero CTA rate, scroll depth). Si la story fait fuir avant le premium → raccourcir à 3 temps.
5. **GSC GP** : ajouter le service account propriétaire sur la propriété GP. Procédure Chrome actée : Claude ouvre GSC → propriété MQ → Paramètres → Utilisateurs (l'email du SA y est visible — la clé n'existe qu'en secret GH) → même page côté GP → le **user clique « Ajouter »** (modification de permissions = action user). Débloque les requêtes GP dans l'audit.
6. **Phase 2 du kit** (DESIGN-KIT.md) : icônes paywall (⚠ smoke EUR : ne toucher QUE les emojis), chips chat, harmonisation des deux ors, variantes HeroScene par état (à éviter/modéré : ciel + densité de nappes) et par région (silhouette de côte).
7. Idée notée (user, 12/06) : décliner la ScrollStory en vraie vidéo verticale (capture Playwright des beats + pipeline video-brief) pour FB/social.
8. **ROADMAP « le produit s'enflamme » (directive user 12/06 nuit — à dérouler sur les prochaines sessions)** :
   - chaque ZONE sa représentation cinématographique (HeroScene paramétrée par région : silhouette de côte, flore, landmarks — un objet tokens par région comme les phases) ;
   - chaque PHOTO du produit double d'une scène profonde (tap photo card/fiche → variante vidéo/SVG vivante : bateaux qui ramassent, vie en journée/soirée — DepthFlow loops déjà en release pour les fiches, Higgsfield si crédits un jour) ;
   - remplacer progressivement chaque image statique par vidéo/SVG/animation — continuer à publier de nouvelles versions/pages à chaque session.

## ⚖️ Décisions user en attente
GO/NO-GO Bahamas (conditionné ventes USD) · crédits Higgsfield (ignorer sauf besoin humains/pub) · Cloudflare token · GO publication FB briefs · share-promo USD · Apple Pay device réel · GSC GP (2 min, point 5).

## Garde-fous (mis à jour 12/06 soir)
EUR/MQ-GP intouchables (smoke EUR : **rebuild MQ d'abord** — un dist région = 3 FAIL à tort) · seuils pipeline interdits · SW bump à chaque deploy code (**prochain : v66**) · grouper les pushes (chaque push remplace le train pending !) · JAMAIS `git add -A` · jamais d'email en clair dans les logs (logId) · jamais un step fragile entre une donnée et son commit · jamais d'animation de fond dans le jeu · jamais d'emoji OS sur les surfaces de marque · photos réelles = cards/fiches/SEO (le hero est vectoriel désormais) · footage spatial = domaine public + crédit only · scroll natif, jamais hijacké · composer mobile-safe (x 262-538) · Chrome=user, Edge=automation FB.
