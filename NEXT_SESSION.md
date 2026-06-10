# NEXT_SESSION — sargagame

*Session précédente : 2026-06-10 (sweep exhaustif 5 régions). **Audit multi-agents (19 agents) + sweep live Playwright sur les 5 domaines → tous les findings critical/high corrigés et poussés le jour même.** Provisioning outils 100 % terminé (run 27255789180 SUCCESS : GA4+Clarity+OneSignal+tokens GSC+SW live partout).*

## 🎯 État cash USD

| Région | Domaine | Site | Payment Links LIVE | Analytics |
|---|---|---|---|---|
| **Punta Cana** | sargassumpuntacana.com | ✅ LIVE complet | ✅ $9.99/$79 | ✅ GA4+Clarity+OneSignal |
| **Riviera Maya** | sargassumcancun.com | ✅ LIVE (ES) | ✅ | ✅ |
| **Florida** | sargassummiami.com | ✅ LIVE | ✅ | ✅ |

- **Aucun paiement USD encore** — réconciliation webhook J+1 à faire (count+sum par région vs tab payments Apps Script). Baseline : 0 USD, funnel payments_real=1/€4.99.
- MRR : €34,93 + 1 paiement détecté hier (10e, €4.99 = 8e client EUR).

## 🔴 Sweep 2026-06-10 — bugs trouvés ET corrigés (poussés)

1. **CRITIQUE — Miami + Cancún affichaient ZÉRO plage** : `island:'fl'/'rm'` ≠ `REGION.id` dans les configs (le front filtre `b.island===REGION.id`). Confirmé live (markers=0). Fix configs + **validation fail-fast regions/index.cjs** (island===id, bbox, beachFilter) → irreproductible région 6+. Vérifié : render local = 12 markers les 2 sites.
2. **Forecast 7j = Math.sin sur les 3 sites USD** : weekly{} pipeline keyé pc001… jamais consommé (BEACH_TO_SARG = MQ/GP only). Fix gated ×4 points + sparkline 30j réactivée.
3. **Site ES en français** : 162 ternaires sans branche es (paywall, CTA, sheet, signalement, push, email modal). Passe `_t(lang,fr,en,es)` complète + SCORE_LABEL_I18N (BON→BUENO) + toggle langue es↔en. Render vérifié : « PLAYAS · 12 LIMPIAS », « BUENO », « HOY/JUE ».
4. **Photos plages fl/rm 404** (hero/vignettes vides) : 36/36 photos Google Places téléchargées (+pc011 El Cortecito, +Maroma qui remplace Bacalar — lagune d'eau douce non crédible). SW v29 ne cache plus les 404.
5. **og:image des 3 sites USD = visuel FR « Martinique & Guadeloupe »** (chaque partage FB/WhatsApp !) : og par région EN/ES généré (`scripts/generate-og-images.cjs` → `regions/og/`, override prepare-ftp, URL stable /og-image.png, 245KB vs 694KB).
6. **Process** : gate full-build 09/21 ≠ cron 0/6/12/18 (nouvelles régions jamais rebuildées en schedule) → 06/07/18/19 ; drip legacy Apps Script supprimé (envoyait du FR aux leads EN/ES, sans filtre unsub, en doublon Resend) ; health checks étendus 5 régions (CI + health-check.cjs) ; fenêtre bulletin weekend 12-13h.
7. **Hygiène** : statiques FR MQ purgés des domaines EN/ES (weekend.html, /en/, a-propos…), manifest sans shortcuts 404, apple-touch-icon=icon-192, deploys nouvelles régions 7,5MB (au lieu de 51MB), timezone Open-Meteo par région, h1 ES, drive «· min» orphelin masqué.

**Non-régression MQ/GP vérifiée** : render local 53 markers FR intact, pw_prelude/EUR/Payment Links inchangés (pw_cta_order tué le 06-09 par ab-evaluate, indépendant). GP 83 markers live.

## ⚠️ À FAIRE (ordre)

1. **Vérifier le deploy CI post-push** : Miami/Cancún carte 12 plages, ES sur cancun, og région servi, SW v29, photos plages. (`node scripts/sweep-live-ui.cjs` fait tout : screenshots + 404 + fuites langue + SW.)
2. **Réconciliation webhook J+1** — endpoints sains (webhook 400 sig invalide, checkout 405 GET).
3. **Secrets OneSignal** : send-notifications.cjs étendu 5 régions code-side ; manquent `ONESIGNAL_API_KEY_{PUNTACANA,FLORIDA,RIVIERAMAYA}` (REST keys : dashboard OneSignal via Chrome user → `gh secret set`). Sans ça, pas de push/brief sur les nouvelles régions (premium vendu = alertes).
4. **SEO pages par région = chantier acquisition #1** : vite.config.js `if (IS_NEW_REGION) return` → les 3 sites USD sont des SPA à 1 URL. Le moteur MQ (543 clk/28j) vient des 136 pages plages. GSC actif depuis hier sur les 3 propriétés.
5. **Backlog sweep** (sévérité moyenne) : stripe-webhook.php `$KNOWN_REGIONS` hardcodé (région 6 = paiements ignorés silencieusement) ; °F/mph florida ; scoreReason phrases FR sur EN/ES ; banks/grid overlays par région (heatmap offshore absente) ; Resend free 1 domaine/100 mails-j (plafond ~100 subs) ; welcome/drip dupes si retry avant commit state ; FTP assets-avant-racine + concurrency group cross-workflows ; Apps Script digest FR/MQ pour tout non-GP ; content/SEO workflows MQ/GP-only (skew versions).
6. **FB amorçage** : re-login 1× `.fb-session-chrome/` (bascule Edge→Chrome), 8 joins en attente, 2e vague (Monitoreo sargazo PC 26K, Hard Rock 22K), retenter post Tips 2026.

## Notes
- Sweep tooling local (non committé) : `scripts/sweep-live-ui.cjs` (Playwright 5 domaines × 2 viewports → JSON + screenshots `.playwright-mcp/sweep-*.jpeg`).
- 522/timeouts transitoires pendant un sweep = throttling de l'hôte mutualisé sous sondes concurrentes, PAS un site down. Re-tester avant de conclure.
- A/B MQ/GP : `pw_prelude` seul vivant (50/50). Ne pas toucher.
- Scripts FB et clé Places : locaux/.env, jamais committés (repo public).
