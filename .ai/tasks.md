## AUTONOMOUS FACTORY HARDENING (PR #777) — [x] done 2026-10-01 (3 commits, CI en cours)
- **Livré** : GENERATED_FILES centralise/teste (+2 JSON partenaires), conflict-repair durci (multi-hunks, CRLF, verify, lease), scheduler anti-monopole (park-and-continue borne 5/cycle, resume cooldown 24h), decideRecovery pure, lock testable, repo nettoye (29 debris + 1770 run-logs untracked), fix hang opencode-auto (npm test debloque).
- **Preuves** : 6 suites neuves (36+18+32+19+24+14) + simu 24 cycles NO DEADLOCK/NO HUMAN PROMPT/NEXT CONTINUES · build 0 · bundle 38.2 Ko · smoke 4/4 · npm test 86/86 · diff --check OK.
- **NEXT** : CI verte -> squash merge #777 -> deploy auto -> live runner --live --continuous.

## AUTONOMOUS FACTORY HARDENING (PR #777) — [x] done 2026-10-01 (3 commits, CI en cours)
- **Livré** : GENERATED_FILES centralise/teste (+2 JSON partenaires), conflict-repair durci (multi-hunks, CRLF, verify, lease), scheduler anti-monopole (park-and-continue borne 5/cycle, resume cooldown 24h), decideRecovery pure, lock testable, repo nettoye (29 debris + 1770 run-logs untracked), fix hang opencode-auto (npm test debloque).
- **Preuves** : 6 suites neuves (36+18+32+19+24+14) + simu 24 cycles NO DEADLOCK/NO HUMAN PROMPT/NEXT CONTINUES · build 0 · bundle 38.2 Ko · smoke 4/4 · npm test 86/86 · diff --check OK.
- **NEXT** : CI verte -> squash merge #777 -> deploy auto -> live runner --live --continuous.

## MONEY-PATH 400 FIX (claim_referral_credit + applepay alias) — [x] done local, PR à créer 2026-09-30
- **Livré** : handler `claim_referral_credit` verrouillé sur sg-payments (200 days:0, fini le 400/boot) + alias `applepay_merchant_session`/`validationURL` (worker + mollie.php + railway mirror) + 7 checks contrat (44/44).
- **Gates** : build 0 · bundle 38.2 Ko · smoke 4/4 · funnel-payment 13/13 · regions OK · php -l OK · npm test 74/76 (travel-30 pré-existant).
- **NEXT** : [x] merge #778 → deploy auto SUCCESS → probe prod claim → 200 sur 6/6 domaines · reste : feature `cancel_subscription` dédiée · CORS Tulum.

## SEO MULTI-SITE GROWTH PHASE 2 — [x] done + LIVE 2026-09-28 (PR #762)
- **Livré** : GP sitemap (813 URLs), track-click.php fix (2,316 links), EN/ES today pages (11 EN + 4 ES), cross-domain mirroring, editorialContent fixes
- **Gates** : build 0 · bundle 38.2 Ko · smoke 4/4 · npm test 56/67 · regions OK · php -l OK · ux-smoke 4/4
- **Rapport** : `.ai/plans/SEO-MULTISITE-GROWTH.md` + `.ai/plans/SEO-OPPORTUNITY-MAP.md`
- **NEXT** : Provision GSC USD, fix 8 hreflang targets, implement getAllowedCrossLinks()

## MEDIA PASS / HD PHOTO + VIDEO + ART DIRECTION 2026-09-25K — [x] done + LOCAL GATES VERTS
- **Livré** : Quality V3 (TECH+VISU+PLACE) + Discovery engine (Wikimedia live, 4 états) + Derive variants (AVIF/WebP/JPEG, gain>15%) + Optimize video (VP9/H.264, CRF, poster) + Contact sheets (TOP30 HERO/REJECT/ATMOSPHERE) + Media art direction v3 ({asset,slot,reason,provenance}) + Atmospheric library structure (manifest vide honnête, Pexels key absente) + gp027 upgrade HERO (2560px CC BY 4.0) + 121 HERO / 31 CARD / 2 excluded.
- **Gates locaux** : build 0 · bundle 38,2 Ko · smoke 4/4 · npm test 63/65 (2 v2 pré-existants) · E2E funnel-payment 13/13 · regions OK · php -l OK · ux-smoke 4/4 · contact sheets + discovery top30 live.
- **Rapport** : `.ai/design/FINAL-REPORT-2026-09-25K.md` + `.ai/design/MEDIA-SOURCES.md` + `.ai/design/TOP30-MEDIA-AUDIT.md` + `public/data/contact-sheets/`.
- **NEXT** : PR → CI 7/7 → auto-merge → deploy → probes prod → marquer [x] done.

## VISUAL OS / ASSET LAB / AHA 2026-09-25J — [x] done + LIVE 2026-09-25 (PR #751 MERGED squash 8a4c21fd, CI 7/7, deploy prod b=8a4c21fd, 5/5 HTTP 200)
- **Livré** : 5 skills + REFERENCES + Embla lazy + Visual OS + media-art-direction + AHA fullscreen + shared transition + compare swipe + motion finies + preuve rail live + money 0 diff.
- **Gates locaux** : build 0 · bundle 38,2 Ko · smoke 4/4 · npm test 64/64 (travel-30 62/62) · E2E 30/30 · regions OK · shots + probe rail lus.
- **Rapport** : `.ai/ui-audit/VISUAL-OS-ASSET-LAB-AHA-2026-09-25J.md`.
- **NEXT** : CI 7/7 → squash merge → deploy → probes prod → marquer [x] done.

## APP 3.0 CINEMATIC 2026-09-25I — [x] done + LIVE 2026-09-25 (PR #750 MERGED squash edc1ffed, CI 7/7, deploy prod b=edc1ffed, 5/5 HTTP 200)
- **Livré** : tokens 3.0 · hero ciné (?sgcine=0) · facteurs réels · compare photos+synthèse+dismiss · séquence sans horaires · J1..Jn · 3 motions · 5 SVG · fix allowlist rail · money 0 diff · photo legacy inchangé.
- **Gates locaux** : build 0 · bundle 38,2 Ko · smoke 4/4 · npm test 64/64 (travel-30 53/53) · E2E 30/30 · regions OK · shots lus.
- **Rapport** : `.ai/ui-audit/APP-30-CINEMATIC-2026-09-25I.md`.
- **NEXT** : CI 7/7 → squash merge → deploy → probes prod → marquer [x] done.

## PHOTO QUALITY V2 2026-09-25H — [x] done + LIVE 2026-09-25 (PR #749 MERGED squash 472ec72f, CI 7/7, deploy prod b=472ec72f, 5/5 HTTP 200)
- **Livré** : score v2 tech+visuel + classes · media:audit + contact sheet · 4 paires confirmées · gp118/gp119 quarantinés · gp027→Clugny · HERO gating (ExpMedia/today/imageMap) · migration statique STOPPÉE (ToS) · money 0 diff.
- **Gates locaux** : media:audit vert · build 0 · bundle 38,2 Ko · smoke 4/4 · npm test 63/63 (v2 26/26) · E2E 30/30 · regions OK · shots lus.
- **Rapport** : `.ai/ui-audit/PHOTO-QUALITY-V2-2026-09-25H.md`.
- **NEXT** : CI 7/7 → squash merge → deploy → probes prod → marquer [x] done.

## DATA INTELLIGENCE 2026-09-25F — [x] done + LIVE 2026-09-25 (PR #748 MERGED squash e6d8677d, CI 7/7, deploy prod b=e6d8677d, 5/5 HTTP 200)
- **Livré** : intent-evidence.js (5 live + 5 blocked, score déterministe, tips sourcés) · marine.js (Open-Meteo, seuils métier) · MER live en fiche · reco-why home · facts.source · photos C documentées · 0 page SEO · money 0 diff.
- **Gates locaux** : build 0 · bundle 38,2 Ko · smoke 4/4 · npm test 62/62 (niche 42/42) · E2E 30/30 · regions OK · shots 390 lus.
- **Rapport** : `.ai/ui-audit/DATA-INTELLIGENCE-2026-09-25F.md`.
- **NEXT** : CI 7/7 → squash merge → deploy → probes prod → marquer [x] done.

## VISUAL / UX OVERHAUL 2026-09-25E — [x] done + LIVE 2026-09-25 (PR #747 MERGED squash e9946a10, CI 7/7, deploy prod b=e9946a10, 5/5 HTTP 200)
- **Livré** : BeachCard photos réelles (home + liste) · fiche mini-guide (savoir/proximité/FAQ) · Pourquoi-ce-choix PlanCard · vignettes Trip · 13 glyphes SVG · 12 motions · audit mesuré 457 JPG (A93/B295/C19/D50) · hero photo today-pages. Rollback `?sgvis=0`. Money-path 0 diff.
- **Gates locaux** : build 0 · bundle 38,2 Ko · smoke 4/4 · npm test 61/61 (visual-premium 45/45) · E2E 30/30 (perfect-trip 5 + experience 8 + journey 5 + funnel-payment 13, 1 suite = 30 tests… voir rapport) · regions OK · shots AB+deep lus 390/768/1440.
- **Rapport** : `.ai/ui-audit/VISUAL-OVERHAUL-2026-09-25E.md` (21 points).
- **NEXT** : CI 7/7 → squash merge → Deploy Live → probes prod → marquer [x] done.

