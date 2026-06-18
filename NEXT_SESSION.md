# NEXT_SESSION — sargagame

> **Reprise 2026-06-17 (soir).** Pivot MONÉTISATION shippé : modèle « paie à l'usage » (passes one-time) + 4 segments + lane jeune. On ATTEND la data clients. **La reprise = LIRE les 2 signaux, pas coder.**

> **18/06 (mesure ROI email — « B » : on ne savait PAS ce que l'email rapporte).** Découvert : opens/clicks Resend **jetés** dans les logs CI, **zéro** lien clic→paiement. Câblé une mesure 100% additive (zéro coût, pas de Resend payant) : (1) engagement (opens/clicks/bounces) désormais **persisté en série** dans `daily-metrics.json` (champ `email`) par `daily-stats-check.cjs` ; (2) revenu **attribué par `metadata.source`** (bucket des abonnés Stripe → `stripe.emailAttributed` + `stripe.bySource`) — le front pose déjà `source=deeplink_email` sur les clics mail (`?paywall=1&utm_source=email`) → `create-checkout.php`. (3) **Migration on-site terminée** : 3 CTA stragglers (J3-FR + J7/J14 EN/ES) basculés de `buy.stripe.com` → `sitePaywall()` (`?paywall=1`) pour que **100 %** des ventes email portent une source (hrefs validés HTTP 200). Lecture : **`node scripts/automation/email-roi.cjs`**. État : attribution = **0 (attendu)** — les 15 abonnés actuels sont pré-on-site sans source (`bySource."(none)"` = €74,85). ⏳ **Re-lire dans ~2-4 sem.** : si €attribué ≥ 20/mo → l'email se paie, scaler justifié ; sinon ne pas payer Resend. NB : `openRate` stocké brut = **événements** Resend (ouvertures répétées → peut dépasser 100 %), le **delta de clics** est le vrai signal. Code mort laissé : `stripeLink`/`STRIPE_BASE` (off-site retiré du drip) — nettoyage futur. cf. [[syst-me-email-complet]].

> **Nuit 18/06 (side-quest social — ne change PAS la reprise ci-dessous).** 1er post « news-jacking honnêteté » shippé : carte golden-hour « une photo ne se vérifie pas, un bilan si » + fiabilité **Vauclin 77 %** (track-record, arrivées = point faible assumé) publiée dans le groupe **SOS Sargasses Martinique** (réaction au post Préfecture/GIP « filets Château Paille »). Passée une review adversariale 3-lentilles (corrigé un cherry-picking 77%↔arrivage). Nouvel outil réutilisable **`scripts/automation/fb-post-card.cjs`** (image+légende → groupe FB, dry-run défaut, garde-fou légende, UI FB en **anglais** → bouton « Post »). Déployé `58e8806b` (deploy OK). `design/proto-plage-plongee.html` (fiche-dive parkée) laissé **NON-committé** — sign-off requis. cf. [[reference_fb_publisher]].

## 📊 LES 2 SIGNAUX À LIRE EN PREMIER
1. **Passes — quel segment achète, à quel prix ?** Events `sg_pass_seg {segment,stage,cents}` + `sg_conversion {plan:pNN}` (sheet Apps Script / `?action=funnel`). Segments : voyageur / planificateur / habitué / découverte. Prix A/B `pass_price` (14,99 / 19,99 / 24,99). → si **voyageur** convertit, concentrer le SEO « sargasses + mois » dessus ; arrêter de pousser les passes au local.
2. **B2B — un hôtel mord ?** Pages `/pro/` + lead-magnet brief gratuit (thread session parallèle).
> Le 1er qui parle = là qu'on met l'énergie. Ne PAS réinvestir de dev dans les passes avant un signal de vente.

## ✅ SHIPPÉ CETTE SESSION (tout live, derrière flags, réversible)
- **Passes one-time** (essai 7j retiré partout, prélèvement direct) : catalogue Stripe EUR MQ+GP (p7 7,99/9,99 · p30 14,99/19,99/24,99), handler `?pass=pNN` (accès N j, vérifié 30j), storefront PRO golden-hour dans le paywall (`pw_pass` 50/50), **4 segments** (message + mesure). Détail → [[reference_ab_tests]].
- **On-site one-time** : backend `pay_once` (PaymentIntent) + front câblé **derrière `pw_pass_onsite` OFF** (`?passonsite=1` pour tester). ⚠️ JAMAIS vérifié en paiement réel → tester une vraie carte (Pass 7j 7,99 € puis refund Stripe) AVANT de flipper. Le **redirect encaisse déjà** = défaut.
- **Lane jeune** : créature jeu à visage + A/B `sg_sprite` (anime/pixel) + panic face ; mascotte « Le Sarga » sur share-cards (happy/panic/magic) ; assets animés carte↔plage + transition `nav_dive` (15%). Assets : `design/transition-carte-plage.html`, `design/assets-anim-carte-plage.html`.
- **Paywall honnêteté** : tué un « 80 % justes » HARDCODÉ + hot-intent élargi (`rel_hot_cta`, `beach_dive_footer`).

## ⚠️ COLLISION SESSION PARALLÈLE
Une 2e session Claude bosse le MÊME repo (B2B `/pro/`, KPI checkout). Working tree a/avait du NON-committé à elle (`create-checkout.php`, `version.json`, `b2b-hotels-en.html`). **NE PAS `git reset --hard` / `git clean` / « discard all ».** Toujours committer en **pathspec explicite** (`git commit -- <paths>`).

## ▶️ REPRISE REFONTE (thread parallèle, toujours valide)
1. Tableau de bord `design/REFONTE-MASTER.md` (§5 backlog cochable) + `design/REFONTE-EXECUTION.md`.
2. Non cochées (§5) : façade `flyTo()` (PHASE 1) · flyTo(région,FAR) /carte + clean-list/conditions + revalidation live /conditions (PHASE 2) · slug canonique resolver (PHASE 0) · fraîcheur /fiabilite + désambiguïsation /saison-* (PHASE 3, mesurer GSC avant 301).
- Live prod (SW v202+) : `home_az`, `map_world`, `pw_beach_dive` (+ parité H2S), `/previsions/` (`prev_az`), `/plages-sans-sargasses/` (`clean_list`), `/alertes/`, stations, à-propos, conditions, 136 fiches SEO — A/B 50/50.

## Garde-fous
EUR/MQ-GP smoke d'abord · `stripe-config.php` jamais committé · SW bump par deploy · **jamais `git add -A`** (session parallèle) · Shabbat ven 18h→sam 19h no-deploy.
