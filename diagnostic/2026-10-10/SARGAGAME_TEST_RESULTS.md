# SARGAGAME_TEST_RESULTS — 2026-10-11

Environnement : Windows, Node v24.14.0, npm 11.9.0, Playwright 1.62.1, PHP 8.4.22 CLI. Preview local : `vite preview` :4173 (200 OK).

| Commande | Sortie | Verdict | Log |
|---|---|---|---|
| `npm test` (`scripts/run-tests.cjs`) | exit 1 — **174/220 OK**, 1 échec = `tests/unit/wow-unlock-transition.test.cjs` (fichier untracked local, absent d'origin/main ; hors périmètre produit) | PARTIAL (produit : 219/219 fichiers trackés OK) | `logs/unit-tests.log` |
| `npm run build` | exit 0 | PASS | `logs/build.log` |
| `node scripts/check-bundle-budget.cjs` | exit 0 — **206.4 Ko ≤ 210 Ko** (206.5 Ko après fix) | PASS | `logs/bundle-budget.log` |
| `php -l` 37 fichiers `public/api/**/*.php` | 37/37 OK | PASS | (résumé console) |
| `node scripts/ux-smoke.mjs` (preview) | exit 0 — `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]` (après fix : idem) | PASS | `logs/ux-smoke*.log` |
| `npx playwright test tests/e2e/funnel-payment.spec.ts tests/e2e/money-path-regression.spec.ts` (avant fix) | exit 1 — 4 échecs (T1 sélecteur obsolète, T4 contrat produit MP-2, T5 régression réelle MP-1, funnel harnais `window.track` inexistant), 3 passed, 3 fixme | PARTIAL | `logs/playwright-funnel.log` |
| `npx playwright test tests/e2e/money-path-regression.spec.ts` (après fix MP-1) | exit 1 — T5 **PASS** ; T1/T4 = harnais/décision produit ; 3 fixme | PARTIAL (cible T5 réparée) | `logs/playwright-money-after-fix.log` |
| Probe P0 local `?pass=p30` sans session_id | `sg_premium_pass_end` posé, pass actif, 0 erreur JS bloquante | Défaut MP-2 confirmé (design/hardening à trancher) | `probes/p0-pass-grant.cjs`, `screenshots/local-pass-p30-no-session.png` |
| Probe prod 6 domaines (Playwright) | voir `SARGAGAME_SITE_MATRIX.md` | PASS sauf Tulum/ApplePay/CSP | `logs/prod-walk.json`, `screenshots/prod-*` |
| HTTP/TLS 7 domaines | 6× 200 (+redirections saines), barbados DNS absent (staging, attendu) | PASS (6/6 prod) | console |
| Re-run `npm test` après fix | 174/220 (inchangé) | PASS (γ régression 0) | `logs/unit-tests-after-fix.log` |

Paiements sandbox : parcours Mollie exécuté UNIQUEMENT via mocks in-page (E2E T1-T6). Aucune session de paiement réelle, aucun email réel, aucune donnée client créée.

Certification finale : voir tableau dans le message de clôture (PHASE 7).
