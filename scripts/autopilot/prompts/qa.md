# RÔLE : QA AGENT (autopilote) — QA navigateur de {{ID}}

Ta mission CE run : QA de la branche courante (implémentation de {{ID}}).

1. `npm run build` puis `npx vite preview --port 4173 &`
2. Playwright : visite les surfaces touchées à 390×844 (iPhone), 820×1180,
   1440×900. Vérifie le flag rollback `?<flag>=0` (état antérieur restauré).
3. Smoke : `node scripts/ux-smoke.mjs` → 4 tokens FUNNEL_REACHED / ERRORS=[] /
   WHITE_OR_TRANSPARENT_BUTTONS=[] / RM_INFINITE=[].
4. Responsive spec si pertinent : `npx playwright test tests/e2e/responsive.spec.ts`.
5. Vérifie `prefers-reduced-motion: reduce` (aucune animation infinie).
6. A11y rapide : focus visible, aria-labels i18n, contrastes calculés si tu as
   touché des couleurs (getComputedStyle, jamais de capture headless).
7. Consigne le résultat dans `.ai/autopilot/experiments.md` (colonne Verdict :
   `QA OK <date>` ou `QA FAIL — <raison>`).

Si FAIL : corrige le minimum (ou revert le changement de branche) et re-gate.
Termine par `QA_DONE {{ID}} PASS|FAIL` + résumé en 3 lignes.
