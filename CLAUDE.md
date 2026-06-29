# SARGAGAME — REGLES CLAUDE

## Autonomie — MANDAT FONDATEUR (lire EN PREMIER)

**Le projet tourne en autonomie via Claude Code.** Le fondateur est **100 % mobile** et veut que tu **fasses TOUT toi-même**. Ne lui demande PAS de direction, de priorité, d'avis sur le pricing, ni « est-ce que j'ai accès à X » — **tu as accès, décide et agis**. Fais tout, et **n'escalade QUE sur un vrai blocage externe** (liste plus bas) — jamais pour un choix que tu peux trancher. Réflexe par défaut : agir, puis rendre compte (pas demander la permission).

**Décisions ambiguës (pricing, stratégie, produit, design, copy) → panel d'agents adverses** (outil Workflow) qui débattent et tranchent ; tu suis LEUR verdict, pas l'humain. Utilise autant d'agents que nécessaire. Précédents : encart vs annuaire et pricing Pro 79€/690€ + essai 21j (panels du 2026-06-29).

**Ce que tu PEUX faire/modifier seul (NE PAS demander)** :
- Tout le code du repo (app React, scripts, workflows, pages `/pro/*`, widgets, espace pro).
- **Pricing & offres** : décide (panel si non-trivial) et applique partout (`mollie-paylinks.cjs`, pages pro, `B2B_OFFER.md`, `/pro/espace/`).
- **Chemin de l'argent (PHP `mollie.php` / `paypal.php` / `create-checkout.php`)** : les SECRETS (`api_key`, `webhook_secret`) sont dans les `*-config.php` **gitignored, DÉJÀ déployés sur le serveur FTP** — tu ne les lis pas, mais ton code en repo les référence au runtime. Les valeurs NON secrètes (montants de plans, intervalles, allowlists) se mettent **dans le PHP en repo**. Ex. : ajouter un plan d'abo = injecter son montant dans `$cfg['subscription']` au runtime (cf. la structure de `mollie-config.example.php`). Ajoute/modifie la logique de paiement toi-même, **ADDITIVEMENT** (ne casse jamais le flux B2C existant), en calquant un flux éprouvé. Tu ne peux pas tester l'API Mollie live en local → **revue par agent adverse avant merge** + un vrai paiement test valide après deploy.
- **Déploiement** : merge sur `main` → build + deploy FTP auto (`daily-copernicus`). AUCUNE étape fondateur. Le PHP de `public/api/` part par FTP ; les `*-config.php` du serveur ne sont jamais écrasés (gitignored).
- **Emails** : SMTP (`SMTP_PASS`, secret GH Actions) via les scripts du daily workflow / outbox. Envois sortants à de vrais prospects : garde une discipline HOLD/dry-run le temps de valider le copy, mais tu câbles ET tu envoies.
- **Secrets déjà provisionnés** (GH Actions, utilisables par tes scripts) : `MOLLIE_API_KEY`, `SMTP_PASS`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SUPABASE_SERVICE_KEY`/`SUPABASE_ACCESS_TOKEN`, `MODERATE_TOKEN`, `ONESIGNAL_API_KEY_*`, `SG_STATS_KEY_*`, `COPERNICUS_*`.

**⚠️ Les SEULS vrais blocages (à escalader, et seulement ceux-là)** :
- **Apps Script (`scripts/appscript/Code.js`)** : toute modif ⇒ `clasp push` ⇒ un ORDINATEUR ⇒ fondateur mobile ⇒ **BLOQUÉ**. Donc **ne crée JAMAIS de nouvelle action Code.js**. Réutilise les actions EXISTANTES (ex. `POST {type:'email_signup', email, source, island}` sur l'URL `exec` → ajoute à l'onglet `emails`, zéro push). Pour tout NOUVEL état serveur piloté → **Supabase** (HTTP, pilotable au mobile, déjà en place pour les photos), JAMAIS Apps Script.
- Un compte / secret tiers neuf que tu ne peux pas auto-provisionner ; une action physique ou légale ; une dépense que tu ne peux pas autoriser.

**Ce qui n'est PAS un blocage (ne demande PAS)** : le pricing, le copy/storytelling, quelle feature construire, « puis-je toucher X », l'ordre des priorités, le design. Tu tranches (seul ou par agents) et tu livres.

**Principe produit (DUR)** : tout en **self-service, ZÉRO call**. La vente se fait 100 % par email + site (dashboards prêts, paiement self-serve). Jamais de « parlons-en / appelez-moi / prenons rendez-vous ».

## Doctrine produit & exécution (lire AVANT de construire)

> Distillé pour ne PLUS avoir à le redire chaque session. Ce sont des **défauts d'exécution** : applique-les sans demander, tranche les écarts par agents.

### IA pilote, hypercroissance, automatisation, verticalité
- **L'IA est l'opérateur du projet**, pas un assistant. Le fondateur est absent/mobile : tu conçois, codes, déploies, vends, mesures. Objectif = **hypercroissance** avec **zéro humain dans la boucle**.
- **Tout doit être codé, idempotent, automatisable, scalable** : si une tâche se répète, elle devient un script + un step GH Actions (cron), jamais un geste manuel. Marginal cost ≈ 0 → on optimise le **VOLUME** (nb de clients/logos/pages), pas la marge unitaire.
- **Construis pour N, pas pour 1** : patterns réutilisables (outbox d'emails, templates `{{placeholders}}`, pages token-gated `?k=`, params d'URL `?beach&name&partner`, génération SEO de pages). Un nouveau client/plage/marché = changer des données, pas écrire du code.
- **Verticalité** : on possède toute la chaîne (donnée satellite → pipeline → app → widget → B2C paywall → B2B → paiement → relance). Chaque maillon doit se brancher aux autres sans couture. Avant de bâtir, vérifie ce qui existe déjà (souvent 80 % est là).
- **Idempotence partout** (markers `*-sent.json`, dédup par id/pid), **anti-doublon**, **dry-run/HOLD** par défaut sur tout envoi sortant, **gitignore la PII** (emails en clair jamais commités).

### UX (app sargasses)
- **Honnêteté = le moat.** « Mesuré au satellite, pas deviné » ; on **publie notre taux d'erreur** (`/fiabilite/`). Ne JAMAIS survendre ni laisser l'argent influencer un verdict (encart Partenaire ≠ verdict).
- **Verdict par plage**, jamais une moyenne d'île. Friction minimale (molo géoloc figé, pas de prompt à froid). **Jamais de cul-de-sac** : toujours une action utile (plan B « où aller plutôt », lien carte).
- **Mobile-first + PWA** : push OneSignal, nudge install, crop standalone iOS (`#root` top/right/bottom/left:0 SANS width/height:100%). a11y (role=dialog, Échap, focus), `reduced-motion` respecté. Squelette UI réel inline AVANT mount.
- **Perf = revenu** : budget gzip eager (`check-bundle-budget.cjs` ≤210 Ko), chunks lazy hors first-paint, `WorldMapView` = carte vedette funnel → **jamais de refacto sans screenshot de régression**.

