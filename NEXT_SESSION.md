# NEXT_SESSION — sargagame

*Session 40 (nuit+matin 2026-06-10→11). Détail complet : memory `project_session40_done.md` + task list (38 tâches). Dernier commit local : 275d1fe.*

## 🔴 Incident CI traité (à connaître)
ffmpeg n'a jamais existé sur ubuntu-latest → 18 runs en boucle (retry-on-failure non gaté re-dispatchait à l'infini) → prod gelée 3h30 + **drips dupliqués ~17×/~8× à 2 abonnées** (état email commité en fin de run seulement). Fixes : apt install + continue-on-error, retry schedule-only, **commit des états email immédiatement après envoi**, excuses automatisées (`incidents.json` + `incident-apology.cjs`, fenêtre 10-20 UTC → parties au cron 12:00). Vérifier dans le commit « chore: email state » de ~12h que les 2 hashes sont marqués `sent`.

## 🟢 Shippé session 40 (5 pushes verts + 5 commits locaux en attente de push)
- **Landing scrollable SpaceX** : hero 100svh vidéo → verdict top-3 cards → méthode → premium → footer ; sticky bar ; reveals IO ; chevron. « À propos » retiré du paywall.
- **2 clips SVG sur mesure** (MethodScene satellite/bateau/ramasseur + AlertScene 06:00/⚠️/itinéraire qui bascule) + **scène WebGL** hero (eau qui ondule + parallaxe pointeur, natif-résolution).
- **10 fixes fluidité** (audit 4 agents : « entrées animées, sorties = démontages bruts ») : hero exit fondu, sheet-exit symétrique, Toute-l'île/FAB décollisionnés, shine GPU (CLS 0,065→0,02), z-index fiche.
- **Clics : 56/56 PASS** sur les 5 domaines (le « bug » user = prod gelée pré-deploy).
- **Coach chat sur /jeu/** (3 langues, donnée TODAY live) + **🔔 click-triggered** fiche plage (leads beach_alert → email verdict quotidien).
- **Checkout USD** (audit live + teardown Starlink) : mandat Stripe nommé (était « PAY »), country par région (était Martinique), **Mensuel par défaut USD**, prelude véridique, wordmark écran paiement. EUR byte-intact (smokes). Wallets : déjà ACTIFS depuis 06-10 — vérifier sur device réel (#14).
- **5 photos FL re-sourcées** (licences propres, crédits) + **/about/ EN-ES** sur USD (+ fix href chat qui 404ait sur USD).
- Loops vidéo **double résolution** (1080² + 1920×1080 desktop, manifest v2).

## ⚠️ REPRISE IMMÉDIATE
1. **Si pas encore fait : push des commits locaux** (026dad7→275d1fe) après le vert du run consolidé, puis vérifier live : sw v54+, manifest v2 wide, landing+scènes dans le bundle, /about/ sur les 3 USD (et absent de MQ/GP).
2. **Réconciliation Stripe** (reporté d'hier, J+1 = aujourd'hui) : vrai MRR via clé locale (`scripts/audit-stripe-duplicates.cjs` a le pattern d'auth) + tâche #28 (funnel payments_real menteur).
3. **Excuses 12:00 UTC** : vérifier l'envoi (2 hashes sent dans incidents.json commité par le CI).
4. **Plafond Resend** (#37) : daily_verdict + beach_alert grossissent vers les ~100/jour du plan free — surveiller les erreurs d'envoi.

## ⚖️ 6 décisions user en attente (tasks #15-16, 24, 31-32, 34)
Cloudflare (token API → `cloudflare-provision.cjs` existe déjà !) · Share-promo coupon USD · Veo 3.1 (compte) · ESA BIC Sud (SASU) · Publication FB (GO) · Promesse fairness.

## 📋 Backlog priorisé (task list, autonome)
#36 scène SVG « 7 jours » paywall USD (post-éval A/B) → #22 épuré carte (18-21 → ~10 éléments) → #17-20 hubs SEO (Fiabilité/côtes/santé/mois) → #26-27 KPI jeu+GA4 série → #38 webhook régions hardcodées (AVANT région 6) → #29 drip EN/ES → #21 pages EN → #25 région suivante (MX/DR) → #23 scène 3D three.js → #30 re-engagement → #35 DepthFlow (évaluer).
Différés post-éval A/B pw_* : réordonnancement preuve modal, titre nominatif plage, guarantee-as-feature.

## Garde-fous inchangés
EUR/MQ-GP intouchables (Payment Links, A/B pw_*, trial copy byte-identique — smoke à chaque touche de Sargasses_PROD.jsx) · seuils pipeline interdits · SW bump à chaque deploy code (prochain : v55) · grouper les pushes (1 run CI = ~50-70 min avec les loops ×2) · jamais de step CI nouveau sans preuve EN CI · état email commité immédiatement · rôles navigateurs : Chrome=user, Edge=automation FB.
