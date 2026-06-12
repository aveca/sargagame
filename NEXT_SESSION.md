# NEXT_SESSION — sargagame

*Session 42 (vendredi 2026-06-12, journée autonome — reprise SEMAINE PROCHAINE). Détail : memory `project_session42_done.md`. Dernier commit : af6e3d1.*

## 🧭 DIRECTION ACTÉE PAR LE USER (à relire avant toute décision produit)
1. **Qualité et cohérence avant expansion** — la région 6 (Bahamas) est GELÉE (dossier prêt dans `regions/_staging/`, ne pas lancer sans GO explicite).
2. **Photos réelles = la marque** (« c'est les photos qui plaisaient »). Jamais d'assets vidéo IA poor-quality. L'entre-deux choisi : **kit design multidimensionnel intégré** → `design/DESIGN-KIT.md` (doctrine, inventaire, phase 2, garde-fous) = SOURCE DE VÉRITÉ.
3. Le produit en une phrase (recadrage user du 12/06) : *« est-ce que ma plage est propre aujourd'hui — et demain ? »* Gratuit = carte ; Payant = veilleur (prévision 7j + brief matin + alertes). Tout chantier doit servir ces 3 lignes.

## 🟢 Shippé session 42
- **Audit « tout ce qui cloche »** (17 agents, 10 findings, 0 réfuté) — TOUT traité :
  - 🔴 RGPD : emails en clair dans les logs Actions publics → logId(hash8) partout + **510 logs de runs purgés** (vérifier les deletions via `gh api .../logs` → 404, PAS `gh run view` qui a un cache).
  - 🔴 Méthodo USD publiait les chiffres d'avril → branchée sur backtest-results.json quotidien (78 % réels).
  - Payment Links USD : essai 7j supprimé (6 liens recréés no-trial, vérité API), GP /es/ « Sargazo Guadalupe » + composite GP-first, hreflang reconstruits (47/47 asserts), fb-posts purgés.
- **Design (pivot user)** : étalonnage léger du héros (3 couches média) ; **brand-icons.cjs + BrandIcon** (14 icônes maison, fin des emojis OS sur landing/CTA/reliability/about/month) ; DESIGN-KIT.md. SW v62.
- **DepthFlow v2** : flotte 76 plages re-rendue haute fidélité (ssaa 1.5, crf 22/23, release 451 Mo). RAPPEL ARCHITECTURE : la scène WebGL est PRIORITAIRE sur le landing — les loops ne servent que les devices sans WebGL.
- **Audit hebdo étendu aux 3 domaines USD** (SITES 5 entrées, résolution GA4 property-id dynamique via Admin API, zéro secret en plus) — le prochain run Weekly UX/SEO inclura miami/puntacana/cancun.
- **Pages santé USD** (#19) + **GA4 quotidien dans la série KPI** (#27, premier point : MQ 303 sessions, GP 213 le 11/06) + parité webhook en CI (#38).
- **Film satellite (directive user 12/06 « site comme SpaceX »)** : section méthode des 5 domaines = vidéo réelle NASA/JPL **Sentinel-6** (mission Copernicus, domaine public, 16 s, 4,5 Mo, `public/videos/sentinel6.mp4`) en bande full-bleed → fil doré « son signal → traduit plage par plage » → MethodScene enrichie d'un écho radar teal + étiquette AFAI 0.42 sur le radeau détecté. Lazy (IO 200 px, pause hors champ, autoPlay muted), jamais chargée si reduced-motion/saveData/2G. Vérifié preview desktop+mobile. Alternatives sourcées (workflow 12 candidats) : reel KSC 4K (launch-to-orbit), reel Sentinel-6B nov 2025 (~5:30 océan), TRACERS SVS 30 s plan continu. SW v63.

## ⚠️ REPRISE (lundi ou +)
1. **Éval A/B pw_cta_order + pw_prelude** : le cron local lundi 09h35 ne tourne que si CE poste est allumé — sinon la lancer à la main (z-test, n≥100/bras, RECOMMEND-only, vérité Stripe pas payments_real). PREMIÈRE éval après 8 semaines — décision importante.
2. ~~Vérifier le train final du 12/06~~ ✅ FAIT le 12/06 18h : run 27417358227 success (52m40s), QA live 4/4 PASS — SW v62, méthodo USD 78 %, GP /es/ « Sargazo Guadalupe », hreflang es→/es/mapa-sargazo/. Reste optionnel : spot-check visuel icônes landing + clips v2 servis (taille fichiers hero-depthflow).
3. **Clarity J+3-7** : re-mesure post-fixes clics (baseline 11/06 : MQ 54 rage/746 dead, GP 347/2225). Si GP ne s'effondre pas → creuser encore.
4. **GSC GP** : ajouter le service account en propriétaire sur la propriété GP. User OK pour le faire via Chrome (12/06). Procédure : Claude ouvre via Chrome MCP la page GSC → propriété MQ → Paramètres → Utilisateurs (l'email du service account y est visible — la clé n'existe qu'en secret GH, pas en local) → puis même page côté GP → le **user clique « Ajouter un utilisateur »** (modification de permissions = action user, règle sécurité) → coller l'email, rôle Propriétaire. Débloque les requêtes GP dans l'audit.
5. **Phase 2 du kit design** (DESIGN-KIT.md §Phase 2) : icônes paywall (⚠ smoke EUR : ne toucher QUE les emojis), chips chat, harmonisation des deux ors.
6. Bahamas : dossier _staging complet (config+seo-content+resorts+LAUNCH-BAHAMAS.md). **GO conditionnel acté par le user le 12/06 : « on lancera la semaine pro si on a des ventes »** → lundi, vérifier les ventes USD (Stripe truth, pas funnel) AVANT de dérouler LAUNCH-BAHAMAS.md. Pas de vente USD = pas de lancement.

## ⚖️ Décisions user en attente
GO/NO-GO Bahamas · crédits Higgsfield (si humains/pub un jour — sinon ignorer) · Cloudflare token · GO publication FB briefs · share-promo USD · Apple Pay device réel · GSC GP (2 min, point 4).

## Garde-fous (mis à jour 12/06)
EUR/MQ-GP intouchables (smoke EUR : **rebuild MQ d'abord** — un dist région = 3 FAIL à tort) · seuils pipeline interdits · SW bump à chaque deploy code (prochain : v63) · grouper les pushes (chaque push remplace le train pending !) · JAMAIS `git add -A` (incident junk+secrets 12/06 — gitignore durci depuis) · jamais d'email en clair dans les logs (logId) · jamais un step fragile entre une donnée et son commit · jamais d'animation de fond dans le jeu · jamais d'emoji OS sur les surfaces de marque · photos réelles only · Chrome=user, Edge=automation FB.