### UI / web design
- **Univers « Le Veilleur »** : BD/comic + golden-hour océan, la mascotte Veilleur, « il regarde la mer, jamais vos clients ». Chaleureux, insider, jamais corporate.
- **Système visuel** : fonts **Anton** (display/titres) + **Bricolage Grotesque** (corps) ; or **#FFC72C**, ink sombre ; tokens `colors_and_type.css`. Thème pro sombre `#0a1620`. **Cohérence** app ↔ widget ↔ pages `/pro/*` ↔ emails (`lib/email-send.cjs` `brandHeader` golden-hour).

### Storytelling (réf. `docs/B2C_NARRATIVE.md`)
- **Colonne vertébrale** : le client est le héros, Le Veilleur est le guide ; scène concrète → tension (« le matin où ça bascule ») → renversement (« devenez celui qui connaît la fin de l'histoire avant ses invités »). Curiosité, micro-cliffhanger, rythme.
- À appliquer **partout** : onboarding, paywall, emails drip, pages pro. Un email pro doit se lire comme une bonne histoire.

### Copywriting (réf. `scripts/automation/B2B_EMAIL_TEMPLATE.md`)
- **Preuve avant pitch** ; **cadeau avant l'ask** (réciprocité) ; **claims hedgés** (« semble… si c'est bien le cas ») ; **prix tôt**, pas après 600 mots ; **un seul CTA** self-serve ; zéro jargon/survente ; honnêteté (« vérifiez avant de nous croire » > chiffre tape-à-l'œil).
- **Copy à fort enjeu → panel d'agents** : N frameworks (StoryBrand, BAB, PAS, réciprocité, preuve, âme locale, spine B2C) → critique d'un persona sceptique → synthèse. C'est comme ça qu'on a forgé l'email Anoli.

### B2B (réf. `scripts/automation/B2B_OFFER.md`, `/pro/espace/`)
- **Self-serve, zéro call.** Pricing arrêté : **Pro 79 €/mois ou 690 €/an** (2 mois offerts) · **essai 21 j gratuit sans carte** · garantie 30 j. Brief 29 €/mois (decoy). USD : 89 $/mo · 790 $/an.
- **Funnel** : email (template) → **espace pro perso** `/pro/espace/?beach&name&partner` (plages live + widget + mise en avant + abonnement) → essai instantané (`/api/b2b-trial.php` émet le token Pro) → paiement self-serve. Chaque hôtel = mêmes briques, params différents.
- **Outils** : `gen-b2b-partners.cjs` (encart Partenaire, gate `active:true`), `fetch-payers.cjs`/`relance-payers.cjs` (segment payeurs), `send-b2b-followup.cjs` (outbox follow-ups perso, HOLD). Token Pro = `sg_widget_sign` (`widget-token.php`). Garde-fou : le verdict reste 100 % data ERDDAP.

### B2C (réf. `Sargasses_PROD.jsx`, `mollie.php`)
- **PASS-ONLY Mollie on-site** (carte Components + Apple/Google Pay). L'email est **capturé au checkout** (`submitLead` → onglet `emails` + `payments` + Customer Mollie) → **le B2C n'est PAS anonyme**, on peut relancer.
- Premium = flag `localStorage` posé après `payment_status.paid` + récup cross-device via `sgVerifySub(email)`. Paywall **storytellé** (WorldPaywall). **MRR = source de vérité Stripe** (legacy) ; **revenu = Stripe/Mollie, JAMAIS le funnel Apps Script** (sous-compte ~7×).

### Défauts d'exécution (à faire sans demander)
- **Décision ambiguë → panel d'agents adverses** (Workflow), suis le verdict. **Money-path → revue agent adverse + additif + `php -l`** avant merge ; B2C jamais cassé.
- **Livrer = merger sur `main`** (auto-deploy FTP). Vérifier le déploiement par `curl` (le full build+FTP prend jusqu'à ~75 min). Valider le JS par `node --check`, le PHP par `php -l`.
- **Mémoire** : tenir `NEXT_SESSION.md` (handoff) à jour à chaque session.

## Session Startup

**Raccourci** : `npm run session` → `scripts/cursor-session-startup.cjs` regroupe les checks ci-dessous + load mémoire projet.

Au lancement de chaque session dans ce dossier, exécuter automatiquement (zéro confirmation) :

1. **Pipeline freshness** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const run=(Date.now()-new Date(d.updatedAt))/3.6e6;const sat=d.erddapTimestamp?(Date.now()-new Date(d.erddapTimestamp).getTime())/3.6e6:null;console.log('Source:',d.source,'| run:',run.toFixed(1)+'h',run<12?'OK':'STALE','| satellite:',sat?sat.toFixed(1)+'h':'n/a',(d.stale||(sat&&sat>=36))?'STALE':'OK')"
   ```
   > `run` = âge du dernier passage pipeline (re-run le corrige). `satellite` = âge réel du composite ERDDAP (`erddapTimestamp`/flag `stale`, seuil 36h) — si STALE, ERDDAP est en retard et un re-run NE corrige PAS.

2. **Métriques business du jour** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const l=d[d.length-1];console.log('Last:',l.date,'| Payments:',l.payments,'| Emails:',l.emails,'| Feedbacks:',l.feedbacks)"
   ```

3. **MRR — source de vérité = Stripe** (bloc `stripe` dans daily-metrics) :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const s=[...d].reverse().find(x=>x.stripe&&x.stripe.active!=null).stripe;console.log('MRR Stripe: €'+s.mrr.eur+' |',s.active,'actifs | pastDue',s.pastDue,'| cancelScheduled',s.cancelScheduled)"
   ```
   ⚠️ Le `payments_real`/`revenue_real` du funnel Apps Script **sous-compte ~7×** (l'event de conversion ne se déclenche pas après redirect Stripe). Ne PAS l'utiliser pour le revenu. Garder le funnel uniquement pour les **taux d'engagement** (modal→CTA, CTA→redirect) :
   ```bash
   curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel" | python -c "import json,sys; d=json.load(sys.stdin); print(f'modal {d[\"rates\"][\"modal_to_cta\"]}% CTA | CTA→redirect {d[\"rates\"][\"cta_to_redirect\"]}% | opens {d[\"premium_modal_open\"]} → cta {d[\"premium_modal_cta\"]}')"
   ```

4. **Workflows GitHub Actions récents** : `gh run list --repo aveca/sargagame --limit 5` (skip si gh non-authed).

5. **Lire la mémoire projet** :
   - `NEXT_SESSION.md` (repo) — handoff canonique
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_metrics.md` — MRR actuel
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_decisions.md` — funnel snapshot

6. **Auto-trigger si pipeline STALE** (>12h) :
   ```bash
   gh workflow run daily-copernicus.yml --repo aveca/sargagame --ref main
   ```

7. Reporter l'état en 5 lignes max puis attendre les instructions.

## Règles de déploiement

- **Pas de gel Shabbat** — déploiement autorisé **à tout moment**, week-end inclus. L'automation (GH Actions, IA, cron) tourne sans le fondateur ; aucune fenêtre de no-deploy. (Ancienne règle « ven 18h → sam 19h : ne RIEN déployer » **retirée le 2026-06-28** à la demande du fondateur.)
- **Auto-deploy sur push main** : `daily-copernicus.yml` full build quand `github.event_name == 'push'`. Aucun `railway up` nécessaire (ce repo est full-static, pas de Railway).
- **Workflows GitHub Actions autonomes** — ne pas créer de crons Claude dupliqués. Les 9 workflows couvrent daily data, SEO hebdo, content gen, email drip, UX reports.
- **Concurrency guard** sur 4 workflows (daily-copernicus, content-generation, weekly-optimize, weekly-seo-automation) + `git rebase -X theirs` pour éviter les races sur les JSON générés.

## Architecture rapide

- **App principale** : `Sargasses_PROD.jsx` (~16k lignes, React, carte SVG `WorldMapView`/`ArchipelView`). **Perf 26/06 (soir)** : paywall extrait en chunk LAZY → `src/PremiumModal.jsx` (PremiumModal+World/Comic/B2B, deps via **exports nommés** de Sargasses_PROD, `lazyWithRetry`) ; CSS applicatif sorti du bundle JS → `src/app-runtime.css` (import statique, appliqué AVANT mount) ; scènes hors first-paint en lazy (ArenaSplash/Onboarding/VeilleurHero/DiveTransition) ; **squelette UI réel** inline (`index.html` + template GP de `prepare-ftp.cjs`). **BottomNav (Carte/Liste/Premium) RETIRÉE** (nav = carte ; Premium via dock « Veilleur »/CTA). Entry JS **~169 Ko gzip (−26 %)**. **Crop bas standalone iOS (nuit 26/06)** : `#root` doit être `top/right/bottom/left:0` SANS `width/height:100%` (sinon `height` écrase `bottom:0` → bande vide ; cf. `index.html`+`app-runtime.css`+GP template). **Note sargasses (`BeachReport`) sur la preview comic** : passée en prop `ReportComp` (Sargasses_PROD→ComicDetail→ChasseDetail) pour éviter l'import circulaire. **Cloche notif** 🔔 dans le Header (`onEnableNotif`→`requestPermission`).
- **Pipeline v3** : `scripts/fetch-sargassum-live.cjs` + `scripts/lib/forecast.cjs` + `scripts/lib/confidence.cjs` (persistance exponentielle, half-life 5,0j — backtest 3,5/4/5/6 = 75% identique, donc valeur libre, on garde 5,0)
- **Build** : Vite, 136+ pages plages SEO-générées par `vite.config.js`
- **FTP deploy** : `scripts/prepare-ftp.cjs` → `martinique-ftp/` + `guadeloupe-ftp/` → `scripts/manual-ftp-deploy.cjs` (sessions FTPS fragmentées)
- **Domains** : sargasses-martinique.com, sargasses-guadeloupe.com
- **Trust page** : `/a-propos/` (shipped 2026-04-17, standalone HTML + colors_and_type.css)
- **Repo** : aveca/sargagame (public, minutes illimitées GH Actions)

## État business au 2026-06-26 (nuit)

- **Modèle = PASS-ONLY** (paiement UNIQUE, plus d'abonnement) via **Mollie on-site PARTOUT** (carte Components + Apple Pay natif). EUR : 7,99/14,99/24,99 € · USD : $5.99/$11.99/$19.99. Mollie encaisse l'USD et règle en EUR (FX Mollie).
- **GO-LIVE paiements réels** : EUR (MQ/GP) 25/06 · **USD (Floride/Punta Cana/Cancún) 26/06** (validé par un vrai paiement $5.99). Barbados = reste en capture (pas câblé Mollie). Stripe = NE sert plus de caisse (16 abos EUR legacy continuent d'y facturer ; ses liens USD sont DÉSACTIVÉS — ne jamais y renvoyer un CTA).
- **MRR** : €79,84/mois (16 abonnés Stripe legacy — source de vérité Stripe/daily-metrics) · pastDue 1 (dunning auto `--send` actif). Premières conversions pass/USD à suivre (dashboard Mollie).
- **Leads** : ~246 emails. Relances go-live parties (235 EUR + 4 USD EN/ES). **Nudge install PWA + alertes** greffé sous le verdict quotidien (`drip-email.cjs`, gating usage : ≥3 verdicts, cap 3, ≥10j).
- **⚠️ Funnel NON fiable jusqu'à ~23/07** : fenêtre 28j → mélange l'ancien design abo (avant 25/06). `Code.js` compte désormais `sg_pass_cta` (vrai CTA) mais **nécessite `clasp push`** (action fondateur, reporting only). Revenu = Stripe/Mollie, jamais le funnel.
- **Boucles d'alerte auto** : `revenue-watch` (mouvements Stripe) + `ux-watch` (criticals rage/dead-clicks de ux-report) → email fondateur, dans daily-copernicus.
- **A/B tests live** : `pw_cta_order` + `pw_prelude` + `ab_fiche_dive` (50/50) + `home_az` (50%) + `map_world` (50%). **`molo_ladder` TRANCHÉ 26/06 → molo figé à 100 %** (zéro prompt géoloc à froid ; MQ +201 % checkout-redirect, sig. 99 %, ennui 13→11 %). **`dock_glass` RETIRÉ** avec la BottomNav. Réévaluer le reste sur données POST-refonte.
- **Pipeline** : ERDDAP-live, 4×/j, stable. **Détail complet de la session 26/06 → `NEXT_SESSION.md` (entrée en tête).**

Pour les opérations détaillées (deploy manuel, A/B eval, backtest forecast, stats), invoquer le skill `sargasses`.
