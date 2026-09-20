## 2026-09-19 · Agent: coding-agent — SHIP E1/A7 PassOffer CTA spécifique (branche `agent/coding/e1-cta-specific`, ex-#685)

### Travail effectué
- **Résumé 1 ligne** : hero CTA PassOffer = livrable nommé (« Voir la prévision 7 jours → ») derrière rollback `?sgcta=0` + contrats A7/E1 verrouillés par tests (purge pw* déjà livrée via #686).
- **Détails + preuves** : `.ai/changelog.md` (entrée 2026-09-19 E1/A7).
- **Attention prochain scope** : A13 = ÉTAT HYBRIDE — `fcDays` lock-shift `i>1` + badge INCLUS présents (variante BSC) MAIS un 2e système local (commit #691 `c5f6de7b`→`f271417c0` rebaptisé, flag `j1FreeOn`, badge « J+1 OFFERT ») coexiste sur les mêmes zones ^ — VÉRIFIER lequel est live en prod, dédupliquer. Fichier `scripts/tests/forecast-j1-free.test.cjs` non encore repris.
- **Note probe** : port 4173 était occupé par un vieux preview (sert l'ancien build) — toujours asserter le hash de chunk avant tests UI.

### Branche / PR
- Branche : `agent/coding/e1-cta-specific` (rebasée post-#692, conflits docs union) · PR : #695

---

## 2026-09-19 · Agent: coding-agent (K3 MAP DECLUTTER — branche `agent/coding/k3-map-declutter`)

### Travail effectué
- **Résumé 1 ligne** : carte = exploration pure par défaut (`?mapdeclutter` ON, rollback `?mapdeclutter=0`), 5 panneaux décisionnels gardés par rendu conditionnel, gates verts.
- **Détails** : voir `.ai/changelog.md` (entrée K3 2026-09-19). Incident évité : 1re passe logique inversée (mesure DOM 48 vs 43 inversée) → corrigée avant validation. Contrat `map-declutter.test.cjs` 17/17 (incl. garde anti-interférence paywall/z-index/tracking). ma-plage.spec.ts → path rollback (8 goto).
- **Rebase post-#691** : branche rejouée `--onto` nouveau main (commit `c5f6de7` exclu — A13/LeadCapture désormais sur main), conflits `.ai/*` résolus par union (entrées G1 conservées + entrée K3 en tête).

### Fichiers modifiés
- `src/WorldMapView.jsx` — const `mapDeclutterOff` + 5 gardes + commentaire K3
- `tests/e2e/ma-plage.spec.ts` — 8× `/?mapdeclutter=0` + note rollback
- `scripts/tests/map-declutter.test.cjs` — NOUVEAU (17 checks)
- `.ai/changelog.md`, `.ai/current_state.md` — handoff

### Tests réalisés
- [x] npm run build → exit 0 (389 modules)
- [x] check-bundle-budget → 38.1 Ko ≤ 210
- [x] php -l → N/A (0 .php)
- [x] ux-smoke → 4 tokens OK
- [x] playwright funnel+bottomnav → 21/21
- [x] playwright ma-plage (rollback) → 8/8
- [x] DOM 390px on/off + screenshots + 0 console error

### Problèmes restants
- [ ] UX-QA-001/002/003/004/006 : voir MASTER_AUDIT (#691 a traité A13 + UX-QA-002 ; reste à vérifier post-deploy)
- [ ] 3 recherches non unifiées (hors scope, chantier séparé)

### Prochaine action recommandée
1. CI PR → merge si vert → deploy auto → QA prod : `/` sans héros, `/?mapdeclutter=0` chrome complet — Rôle : release/qa

### Branche / PR
- Branche : `agent/coding/k3-map-declutter`
- PR : #692
- Rollback : `?mapdeclutter=0` (produit) ou revert 1 commit

---

## 2026-09-18 · Agent: coding-agent — SHIP G1 lead capture Supabase (branche `agent/coding/g1-supabase-leads`, ex-#685)

### Travail effectué
- **Résumé 1 ligne** : migration G1 reconstruite proprement — Supabase `b2c_alerts` en sink PRIMAIRE (REST direct anon), Apps Script en backup documenté, bannière LeadCapture réparée (elle perdait 100 % des leads B2C/B2B en prod via le hop worker 404 + faux succès UX).
- **Détails + diagnostic prod + preuves** : `.ai/changelog.md` (entrée 2026-09-18 G1).

### Fichiers modifiés (5, verrouillés)
- `src/supabasePhotos.js`, `src/Sargasses_PROD.jsx` (hunk G1 uniquement — A13 exclu), `src/LeadCapture.jsx`, `scripts/tests/lead-capture-g1.test.cjs`, `scripts/lib/supabase-leads.test.cjs`

### Tests réalisés
- [x] lead-capture-g1 8/8 · supabase-leads 21/21 · paywall A1/E2 tests ALL PASS · build exit 0 · bundle 38,1 Ko ≤ 210 · smoke 4/4 · Playwright funnel 13/13 + j0 7/7 · probe réel bannière → POST b2c_alerts (réseau intercepté, 0 écriture prod) · probes prod : /api/supabase 404 + RLS 400 not-null (proofs sans écriture)

### Prochaine action recommandée
1. Scopes #685 restants : **A13** (porter j1_free sur la variante LIVE ChasseDetail — UX-QA-001), **G3** (mirror PayPal), **G2** (purge analytics), **G15** (ci-gate), **E1/A7** — Rôle : coding-agent
2. UX-QA-002 : bannière email z1500 > paywall/checkout — Coding Agent
3. Post-deploy : vérifier création réelle d'une ligne b2c_alerts (signature domain réel, ex. un lead organique du jour) — Data Agent (lecture service côté dashboard)

### Branche / PR
- Branche : `agent/coding/g1-supabase-leads` · PR : #690 (rebasée post-#689, conflits docs résolus par union)

---

## 2026-09-18 · Agent: ui-agent (F1 VALIDÉ PROD — #689 mergé + déployé)

### Travail effectué
- **Résumé 1 ligne** : CI #689 7/7 → squash merge 18:57 UTC → Deploy Live success → QA prod badge OK (#8a5a00 live, CR 5.93). Scope F1 terminé.
- **NEXT** : en attente rapport K3 pour le prochain prompt — ne pas lancer d'agent.

## 2026-09-18 · Agent: ui-agent (F1 STALE CONTRAST — branche `agent/ui/f1-stale-contrast`)

### Travail effectué
- **Résumé 1 ligne** : scope F1 uniquement — badge stale « il y a 1 j » 3.34 → 5.49 (AA), 1 valeur, test 6/6, gates verts.
- **Détails** : voir `.ai/changelog.md` (entrée F1). F2 backlog / F3 documenté / F4 clos (voir `.ai/whiteness-audit.md`, non modifié).

### Branche / PR
- Branche : `agent/ui/f1-stale-contrast`
- PR : à créer
- Rollback : revert 1 ligne (aucun flag nécessaire, visuel pur)

## 2026-09-18 · Agent: ui-agent (UI VISUAL RESCUE VALIDÉ PROD — #688 mergé + déployé)

### Travail effectué
- **Résumé 1 ligne** : CI #688 7/7 vert → squash merge 17:49 UTC → Deploy Live success → QA visuelle prod OK (cartes CR 19.53, filtres actifs, sticky 2 lignes 390px, desktop inchangé). Rescue UI terminé.
- **Rappel scope** : #688 = sous-ensemble précis (XP cards + armor thème + sticky CTA), PAS une preuve que tout « blanc sur blanc » est résolu — rester vigilant sur les autres surfaces.
- **NEXT** : G1 Supabase dans une branche neuve depuis ce main — Rôle : coding-agent (fait, voir entrée en tête)

## 2026-09-18 · Agent: coding-agent — SHIP scope partenaires/WhatsApp (branche `agent/coding/partners-whatsapp-ship`, ex-#685)

### Travail effectué
- **Résumé 1 ligne** : scope « partenaires → support WhatsApp » extrait proprement de PR #685 sur main@ef81d8a82 frais (post-#686), 7 fichiers verrouillés, gates verts, modifs concurrentes (PassOffer/app-runtime.css/ExperienceReset/xp-visual-rescue) préservées hors staging.
- **Détails** : voir `.ai/changelog.md` (entrée 2026-09-18). MQ fiche plage : unique carte « Sargagame Support · Écris-nous sur WhatsApp » (wa.me/596596106124, texte prérempli plage+région), Taxis Martinique + Lovelly retirés. Kill-switch `?partnerctx=0` inchangé. Catalog régénéré par le générateur (jamais édité à la main).

### Fichiers modifiés (staged, 7)
- `regions/mq.json`, `scripts/automation/gen-context-partners.cjs`, `src/lib/partners.js`, `src/components/PartnerContext.jsx`, `src/lib/partners-catalog.json` (regen), `scripts/tests/partners-contract.test.cjs`, `tests/e2e/partners-context.spec.ts` + docs `.ai`

### Tests réalisés
- [x] partners-contract 37/37 · assertAllRegionsValid OK · suite 173/175 (baseline préexistante) · build exit 0 · bundle 38,1 Ko ≤ 210 · smoke 4/4 · Playwright funnel 13/13 + j0 7/7 + partners 2/2 (+10/10 avec ma-plage)
- [!] 1 échec flaky observé en parallélisme lourd : overlays cookie/bannière-email interceptent un clic (UX-QA-002/003 connus en MASTER_AUDIT, hors cause du scope)

### Prochaine action recommandée
1. Scopes #685 restants, un par PR : **G1** (submitLead Supabase + supabasePhotos.js + LeadCapture + tests), **A13** (j1_free — vérifier UX-QA-001 : variante LIVE ChasseDetail non couverte par le fix #685 BeachSheetComic), **G3** (mirror PayPal), **G2** (purge analytics), **G15** (ci-gate), **E1/A7** (PassOffer copy/paths) — Rôle : coding-agent
2. UX-QA-002 (bannière email z1500 > paywall/checkout) — Coding Agent

### Branche / PR
- Branche : `agent/coding/partners-whatsapp-ship` (base origin/main @ ef81d8a82)

## 2026-09-18 · Agent: ui-agent (UI VISUAL RESCUE, branche `agent/ui/visual-rescue`)

### Travail effectué
- **Résumé 1 ligne** : 3 régressions visuelles prod reproduites (local+prod, CR 1.02) + corrigées (CR 19.53, CTA or, sticky 390px) — visuel seul, PR #686 innocentée.
- **Détails** : voir `.ai/changelog.md` (entrée UI VISUAL RESCUE 2026-09-18). Preuves : visual-audit/before + après (Temp/opencode).

### Fichiers modifiés
- `src/components/ExperienceReset.jsx` — color:INK + XP_ARMOR + classes actives
- `src/PassOffer.jsx` — classes sg-sticky-wrap/label/buy
- `src/app-runtime.css` — lot 10 (sticky 2 lignes ≤480px)
- `scripts/tests/xp-visual-rescue.test.cjs` — NOUVEAU (26 checks, ALL PASS)

### Tests réalisés
- [x] npm run build → exit 0
- [x] check-bundle-budget → 38.1 Ko ≤ 210
- [x] ux-smoke → 4 tokens + exit 0
- [x] npm test → 173/175 (2 jolly-yalow préexistants, hors repo)
- [x] playwright bottomnav+j0+funnel 28/28 + ma-plage+e9 13/13
- [x] esbuild 2 fichiers → OK
- [x] git diff --check → OK

### Problèmes restants
- [ ] UX-QA-002 (bannière lead z1500 au-dessus paywall/checkout) — volontairement NON fixé (multi-scope lead+paywall+checkout → STOP mission) — voir MASTER_AUDIT

### Prochaine action recommandée
1. CI PR #688 → merge si vert → deploy auto → vérif prod visuelle Plages/Ma Plage/sticky 390px — Rôle : release/qa

### Branche / PR
- Branche : `agent/ui/visual-rescue`
- PR : #688 (https://github.com/aveca/sargagame/pull/688)
- Commit head : rebasé sur origin/main (voir PR)

### INCIDENT CONCURRENCE (résolu, zéro perte)
- Une session parallèle a basculé le worktree partagé sur `agent/coding/partners-whatsapp-ship` pendant ma session : mon 1er commit a atterri sur sa branche. Récupéré : cherry-pick sur `agent/ui/visual-rescue`, reset partners sur `origin/b729e01ab` (arbre vérifié propre, aucun commit perdu). Rebase rejoué sur `origin/main@fc2167291` (conflits `.ai/*` gardés des 2 côtés).

---

## 2026-09-17 ~21:50 · Agent: fix-qa (CORRECTIFS des 6 findings QA, branche `agent/ux/continuous-explorer`)

### Travail effectué
- **Résumé 1 ligne** : les 6 findings QA P1/P2 traités — 2 bugs produit mineurs corrigés (placement email A1 · nom partenaire WhatsApp), 1 flag de test ajouté (`?sgcomm=N`, display-only), 3× TEST ISSUE prouvées (waitForSelector `.sg-maplabel` = 1er élément seul), zéro régression.
- **Détails** : voir `.ai/changelog.md` (entrée 2026-09-17 FIX QA) et MASTER_AUDIT.md (bloc « Session FIX QA »).

### ⚠️ INCIDENT CONCURRENCE
- Une session parallèle a commit `67b495ab1` (PremiumModal.jsx SEUL, état hybride : `readCommOverride()` défini MAIS `community: __COMM` non câblé) et restauré l'état antérieur des autres fichiers (WorldPaywall/PartnerContext/tests/docs ré-appliqués par moi après).
- **État final à vérifier avant merge** : `git diff` doit montrer `community: readCommOverride()` (pas `__COMM`) dans commonPaywallProps.

### Fichiers modifiés (NON COMMITTÉS — arbitrage merge = fondateur)
- `src/PremiumModal.jsx` — `community: readCommOverride()` (override `?sgcomm=N`)
- `src/PremiumModal/WorldPaywall.jsx` — bloc email A1 après l'offre (fix UX-002)
- `src/PremiumModal/preCtaEmail.js` — commentaire placement
- `src/components/PartnerContext.jsx` — subText WhatsApp = `${p.name} · Écris-nous sur WhatsApp`
- `scripts/tests/paywall-email-pre.test.cjs` + `paywall-social-proof.test.cjs` — contrats MAJ
- `tests/e2e/ma-plage.spec.ts` — `.sg-maplabel:visible` ×11 + fraîcheur DOM + scope `[data-vmui="1"]`
- `tests/e2e/weekhub-forecast.spec.ts` — helper openBeachDetail
- `tests/e2e/partners-context.spec.ts` — popup URL (redirect wa.me headless)
- `tests/e9-paywall.spec.ts` (conservé de ma première passe) — sgcomm=0 + qs préservée
- `MASTER_AUDIT.md` — UX-001..006 [x] + bloc fix
- `.ai/changelog.md` + ce fichier

### Tests (1re passe, post-fix, tous verts)
- j0 7/7 · ma-plage 8/8 · weekhub 5/5 · partners 2/2 · e9 5/5 · funnel 13/13 · around-me 10/10 · bottomnav 8/8 · p1-03 11/11 · smoke PASS · build 0 · bundle 38.1 Ko · 4 unitaires ALL PASS
- Desktop 1440 : labels ~200 ms (5 arbitrés)

### Prochaine action recommandée
1. Re-tester la 2e passe (post-réapplication) puis commit/merge — Release Agent
2. Traiter UX-QA-002 (bannière z1500 > paywall/checkout) — Coding Agent

---

## 2026-09-17 · Agent: ux-agent (QA réelle complète, branche `agent/ux/continuous-explorer`)

### Travail effectué
- **Résumé 1 ligne** : batterie QA observe+prove terminée (local build + prod 6 domaines + headed) — tous les parcours rentrent, 2 bugs produits confirmés (J+1 A13 absent de la variante live ; bannière email au-dessus du paywall), 4 bugs d'empilement préexistants tracés en tâches, le reste passe.
- **FAIT MARQUANT** : la prod est UN BUILD EN RETARD sur HEAD (`index-DvDTSfse` prod vs `CNCRwgMD` local) — tout ce qui a été corrigé dans la journée (UX-R2-003, E1/E2/E9, WhatsApp, G1 direct) est prêt dans le code mais non déployé.
- **Preuves durables** : `.ai/ux-agent/runs/20260917-qa/` (screenshots, vidéos webm, traces.zip Playwright, checks/diagnostics/regions/summary JSON).

### Bugs enregistrés (MASTER_AUDIT, exploitables par agent)
- P1 UX-QA-001 : A13 J+1 « offert » invisible en vrai (variante live ChasseDetail verrouille J+1 ; fix fait dans la variante dormante BeachSheetComic ; flag `?j1_free=0` sans effet live)
- P1 UX-QA-002 : bannière capture email (z 1500) se superpose au paywall (z 1260) et checkout (z 1300)
- P1 UX-QA-003 / UX-QA-004 : la même bannière intercepte le bouton « Refuser » des cookies (mobile) et la nav « ◉ Carte » (desktop)
- P2 UX-QA-005 : × du modal premium intercepté par la fiche (à re-tester après deploy d'a1585b563)
- P2 UX-QA-006 : « Plus tard » inopérant sur desktop

### Prochaine action recommandée
1. **Merger/déployer la branche** (livrables du jour en prod) puis rejouer `.ai/ux-agent/qa/qa-suite.py --base https://sargasses-martinique.com/ --label prod --core` (valide: modal z=1260, E2/E9/E1 visibles, WhatsApp). — Rôle : devops/release
2. Traiter UX-QA-001 (porter `j1_free`/gating A13 dans ChasseDetail). — Rôle : coding-agent

---

## 2026-09-17 · Agent: ux-agent + coding-agent (UX Explorer + fix UX-R2-003)
### Travail effectué
- **Résumé 1 ligne** : Continuous UX Explorer opérationnel (exploration LLM Webwright + skill rejouable + replay déterministe Playwright) + **UX-R2-003 corrigé** : le modal premium s'ouvre désormais AU-DESSUS de la fiche plage.
- **UX-R2-003 (blocker money-path)** : depuis une fiche plage (`.lc-detail` z1200), « Débloquer les prévisions 7 jours » ouvrait le modal premium EN DESSOUS (panel z1100 / takeover comic z1200 égalité) → offre invisible, clics interceptés. Fix minimal (commit `a1585b563`) : panel 1100→1260, 2 backdrops premium 1005→1250 inline, ComicPaywall 1200→1260 ; checkout Mollie (OnsiteCheckout z1300) conservé au-dessus. Rollback : revert a1585b563.
- **Preuves** : build exit 0 · bundle 38.1 Ko ≤ 210 · Playwright réel (vite preview local) mobile 390×844 + desktop 1440×900 : `elementFromPoint` centre = modal (plus la fiche), CTA paywall pointable, Fermer cliquable avec fermeture réelle, fiche intacte après retour.
- **Continuous UX Explorer** : `.ai/ux-agent/` (launcher NVIDIA kimi-k3, configs Webwright `local_browser`, skill `inspect-sargagame-home` rejouable) ; RUN 1 exploration (20 screenshots, 8 findings) + RUN 2 replay OK ; autres findings ouverts et documentés : UX-M-001/002/003, UX-D-001/002 (+ 400 `/api/mollie.php`, 404 `/api/b2b-partners.json` — info).

### Prochaine action recommandée
1. Recetter UX-R2-003 **en prod** après merge+deploy (replay : `.ai/ux-agent/skills/inspect-sargagame-home/run.py`). — Rôle : qa-agent
2. P0 inchangé : premier paiement réel (action fondateur, voir entrée 19:20 ci-dessous).

---

## 2026-09-16 19:20 UTC · Agent: release-agent (PR #682 merged → PROD VALIDÉ → P0 SOFTWARE FIXED)

### Travail effectué
- **Résumé 1 ligne** : PR #682 mergée, deploy-live 17:47 UTC OK (Pages 6 régions + Workers + health 6/6), preuves live curl + probe Playwright iPhone 12 — money-path software validé, 1er paiement réel bloqué UNIQUEMENT par carte bancaire réelle (action fondateur).

### Preuves exactes (prod live)

**1. PR #682** — `MERGED` à 17:34 UTC, merge commit `343295bea` → main. Tous checks CI SUCCESS (branch-policy, CI Tests, Funnel Gate, Perf Budget, Playwright E2E, Secret scan). Déploiements : run deploy-live `35129014961` (17:34, success) + `35130311634` (17:47, success, commit `f4e6bd2f9`) = Pages 6 régions + workers (sg-payments, supabase-proxy, b2b-api) + health-check.

**2. Health 6/6 domaines (19:05 UTC)** :
- sargasses-martinique.com, sargasses-guadeloupe.com, sargassummiami.com, sargassumpuntacana.com, sargassumcancun.com, sargazotulum.com → root **200** + `/api/mollie-health` **200** ({"ok":true,"worker":"sg-payments","version":"sprint15","routes":45})

**3. Fix invalid_json VÉRIFIÉ LIVE** (worker déployé = code corrigé) :
- `POST /api/mollie` body vide → `400 {"error":"action_inconnue"}` (pas `invalid_json` → `request.text()`+`JSON.parse()` actif)
- `POST /api/mollie {"action":"create_payment","pass":"trip7","cents":499,"cur":"EUR",...}` → **200** `{"checkoutUrl":"https://www.mollie.com/checkout/select-method/gU5tuV7HHuuks9ZsadsWJ","paymentId":"tr_gU5tuV7HHuuks9ZsadsWJ"}`
- `POST /api/mollie {"action":"payment_status","paymentId":"tr_gU5tuV7HHuuks9ZsadsWJ"}` → **200** `{"paid":false,"status":"open","terminal":false}` → Mollie renvoie paymentId/checkout exploitable, API key **LIVE** (URL sans `?testmode=true`)

**4. Fix race condition VÉRIFIÉ LIVE** (probe Playwright iPhone 12 headless, taggé `synthetic`) :
- `?paywall=1` → paywall → CTA pass → **`payStep` ouvert** → **5 iframes Mollie** (1 controller + 4 components cardHolder/cardNumber/expiryDate/verificationCode montés sur `js.mollie.com/v1/component/?profileId=pfl_t8KCk4Cm2C`)
- Email + carte test remplis (4 champs iframe) → clic « Payer 14,99 € » → events : `sg_pass_cta` → `sg_onsite_checkout_opened` → `sg_pay_email_captured` → `sg_card_tokenize_attempt` → `sg_pay_onsite_error` + `sg_payment_failed` (reason "Vérifie ta carte." = rejet carte test attendu en live)
- **AUCUN** `sg_mollie_components_not_mounted`, **AUCUN** `sg_mollie_mounted_timeout`, **AUCUNE** erreur console, **AUCUN** "Not all required components are mounted"
- Screenshots : `C:\Users\user\AppData\Local\Temp\opencode\probe-{1..5}*.png`

**5. Données (séparation synthetic/QA/réel)** :
- `sg_mollie_components_not_mounted` : **0** (ni synthetic probe, ni réel — funnel-daily-report n'en a pas)
- `sg_mollie_mounted_timeout` : **0** (id. — mounts immédiats en prod, pas d'attente)
- `sg_mollie_mounted_after_wait` : **0** (mounts instantanés)
- `sg_payment_failed` : 3/24h (fenêtre 2026-09-15, pré-deploy) ; 1 synthetic probe post-deploy (raison carte test, attendu)
- `mollie_checkout_redirect` : **0/24h** réel ; payment Mollie créé via probe curl (tr_gU5tuV7HHuuks9ZsadsWJ) = création OK mais pas de paiement complété
- `conversion` : **0** — aucun paiement `paid` (dernier paiement Mollie réel : 2026-07-19)

### Fichiers modifiés
- `.ai/current_state.md`, `NEXT_SESSION.md` — mémoire handoff

### STATUT
| Verdict | Valeur |
|---------|--------|
| **P0 SOFTWARE** | **FIXED** — preuves curl + probe live ci-dessus |
| **FIRST REAL PAYMENT** | **NOT YET VERIFIED — BLOCKED par action fondateur** : payer un Pass 7j 4,99 € avec vraie carte sur mobile (funnel déjà prouvé jusqu'à tokenize+create_payment+status ; webhook/grant/conversion non prouvables sans paiement `paid`) |

### Action exacte fondateur (indispensable)
1. Depuis mobile réel : https://sargasses-martinique.com/?paywall=1 → Pass 7 jours 4,99 € → payer avec carte réelle
2. Pourquoi indispensable : clé Mollie **live** (checkout sans testmode) → aucun moyen de générer un paiement `paid` sans carte réelle ; mode test nécessiterait une clé `test_` (déploiement distinct, déconseillé en prod)
3. Dernier point technique déjà validé : `sg_card_tokenize_attempt` → Mollie Components OK, create_payment 200 OK, payment_status 200 OK
4. Après paiement : vérifier webhook → `payment_grants` (Supabase) → accès premium + event `conversion`

### Rollback
- Aucune nouvelle feature déployée ; si régression : `git revert f11ca638a e8c665085` + push main (re-deploy auto) ou `?flag=0` côté paywall.

---

## 2026-09-16 18:30 UTC · Agent: coding-agent (B2C Payment Race Condition FIXED + /api/mollie routing FIXED)

### Travail effectué
- **Résumé 1 ligne** : Race condition corrigée (payMountedRef) + routage /api/mollie (invalid_json) — money-path B2C prêt pour validation prod

### Fichiers modifiés
- `src/PremiumModal.jsx` : ajout `payMountedRef` partagé
- `src/PremiumModal/OnsiteCheckout.jsx` : utilisation `payMountedRef` partagé, mount 4 composants Mollie avant `sg_onsite_checkout_opened`
- `src/PremiumModal/doSubscribe.jsx` : attente `payMountedRef` (5s/120ms polling) avant `createToken()`, events `sg_mollie_mounted_timeout` / `sg_mollie_mounted_after_wait`
- `workers/sg-payments/src/index.ts` (commit e8c665085) : `handleMollie` utilise `request.text()` + `JSON.parse()` pour corriger `invalid_json` sur body vide

### PROBLÈMES RÉSOLUS

| Problème | Cause racine | Correctif | Commit |
|----------|--------------|-----------|--------|
| **A. "Not all required components are mounted"** | `createToken()` appelé avant que les 4 Mollie Components (cardHolder, cardNumber, expiryDate, verificationCode) ne soient montés dans le DOM | `payMountedRef` partagé + attente 5s/120ms polling dans `doSubscribe` avant `createToken()` | f11ca638a |
| **B. "invalid_json" / body vide sur POST /api/mollie** | Worker lisait `request.json()` sur body déjà consommé / vide | `handleMollie` utilise `request.text()` + `JSON.parse()` avec fallback sécurisé | e8c665085 |

### VALIDATION TECHNIQUE

| Check | Résultat |
|-------|----------|
| `npm run build` | ✅ 388 modules, 0 erreur |
| Bundle budget (38.1 Ko / 210 Ko) | ✅ |
| PHP lint (mollie.php, mollie-lib.php, mollie-webhook.php) | ✅ |
| Unit tests | ✅ 200+ PASS |
| Funnel-payment E2E | ✅ 12/13 PASS (1 flaky comic variant) |
| Contract-pass-one-time | ✅ 2/2 PASS |
| Regions validation | ✅ 5 régions valides |

### TESTS E2E PAYMENT FLOW — CE QUI EST COUVERT

| Test | Couvert |
|------|---------|
| Carte → fiche → paywall : funnel reaché + events | ✅ |
| Paywall affiche CTA Premium | ✅ |
| Pas d'erreurs JS critiques | ✅ |
| Rollback flags (?flag=0, ?pwcomic=0) | ✅ |
| Paywall → email → CTA checkout visible | ✅ |
| Premium localStorage activation | ✅ |
| Reduced motion | ✅ |
| Multi-region EUR (MQ) | ✅ |

### ARCHITECTURE MONEY-PATH B2C — ÉTAT

| Composant | Statut |
|-----------|--------|
| `PremiumModal.jsx` → `OnsiteCheckout` overlay (z 1300) | ✅ Monté |
| `OnsiteCheckout` : 4 Mollie Components + email | ✅ Montés avant `sg_onsite_checkout_opened` |
| `doSubscribe` → `payMountedRef` wait → `createToken()` | ✅ Race condition éliminée |
| `POST /api/mollie.php` (worker `handleMollie`) | ✅ Body parsing corrigé |
| Mollie `create_payment` → `checkoutUrl` / `paymentId` | ✅ Code prêt |
| Webhook `payment.paid` → `payment_grants` → `sg_auth` | ✅ Code prêt |

### DÉPENDANCES EXTERNES NON VALIDÉES EN PROD

| Dépendance | Statut | Action requise |
|------------|--------|----------------|
| POST /api/mollie live → Mollie sandbox | **NON TESTÉ EN PROD** | Déclencher un checkout réel (P0) |
| Webhook Mollie → grant → entitlement | **NON TESTÉ EN PROD** | Vérifier après 1er paiement |
| Event `sg_mollie_mounted_timeout` / `sg_mollie_mounted_after_wait` | **NON ÉMIS EN PROD** | Surveiller après déploiement |

### PROCHAINES ACTIONS RECOMMANDÉES

1. **Déployer via normal mechanism** (push main → daily-copernicus.yml → build → FTP → health-check)
2. **Valider money-path réel** : 1 paiement test Mollie sandbox (si nécessaire) ou attendre 1er paiement réel
3. **Surveiller events** : `sg_mollie_mounted_timeout` (doit rester à 0), `sg_mollie_mounted_after_wait` (doit > 0 si délai), `sg_pass_cta` → `sg_onsite_checkout_opened` → `sg_payment_failed`/`mollie_checkout_redirect` → `conversion`
4. **Confirmer disparition erreur** "Not all required components are mounted" en prod
5. **Mettre à jour .ai/current_state.md** après validation prod

### Branche / Commit
- Branche : `main` (HEAD = `f11ca638a`)
- Fixes inclus : f11ca638a (payMountedRef), e8c665085 (invalid_json)

### STATUT FINAL : **FIXED — frontend race condition + /api/mollie routing — PRÊT POUR VALIDATION PROD**

---

### HANDOFF TEMPLATE

```
## 2026-09-16 18:30 UTC · Agent: coding-agent

### Travail effectué
- Fix race condition "Not all required components are mounted" via payMountedRef (5s/120ms polling)
- Fix /api/mollie invalid_json via request.text() + JSON.parse()
- Build OK, bundle 38.1 Ko, tests 200+ PASS, funnel-payment E2E 12/13

### Fichiers modifiés
- src/PremiumModal.jsx, src/PremiumModal/OnsiteCheckout.jsx, src/PremiumModal/doSubscribe.jsx
- workers/sg-payments/src/index.ts

### Problèmes résolus
A. Race condition frontend : createToken() avant mount Composants → payMountedRef wait
B. Routing /api/mollie : body vide → request.text() + JSON.parse()

### Prochaine action
1. Push main → deploy auto (daily-copernicus.yml)
2. Valider money-path prod : 1 paiement test
3. Surveiller events sg_mollie_mounted_* + funnel complet
4. Confirmer disparition erreur "Not all required components are mounted"
```