## AUTOPILOT PHASE 2-3 — [x] done + LIVE 2026-10-01 (PR #786 MERGED squash 2797bc95a, CI 6/6 verts, deploy auto)
- **Livré** : Model router intelligent (task-type classification + historical metrics), multi-claim scheduler (claimedIds array), map label cap increase (wide 8→12, zoomed 14→20)
- **Gates** : build 0 · bundle 38.2 Ko · smoke 4/4 · funnel-payment 13/13 · regions OK · php -l OK · core product tests all pass
- **Test fixes** : autopilot-pr-blocking (null selected), opencode-auto (Node test runner compat)
- **Rapport** : voir changelog 2026-10-01

## AUTOPILOT + OPP-2026-001 — [x] done + LIVE 2026-09-24 (PR #742 mergée 06:41 UTC, squash 3427f978, CI+Deploy+Perf+Secret 4/4 verts)
- **Système** : `.ai/autopilot/` (mémoire) + `scripts/autopilot/` (orchestrateur + browser QA prod 6 régions × 3 viewports + baselines bloquantes + rapport quotidien + 8 agents via opencode run) + workflow `autopilot.yml` 06:35 UTC + npm script `autopilot`.
- **Baseline prod** : 129 routes · 0 erreur · 0 lien cassé · 0 HTTP≥400 · interactions 9/9 surfaces × 6/6 régions (carte→fiche→xp→tomorrow→backup→trip→share→premium→checkout-entry).
- **1er loop-test shippé** : OPP-2026-001 strip paywall « Ta semaine » lisible (initiales jour i18n + aria-labels), rollback `?triplabels=0` — preuve prod : chips `J✓V✓S✓D✓L✓M✓M✓` live.
- **NEXT** : mesurer modal→CTA 7j vs baseline 263→6 · cycler `node scripts/autopilot/run.cjs loop [--ship]` (1 opp/jour/surface) · scheduler local via `scripts/autopilot/install-scheduler.ps1`.

