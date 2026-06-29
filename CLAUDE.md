# SARGAGAME — CLAUDE.md (APEX OPÉRATIONNEL)

> App de prévision sargasses **par plage**, **IA-PILOTÉE** (fondateur 100 % mobile/absent), hypercroissance **B2B + B2C 100 % self-serve, ZÉRO call**. Lis ce fichier en entier : il fait autorité sur tout autre `.md` en cas de conflit. Démarrage réel d'une session = ce bloc **ÉTAT + MANDAT + MONEY-PATH**, puis la **Session Startup**, puis la tête de `NEXT_SESSION.md`.

## ÉTAT + MANDAT + MONEY-PATH (autorité unique — 2026-06-29)

**Bloc maître.** Si un autre `.md` contredit ces lignes, celles-ci gagnent (le doc fautif → Index/ARCHIVÉS). Dit une fois, pas re-déduit ailleurs.

### Faits structurants (vérifiés contre le code déployé)

- **Monolithe** : `src/Sargasses_PROD.jsx`, ~13,4k lignes (jamais à la racine). Carte = **SVG primaire** (`WorldMapView`/`ArchipelView`) ; **Leaflet RETIRÉ comme carte primaire MAIS fallback `?nav=map` encore vivant** (Sargasses_PROD.jsx ~10875/11710 + détection `.leaflet-marker-icon` ~2150/4092/4103). Ne purge PAS les traces Leaflet sans casser ce fallback. `WorldMapView` = composant funnel vedette → **jamais de refacto sans screenshot de régression**.
- **Supabase = brique prod** (4e backend : static-bake / Apps Script legacy / SMTP / Mollie). Photos visiteurs (`src/supabasePhotos.js`, Edge Function `moderate`, `notify-photos.yml`). **Tout NOUVEL état serveur → Supabase, JAMAIS Apps Script.**
- **Régions LIVE payantes** : MQ + GP (EUR) · `florida` + `puntacana` + `rivieramaya` (USD). `rivieramaya` = id interne, domaine public = **sargassumcancun.com**. `barbados` = **PRÉPARÉ mais NON live** : `regions/barbados.json` a déjà des `stripeProducts` (placeholders) et `barbados` est dans `$KNOWN_REGIONS` de `stripe-webhook.php:111` → **résidus Stripe présents**. À câbler en **Mollie** ; au passage **purger les résidus Stripe** (placeholders + entrée KNOWN_REGIONS) pour rester cohérent avec « Stripe = run-off ».
- **MRR** : €79,84/mo (16 abos Stripe legacy = source de vérité) · pastDue 1 (dunning auto). Conversions pass/USD/Mollie → dashboard Mollie. ~246 leads emails (capturés au checkout, B2C non anonyme, relançable).

### Modèle de prix (source unique)

- **B2C pass one-time** : EUR 7,99 / 14,99 / 24,99 € · USD 5,99 / 11,99 / 19,99 $.
- **B2B annuel (paylinks Mollie)** : `brief_annual` = 290 € (LIVE) · `pro_annual` = **690 €** (décision panel 2026-06-29). L'entrée `pro_annual` périmée à 790 € a été **retirée** de `public/api/b2b-paylinks.json` (PR #211 + #212) → le step « Ensure B2B Mollie payment links » du pipeline **frappe un lien neuf à 690 €** au prochain run planifié (clé `MOLLIE_API_KEY`). En attendant, le CTA « payer l'année » se cache et retombe sur `/?pro=1` / `/pro/pricing/`. ⚠️ **Valider le lien 690 € par un vrai paiement test post-régénération.**
- **B2B mensuel récurrent (Pro 79 € / Brief 29 €) = câblé EN REPO (#210)** : `mol_b2b_plans()` dans `public/api/mollie-lib.php` porte les montants (in-repo, **PAS** dans `mollie-config.php`, **ZÉRO action fondateur**) ; `mollie.php` `create_subscription` les résout (allowlist) et `mol_b2b_grant_once()` émet le token Pro au paiement. Reste : l'exposition front complète (émission auto du token d'essai 30 j à la capture, cf. `NEXT_SESSION.md`). Les **abos récurrents B2C** restent legacy/Stripe-only (modèle B2C = pass-only).
- **Essai Pro** : 30 j sans carte, 100 % self-serve (confirmé).
- **Source unique pricing** = `scripts/automation/mollie-paylinks.cjs` (TIERS). Tout changement : éditer TIERS → grep les 4 `B2B_*.md` → **régénérer le lien** (`node scripts/automation/mollie-paylinks.cjs`, `--dry` pour preview ; tourne déjà dans `daily-copernicus.yml:190`). Le script **auto-répare** désormais (#212) : un lien dont le `value` diffère du TIERS est re-frappé automatiquement (plus besoin de supprimer l'entrée à la main ; un même montant reste idempotent/skippé).

### 💳 MONEY-PATH (la règle Stripe/Mollie/PayPal — dite ICI uniquement)

| Voie | Statut | Règle |
|---|---|---|
| **Mollie** (`mollie.php`, `mollie-lib.php`, `mollie-webhook.php`) | **CAISSE ACTIVE** partout (EUR MQ/GP + USD florida/puntacana/rivieramaya). Front activé par flag `PAY_PROVIDER='mollie'` (Sargasses_PROD.jsx) | Modif **ADDITIVE only** — ne casse JAMAIS le flux B2C. Montants non secrets → PHP en repo ; secrets → `*-config.php`. |
| **PayPal** (`paypal.php`, `paypal-webhook.php`) | secondaire vivant (flag `PAY_PROVIDER='paypal'`) | additif, mêmes règles que Mollie. |
| **Stripe** (`create-checkout.php`, `stripe-webhook.php`) | **LEGACY run-off, LECTURE SEULE** | Surveiller MRR uniquement. **Ne pas étendre, ZÉRO CTA dessus, liens USD désactivés.** (Seule occurrence de cette règle — ne pas la répéter ailleurs.) |

**⚠️ Configs secrètes** : en repo = `*-config.example.php` SEULEMENT (`mollie`/`paypal`/`stripe`). Les vrais `*-config.php` vivent sur FTP (gitignored, jamais écrasés au deploy). **Ne t'attends jamais à les voir localement** ; `php -l` passe sur les `.php` non-config. Ne lis ni ne commit JAMAIS un `*-config.php` réel.

**Check-list avant merge money-path** : (1) **additif only** ; (2) **`php -l`** sur chaque `.php` touché ; (3) **revue panel adverse** (outil Workflow, voir mandat) — tu ne testes pas l'API live en local ; (4) **paiement test = SEULEMENT pour un NOUVEAU mécanisme de charge.** Mollie est **déjà prouvé** (paiements test + un vrai client a payé) → une modif **additive d'un flux déjà validé NE nécessite PAS de re-test** (ne le redemande pas à chaque fois). Si un mécanisme vraiment neuf est introduit (ex. checkout hébergé récurrent), un coup d'œil au 1er paiement réel suffit = action fondateur (dashboard Mollie), tu prépares + signales ; (5) **L'argent ne touche JAMAIS le verdict** (encart Partenaire = `sponsored` ; verdict 100 % data ERDDAP). Si un paiement échoue : revert additif (le commit précédent reste déployable), ne « répare » pas à l'aveugle.

### MANDAT FONDATEUR — autonomie totale

Le projet tourne en autonomie via Claude Code. Le fondateur est **100 % mobile** : **fais TOUT toi-même, agis puis rends compte, ne demande JAMAIS direction / priorité / avis pricing / « ai-je accès à X ».** Décisions ambiguës (pricing, stratégie, produit, design, copy) → **panel d'agents adverses (outil Workflow)** qui tranche ; **tu suis LEUR verdict, pas l'humain.** Précédents : encart vs annuaire ; Pro 79 €/690 € + essai 30 j (panels 2026-06-29).

**Panel de rôles canonique** (pioche les lentilles PERTINENTES pour l'artefact — jamais les 25 à chaque fois ; toujours +1 critique adverse « avocat du diable »). Ne te limite PAS à UX/UI/copy : pour CE produit, les angles les plus à fort levier sont **data/forecast, trust, croissance, risque**.
- **Produit & expérience** : design produit (flows, friction, zéro cul-de-sac) · design visuel (univers Le Veilleur) · motion/interaction · accessibilité · mobile/PWA.
- **Data & fiabilité** : data/forecast-ML (AFAI, confiance, backtest) · data-engineer pipeline (ERDDAP, fraîcheur) · perf (LCP/INP, budget) · analytics/mesure (vérité du revenu, events).
- **Croissance & monétisation** : SEO/contenu (136+ pages, local, EN/ES) · CRO/funnel (paywall, A/B) · rétention/lifecycle/CRM (drip, win-back, push) · viralité/referral · pricing/économiste · deliverability email · B2B sales/partenariats.
- **Confiance & risque** : **gardien de l'honnêteté/neutralité (LE moat)** · RGPD/légal (PII, consentement, remboursements) · sécurité (chemin de l'argent, tokens, secrets).
- **Plateforme & exécution** : architecte logiciel · SRE/infra/coût (FTP, CDN, GH Actions) · paiements (Mollie/PayPal) · QA/release (le Gate de ship) · localisation i18n (FR/EN/ES).
- **Méta** : architecte de la connaissance (CLAUDE.md, docs) · veille concurrentielle · orchestrateur d'agents · opérateur/fondateur généraliste (priorisation hypercroissance).

**Tu fais SEUL (ne demande pas)** : tout le code du repo (app, scripts, workflows, pages `/pro/*`, widgets, espace pro) ; pricing & offres (panel si non-trivial, puis applique partout via la source unique) ; money-path Mollie/PayPal (additif, check-list ci-dessus) ; déploiement ; emails SMTP (HOLD/dry-run par défaut, puis câble ET envoie). Secrets déjà provisionnés en GH Actions (`MOLLIE_API_KEY`, `SMTP_PASS`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SUPABASE_SERVICE_KEY`/`SUPABASE_ACCESS_TOKEN`, `MODERATE_TOKEN`, `ONESIGNAL_API_KEY_*`, `SG_STATS_KEY_*`, `COPERNICUS_*` — non lisibles depuis ici, ne pas s'y fier en local).

**Merge → deploy → vérif** : crée une branche, ouvre une PR via github MCP, merge sur `main`. Push sur `main` déclenche `daily-copernicus.yml` (`event_name == 'push'` → build 5 régions + deploy FTP + health-check, plafond `timeout-minutes: 75`, AUCUNE étape fondateur). Vérif DONE : **run du workflow vert** (`mcp__github__actions_list/get`) **ET** `curl` sur l'URL de prod — jamais « live » sans l'avoir vu sur prod.

**SEULS vrais blocages (escalade, et SEULEMENT eux)** :
- **Apps Script** (`scripts/appscript/Code.js`) : toute modif ⇒ `clasp push` ⇒ ordinateur ⇒ fondateur mobile ⇒ **BLOQUÉ**. **Ne crée JAMAIS de nouvelle action `Code.js`.** Réutilise l'existant (ex. `POST {type:'email_signup', email, source, island}` → onglet `emails`, zéro push). Tout nouvel état serveur → **Supabase**. Dettes en attente (referral, funnel `sg_pass_cta`) → ne pas multiplier.
- **Creds tiers côté console** : sitemaps GSC + IDs GA4/Clarity US dans `regions/*.json` (goulot SEO ×10) ; paiement test réel du lien Pro 690 € après sa régénération (dashboard Mollie). = action fondateur. *(Les plans B2B récurrents ne sont PAS une action fondateur : montants en repo via `mol_b2b_plans`, #210.)*
- Compte/secret tiers neuf non auto-provisionnable ; action physique/légale ; dépense non autorisable.

**N'EST PAS un blocage (ne demande pas)** : pricing, copy, quelle feature, « puis-je toucher X », ordre des priorités, design. Tu tranches (seul ou panel) et tu livres.

**Pars-et-reviens (conteneur éphémère)** : **commit + push à chaque chunk**, `NEXT_SESSION.md` à jour en continu, jamais de travail non-poussé. `/loop` pour le check-in week-end. **Barre de DONE** : ≥1 PR mergée sur `main` (run workflow vert + vérifié `curl`) OU blocage `clasp`/creds documenté, + `NEXT_SESSION.md` à jour. Pas d'audit qui dort. Self-service DUR : **ZÉRO call** (jamais « appelez-moi / rendez-vous »).

---

## Gate de ship

> Aucun merge sur `main` touchant l'app ne saute cette séquence. Auto-deploy FTP au push : ce qui casse part en prod. Étape qui échoue = corriger, jamais contourner.

### Séquence exacte (copiable)

```bash
# 0. SYNTAXE par fichier modifié, avant build.
#    esbuild parse JSX/ESM/CJS ; le fallback `node --check` ne vaut QUE pour .cjs
#    (il casse sur .jsx/.mjs). esbuild --bundle=false ne résout PAS les imports
#    (exports nommés non vérifiés ici) — c'est le build (#1) qui les attrape.
for f in $(git diff --name-only --diff-filter=ACM | grep -E '\.(jsx?|mjs|cjs)$'); do \
  npx esbuild "$f" --bundle=false --log-level=error --outfile=/dev/null \
    || { echo "ESBUILD FAIL $f"; exit 1; }; done
for f in $(git diff --name-only --diff-filter=ACM | grep -E '\.php$'); do php -l "$f" || exit 1; done

# 1. BUILD prod réel = sync-version.cjs + build-sargassum-json.cjs
#    + automation/gen-b2b-partners.cjs + vite build + stamp-sw-hash.cjs
npm run build            # échoue ici = ne JAMAIS commit
node scripts/check-bundle-budget.cjs   # budget JS eager (cf. règle dédiée)

# 2. SERVIR le build prod (pas le dev server : son cache masque les régressions)
npx vite preview --port 4173 &   # garder le PID ; preview sert dist/

# 2.5 PRÉREQUIS browser (runner frais) : Playwright doit avoir Chromium.
node -e "require('playwright').chromium.executablePath()" >/dev/null \
  || npx playwright install chromium

# 3. SMOKE parcours comic sur le BUILD. ATTENTION : ux-smoke.mjs lance
#    chromium.launch() en ÉMULATION iPhone (390×844, UA Safari, deviceScaleFactor 2,
#    isMobile, hasTouch) — ce n'est PAS du WebKit réel : une régression Safari/iOS-only
#    peut passer. Le smoke n'appelle JAMAIS process.exit() (toujours exit 0) :
#    le gating se fait par grep sur sa sortie, sinon un `&&` valide à tort.
node scripts/ux-smoke.mjs | tee /tmp/smoke.log
grep -q 'ERRORS=\[\]' /tmp/smoke.log \
  && grep -q 'WHITE_OR_TRANSPARENT_BUTTONS=\[\]' /tmp/smoke.log \
  || { echo "SMOKE BLOQUÉ"; exit 1; }   # captures /tmp/j*.png

kill %1 2>/dev/null      # arrêter le preview
```

**Passe =** `npm run build` exit 0 ET `check-bundle-budget` exit 0 ET les deux tokens littéraux `ERRORS=[]` **et** `WHITE_OR_TRANSPARENT_BUTTONS=[]` présents dans la sortie smoke. Tout le reste = blocage. (Le smoke tronque `ERRORS` à 12 entrées — n'affecte pas le test `=[]`.)

### Règles dures

- **Couleurs jugées en `getComputedStyle`, jamais sur capture headless** (forced-colors/fonts système fuient → le PNG ment). Lire `getComputedStyle(el).backgroundColor`. Les `/tmp/j*.png` servent au layout/présence, pas au colorimètre.
- **`reduced-motion`** : toute anim doit dégrader proprement sous `prefers-reduced-motion`. ⚠️ NON couvert par `ux-smoke.mjs` (aucun `emulateMedia({reducedMotion})`) — vérif manuelle, ou câbler `p.emulateMedia({reducedMotion:'reduce'})` dans le smoke pour l'automatiser.
- **Budget = JS eager** : `check-bundle-budget.cjs` gzip le `<script type=module>` d'entrée + les `modulepreload` de `dist/index.html`, seuil `BUNDLE_BUDGET_KB` (défaut 210 Ko), exit 1 si dépassé. C'est le JS du chemin critique, **pas le CSS**. CI bloquant.
- **SW `CACHE_NAME` auto-dérivé — ne jamais le bumper à la main.** `public/sw.js` reste `sargasses-vNNN` (regex `sync-version.cjs`) ; `stamp-sw-hash.cjs` (postbuild, n'édite QUE `dist/sw.js`) y appose un hash de `src/` : code change → bump → reload PWA ; data-only → pas de bump → zéro reload intempestif. L'éditer à la main casse cette logique.
- **`WorldMapView`** (carte SVG, composant vedette du funnel, préchargée eager) : jamais de refacto sans screenshot de régression avant/après.
- **Money-path** : en plus de `php -l` (point 0) → revue agent adverse + 1 vrai paiement test post-deploy (cf. encadré 💳 MONEY-PATH).

### Anti-faux-positif

> Aucune trouvaille d'audit n'est actionnée tant qu'elle n'est pas reproduite sur le working tree. Pas de fix sur la foi d'un rapport.

```bash
rg -n "<symbole|chaîne exacte du finding>" src/ scripts/   # le finding existe-t-il VRAIMENT ?
node -e "require('./regions/index.cjs').assertAllRegionsValid()"   # invariant régions OK ?
```

Grep ne reproduit pas → faux positif, classé sans suite. Finding « vrai en théorie » mais build vert + smoke `ERRORS=[]` localement = non actionnable.

### Déjà-validé — ne pas re-auditer (sauf preuve grep d'une régression)

- Cascade SEO (génération pages plages, balisage)
- JSON-LD
- 0 texte `undefined`/`NaN` runtime
- `.htaccess` (compression brotli/deflate + cache immutable 1 an)
- CLS = 0 (squelette UI réel inline avant mount)

---

## Doctrine UX (app sargasses) — lire AVANT de toucher au front

> Lois d'exécution, pas des conseils. Applique sans demander ; tranche les écarts par agents adverses. Tout ce qui est NOMMÉ ci-dessous existe et a été vérifié — ouvre la cible avant de coder.

### Encart COMMANDES (exécutable en session fraîche, sans grep préalable)
- **Composants vedettes** (chemins réels) : app = `src/Sargasses_PROD.jsx` (PAS à la racine) · `src/WorldMapView.jsx` (vedette funnel) · `src/PremiumModal.jsx` (paywall lazy) · `src/PassOffer.jsx` (offre) · `src/ChasseHome.jsx`.
- **Data du verdict (le moat)** : source = `public/api/copernicus/sargassum.json` (composite ERDDAP-live + forecast). Logique = `scripts/lib/forecast.cjs` (persistance, half-life 5,0j) + `scripts/lib/confidence.cjs`. Le front lit ce JSON via la prop `sargData` propagée dans `Sargasses_PROD.jsx` → `LazyChasse`/fiches. « Data réelle tissée » = brancher `sargData`, jamais un placeholder.
- **`/fiabilite/` est GÉNÉRÉE** par `vite.config.js` (consomme `backtest-results.json`). Pour la modifier → édite `vite.config.js`, **jamais `dist/fiabilite/`** (écrasé au build).
- **Tokens couleur** : `public/a-propos/colors_and_type.css` (PAS à la racine ni dans `public/`).
- **Flags rollback** : lus en inline via regex sur `window.location.search` par feature (modèle `pwOnboard`, `Sargasses_PROD.jsx` ~L11148 : `/[?&]onboard=0/.test(q)`). Pas de helper central — copie ce pattern pour tout nouveau flag.
- **Vérif visuelle** : `npm run build` puis `npm run preview` ; screenshot via Playwright WebKit 390×844 (cf. `scripts/audit-capture.cjs` comme base) sur l'URL preview, jamais le dev-server. Juger les couleurs en **computed-styles** (`page.evaluate(getComputedStyle)`), JAMAIS sur capture headless.

### Le moat = l'honnêteté (non négociable)
- **« Mesuré au satellite, pas deviné. »** Phrase-mère. Le verdict dérive de la donnée ERDDAP-live, JAMAIS d'une intuition, moyenne marketing ou dire de partenaire. Donnée manquante → cadenas/incertitude affichée, **jamais** un chiffre inventé (« 0 fabrication », loi dure).
- **On publie notre taux d'erreur** : `/fiabilite/` (prédictions datées vs réalisé) est citée dans le **paywall** (`PremiumModal.jsx`) et les **emails B2B** (`drip-b2b-email.cjs`). Elle n'est PAS dans le drip B2C (`drip-email.cjs`) — si tu veux l'y mettre, c'est un ajout à faire, ne la présuppose pas.
- **L'argent ne touche JAMAIS le verdict.** Encart Partenaire = `sponsored`, B2B = `sponsored`, verdict 100 % data ERDDAP. Toute PR laissant un sponsor influencer une couleur/chiffre de verdict est rejetée d'office.
- **Claim fiabilité = forme hedgée OBLIGATOIRE**, jamais un « 100 % » nu. La formule shippée et autorisée (cf. `b2b-outreach.cjs:215`, `PassOffer.jsx:101`) : *« 100 % de nos prévisions "mer propre" vérifiées »* TOUJOURS accompagné de **(1) fenêtre datée, (2) N comparaisons, (3) "saison calme", (4) le ~76 % tous régimes confondus, (5) faible confiance sur les rares alertes**. Un « 100 % saison calme » détaché de ces 5 qualificatifs est INTERDIT.
- **Ground-Truth Snap** (`public/ground-truth.php`) existe mais **n'est PAS câblé dans l'UI** (zéro ref dans `src/*.jsx`). Actif dormant, pas une loi : si une session le branche, dire explicitement OÙ (quel composant, quel CTA) — sinon ne pas l'invoquer comme acquis.

### Verdict par plage — granularité = produit
- **Verdict PAR PLAGE**, jamais une moyenne d'île. Une île « rouge » avec une crique propre montre la crique propre — c'est la valeur que le concurrent (moyenne floue) ne donne pas.
- Promesse **toujours positive** : « devenez celui qui connaît la fin de l'histoire » — **jamais** « débloquez J+2-7 » (cadrage feature/négatif interdit). Toute copy front part de `docs/B2C_NARRATIVE.md` (ancre obligatoire), jamais d'une page blanche.

### Friction minimale
- **Molo géoloc figé à 100 %** (`molo_ladder` tranché : zéro prompt géoloc à froid ; MQ +201 % checkout-redirect, sig. 99 % — géoloc à la demande seulement via clic « Près de moi », `Sargasses_PROD.jsx` ~L12254/12279). Ne JAMAIS réintroduire un prompt de permission avant que l'utilisateur ait vu de la valeur.
- **Squelette UI réel inline AVANT mount** (`index.html` + `src/app-runtime.css` + template GP de `prepare-ftp.cjs`) : zéro flash blanc, zéro CLS. Verdict accessible en **1 écran**, sans scroll obligatoire.

### Jamais de cul-de-sac (toujours un plan B)
- Aucun écran ne se termine sur une impasse. Plage rouge → **« où aller plutôt »** (alternative la plus proche) + lien carte. Erreur réseau / data absente → message + action de retry, jamais un blanc. Paywall fermé → retour au verdict gratuit, pas au vide.
- **Tout ajout conversion DOIT avoir son flag rollback `?xxx=0`** (switch on/off, modèle `pwOnboard` ci-dessus ; liste maintenue dans le code). Pas de flag = pas de merge. ⚠️ `?preview_partner=<slug>` n'est PAS un flag rollback (c'est une valeur, `ChasseHome.jsx:350`) — ne pas le ranger dans cette catégorie.

### Accessibilité (plancher dur)
- Toute modale : **`role="dialog"`, fermeture par Échap, focus piégé + restauré** au close (patterns présents `PremiumModal`/`ArenaSplash`/`ComicDetail` — ne pas régresser).
- **`prefers-reduced-motion` = plancher** : toute animation (golden-hour, paper/ink saturé, transitions de scène) a son fallback statique. Pas de variante reduced-motion = livrable incomplet.
- Contraste suffisant sur ink/paper et thème pro sombre `#0a1620` ; cibles tap ≥44px ; jamais d'info portée par la couleur seule.

### Perf = revenu (budget CI bloquant)
- **Budget gzip eager ≤210 Ko** (`check-bundle-budget.cjs`, CI bloquant). Entry JS ~169 Ko gzip post-refonte — toute hausse se justifie ou se chunk. Chunks lazy hors first-paint (`PremiumModal`, scènes), bake SVG→PNG différé idle off-thread.
- **PWA mobile-first** : push OneSignal, nudge install, **crop standalone iOS** (`#root` en `top/right/bottom/left:0` SANS `width/height:100%` — détail dans §Architecture rapide, ne pas dupliquer ici). Tester l'UI réelle (build prod), jamais le seul dev-server.

### Barre du « waouh » avant de montrer/merger
- 4 tests, OUI partout sinon ce n'est pas done : (1) beau sans JS ; (2) data réelle tissée (`sargData` branché, pas de placeholder) ; (3) utile en 1 écran ; (4) convertit avec une promesse POSITIVE.
- **`WorldMapView`** : jamais de refacto sans screenshot de régression (protocole encart COMMANDES).
- Note : les 4 tests sont qualitatifs (jugement humain) ; le seul gate chiffré-bloquant est le budget gzip ≤210 Ko en CI.

---

## Doctrine UI / web-design + mobile-PWA — UNE seule boussole (« Le Veilleur »)

> Doctrine d'exécution visuelle. Applique sans demander ; tranche tout écart par panel d'agents adverses (jamais le fondateur). Ouvre la **cible** (fichiers ci-dessous) avant de coder, ne réinvente jamais.

**Univers.** « Le Veilleur » : BD/comic + golden-hour océan, paper/ink, mascotte qui regarde la mer. « Il regarde la mer, jamais vos clients. » Chaleureux, insider, **jamais corporate**. La direction **dark-navy / « Tidal Cartography » est MORTE** (abandonnée 19/06, `design-philosophy.md` archivé) — ne jamais la ressusciter, même « pour faire pro ».

**Valeurs source-de-vérité (verrouillées).**
- **Fonts** : **Anton** (display/titres) + **Bricolage Grotesque** (corps, `font-family` du `<html>`/`<body>` dans `index.html`). Pas d'autre famille sans panel.
- **Couleurs** : or **`#FFC72C`** (accent/CTA/mascotte) + ink sombre ; ancre cadre app/SW/standalone = **`#0d1117`**. Navy **`#0a1620`** = thème B2B (`/pro/*`, widget) — **l'unique** zone sombre tolérée.
- **Lanes de tokens (NE PAS mélanger)** : vars `--sg-*` **runtime in-app** = `src/Themes.css` (source) + `src/app-runtime.css` + `index.html`. Lane **paper/ink in-app** = classes `.lc-` (`src/ChasseHome.jsx`, `src/ComicDetail.jsx`, `src/PremiumModal.jsx`). Lane **SEO/landing UNIQUEMENT** = `SCENE_TOKENS`/golden-hour 4-phases, défini dans `src/Sargasses_PROD.jsx` mais réservé au rendu pages SEO — **ne jamais l'appliquer au runtime app**. `public/a-propos/colors_and_type.css` = tokens de la **seule** page trust standalone `/a-propos/` (PAS chargé par l'app).

**Carte des surfaces (ouvrir AVANT de coder).**
- `src/Sargasses_PROD.jsx` (~13,4k l., app + carte `WorldMapView`/`ArchipelView` + `SCENE_TOKENS` SEO + Header/cloche notif + flags `mapdetail`/`onboard`).
- `src/ChasseHome.jsx` (home comic, lane `.lc-`, **8 flags rollback** : `fc7 ladder badges alerts space h2snote streak7 partners`).
- `src/PremiumModal.jsx` (paywall lazy, flag `pwcomic`), `src/ComicDetail.jsx`.
- Protos : `design/arena-v2.html` (`/arena-v2.html` en prod) + `design/proto-paywall-comic.html` ; `design/STORY/` (01→10) = narration/motifs.

**Cohérence inter-surfaces (loi).** Même univers app ↔ widget B2B ↔ `/pro/*` ↔ emails. Tout email part de `brandHeader(...)` (`scripts/automation/lib/email-send.cjs:100`, en-tête golden-hour) — jamais un header maison. Toute nouvelle surface réutilise tokens `--sg-*` + fonts + mascotte.

**Mobile-first + PWA.**
- **Push = OneSignal** : cloche 🔔 Header → `onEnableNotif` → `requestPermission`.
- **Crop standalone iOS — NE PAS régresser.** Base `#root{position:fixed;inset:0}` (atteint le vrai bas en Safari) ; **override standalone** (`html.sg-standalone`) → `height:var(--sg-vh,100dvh)` ; `#sg-chin` = ancre fixe `#0d1117` bord bas. **Toute la mécanique + justifs vivent dans `index.html` l.116-122 + `src/app-runtime.css` — s'y référer, ne pas paraphraser.**
- **Squelette UI réel inline AVANT mount** : skeleton statique dans `index.html` (+ template GP de `prepare-ftp.cjs`) ; CSS app `src/app-runtime.css` importé en **statique, appliqué AVANT mount** (hors bundle JS) → zéro flash.
- **a11y plancher** : `role=dialog` + Échap + focus-trap sur modales ; `prefers-reduced-motion` respecté (animations golden-hour/comic = plancher, jamais imposées).

**Flags rollback (loi : pas de flag = pas de merge).** Tout ajout touchant conversion/UI DOIT avoir son kill-switch `?xxx=0` réversible. **Flags réellement câblés** (défaut ON) : `fc7 ladder badges alerts space h2snote streak7 partners` (`src/ChasseHome.jsx`), `pwcomic` (`src/PremiumModal.jsx:1412`), `mapdetail onboard` (`src/Sargasses_PROD.jsx`). Vérifier le câblage réel avant de citer un flag (la liste a déjà divergé une fois).

---

## Doctrine storytelling & copywriting

> **Source de vérité = `design/STORY/` (canon, 11 docs `00-README` → `10-ROLLOUT`).** Toute copy à enjeu part d'un doc, jamais d'une page blanche. Deux dérivés opérationnels : `docs/B2C_NARRATIVE.md` (transposition voyageur + accroches prêtes) et `scripts/automation/B2B_EMAIL_TEMPLATE.md` (copy B2B + 6 règles dures). En cas de divergence, `design/STORY/` tranche.
>
> **Surfaces** : onboarding (`ArenaOnboarding`/`PaidOnboarding`), paywall (`src/PremiumModal.jsx`), drip (`drip-email.cjs`), pages `/pro/*`, emails outreach, headlines SEO.

### Colonne vertébrale unique — 6 temps (B2B = B2C, mot pour mot)

Même séquence pour les deux audiences, on remplace juste « l'hôtelier pris en traître par sa plage » par « le voyageur pris en traître par ses vacances ». Le client est le héros, **Le Veilleur est le guide** — jamais l'inverse.

1. **Constat concret et personnel** — sa plage, sa date consultée. Jamais le pitch générique « les sargasses, ce fléau ». B2C : « Vous regardez Les Salines. Demain, le vent tourne. »
2. **Cadeau / preuve AVANT l'ask** — le verdict du jour, toujours gratuit, AVANT tout paywall. Alerte/premium ne se proposent qu'après **≥3 verdicts consommés** (gating réel `drip-email.cjs` L987 : `(record.daily_count||0) >= 3 && install_nudge_count < 3 && nudge_age >= 10j`, cap 3).
3. **Douleur en UNE phrase** — jamais la peur étalée : « personne n'aime découvrir les algues une fois la serviette posée. » Le sceptique décroche au matraquage.
4. **Renversement de statut** — on vend un statut social, pas un abonnement. B2B : « celui qui connaît la fin de l'histoire avant ses invités ». B2C : « le copain qui ne se trompe jamais de crique ».
5. **Honnêteté auditée = preuve** — « on publie nos erreurs sur `/fiabilite/` ». **Acquis dans le paywall** : `recordProof` affiche le % audité réel (`cleanReliabilityPct`, « Mesuré au satellite, pas deviné », `PremiumModal.jsx` L665). **À shipper (objectif, PAS encore en code)** : CTA texte « avant de payer, allez voir ce qu'on vaut vraiment » → lien `/fiabilite/` dans onboarding ET juste avant le paywall.
6. **Offre sans friction** — un seul CTA self-serve, prix tôt, zéro call.

**Signature marque** : FR « **il regarde la mer, jamais vos clients** » (B2B) / « on regarde la mer pour vous » (B2C) · EN « He watches the sea, never your guests » · ES « Mira el mar, nunca a tus clientes ».

### 6 règles dures copywriting (réf. `B2B_EMAIL_TEMPLATE.md`)

- **Preuve avant pitch · cadeau avant l'ask · prix tôt · un seul CTA self-serve · zéro survente · zéro call.** Corps email ≤ **280 mots**, une douleur = une phrase.
- **Claims hedgés (obligatoire)** : « **semble réglé sur** » + « **si c'est bien le cas** ». Le constat plage-par-plage est l'arme n°1 ; non hedgé et faux, il vexe et l'email s'effondre.
- **Cadeau ≠ injonction** : « si vous voulez le corriger vous-même », jamais « collez à la place ». On ne touche jamais à leur code.
- **Prix tôt + honnêteté chiffrée** : jamais le tarif après 600 mots. **INTERDIT : tout taux « 100 % » / « 100 % saison calme » nu.** Chiffre canonique = global tous-régimes **~76 %** (24h ; source `reliability.json`/`backtest-results.json`, valeurs front `{overall 77, calm 79, peak 76}` → bande affichée « 76 % à 79 % selon la saison » de `vite.config.js`). Citer le plancher, jamais le flatteur, et renvoyer vers `/fiabilite/`.
- **L'argent ne touche JAMAIS le verdict** : encart « Partenaire » = `sponsored`, le verdict reste 100 % data ERDDAP.
- **EN/ES** : traduire sans toucher la structure. Routes honnêteté **générées au build** (`scripts/lib/reliability-page.cjs`, pas en source) : `/fiabilite/` (FR/MQ-GP), `/reliability/` (EN), `/fiabilidad/` (ES) — ne pas chercher de page statique éditable.

### Copy à fort enjeu → panel d'agents (méthode imposée)

Pour paywall, onboarding, objets/corps d'email outreach, headline de page pro :
1. **Lancer le panel** (skill `sargasses` ou Task multi-agents) : **N frameworks en parallèle** — StoryBrand, BAB, PAS, réciprocité, preuve sociale, âme locale.
2. **Critiquer** par 2 personas sceptiques : voyageur méfiant des apps anxiogènes / hôtelier débordé qui décroche au matraquage.
3. **Synthèse** = livrable : 1 version retenue + justification persona, à coller dans la surface cible. On suit la synthèse du panel.

---

## Doctrine — Hypercroissance, B2B, B2C, scalabilité

> Défauts d'exécution : tu tranches et tu livres sans demander ; les écarts (pricing, copy, features, priorités) se règlent par panel d'agents adverses. La seule chose NON arbitrable → le bloc « seul vrai blocage » du mandat. Money-path / pricing / Stripe-legacy : voir le bloc maître, **ne pas re-répéter ici**.

### Règles de scale (opérables uniquement)
- **L'IA est l'opérateur**, pas un assistant : conçois, code, déploie, vends, mesure. Objectif = hypercroissance, **zéro humain dans la boucle**.
- **Marginal cost ≈ 0 → optimise le VOLUME** (clients/logos/pages/marchés), pas la marge unitaire.
- **Avant de bâtir, grep l'existant** — ~80 % est déjà là (verticalité complète : satellite → pipeline → app → widget → paywall → B2B → paiement → relance).
- **Un nouveau client/plage/marché = changer des DATA, pas écrire du code** : templates `{{placeholders}}`, pages token-gated `?k=`, params `?beach&name&partner`, SEO programmatique.
- **Tout ce qui se répète → script + step GH Actions (cron)**, jamais un geste manuel.
- **Idempotence + cap + dry-run/HOLD par défaut** : markers `*-sent.json`, dédup par id/pid, `git rebase -X theirs` sur les JSON générés. **gitignore la PII** (emails en clair jamais commités). ⚠️ **Piège** : l'idempotence se fait souvent sur la PRÉSENCE d'un id, pas sur sa VALEUR (cf. paylinks) — vérifie quel champ déclenche le skip avant de supposer qu'un re-run propage un changement.
- **Chemins réels** : tout le money-path est sous `public/api/` (`mollie.php`, `paypal.php`, `widget-token.php`, `b2b-trial.php`, `b2b-paylinks.json`). **N'édite JAMAIS `dist/`** (build généré, miroir). Scripts B2B/payeurs sous **`scripts/automation/`**.

### B2C (réf. `Sargasses_PROD.jsx`, `public/api/mollie.php`)
- **Pass one-time** (montants → bloc maître). Carte Components + Apple/Google Pay natif. Abo mensuel récurrent B2C = **pas encore live** (plans Mollie à créer = action fondateur, ne pas câbler avant).
- **Régions LIVE** : MQ + GP (EUR) · 3 domaines USD (`sargassummiami.com`→florida, `sargassumpuntacana.com`→puntacana, `sargassumcancun.com`→rivieramaya). Barbados préparé, NON câblé → câbler **en Mollie** + purger résidus Stripe.
- **Pas anonyme** : email **capturé au checkout** (`submitLead` → onglets `emails`/`payments` + Customer Mollie) ⇒ tout payeur/abandon est relançable.
- **Premium** = flag `localStorage` après `payment_status.paid`, récupéré cross-device via `sgVerifySub(email)`. Paywall (`WorldPaywall`/`ComicPaywall`, rollback `?pwcomic=0`) : promesse **positive**, jamais « débloquez J+2-7 ».

### B2B — self-serve, zéro call (réf. `B2B_OFFER.md`, `B2B_SCALE.md`, `/pro/espace/`)
- **Pricing arrêté (panel 2026-06-29)** : **Pro 79 €/mois ou 690 €/an** (2 mois offerts) · essai **30 j gratuit sans carte** · garantie 30 j. Brief 29 €/mo = decoy. USD : 89 $/mo · 790 $/an.
- **DEUX sources de prix B2B** (ne grep pas qu'une seule) :
  1. **Annuel** → `scripts/automation/mollie-paylinks.cjs` (`TIERS` : `brief_annual` 290, `pro_annual` 690 ; **EUR codé en dur**, pas d'USD).
  2. **Mensuel** → `mol_b2b_plans()` dans `public/api/mollie-lib.php` (plans `pro_monthly` 79 € / `brief_monthly` 29 €, **montants codés EN REPO**, pas en config gitignored ; résolus par `mollie.php` `create_subscription`, #210). Le 79 €/mo vit ICI, pas dans le cjs. (USD B2B = grille de référence 89/790 $, pas encore de lien.)
- **Changer un prix ANNUEL** : `mollie-paylinks.cjs` **auto-répare** (#212) — il re-frappe le lien quand le `value` stocké diffère du TIERS (un même montant reste idempotent/skippé). Puis grep les `B2B_*.md`. **État : l'entrée `pro_annual` 790 € a été retirée de `b2b-paylinks.json` (#211 + #212) → le lien 690 € est minté au prochain run planifié du pipeline ; valider par un vrai paiement test.**
- **Funnel 100 % self-serve** : email (template) → `/pro/espace/?beach&name&partner` → essai instantané (`/api/b2b-trial.php` émet le token Pro via `widget-token.php`/`sg_widget_sign`) → paiement Mollie.
- **Outreach AUTOMATISÉ** : `scripts/automation/b2b-cold-outreach.cjs` (ramp `CAP_NEW`, HOLD/dry-run). Payeurs : `fetch-payers.cjs` / `relance-payers.cjs`. Suivi : `send-b2b-followup.cjs` (outbox, HOLD). Encart Partenaire : `gen-b2b-partners.cjs` (gate `active:true`).
- **Goulot de scale = délivrabilité** de `alerte@sargasses-martinique.com` (partagé clients) → domaine d'envoi dédié + SPF/DKIM/DMARC + secret `B2B_FROM`.
- **Garde-fou DUR** : verdict reste **100 % data ERDDAP** ; encart Partenaire `sponsored` ne l'influence JAMAIS.

### Supabase = la voie pour tout nouvel état serveur
Tout **NOUVEL état serveur → Supabase** (REST HTTP, pilotable au mobile ; projet `https://rswdmjtdzrucqzzukfmd.supabase.co`, secret `SUPABASE_SERVICE_KEY` type `sb_secret_…`, pattern lecture/écriture dans `scripts/automation/notify-new-photos.cjs` : `GET/PATCH ${SUPABASE_URL}/rest/v1/<table>` avec `svcHeaders()`). **JAMAIS de nouvelle action Apps Script** (`Code.js` ⇒ `clasp push` ⇒ BLOQUÉ). Le reste (pricing, copy, features, design, priorités) n'est PAS un blocage : tu tranches et tu livres.

---

## Index des docs

> Carte « quel doc pour quoi », 1 ligne/doc. **Démarrage = `AUTONOMOUS_LOOP.md` puis tête de `NEXT_SESSION.md`.** Chemins relatifs racine repo. **Classification** : `.md` listé en table active = utilisable ; en **ARCHIVÉS** = périmé, ne pas l'utiliser comme source ; ni l'un ni l'autre = suspect → ne pas s'en servir comme autorité.

### Autonomie & exécution
| Doc | Rôle |
|---|---|
| `AUTONOMOUS_LOOP.md` | Prompt de relance + gate de ship + mécanique « pars-et-reviens ». Lu en premier pour reprendre la loop. |
| `CLAUDE.md` | Doctrine + état courant + gate + money-path. Surplombe tous les autres docs en cas de conflit. |

### Handoff & mémoire
| Doc | Rôle |
|---|---|
| `NEXT_SESSION.md` | Handoff. Tête = session courante. Tenir à jour à chaque chunk ; archiver les entrées > ~7 j. **Seul état qui survit côté agent web.** |
| `PLAN_7J.md` | Plan glissant 7 jours (priorités semaine). |
| _mémoire projet_ | MRR + snapshot funnel/décisions. ⚠️ Le dossier `~/.claude/.../memory/` n'existe que sur la machine du fondateur, **absent du container web** → lire MRR/funnel depuis `NEXT_SESSION.md`. |

### B2B (hôtels, self-serve, zéro call)
| Doc | Rôle |
|---|---|
| `scripts/automation/B2B_OFFER.md` | Offre + pricing arrêté + état câblage Mollie. |
| `scripts/automation/B2B_EMAIL_TEMPLATE.md` | Template outreach hôtels (storytelling, FR/EN/ES, placeholders). |
| `scripts/automation/B2B_SCALE.md` | Infra B2B automatisée (système & scale). |

### B2C & SEO
| Doc | Rôle |
|---|---|
| `docs/B2C_NARRATIVE.md` | Colonne vertébrale storytelling B2C (panel 2026-06-29). |
| `GROWTH-SEO-STRATEGY.md` | Stratégie SEO réseau 5 domaines (maillage, netlinking, clusters). |
| `US_SEO_DIAGNOSIS.md` | Diagnostic « 0 trafic US » + plan de correction. |

### Produit / UX
| Doc | Rôle |
|---|---|
| `PRODUCT.md` | North-star produit & design system « Le Veilleur ». |
| `SCREENS_V2.md` | Backlog reconstruction « ARENA v2 » ; prototype = `design/arena-v2.html`. |
| `UX_BUILD_BRIEF.md` | Source de vérité de la méga-loop UX/UI. |

### Archi / Ops
| Doc | Rôle |
|---|---|
| `docs/ARCHITECTURE.md` | Un codebase, 5 domaines : structure, build, déploiement FTP. |
| `docs/OPERATIONS.md` | Runbook ops + **noms** de secrets (jamais de valeurs ; repo public). |
| `docs/DATA-PIPELINE.md` | Pipeline v3.1 ERDDAP/forecast/confidence/score. |
| `docs/PERFORMANCE.md` | Métriques perf chargement, harnais de mesure, leviers. |
| `MOLLIE_MIGRATION.md` | Money-path → Mollie on-site (⚠️ Stripe pas mort : legacy lecture seule, cf. bloc maître). |
| `docs/visitor-photos-runbook.md` | Runbook feature photos visiteurs (backend Supabase). |
| `docs/competitor-sargazowatch.md` | Veille concurrent USD/Caraïbe (Sargazo Watch). |
| `scripts/automation/ANALYTICS-SETUP.md` | Setup credentials ingestion analytics unifiée. |

### Scale / nouvelle verticale
| Doc | Rôle |
|---|---|
| `NEW_VERTICAL_PLAYBOOK.md` | Ajouter une géo (1 domaine = 1 région = 1 dossier FTP). |
| `README.md` | Pitch produit + onboarding repo (public). ⚠️ Daté 18/06 — vérifier cohérence pass/Mollie/Stripe-legacy avant de le citer. |

### ⛔ ARCHIVÉS — périmés, contredits par CLAUDE.md
**Ne pas ouvrir, citer ni ré-auditer.** Format : `doc` → remplaçant.
- `AUTONOMOUS_BUILD.md`, `AGENT_WORKFLOW.md` → `AUTONOMOUS_LOOP.md`.
- `NIGHTLY_SWEEP.md`, `NIGHT_LOG.md` → (sans remplaçant).
- `NEXT-SESSION-PROMPT.md`, `docs/NEXT-SESSION-PROMPT.md`, `docs/HANDOFF-SCOPE.md` → `NEXT_SESSION.md`.
- `docs/SUPABASE-DECISION.md` → (décision tranchée).
- `design-philosophy.md` → `PRODUCT.md` / `UX_BUILD_BRIEF.md`.
- `sarg_seo_ia_local_prompt.md`, `ROUTINE-SEO-ANALYTICS.md` → `GROWTH-SEO-STRATEGY.md`.
- `REFERRAL_LOOP.md`, `NEXT_VENTURE.md` → (hors scope).
- `DEPLOY-GUIDE.md`, `DEPLOI-FTP.md` → `docs/OPERATIONS.md` + `docs/ARCHITECTURE.md`.
- `scripts/automation/B2B_OUTREACH_KIT.md` → `B2B_OFFER.md` + `B2B_EMAIL_TEMPLATE.md`.

---

## Session Startup

**Raccourci** : `npm run session` → `scripts/cursor-session-startup.cjs` (checks 1-3 + tente la mémoire `~/.claude`). Au lancement de chaque session, exécuter automatiquement (zéro confirmation). cwd reset entre appels bash → préfixer chaque commande par `cd /home/user/sargagame &&` (ou chemins absolus).

1. **Pipeline freshness** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const run=(Date.now()-new Date(d.updatedAt))/3.6e6;const sat=d.erddapTimestamp?(Date.now()-new Date(d.erddapTimestamp).getTime())/3.6e6:null;console.log('Source:',d.source,'| run:',run.toFixed(1)+'h',run<12?'OK':'STALE','| satellite:',sat?sat.toFixed(1)+'h':'n/a',(d.stale||(sat&&sat>=36))?'STALE':'OK')"
   ```
   > `run` = âge du dernier passage pipeline → **un re-run le corrige**. `satellite` = âge réel du composite ERDDAP (`erddapTimestamp`/flag `stale`, seuil 36 h) → si STALE, **ERDDAP est en retard, un re-run NE corrige PAS** (seule règle où re-run est inutile).

2. **Métriques business du jour** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const l=d[d.length-1];console.log('Last:',l.date,'| Payments:',l.payments,'| Emails:',l.emails,'| Feedbacks:',l.feedbacks)"
   ```

3. **MRR — source de vérité = Stripe** (legacy run-off, bloc `stripe` dans daily-metrics) :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const s=[...d].reverse().find(x=>x.stripe&&x.stripe.active!=null).stripe;console.log('MRR Stripe: €'+s.mrr.eur+' |',s.active,'actifs | pastDue',s.pastDue,'| cancelScheduled',s.cancelScheduled)"
   ```
   ⚠️ **Revenu = Stripe (legacy) + Mollie (dashboard Mollie), JAMAIS le funnel** : `payments_real`/`revenue_real` Apps Script sous-comptent ~7×. Le funnel ne sert qu'aux **taux d'engagement** (modal→CTA, CTA→redirect) — commande funnel : skill `sargasses`.

4. **Workflows récents** : `gh run list --repo aveca/sargagame --limit 5`. ⚠️ **`gh` absent du container** → fallback : `mcp__github__actions_list` sur `aveca/sargagame`.

5. **Mémoire projet** — **`NEXT_SESSION.md` (repo) est le seul état qui survit côté agent web** ; append-on-top, lire l'entrée en tête. (L'état courant de CE fichier fait autorité si un doc le contredit.) Les fichiers `~/.claude/projects/.../memory/*.md` lus par `cursor-session-startup.cjs` n'existent QUE sur la machine du fondateur (le script reporte `0/4` sans crasher) → MRR/funnel snapshot depuis `NEXT_SESSION.md`.

6. **Auto-trigger si pipeline STALE** (`run` > 12 h ; inutile si c'est `satellite` qui est STALE) :
   ```bash
   gh workflow run daily-copernicus.yml --repo aveca/sargagame --ref main
   ```
   ⚠️ `gh` absent → fallback : `mcp__github__actions_run_trigger` (workflow `daily-copernicus.yml`, ref `main`).

7. **Reporter l'état en 5 lignes max**, puis enchaîner (autonome) ou attendre instructions. Présence fondateur = prompt interactif en cours ; en `/loop`/cron, supposer absent et travailler en autonomie.

---

## Règles de déploiement

- **Aucune fenêtre de gel** — déploiement autorisé à tout moment, week-end inclus (l'automation tourne sans le fondateur). Ancienne règle « ven 18 h → sam 19 h » **retirée le 2026-06-28**.
- **Livrer = merger sur `main`** → `daily-copernicus.yml` full build + deploy FTP auto quand `github.event_name == 'push'`. Aucune étape fondateur, aucun `railway up` (repo full-static). Le PHP de `public/api/` part par FTP ; les `*-config.php` serveur (secrets) sont **gitignored, jamais écrasés**.
- **Pousser/PR via github MCP** (`gh` absent) : si sur `main`, brancher d'abord (`mcp__github__create_branch`), puis `mcp__github__create_pull_request` + `mcp__github__merge_pull_request`. Remote = `aveca/sargagame`.
- **Vérifier le déploiement par `curl`** sur l'URL de prod après merge (plafond `timeout-minutes: 75`, durée typique plus courte). Ne jamais déclarer « live » sans l'avoir vu sur prod.
- **Ne pas créer de crons Claude dupliqués** — un besoin récurrent = un step dans un workflow existant. Inventaire réel : `ls .github/workflows/` (21 fichiers ; il n'existe PAS de `content-generation.yml`).
- **Concurrency guard + `git rebase -X theirs`** sur les workflows qui écrivent des JSON générés (`daily-copernicus`, `weekly-optimize`, `weekly-seo-automation`, etc. — cf. `grep -l "concurrency:" .github/workflows/*.yml`).
- **Collision deux-sessions** : `git add` **ciblé** sur tes fichiers, **jamais `git add -A`** (sessions concurrentes touchent des JSON générés).

---

## Architecture rapide

> Vue d'ensemble actionnable. Détail complet → `docs/ARCHITECTURE.md` ; pipeline → `docs/DATA-PIPELINE.md` ; perf → `docs/PERFORMANCE.md` ; ops/secrets → `docs/OPERATIONS.md`.

- **App (monolithe)** : `src/Sargasses_PROD.jsx` — **~13 400 lignes**, React. Carte = **SVG** (`WorldMapView`/`ArchipelView`) ; Leaflet retiré comme carte primaire (fallback `?nav=map` vivant — cf. bloc maître). `WorldMapView` = carte du first paint, préchargée eager → tout changement pèse sur le budget JS critique.
- **Paywall lazy** : chunk → `src/PremiumModal.jsx` (`PremiumModal` + variantes World/Comic/B2B). Deps via **exports nommés** de `Sargasses_PROD`, chargé en `lazyWithRetry`. CSS app sorti du bundle JS → `src/app-runtime.css` (import statique, appliqué **AVANT** mount). Scènes hors first-paint en lazy. **Note sargasses (`BeachReport`)** sur la preview comic = passée en prop `ReportComp` (anti-import-circulaire).
- **Budget perf** : `check-bundle-budget.cjs` (CI bloquant) mesure le **JS eager gzip** au premier paint (entry + modulepreload), seuil **≤210 Ko** (réel ~193 : entry 168 + WorldMapView 15 + preact 9). Échoue si un chunk lazy redevient eager.
- **Build + deploy (canonique, par région)** : `VITE_REGION=florida npm run martinique` — `npm run build` = `sync-version.cjs` → `build-sargassum-json.cjs` → `gen-b2b-partners.cjs` → `vite build` → `stamp-sw-hash.cjs` ; puis `prepare-ftp.cjs`. `martinique`/`guadeloupe` = défauts EUR. **136+ pages plages SEO** générées par `vite.config.js`. Build région isolé par `VITE_REGION` (anti-cannibalisation, défaut `mq`).
- **Moteur régions** : `regions/<id>.json` (seul fichier requis), validé par `regions/index.cjs` (fail-fast `island===id`, bbox, `beachFilter.island===id`). **Valider une édition** : `node -e "require('./regions/index.cjs').assertAllRegionsValid()"` — PAS `loadAll()` (qui ISOLE les régions non-core en warn et renvoie exit 0 sur fichier cassé → fausse confiance). 6 régions, `regions/` = source unique.
- **Pipeline v3 (données)** : `scripts/fetch-sargassum-live.cjs` + `scripts/lib/forecast.cjs` + `scripts/lib/confidence.cjs` (persistance exponentielle, **half-life 5,0 j** — backtest 3,5/4/5/6 ≈ 75 % identique, valeur libre, on garde 5,0). Source = ERDDAP-live, 4×/j. Sortie = `public/api/copernicus/sargassum.json` — champs load-bearing : `source`, `updatedAt`, `erddapTimestamp`, `stale`, `dataAgeMinutes` (parsés par le hook startup). Ne pas changer le schéma sans lire `docs/DATA-PIPELINE.md`.
- **FTP deploy** : `scripts/prepare-ftp.cjs` → `*-ftp/` (dir par `region.ftpDir`) → `scripts/manual-ftp-deploy.cjs` (FTPS fragmenté). Repo **full-static**, aucun Railway. Auto-deploy au merge sur `main`.
- **Money-path PHP** (`public/api/`, déployé via FTP) : `mollie*.php` = caisse on-site Mollie (`mollie.php` création, `mollie-webhook.php` statut paid, `mollie-lib.php` partagé, `mollie-config.php` secrets **gitignored** + template `mollie-config.example.php`). `widget-token.php` = token PRO HMAC widget hôtel (`sg_widget_sign`) ; `b2b-trial.php` = token essai Pro 30 j self-serve. **Règles Mollie actif / Stripe legacy → bloc 💳 MONEY-PATH.**
- **Crop standalone iOS** : `#root{position:fixed;inset:0}` SANS `width/height:100%` ; override `html.sg-standalone` → `height:var(--sg-vh,100dvh)` ; `#sg-chin` ancre `#0d1117`. Mécanique dans `index.html` l.116-122 + `src/app-runtime.css`. **Cloche notif** 🔔 Header (`onEnableNotif`→`requestPermission`).
- **Supabase (photos visiteurs)** : `src/supabasePhotos.js` (REST + Storage, clé anon RLS) + `src/BeachPhotos.jsx` ; Edge Function `moderate` + `notify-photos.yml`, modération 1-tap par email (secrets `SUPABASE_SERVICE_KEY` / `MODERATE_TOKEN`). **Tout NOUVEL état serveur → Supabase, jamais Apps Script.** (Les **webcams live** YouTube par plage ont été **retirées le 2026-06-29** — verdict panel adverse : risque moat « EN DIRECT » sur flux mort + supply insourçable ; la « preuve du présent » repose désormais 100 % sur les photos visiteurs.)
- **SW** : `CACHE_NAME` **auto-dérivé** (`sync-version.cjs` prebuild + `stamp-sw-hash.cjs` postbuild) — ne JAMAIS le bumper à la main ; bumper `release-notes.json` bump SW + `version.json` ensemble.
- **Domains** : sargasses-martinique.com, sargasses-guadeloupe.com (EUR) · sargassumcancun.com (= région interne `rivieramaya`) + Floride + Punta Cana (USD).
- **Trust page** : `/a-propos/` (standalone HTML + `public/a-propos/colors_and_type.css`). **Repo** : aveca/sargagame (public, minutes illimitées GH Actions).

---

## État business (2026-06-29)

> Faits volatils. Les règles durables (modèle, money-path, pricing) vivent dans le **bloc maître** — ici uniquement le snapshot.

- **Modèle** : B2C **pass one-time** (live EUR MQ/GP + USD florida/puntacana/rivieramaya). **B2B mensuel récurrent câblé en repo** (#210, `mol_b2b_plans` 79/29 €) ; **abos récurrents B2C = legacy/Stripe-only, plus vendus** (modèle B2C = pass-only). Caisse = **Mollie on-site** (Components + Apple/Google Pay) ; **Stripe = legacy lecture seule** ; **PayPal** = secondaire vivant.
- **GO-LIVE** : EUR 25/06 · USD 26/06 (validé par un vrai paiement $5.99). Barbados = préparé, non câblé (résidus Stripe à purger).
- **MRR** : €79,84/mo (16 abos Stripe legacy = source de vérité) · pastDue 1 (dunning auto `--send`). Conversions pass/Mollie → dashboard Mollie. **~246 leads emails** ; nudge install PWA + alertes greffé sous le verdict (`drip-email.cjs`, gating ≥3 verdicts, cap 3, ≥10 j).
- **B2B** : Pro 79 €/mo ou 690 €/an (panel 2026-06-29), essai 30 j sans carte. Mensuel récurrent câblé en repo (#210, `mol_b2b_plans`). **Paylink annuel : entrée 790 € retirée (#211+#212), lien 690 € minté au prochain run pipeline — valider par un vrai paiement test.**
- **⚠️ Funnel NON fiable jusqu'à ~23/07** (fenêtre 28 j mélange l'ancien design abo) ; `Code.js` compte `sg_pass_cta` mais nécessite `clasp push` (action fondateur). Revenu = Stripe/Mollie, jamais le funnel.
- **A/B tests live** : `pw_cta_order`, `pw_prelude`, `ab_fiche_dive`, `home_az`, `map_world`. **`molo_ladder` TRANCHÉ → molo figé 100 %** (zéro géoloc à froid ; MQ +201 % checkout-redirect, sig. 99 %). `dock_glass` RETIRÉ (avec la BottomNav). Réévaluer le reste sur données POST-refonte.
- **Boucles d'alerte auto** : `revenue-watch` (mouvements Stripe) + `ux-watch` (criticals rage/dead-clicks) → email fondateur, dans daily-copernicus. **Pipeline** : ERDDAP-live, 4×/j, stable.
- **Détail session courante → `NEXT_SESSION.md` (entrée en tête).** Opérations détaillées (deploy manuel, A/B eval, backtest, stats) → skill `sargasses`.