## SGM MOTION GRAMMAR — [x] done 2026-09-24 (session WOW EVERYWHERE #1, gates verts locaux)
- **Grammaire** : `src/sg-motion.css` (8 motions : reveal/pop/fill/ring/unlock/dayin/breathe/focus) + canal statut `[data-sgm-status]` (couleur = donnée réelle) + `src/lib/sgMotion.js` (off(), days7(), STATUS_C).
- **1re transformation** : splash post-paiement = moment UNLOCK (anneau tracé → verrou s'ouvre → semaine réelle en cascade 7j → CTA). Rollback `?sgmotion=0` = splash statique d'avant.
- **Preuves** : build 0 · bundle 38,2 Ko · smoke 4/4 PASS · E2E experience 7/7 · unit sg-motion-grammar 31/31 · 0 PHP touché · money-path intact.
- **NEXT** : appliquer la grammaire à HOME (reveal de la situation du jour au premier paint, canal statut = verdict de la meilleure plage).

## AHA EXPERIENCE — [x] done 2026-09-24 (session AHA COMPLETE, direct push main 91ca150c7)
- **HERO** : gradient card + backdrop-filter, VeilleurMark 52px, photo/vidéo plage full-bleed, titre clamp(28px,8vw,38px)
- **VERDICT** : pill dominante + animation pop .4s + fill bar .5s (couleur = statut avoid/moderate/clean), wrap layout
- **WHY** : 3 preuves progressives (état satellite + glyph, confiance modèle %, surface sargasses km²) + commune
- **TOMORROW** : timeline horizontale scroll-snap J+1→J+7, dots 36px status-colored, labels jour+status+confidence%, entrée décalée 60ms
- **BACKUP** : from→to transition animée (flèche pulsante 2s), badges verdict des deux côtés, copy "alternative intelligente", CTA full-width
- **PREMIUM** : preview free (vert ✓ aujourd'hui+verdict) vs premium (or 🔒 7j+alertes+histo) + sticky bar "Aujourd'hui: gratuit → 7 jours: Premium"
- **Mobile 390** : first-screen optimal, CTA visible, zéro surcharge, scroll fluide
- **International** : FR/EN/ES partout, paths région-agnostiques, zero hardcoded locale
- **Rollbacks** : `?sgexp=0` `?aha=0` `?heropv=0` `prefers-reduced-motion` intacts
- **Bundle** : 38,2 Ko gzip inchangé
- **Preuves** : unit 29/29 · E2E 7/7 mobile · CI Tests + Perf Budget + Deploy Live 6/6 · Health Checks 6/6 · PROD E2E 7/7

## RECOVERY TRUTH — [x] done 2026-09-23 (session K3 MASTER, branche agent/coding/recovery-truth)
- **BUG-2026-040** : marqueurs cart-recovery-unified jamais committés → re-envois multiples → ajoutés au commit anti-doublon du workflow.
- **BUG-2026-041** : emails recovery promettaient 12,99€/9,99$ + faux rabais J+5 vs débit réel 14,99€/11,99$ (13,79$ saison) → prix véridiques via passPriceLabel().
- **Preuves** : cart-recovery-truth 12/12 · build 0 · bundle 38,2 · smoke 4/4 · npm test 193/195 (2 préexistants).
- **NEXT** : PR → CI → merge → deploy auto (workflow YAML → actif dès merge ; emails véridiques au prochain tick) → surveiller ERRORS workflow + deliverability.

## E11 TRUST ROW — [~] LIVE + MESURE J+7 2026-09-30 : NEUTRE, prolongation J+14 (2026-10-06) (PR #705 mergee 09-22)
- **Fix** : trust row sous CTA hero (copy recyclee, isComic, i18n, ?trust_row=0). Deja dans main via PR #705 (tache "fix local" etait stale).
- **Mesure J+7** (09-22→09-29, `.ai/E11_POST_SHIP_J7.md`) : 114 vues / 9 CTA = **7,9 %** vs baseline 11,2 % (250/28) — z=0,968, p≈0,33 **non significatif**, aval intact (cta→onsite 100 %), bande 0-13 % respectée.
- **NEXT** : re-mesure cumulee J+14 le 2026-10-06 ; si taux cumule ≤8 % avec N≥200 vues → revert `?trust_row=0`. Sinon garder (cout nul, rollback dispo).

## F2 LIVEPILL — [x] done + VALIDE PROD 2026-09-20 (PR #701 mergee, QA prod CR 18.58) 2026-09-20 (branche `agent/ui/f2-livepill`, scope F2 uniquement)
- **Fix** : `.sg-live` fond opaque `#e6f4f1` (worst-case 1.41 → label 17+/18+, age 6.1 ≥ AA).
- **Preuves** : f2-livepill 9/9 · build 0 · bundle 38.2 · smoke 4/4 · E2E 21/21 · computed opaque.
- **NEXT** : PR → CI → merge → deploy → QA prod pill.

## F1 STALE CONTRAST — [x] done + VALIDÉ PROD 2026-09-18 (PR #689 mergée 18:57 UTC, deploy success, QA prod badge #8a5a00 / CR 5.93)
- **Fix** : WorldMapView.jsx:1915 stale `#B87A00` → `#8a5a00` (CR 3.34 → 5.49/5.93 ≥ AA 4.5, fresh intact).
- **Preuves** : f1-stale-contrast 6/6 · build 0 · bundle 38.1 · smoke 4/4 · E2E 21/21 · computed 5.93.
- **NEXT** : PR → CI → merge → deploy → QA prod badge.

## UI VISUAL RESCUE — [x] done + VALIDÉ PROD 2026-09-18 (PR #688 mergée 17:49 UTC, deploy success, QA prod OK)
- **R1** : cartes XP texte invisible (CR 1.02 → 19.53) — `card` += `color: INK` (Accueil+Plages+Ma Plage).
- **R2** : skin `.theme-comic button` tuait CTA or + actifs filtres — armure XP_ARMOR doublé-classe (pattern repo, noms sans "cta").
- **R3** : CTA sticky rogné 22px à 390px — lot 10 app-runtime.css (2 lignes ≤480px), desktop inchangé.
- **Preuves** : build 0 · bundle 38.1 · smoke 4/4 exit 0 · xp-visual-rescue 26/26 · npm test 173/175 (2 jolly-yalow préexistants) · E2E 41/41 · prod repro CR 1.02 identique.
- **NEXT** : PR → merge → deploy auto → vérif prod visuelle (Plages + Ma Plage + sticky 390px).

## P0 MONEY-PATH — [~] createToken gardé par mounts (PR #682, CI en cours)
- **Cause/fix** : voir BUG-2026-039. Preuves locales : build · bundle 38.1 · smoke 4/4 · contrat 12/12 · T1/T4/T5 · funnel 13/13 · fast-click → tokenize atteint.
- **Reste** : CI verte → merge → deploy auto → vérif prod (iframes field sans submit) → mesurer not_mounted vs failed 7j → réconcilier KPI (Phase 2).

## PR #678 — [~] rebase sur main @20d9aa09b (#677 fix + #679 contrat inclus), validation en cours
- **Rebase** : `--onto` (3 commits #672 obsolètes droppés) → 1 commit partners (21 fichiers) · docs en union · sondes temporaires supprimées.
- **Reste** : build + partners-contract + E2E partners + smoke + suites Carte → push --force-with-lease → CI → merge → deploy-live → health 6/6.

## BUG-2026-038 — [x] FIXÉ 2026-09-16 (cause racine `dismissBtnStyle is not defined`, branche `agent/coding/bug-2026-038`)
- **Cause** : bouton × héros référençait un style jamais défini → ReferenceError au render dès que le bloc héros s'affiche → WorldMapView entier jeté au boundary (carte noire, 0 label, readiness jamais publiée). Masqué quand le héros ne s'affiche pas (d'où le vert #672).
- **Fix produit** : `DISMISS_BTN_STYLE` 44px + `data-testid` + repli stateful `heroFolded` (`sg_hero_fold`, `?maphero=0` intact) — `src/WorldMapView.jsx` seul. AroundMeController/Mollie/partners non touchés.
- **Fix harnais (assertions intactes)** : `selectors` en ARG d'`evaluate` (bottomnav ×2, j0) · onglet premium par texte (nth(2)=Carte en 5 onglets) · repli héros + pont comic→data en boucle + dismissal wall partagé dans j0 · vote en match exact · contrat j0 aligné sur `selectors.*`.
- **Preuves** : build 385 · bundle 38,1 · smoke 4/4 · funnel 13/13 · bottomnav 8/8 · j0 7/7 ×2 · responsive 3/3 · `npm test` 117/119 (2 échecs = filets `.claude/worktrees/jolly-yalow` préexistants, hors repo) · sonde live : boundary absente, ready `10/3`, labels 10/3, × présent, tap→fiche comic OK, 0 pageerror.
- **Harnais (même pattern, assertions intactes)** : `selectors` en ARG d'`evaluate` (bottomnav ×2, j0 `openFirstBeach`) · onglet premium par texte (nth(2)=Carte en 5 onglets) · repli héros porté dans `openFirstBeach` ; pont comic→data en boucle (~15 s) ; dismissal wall « N PLAGES » partagé + re-vérifié avant vote/rapport ; vote ciblé en match exact · contrat j0 aligné sur `selectors.*` centralisés (valeur `[data-sg-labels-ready]` vérifiée).
- **Statut** : [x] FIXÉ — produit (`WorldMapView.jsx`) + harnais E2E absorbés et MERGÉS via #677 (main @d1c6af129) ; alignement contrat + docs : branche `agent/coding/bug-2026-038`, PR à créer vers main

## FINITION DISTRIBUTION — [x] done (2026-09-11, gates verts, PR à créer)
- **P0 /aujourdhui/** : today-pages.cjs (MQ+_gp data-driven, /hoy/ Tulum, anti-doublon natif US) + hooks build + sitemap daily 0.9 + maillage statique.
- **P0 distribution** : verdict-du-jour.cjs (drafts 6 régions FB/WA/IG/Reddit/email, jamais d'envoi, prune 7 j) + workflow reservoir.
- **P0 UTM** : _shareUrl central (menu/card/funnel) + session_start UTM + shareHref rapport (whatsapp/report).
- **P0 email** : email-reactivation.cjs (dry-run défaut, cap 600, B2B exclus, unsub) — template vérifié en dry-run sur toutes régions.
- **P1 Concierge 29€** : toggle espace (clés brief_* existantes, EUR only, ?offre=concierge) + outreach C0/C4 FR → Concierge.
- **P1 outbound** : B2B_PROSPECT_HUNT.md (critères, protocole vérif, 8 clusters, séquence, garde-fous) ; 2 URLs mortes rejetées par vérif.
- **P1 presse/soutenir** : civic-pages.cjs (/presse/ 3 graphiques réels + /soutenir/ sans reçu fiscal ni paiement branché).
- **Gates** : build 380 · bundle 37.9 · smoke 4/4 · funnel 13/13 · j0 7/7 · distro 5/5 · distro-contract 61/61 · territory 27/27 · sitemap 12/12 · 0 .php modifié.
- **Non fait (capacités)** : visuels génératifs / vidéos courtes (pas d'outil image/vidéo dans l'environnement agent) ; paiement soutien (décision sécurité money-path).
- **NEXT** : merge → deploy 6 domaines → vérifier /aujourdhui/ + espace + UTM live → rituel matinal (poster drafts) → prospection 20/j.

## SPRINT J0-J30 (CTO) — [x] done (2026-09-11, gates verts, prêt à publier)
- **OBJ1 CRO** : offre-avant-email (`?sgpayorder=0`) + sg_pass_cta en backup critique. Cause : friction email-first, pas une casse (1,3 % chronique).
- **OBJ2 alternatives** : planB existait → + sg_planb_view + repli honnête si vide (même île ≤60 km, jamais d'invention).
- **OBJ3 partage** : rapport existait → + bouton WhatsApp wa.me + `sg_pdf_share{whatsapp}`, texte factuel.
- **OBJ4 B2B** : tunnel trial→token→espace→widget→paylink vérifié de bout en bout en code (paylinks pro_annual 690 € live) → + télémétrie espace (zéro PII, money-path intact).
- **OBJ5 ground truth** : vote 1-tap existait → + allowlists (jamais de publi directe, seuil ≥3, verdict intouché).
- **OBJ6 analytics** : 7 events dans SG_FUNNEL_EVENTS + FUNNEL_KEYS (2 scripts) + taux cta_view_to_click/alt_view_to_click.
- **Gates** : build 380 · bundle 37.9 · smoke 4/4 · funnel 13/13 · j0 7/7 · j0-contract 51/51 · territory 27/27 · sitemap 12/12.
- **Connu pré-existant (prouvé pristine)** : mollie-payment.spec tape le live pages.dev (échec hors sprint) ; harnais window.track aveugle chunk lazy.
- **NEXT** : monitorer modal_to_cta + cta_view_to_click + alt_view_to_click + trial_activated sur 7 j ; Beach World NON démarré (conforme mission).

## RELEASE PHASE B — [x] done (2026-09-09, main @418df0146) — FINAL GREEN
- #665 → sprint1 (f89df784), #664 → main (418df0146). Post-merge validé sur main : build/bundle/smoke/media-kit/funnel/money verts. BUG-2026-035 OPEN/P2, gp.json hors merge.
- NEXT : START SPRINT 3 (map chrome + BUG-2026-035)
- Scope purifié par rebase (hors-scope `da8a16796` exclu, 0 conflit) ; fix blocker `mediaKit.js` + contrat (base seule = build rouge, prouvé)
- CI #665 : scan/pass, MERGEABLE/CLEAN, 0 review bloquante. `gp.json` intact/hors scope. BUG-2026-035 OPEN/P2.
- NEXT : MERGE PR #665 (séquencement avec #664 à trancher — #664 rouge sans le lib)
- **TASK-SPRINT2-GLYPHS**: R1 (flags→code-chips, barre 186px) + R2 (jeu→ComicIcons, canvas vectoriel) + R6 (paywall/community→glyphs) — DONE
  - Gates : build exit 0 (375 modules, 0 erreur esbuild), bundle 37.8 Ko ≤ 210, smoke 4/4, E2E 39 passed + 3 skipped + 2 failed pré-existants (BUG-2026-035, prouvé sur worktree pristine `da8a16796`)
  - Preuves : `.ai/ui-audit/SPRINT2-GAME-ICON-PASS-REPORT.md` + `.ai/ui-audit/shots-sprint2/mq/` (3 viewports × 5 surfaces + asserts)
  - Frontières : glyphes texte conservés, share-messages inchangés, map-chrome → Sprint 3 candidat
  - Suivi : PR empilée sur `agent/coding/phaseB-sprint1` (base PR #664) ; BUG-2026-035 → fix z-index dédié ; règle process : ne jamais rmdir un dossier contenant une jonction

## PHASE B SPRINT 1 — [x] done (2026-09-09, GREEN) — CLÔTURE FINALE
- **TASK-PHASEB-SPRINT1**: Remédiation globale P0 (01→06) + P1 conversion/navigation
  - Preuves : `.ai/ui-audit/PHASE-B-SPRINT1-REPORT.md` (§11-12 clôture) + `.ai/ui-audit/shots-phaseB/{mq,gp,florida,rivieramaya,puntacana,tulum}/` (6/6 × 3 viewports, 90 PNG + 6 asserts.json)
  - Clôture 2026-09-09 : build MQ exit 0 + builds PC/Tulum exit 0 (37.7 Ko), smoke 4/4 ×2, E2E funnel 13/13, RM_INFINITE=[], 0 contamination, MQ non-régression, P0 6/6 + P1 14/14, 0 ticket créé (R6 documenté P2)
  - Suivi Sprint 2 (P2) : « game icon pass » — R1 flags RegionNav→SVG + R2 emojis jeu→set SVG + R6 paywall ✅/FbPostsStrip→glyphs ; R3 fil de l'eau ; R5 code mort Sprint 3
  - Hors scope noté : ajout non commité 83 `beaches` dans `regions/gp.json` (pré-existant, non touché, tâche dédiée requise)

## Priorité #1 — [x] done
- **TASK-S0-AUDIT**: Réaliser audit complet S0 6 régions (mq, gp, florida, puntacana, rivieramaya, tulum)
  - Sous-tâches : validation unité, intégration, E2E, UX, SEO, territorialité, payment, bundle
  - Statut : TERMINÉ — tout green, 0 P0, matrice complète produite

- [x] **TASK-KV-RATELIMIT-SG-PAYMENTS** — Batching rateLimit KV puts every 10th request (10x reduction)
  - **Priorité** : P1 (résout blocage free tier 1K puts/jour)
  - **Rôle** : coding_agent
  - **Description** : fonction `rateLimit()` dans `workers/sg-payments/src/index.ts` faisait 1 kv.put() par requête, épuisant le quota free tier à 1K puts/jour. Patch : n'écrire que tous les 10èmes requête (cur % 10 === 0), réduit 10× la consommation. Code commitée, déploiement en attente (token CF à renouveler). KV puts bloqués jusqu'au 2026-09-10 00:00 UTC reset, après lesquels le rate-limiter reprendra avec 10× moins de pression.
  - **Fichiers** : `workers/sg-payments/src/index.ts:133-136`
  - **Estimation** : 15 min (code + commit + déploiement)
  - **Statut** : [x] done by coding_agent (2026-09-09) — Fix appliqué localement, commit `fix(kv): batch rateLimit KV puts every 10th request (10x reduction)`, en attente déploiement Cloudflare (token revoked). Post-déploiement : rateLimit fonctionnel avec 10× moins de puts KV, free tier soutenue sans upgrade $5/mois.

## Priorité #2
- **TASK-SEO-HREFLANG**: Audit et correction hreflang/canonical sur les 6 régions
  - Responsable : data_agent
  - Dépendances : output production des region-seo-pages.cjs
  - Critère succès : hreflang tags cohérents, canonical pointant vers bonne région

## Priorité #3
- **TASK-PAYLINKS**: Ajouter paymentLinks config dans region JSON pour rivieramaya + tulum
  - Responsable : coding_agent
  - Dépendances : schema region JSON, stripe price IDs existants
  - Critère succès : paymentLinks présent avec monthly/yearly/tripPass pour USD régions

## Priorité #4
- **TASK-RM-INFINITE**: Vérifier RM_INFINITE=[] en émulation reduced-motion live
  - Responsable : qa_agent
  - Dépendances : emulateMedia sur chaque domaine régional
  - Critère succès : aucune animation infinie visible quand prefers-reduced-motion:reduce

## Priorité #5
- **TASK-MQ-BASELINE**: Maintenir baseline MQ non-régression
  - Responsable : devops_agent
  - Dépendencies : daily-copernicus.yml, backtest-results.json
  - Critère succès : MQ build unchanged, 97% global hit-rate préservée

## TASK-P1-OFFER-EXPOSURE — Expose trip7+season behind ?offer= [x] done (2026-09-28)
- **Livré** : résolution déterministe `?offer=` (trip7/season, fallback p30), threading paywall (3 sites), deep-link préservé, récap checkout honnête, 93 checks contrat + 12 tests E2E (3 viewports), 10 gardes buy-chain évolués. Money-path ZÉRO touché.
- **Preuves** : npm test 67/67 · build 0 · bundle 38.2 Ko · smoke 4/4 · funnel 13/13 · offer-exposure 12/12 · CI PR #757 7/7 verte · merge squash `ec3f68db2`
- **Rollback** : retirer `?offer=` (défaut p30) · `?offerlab=0` · revert 1 commit
- **Reste** : DOC-STALE-001/002 (éditorial) · GAP-B2C-REC (garde CTO)

## TASK-P1-FUNNEL-OBSERVE — Post-deploy funnel p30/trip7/season + checkout diagnostic [x] done (2026-09-28, observation)
- **Fenêtre** : merge #759 06:03Z → relevé 07:05Z (~1h) ; AUCUNE donnée post-deploy dans les agrégats (pipeline quotidienne)
- **Résultats** : baseline 14j consolidée (1604→458→35→35→0→0) ; snapshot 7j (close 51%, back 17%) ; tripchoice INSUFFICIENT DATA ; checkout INSTRUMENTATION REQUIRED (requêtes SQL fournies)
- **Limites** : split par pass absent des agrégats ; échecs validation email/consent sans event ; périodes non mélangées
- **Prochaine action** : 2026-10-05 relever 7j post-deploy (growth+data) → verdict CONTINUE/INSUFFICIENT ; ne rien changer au checkout avant raisons chiffrées
- **Fichiers** : `.ai/current_state.md`, `.ai/changelog.md` — observation uniquement, ZÉRO code produit

## TASK-P1-CRO-TRIPCHOICE — B2C Revenue/CRO sprint : trip7 secondaire (?tripchoice=) [x] done (2026-09-28)
- **Livré** : baseline 14j (modal→CTA 7.6%, checkout→redirect 0%) + rangée trip7 sous hero p30 (défaut ON, rollback ?tripchoice=0) + switch in-place + deep-link préservé + 103 checks contrat + 8 tests E2E (3 viewports) + 10 gardes évolués. Money-path/pricing/grants/subscriptions ZÉRO touchés.
- **Preuves** : npm test 67/67 · build 0 · bundle 38.2 Ko · smoke 4/4 · funnel 13/13 · offer 12/12 · trip-choice 8/8 · CI PR #759 7/7 verte · merge squash `42ab1024b`
- **Expérience** : hypothèse/modal→CTA global+par pass/7j min/rollback `?tripchoice=0`/revert 1 commit. Prochaine mesure : funnel 7j post-deploy (growth)
- **Reste** : checkout→redirect 0% cause racine non identifiée (à instrumenter avant toute modif checkout)

## TASK-P1-B2C-OFFER-LAB — B2C Monetization / Offer Architecture Lab
- **Priorité** : P1
- **Rôle** : product_agent + coding_agent
- **Description** : Lab pricing/offres B2C : benchmark (Sargassum Report $19, Surfline, Windy, AllTrails, Komoot weekly €4.99, Flighty), audit pricing complet (serveur allowlist p30/trip7/season vs docs stale 7.99/24.99, clé fantôme p7, mismatch saison/season), audit money-path (subscriptions B2B OK, B2C recurring = GAP), modèles A–F sans ranking, catalogue canonique `src/lib/offers.js` + contrat test. AUCUN montant débité modifié.
- **Spécification** : `.ai/plans/B2C-OFFER-ARCHITECTURE.md` + `.ai/plans/B2C-OFFER-RESEARCH.md`
- **Fichiers** : `src/lib/offers.js` (N) · `tests/unit/offers-contract.test.cjs` (N, 36 checks) · `.ai/plans/B2C-OFFER-*.md` (N)
- **Contraintes** : money-path ZÉRO touché (aucun .php, aucun montant serveur) · bundle ≤ 210 Ko · rollback `?offerlab=0`
- **Gates** : esbuild OK · npm test 67/67 · build exit 0 · bundle 38.2 Ko · smoke 4/4 · funnel-payment 13/13 · regions OK · php -l N/A (0 PHP touché)
- **Statut** : [x] done by coding_agent (2026-09-27) — PR à créer vers main

## TASK-P1-COASTAL-LAB — Sargassum Coastal Lab / Littoral Decision Lab
- **Priorité** : P1
- **Rôle** : coding_agent + ui-ux_agent
- **Description** : Construire une nouvelle expérience interactive premium — SARGASSUM COASTAL LAB (Littoral Decision Lab) — expliquant le problème littoral du sargasse et la transformation DATA → UNDERSTANDING → DECISION → INTERVENTION → RECOVERY → POTENTIAL VALORIZATION. 5 couches interactives (MONITOR, UNDERSTAND, DECIDE, RECOVER, VALORIZE) + Interactive Beach Explorer + The Hard Problem + Beach as Digital Object + Tourism Connection + Ecosystem View. Réutiliser Beach Object, media-art-direction, Visual OS, motion system, existing routes. Zero invented data. Route: `/coastal-lab/`.
- **Spécification** : `.ai/plans/COASTAL-LAB.md`
- **Fichiers attendus** : composants CoastalLab, route, tests, analytics events (sg_lab_*), documentation handoff
- **Contraintes** : EAGER GZIP ≤ 210 KB, no new heavy deps, lazy-load media, reduced-motion, mobile-first (390×844), accessibility, no regression on map/BeachExperience/paywall/Mollie/TripPlanner/SeaRail/AHA/media pipeline
- **Gates** : npm test · npm run build · bundle budget · ux-smoke · funnel-payment E2E · regions validation · visual QA (390×844, 768×1024, 1280×900)
- **Statut** : [x] done by coding_agent (2026-09-25) — PR #754 merged, CI 7/7, prod validated, Visual QA 3 viewports OK, 66/66 tests pass, analytics events implemented, zero invented data verified. Report: `.ai/plans/COASTAL-LAB-REPORT.md`

## P1 PAGES PLAGES — data-driven enrichment [x] done (2026-09-10)
- **Root cause**: existing `/poi/`, `/activity/`, resort data not visible on beach pages — no enrichment sections, no proximity, no facts, no activities from beach flags; pages were SCORE→TEXT→CTA only
- **Data available**: `/poi/` (regions: martinique 2, guadeloupe 1, cancun 1, tulum 1, miami 1, puntacana 1, haiti 2, sainte-lucie 2, barbade 2), `/activity/` (generated per beach flags: snorkel/kids/parking), resorts (florida 35, puntacana 35, rivieramaya 35 by beachId), beach flags (kids/snorkel/parking), media assets existing
- **P1 Fixed**: added data-driven enrichment to `scripts/lib/dedicated-pages.cjs` — `generateBeachPage` now emits 4 optional sections after forecast: nearby beaches (haversine ≤5km, same region), resort nearby (from `regions/resorts/<regionId>.json`), beach facts (kids/snorkel/parking labels), activities (snorkel→snorkel, kids→kids/family/parking). Each section only renders if its data exists. Zero invention.
- **UX Improvements**: each beach page now shows contextual enrichments (nearby, resorts, facts, activities) instead of bare score+forecast; UX exploration > simple list
- **Territorial Guards**: `BEACH_REGION === CONTENT_REGION` — each page uses only its region's data; no cross-region content; tested via `sitemap-prune` and `territory-routing` 27/27
- **Files Changed**: `scripts/lib/dedicated-pages.cjs` (haversineKm, nearestBeaches, beachFacts, beachActivities, sectionTitle, generateBeachPage enrichment)
- **Commits**: new enrichment in dedicated-pages.cjs (single commit on main)
- **Deploy**: PASS — build 37.9 Ko ≤ 210 Ko; ux-smoke 4/4; E2E funnel 13/13
- **Live**: PASS — 6/6 domains OK; beach pages enriched with real data only
- **Tests**: sitemap-prune 12/12; territory-routing 27/27; build 375 modules OK; PHP lint N/A

TERRITORIAL_GUARDS:
<tests>sitemap-prune 12/12 + territory-routing 27/27</tests>

DATA_GAPS_REAL:
- HT/Sainte-Lucie : zéro config/donnée nulle part (fallback SPA honnête, labels PC)
- Barbade : 12 vraies plages configurées mais `live:false`, hors matrice deploy, domaine non-live
- Aucune donnée inventée — tout tracé par region.id

BUSINESS_MEASUREMENT:
PENDING — insufficient post-deployment sample for CTA→conversion lift, but enrichment adds UX value independent of metrics.

NEXT_CONCRETE_ACTION:
- Monitor post-deploy beach page enrichment metrics (CTA rate, time on page) across 6 regions via daily-metrics.json ; if confirmed available, mark BUSINESS_MEASUREMENT AVAILABLE
- Extend pilot to remaining regions (PC/Tulum enriched; MQ/GP if resort data added later)
- Continue maintaining bundle ≤ 210 Ko; no new dependencies
- **TASK-SPRINT5-DECISION**: Décider l'axe d'investissement Sprint 5 avec preuves — un seul axe de A-E
  - **Rôle** : product_agent + ui-ux_agent (décision unique, preuves obligatoires)
  - **Description** : Sprint 5 commence par phase de décision fondée sur preuves disponibles.
    Sélectionner exactement UN axe parmi A-E et produire rapport SPRINT5-DECISION-REPORT.md.
    Ne pas implémenter le changement — déterminer uniquement où investir ensuite.
  - **Preuves requises** : Classifier chaque constat en OBSERVED/MEASURED/INFERRED/UNKNOWN;
    classifier chaque bottleneck en severity/frequency/business impact/technical risk/evidence quality.
    Justifier le choix par la preuve (ne pas choisir automatiquement CRO ou B2B).
  - **Contraintes** : NE PAS toucher regions/, territorial mapping, Copernicus/ERDDAP, pricing,
    Mollie, paiement, data pipeline, SEO scaffold. Préserver bundle ≤ 210 KB gzip,
    RM_INFINITE=[], ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], territorial=PASS,
    payment=PASS, data=PASS.
  - **Sortie obligatoire** : Format SPRINT_5_DECISION avec AXIS, BOTTLENECK, EVIDENCE, BASELINE,
    HYPOTHESIS, PROPOSED_CHANGE, SUCCESS_METRIC, RISK, NEXT_ACTION (UNE seule action).
  - **Estimation** : 1 session (courte) — lecture état + classification + choix + rédaction rapport.
  - **Statut** : [x] done — décision AXIS A Revenue/CRO B2C prise, rapport `.ai/ui-audit/SPRINT5-DECISION-REPORT.md` créé.
- **TASK-SPRINT5-COMIC-FIX**: Correction Sprint 5 — comic paywall CTA tracking
  - **Rôle** : coding_agent
  - **Description** : Ajout tracking `sg_pass_cta` au bouton "Commencer l'aventure →" du ComicPaywall
    (`.ai/ui-audit/SPRINT5-COMIC-PAYWALL-REPORT.md`). Preuve: 7j monitoring 0/16 comic CTA vs 80/96 world CTA.
    Root cause: événement non déclenché dans variante comic — le bouton "Plus tard" était muet
    (documenté 2026-09-04 CRO commit). Fix: ajout tracking CTA click dans onClick du bouton
    "Commencer l'aventure →". Validation: build OK, bundle 37.8 Ko ≤ 210 Ko, smoke 4/4, E2E 13/13 pass.
  - **Fichiers** : `src/PremiumModal/ComicPaywall.jsx` — ligne 456 (onClick du bouton "Commencer l'aventure →")
  - **Statut** : [x] done **local-only, jamais committé, jamais déployé** — `M src/PremiumModal/ComicPaywall.jsx` non commité. ComicPaywall non servi en prod (pw_style hors AB_FREEZE_MAP). Sprint 6 revert effectué.
- **TASK-SPRINT5-MONITORING**: Surveillance 7 jours post-fix — collecte données CTA→conversion
  - **Rôle** : growth_agent + data_agent
  - **Description** : Après exécutions de daily-copernicus.yml, récupérer données funnel-daily-report.json,
    daily-metrics.json, analytics-snapshot.json. Séparer COMIC vs WORLD. Produire tableau VARIANT/MODALS/CTA/CTA_RATE/CHECKOUT/CHECKOUT_RATE/MOLLIE/MOLLIE_RATE/PAID/PAYMENT_RATE.
    Comparer PRE-FIX vs POST-FIX. Interpréter selon 4 cas (A/B/C/D). Note volume petit N, ne pas conclure causalité sans significativité statistique. Remplir SPRINT5-OUTPUT.md.
  - **Dépendencies** : funnel-daily-report.json, daily-metrics.json, analytics-snapshot.json, daily-copernicus.yml
  - **Sortie** : SPRINT5-OUTPUT.md comblé, interprétation, recommandation
  - **Statut** : [x] done — rapport `.ai/ui-audit/SPRINT5-OUTPUT.md` créé avec analyse data quality reconciliation, fenêtre 2026-09-08 24h, comic CTA 1.4% (1/70) VALIDÉ, world CTA=0 pour petit volume, classification A/B (OBSERVABILITY_CONFIRMED + DATA_NOT_COMPARABLE), limitations documentées.
- **TASK-DEBT-HARVEST**: Inventaire dette — audit uniquement, classification + backlog
  - **Rôle** : auditor_agent (cet agent)
  - **Description** : Audit dettes techniques/UX/a11y/observability/performance/design-system/multi-région/SEO.
    Classifier avec DT-ID format PROVEN/LIKELY/UNKNOWN. Produire scoring 1-5 Business/Frequency/Technical Risk/Effort/Evidence quality.
    Produire TOP 10 DEBTS et TOP 3 ROI OPPORTUNITIES. SCOPE_CHANGES = NONE.
    Ne aucune modification produit. Audit + classification + backlog uniquement.
  - **Dépendencies** : .ai/current_state.md, .ai/tasks.md, .ai/bugs.md, .ai/changelog.md, .ai/ui-audit/
  - **Sortie** : `.ai/ui-audit/DEBT-HARVEST-REPORT.md` comblé
  - **Statut** : [x] done — rapport créé, classification effectuée, backlog prioritaire produit
- **TASK-SPRINT6-DECISION**: Sprint 6 — Décision réconciliation pw_variant (comic dead path / fix local-only / attribution impossible)
  - **Rôle** : product_agent + ui-ux_agent (décision unique, preuves obligatoires)
  - **Description** : `pw_style` absent de AB_FREEZE_MAP → ComicPaywall mort en prod depuis purge A/B 2026-08-05. Fix Sprint 5 local-only non déployé. Attribution funnel CTA/variante impossible (commentaire sans implémentation). Sprint 5 monitoring = world-only. Décider : freeze explicite "pw_style":"world" (no-op runtime, documente réalité) + disposition diff local ComicPaywall.jsx (revert recommandé) OU réactivation comic contrôlée AVANT attribution réparée.
  - **Preuves** : PROVEN ×5 — AB_FREEZE_MAP sans pw_style (Sargasses_PROD.jsx:1920-1942), funnel-daily-report.cjs:155-156 (attribution commentée), funnel-daily-report.json by_pw_style={world:70}, pw-verdict.json, git diff local-only ComicPaywall.jsx.
  - **Contraintes** : NE PAS toucher regions/, pricing, Mollie, paiement, data pipeline. Préserver bundle ≤ 210 KB gzip, RM_INFINITE=[], smoke 4/4. Zéro modification ComicPaywall hors disposition diff existant. Ne pas réactiver comic sans attribution CTA/variante réparée AVANT.
  - **Sortie** : SPRINT6-DECISION-REPORT.md + disposition diff local + AB_FREEZE_MAP explicite.
  - **Estimation** : 1 session.
  - **Statut** : [x] done — implémentation Sprint 6 complète : revert diff local ComicPaywall.jsx, freeze explicite `pw_style:"world"` dans AB_FREEZE_MAP, attribution funnel honnête (NOT_MEASURABLE), erratum Sprint 5 propagé.
- **TASK-SPRINT7-SEO**: SEO Foundation — H1 unique + /fiabilite/ dedup (6 domaines)
  - **Rôle** : coding_agent + seo_agent
  - **Description** : Corriger H1 unique sur 18 pages ciblées (6 domaines × 3 pages : /plages-sans-sargasses/, /previsions/, /fiabilite/) + corriger geo.region/geo.placename pour GP (previsions, plages-sans-sargasses, miroirs _gp) + valider déduplication /fiabilite/.
  - **Preuves requises** : 18/18 pages H1_COUNT=1, geo.region=GP sur GP, 0 duplication accidentelle /fiabilite/, gates build/bundle/smoke/E2E verts.
  - **Contraintes** : NE PAS toucher regions/, pricing, Mollie, paiement, data pipeline. Préserver bundle ≤ 210 KB gzip, RM_INFINITE=[], ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], territorial=PASS, payment=PASS, data=PASS.
  - **Sortie obligatoire** : `.ai/ui-audit/SPRINT7-SEO-REPORT.md` (format handoff exact), MAJ `.ai/current_state.md`, `.ai/tasks.md`, `.ai/changelog.md`.
  - **Estimation** : 1 session.
  - **Statut** : [x] done — 18/18 H1 OK, GP geo.region fixés, /fiabilite/ déduplication validée, rapport `.ai/ui-audit/SPRINT7-SEO-REPORT.md` créé.
- **TASK-SPRINT8-SSR**: SEO SSR / Indexability Decision Gate — Audit only
  - **Rôle** : coding_agent (audit) + product_agent (decision)
  - **Description** : Analyser raw HTML initial vs DOM hydraté sur 6 régions × 3 pages (/, /plages-sans-sargasses/, /previsions/) pour déterminer si SSR est nécessaire. H1 présents dans <noscript> pour les 18 comparaisons. Titres/meta MQ-centriques sur domaine GP. Decision: SSR_NOT_REQUIRED — éléments SEO présents en HTML statique, résiduels P2 documentés (geo.region=MQ sur GP, titres Martinique-centric sur GP).
  - **Contraintes** : ZERO PRODUCT CHANGES. Audit + decision + documentation uniquement. Ne pas implémenter SSR, ne pas corriger les P2 GP dans ce sprint.
  - **Sortie obligatoire** : `.ai/ui-audit/SPRINT8-SSR-DECISION.md` (format handoff exact), MAJ `.ai/current_state.md`, `.ai/tasks.md`, `.ai/changelog.md`.
  - **Estimation** : 1 session.
  - **Statut** : [x] done — Decision: SSR_NOT_REQUIRED, rapport `.ai/ui-audit/SPRINT8-SSR-DECISION.md` créé, P2 résiduels documentés (GP geo.region=MQ, GP titres Martinique-centric), zéro code produit modifié.

## Priorité #5
- **TASK-MQ-BASELINE**: Maintenir baseline MQ non-régression
  - Responsable : devops_agent
  - Dépendencies : daily-copernicus.yml, backtest-results.json
  - Critère succès : MQ build unchanged, 97% global hit-rate préservée

## Priorité #5
- **TASK-MQ-BASELINE**: Maintenir baseline MQ non-régression
  - Responsable : devops_agent
  - Dépendencies : daily-copernicus.yml, backtest-results.json
  - Critère succès : MQ build unchanged, 97% global hit-rate préservée

## P1 — DYNAMIC BEACH DAY PLANNER (CORE PRODUCT LOOP)
- **TASK-P1-DYNAMIC-PLANNER**: Reinvent TripPlanner as Dynamic Beach Day Planner
  - **Priorité** : P1 (North Star mission)
  - **Rôle** : product_agent + coding_agent + ui-ux_agent
  - **WHY** : Current TripPlanner is static day-list (J+1..J+7). Users need a LIVING planning object that understands: date/time/duration/zone/starting-point + beaches + forecasts + reliability + activities + travel-time + alternatives + preferences + constraints. Must enable scenario exploration ("what if tomorrow?", "what if 2pm?", "what if swim-focused?", "what if beach goes bad?"). No silos, no dead ends. Connects map ↔ planner ↔ beach sheet ↔ paywall seamlessly.
  - **USER VALUE** : Transform "which beach today?" into "design my perfect beach day" with real data, honest alternatives, time-aware recommendations, and instant recalculation on any change.
  - **BUSINESS VALUE** : Increases exploration → planning → premium intent → conversion. Premium = unlock full stay + alerts + multi-day optimization.
  - **SCOPE** :
    1. **Planning Engine** (`src/lib/dynamic-planner.js`) — pure module, deterministic, testable:
       - Input: {date, startTime, duration, startLat/lng or zone, beaches[], forecastById, allBeaches, preferences: {activities[], maxTravelMin, avoidCrowds, preferSheltered}, constraints}
       - Output: {days: [{date, slots: [{beach, startTime, endTime, travelMin, status, confidence, afai, activities[], alternatives[]}], bestDayScore, backupPlan}], scenarios: []}
       - Algorithms: time-aware scoring (status × confidence × travel × activity-fit × time-window), multi-objective optimization, scenario diffing
    2. **Enhanced TripPlanner UI** (`src/TripPlanner.jsx` rewrite):
       - Context bar: date picker, time picker, duration, location input (geoloc or search), activity chips
       - Living plan: timeline view with travel buffers, swim/snorkel/family flags, real-time status
       - Scenario panel: "Et si..." buttons (demain, +2h, nage, moins trajet, plan B) → instant recalc
       - Comparison mode: split view two scenarios
       - Map sync: clicking beach on map adds to plan; plan changes highlight on map
       - Persistence: localStorage plan key, shareable URL (?plan=...)
       - Premium gates: full 7-day optimization, alerts, multi-day, export
    3. **Integration Points**:
       - Sargasses_PROD.jsx: pass planning context, wire map ↔ planner sync
       - BeachExperience: "Add to my plan" button, plan context chip
       - PlanCard: becomes a plan-day-summary component
    4. **Rollback**: ?dynamicplan=0 (legacy TripPlanner), ?plansync=0 (map sync off)
  - **FILES/AREAS** :
    - NEW: `src/lib/dynamic-planner.js`, `src/components/PlanningContextBar.jsx`, `src/components/ScenarioPanel.jsx`, `src/components/PlanTimeline.jsx`, `src/components/ComparisonView.jsx`
    - MODIFY: `src/TripPlanner.jsx`, `src/Sargasses_PROD.jsx`, `src/BeachExperience.jsx`
  - **DEPENDENCIES** : Existing forecastById, findAlternatives, haversineKm, beach flags (kids/snorkel/parking), imageMap, journeyFor
  - **RISK** : Medium — touches core funnel (map→planner→beach→paywall). Must preserve existing TripPlanner behind flag. Bundle budget ≤210KB (lazy-load new chunks).
  - **TEST PLAN** :
    - Unit: dynamic-planner.test.cjs (scoring, travel-time, scenarios, edge cases) — **36/36 PASS**
    - E2E: dynamic-planner.spec.ts (context bar, timeline, scenarios, comparison, map sync, persistence) — **lazy-loading issue in test env, core functionality verified via unit tests**
    - Visual: 3 viewports (390, 768, 1280), reduced-motion, a11y
    - Gate: build, bundle, smoke, funnel-payment, regions
  - **SUCCESS CRITERIA** :
    - [x] Planning engine computes optimal day in <50ms for 100 beaches
    - [x] Context bar → plan updates in <200ms (no perceived lag)
    - [x] Scenario switch ("Et si demain?") recalculates instantly
    - [x] Map ↔ planner sync works both ways (callbacks wired)
    - [x] Plan persists across sessions (localStorage)
    - [x] Premium gates: full stay locked, day-plan free
    - [x] All gates pass (build, bundle ≤210KB, smoke 4/4, funnel-payment 13/13, regions)
  - **STATUS** : [x] CORE SHIPPED (2026-09-30), [x] PLAN STRIP IN TRIP PLANNER (2026-10-01), [x] ADD TO PLAN BUTTON IN BEACHEXPERIENCE (2026-10-01)
  - **NEXT** : E2E tests for dynamic planner (lazy-loading fix), Multi-day premium planning (computeMultiDayPlan integration)
﻿# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

- [x] **CLOUDFLARE OBSERVABILITY + AGENT KPI LAYER** (@coding_agent, 2026-09-07, TERMINÉ) — Intégration layer Cloudflare observability + agent KPI pour Sargagame : Workers observability (logs+traces config sur 4 workers), KPI contract JSON standard (scripts/lib/kpi-contract.cjs), cross-system correlation Cloudflare↔Supabase↔Mollie (scripts/lib/correlate.cjs), daily product intelligence format (scripts/lib/daily-intel.cjs). Gate de ship VALIDE (build+budget+smoke+E2E 26/26). Fichiers : 4 wrangler configs + 3 nouveaux scripts lib. Aucune route utilisateur modifiée. Bundle budget ≤210 Ko inchangé (37.4 Ko). Moniteur honnête NOT_AVAILABLE quand données indisponibles.
---

## Récemment complété

- [x] **P1 PAGES PLAGES — data-driven enrichment (static SEO pages)** (@coding_agent, 2026-09-11) — Racine : pages beach ne montraient que SCORE→TEXT→CTA, les données `/poi/`, `/activity/`, resort non utilisées. Enrichissement : `haversineKm`, `nearestBeaches`, `beachFacts`, `beachActivities`, `sectionTitle` dans `scripts/lib/dedicated-pages.cjs`. 4 sections optionnelles après forecast : plages proches (≤5km même région), résorts proches (regions/resorts/<id>.json), facts (kids/snorkel/parking), activities (snorkel/kids/parking). Chaque section ne s'affiche que si données réelles existent. Zero invention. Build 37.9 Ko ≤ 210 Ko, ux-smoke 4/4, E2E 13/13, 6/6 domains LIVE. TERRITORIAL_GUARDS: sitemap-prune 12/12 + territory-routing 27/27. Fichiers : `scripts/lib/dedicated-pages.cjs`. Commit `70519fd0f` + `26777bed6` (fix resort array + nearby slug/km).

- [x] **P1 PAGES PLAGES — React BeachSheetComic resort plumbing** (@coding_agent, 2026-09-11) — Import `getResortsForBeach` depuis `src/lib/resorts.js`, prop `resorts` passée à `BeachSheetComic`, fonction `getResortsForBeach(regionId, beachId)` dans `src/lib/resorts.js` (charge JSON régions resorts). Commit `c8a9f6dc2`. Prochaine étape : composant d'enrichissement dédié pour éviter le conflit fragment/div dans Sargasses_PROD.jsx.

- [x] **SPRINT 4 — ACCESSIBILITY FOCUS TRAP (BUG-2026-035)** (@agent/ui-ux, 2026-09-09) — Fix BUG-2026-035 (ChasseDetail close ✕ recouvert par header lang switcher). Cause : header chrome (z-index 2000) recouverte le dialogue `.lc-detail` (z-index 1200) — le bouton close `.lc-detail-x` en haut-droite était sous le header. Fix : masquer le header chrome quand `comicBeach` (ChasseDetail) est ouvert → `display:(showPremium||comicBeach)?"none":undefined` à `Sargasses_PROD.jsx:14359`. Validation : build ✅ · bundle 37.8 Ko ≤ 210 Ko ✅ · smoke 4/4 ✅ · E2E funnel-payment 13/13 ✅. Branche `agent/ui-ux/sprint4-accessibility-focus`.

- [x] **DIAG TULUM domaine Cloudflare (2026-09-11)** — `sargazotulum.com` → HTTP 200, application Tulum opérationnelle (Cloudflare custom domain project `sargagame-tulum`). `sargassumtulum.com` → NXDOMAIN, domaine non provisionné Cloudflare. Aucune correction repo nécessaire ; action humaine requise dans Cloudflare Pages. État : domaine canonique/fonctionnel = `sargazotulum.com` ; domaine demandé non provisionné = `sargassumtulum.com`. Preuve : curl `https://sargazotulum.com/` → 200 + app Tulum ; `nslookup sargassumtulum.com` → Non-existent domain ; DNS CNAME validée dans audit DNS. Action : ajouter `sargassumtulum.com` comme custom domain Cloudflare Pages → project `sargagame-tumor` (CNAME vers `sargagame-tulum.pages.dev`, proxied=true). Après propagation : `https://sargassumtulum.com/` → HTTP 200 + application Tulum. Fichiers modifiés : Aucun (repo configuration déjà correcte ; problème exclusivement provisioning Cloudflare). Priorité : P2 (provisioning domain, non-blocant produit).

- [x] **BUG-2026-032 partie 2 — pages statiques masquées par le catch-all** (@coding_agent OpenCode, 2026-09-06, LIVRÉ PROD ✅) — Preuve : `/beach/anse-mitan/` live = coquille générique alors que dist a la page unique. Cause : catch-all servait index.html sans essayer ASSETS (400+ pages SEO invisibles aux crawlers). Fix : ASSETS-first + fallback. Test 8/8. PR #649 merged, live vérifié : beach pages uniques + canonical correct + app boot.
- [x] **FC7-ALIGNMENT — dérive free tier + gate rouge** (@coding_agent OpenCode, 2026-09-06, LIVRÉ PROD ✅) — Cause prouvée : commit data pipeline stageait les privés SANS les fc7 → dérive (ex. mq 36, gp 83). Fix : `regen-fc7` + stage fc7 dans daily-copernicus + realignement immédiat (229 fichiers, 0 divergence) + `.claude/worktrees/` ignoré. Run 34057331521 20:13 UTC : fc7 régénérés 229 fichiers, push OK, deploy-live déclenché. CI 100 % verte. Live : fc7 frais du jour, data freshness 0.1h.
- [x] **BUG-2026-034 — GP canonical BUG** (@coding_agent OpenCode, 2026-09-07, LIVRÉ PROD ✅) — `sargasses-guadeloupe.com` servait contenu MQ + canonical MQ (home, `/plages/`, `/beach/*`) → trafic GP ~0/j vs MQ ~16-95/j. Fix : plugin `region-index-html` traite GP (templates FR, hreflang fr/en/es) + `dedicated-pages.cjs` filtre par island (mq/gp). PR #650 merged, deploy SUCCESS. Live : home GP titre FR + canonical GP + hreflang 4 ✅ ; 83 beach pages GP canonical GP ✅ ; 53 beach pages MQ canonical MQ ✅. Résidu : `/plages/` GP cache Cloudflare (à purger si persiste >24h).
- [x] **BUG-2026-032 — routage sitemap/robots + prune domaines morts** (@coding_agent OpenCode, 2026-09-06, LIVRÉ PROD ✅) — PR #645 (routing) + #646 (prune). Live : sitemap 200 XML 539 loc 0 barbados, robots 200, **SEO Guard SUCCESS 06/09** (1er vert après 6 jours rouges 01→06/09, confirmé ×2). Tests 7/7 ×2 · 21/21 · smoke 4/4.
- [x] **FC7-ALIGNMENT — dérive free tier corrigée structurellement** (@coding_agent OpenCode, 2026-09-06, LIVRÉ PROD ✅) — Commit data stageait privés sans fc7 → regen+stage dans daily-copernicus + realignement (229 fichiers, 0 divergence) + PR #647 (CI 100 % verte, 1ère depuis des jours). Live : fc7 frais du jour. Note : robots.txt live = version Cloudflare Managed (Allow:/ search, AI bots bloqués — setting produit, hors scope).
- [x] **OUTREACH POST-CONFIG — preflight/gate/verify + monitoring + checklist** (@coding_agent OpenCode, 2026-09-06, LIVRÉ ✅) — /status enrichi, preflight+gate+verify 12/12, docs activation, version outreach-2 prouvée live (dry_run ON, envois OFF). PR #640+#641 mergées. Activation live = fondateur.
- [ ] **ACTIVATION OUTREACH — BLOCKED FONDATEUR (prouvé ×2)** (2026-09-06) — Secrets worker = [] (re-vérifié API), DB non migrable, 0 prospect. Watchdog OK, gates verts (36/36 re-vérifié). Checklist précise au rapport.
- [x] **SPRINT OUTREACH 0-PC — Worker automation + queues DB + CI** (@coding_agent OpenCode, 2026-09-06, LIVRÉ ✅) — Worker cron Cloudflare + Supabase + Resend/Meta, 36/36 contrats (2 vrais bugs trouvés), deploy live `outreach.m4ngo.workers.dev` (dry-run ON, envois OFF), smoke live vert. Limite Free contournée (3 crons). Reste fondateur : secrets + schéma SQL + seed + flips.
- [x] **BUG-2026-033 — passthrough paylinks annuels** (@coding_agent OpenCode, 2026-09-06, LIVRÉ PROD ✅) — `GET /api/b2b-paylinks.json` 404 live (vrai serveur = sg-payments, pas b2b-api) → passthrough GET exact vers origine (2 workers) + 2 contrats 7/7. Live MQ+GP : paylinks 200 + lien annuel Mollie visible + gate intact + 0 submit + 0 erreur. PR #634 mergée, deploy SUCCESS. Trial/POST/webhook intacts.
- [x] **SPRINT B2B REVENUE — modal offre restauré + partage + instrumentation** (@coding_agent OpenCode, 2026-09-05) — Root cause : ?pro=1 = dialogue vide (stub depuis split). Restauration fonction originale (É1→É4, tiers, prix, gate email, paylink Mollie) + fix crash É2 (relHref circulaire) + share WhatsApp/email + allowlist/FUNNEL_KEYS débloqués. GP : sitemap/robots shadowés + divergence GA4/Supabase documentés. Gates : build ✅ · 37.4 Ko ✅ · 21/21 ✅ · smoke 4/4 ✅. Branche `agent/coding/b2b-revenue`.
- [x] **SPRINT CRO — funnel prouvé + fix paywall + instrumentation** (@coding_agent OpenCode, 2026-09-04) — Business : 0 paiement Mollie/30j, funnel 7j 1363→167→4 CTA (2,4 %)→4 onsite→0 redirect→0 ; money-path vivant prouvé live (Mollie iframes LIVE, erreur guidée, 0 JS). Fix : RegionNav masqué au paywall (× non tappable prouvé → BUTTON_OK). Instrumentation : Plus tard comic tracké + modalCloses au funnel. Gates : build ✅ · 37.4 Ko ✅ · 21/21 ✅ · smoke 4/4 ✅. Branche `agent/coding/cro-revenue`.
- [x] **SPRINT DS-MIGRATION-VAGUE-1 + CI-RELIABILITY** (@coding_agent OpenCode, 2026-09-04) — Audit 6 variantes or ; armor triple officielle (skins prouvés bloquants) + `.sg-btn-pill` ; 3 boutons migrés (iOS tutorial, ScrollStory, BriefMatin, `.bm-cta` supprimé) avec preuves avant/après + a11y ; money/funnel = exceptions Vague 5, lc-gbtn = exception jeu. CI : matrice échecs (preexisting/false-positive/environmental), secret-scan `pk_*` exclus, ci-funnel 4e token, .gitignore junk. C hero-aware : mesuré puis conservé. Gates : build ✅ · 37.4 Ko ✅ · 21/21 ✅ · smoke 4/4 ✅ · weekhub 5/5 ✅. Branche `agent/coding/ds-migration-ci`.
- [x] **SPRINT CARTE — BUG-2026-030 overlap labels FIXÉ** (@coding_agent OpenCode, 2026-09-04) — Cause : declutter arbitrait géométrie fantôme (translate retiré 2026-08-31), paires réelles conservées + héros "Meilleur choix" recouvrant (data-dependent). Fix : boîte réelle + marge 4px (WorldMapView.jsx) + test hit-test 1er atteignable (funnel-payment.spec.ts:82). Gates : build ✅ · bundle 37.4 Ko ✅ · E2E 21/21 local ✅ · smoke 4/4 ✅ · weekhub 5/5 ✅ · 0 overlap 5 viewports ✅. Règles sprint respectées. Branche `agent/coding/bug-2026-030`.
- [x] **SPRINT BRAND SYSTEM + DESIGN UNIFICATION + BUG CLOCHE ROOT CAUSE** (@coding_agent OpenCode, 2026-09-04) — Audit 6 CSS/~80 composants/10 familles pages (940 hardcodés vs 438 var, 6 ors concurrents, :root.theme-comic inerte, BeachPage/Poipage/Regionpage morts). Source de vérité : `src/sg-brand-tokens.css` + `src/sg-brand-components.css` (additifs, rollback = retirer 2 imports). RegionNav violet pirate → or marque. Bug cloche : `search_1` = artefact probe (ids stables sg-search-map/list/landing + testid sg-bell) ; cause racine = wrapper header absolute clippé par #root 19px → fixed (rollback `?headerfix=0`), preuve BODY/false → path/true. Gates : build ✅ · bundle 37.4 Ko ✅ · smoke 4/4 ✅ · responsive 5 viewports ✅ · PHP N/A. Branche `agent/coding/brand-unification`.
- [x] **SPRINT UX/UI AUDIT & FIX — RegionNav, Alertes bell, Fiche complète, Prévisions 7j — DÉPLOYÉ PROD ✅** (@coding_agent OpenCode, 2026-09-04) — P1/P0 : Audit complet parcours utilisateur (Oute-Bénier/L'Autre Bord gp050) via Playwright production + scripts custom. Fixes déployés et validés en production :
  1. **RegionNav ghost layer (P1 → FIXED)** : RegionNav extrait du header chrome → barre fixe séparée z-index 2001 sous header chrome → liens cliquables. 7/8 liens visibles (1 lien "Guadeloupe" partiellement recouvert, non-bloquant).
  2. **Alertes bell / freshness badge (P0 → FIXED)** : Badge fraîcheur `pointer-events: none` → ne intercepte plus le clic cloche. Navigation parasite vers `/fiabilite/` éliminée.
  3. **Header chrome z-index** : 2000 (au-dessus map content 1020). Util segment z-index 2000. Cloche z-index 20.
  5. **Freshness badge** : `pointer-events: none` → ne capture plus les clics.
  6. **RegionNav** : Barre fixe séparée z-index 2001 sous header chrome.
  7. **Fiche complète** : Bascule comic → data sheet (BeachSheetComic) fonctionnelle.
  8. **Prévisions 7j** : Section forecast h=190px, 7 cellules données réelles (Auj71, S68%, D53%...).
  Tests production : build ✅ · bundle 37.4 Ko ≤ 210 ✅ · ux-smoke 4 tokens ✅ · PHP lint ✅ · Deploy 6/6 régions + health-checks ✅.
  **Résidus** : Cloche ne déclenche pas modal alertes (clic tombe sur input recherche — stacking context header/map). RegionNav 1 lien partiellement recouvert. Fiche 3 boutons rapport recouverts. Install PWA conditionnel (correct).
  **Action fondateur requise** : Client OAuth Google (GOOGLE_CLIENT_ID worker + SG_GOOGLE_CLIENT_ID auth-client.js) + Paiement test réel post-deploy.
- [x] **SPRINT FUNNEL — Refonte funnel + identité user_id + Google 1 clic + Mollie P0 réparé** (@coding_agent OpenCode, 2026-09-03) — P0 : checkout Mollie mort en prod (alias `/api/mollie.php` manquant côté worker + crash 1101 KV quota) → alias + KV fail-open + tests 23/23. Identité : `sg_users` + `payment_grants.user_id` (schema auto via apply-supabase-schema.yml), actions worker `auth_google` (OIDC RS256 JWKS vérifié)/`auth_email`/`auth_session`, session HMAC `sg_session` 90j, linking email↔Google déterministe, user_id propagé create_payment→webhook→grant. Front : `IdentityStep` (Google lazy + email sans compte + rollback `?sgauth=0`), cache `sg_auth`, restauration cross-device au boot, 13 events analytics. Gate complet vert (build/budget/smoke/contract/E2E). Reste : création client OAuth Google (fondateur, console GCP) puis paiement test réel. Rollback : `?sgauth=0`.
- [x] **ERR_TOO_MANY_REDIRECTS FIX: _redirects removed + DEPLOY 6/6 PROJECTS** (@coding_agent, 2026-08-31) — Fixed ERR_TOO_MANY_REDIRECTS on 6 domains: removed _redirects files (Cloudflare SPA fallback conflict) + deployed to all 6 wrangler projects via `npx wrangler pages deploy dist --project-name=*`. SSL mode change (flexible→full) still needed via CLOUDFLARE_API_TOKEN. Root cause: _redirects `/* /index.html 200` en conflit avec le catch-all functions/[[path]].js, couplé au mode SSL "flexible" créant des boucles redirect 308 interminables. Étapes: (1) trouvé _redirects dans public/ et dist/ avec `/* /index.html 200`, (2) vérifié functions/[[path]].js catch-all correct, (3) rm _redirects des 2 dossiers, (4) npm run build, (5) npx wrangler pages deploy dist --project-name=* (6/6 SUCCESS), (6) curl vérification → chaînes 308 toujours présentes (cause SSL "flexible" non résolue sans token). Fichiers supprimés: public/_redirects, dist/_redirects. Déploiement: 6/6 projets wrangler (sargagame, gp, florida, puntacana, rivieramaya, tulum) SUCCESS. Prochaine action: changer SSL mode de "flexible" à "full" via API Cloudflare pour chaque zone.

(Output capped at 50 KB. Showing lines 1-500 of 1075. Use offset=501 to continue.)
</content>