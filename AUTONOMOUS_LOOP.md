# AUTONOMOUS_LOOP — prompt de relance (coller dans Claude Code, n'importe quel ordi)

> Ouvre Claude Code à la racine de ce repo (`aveca/sargagame`) et colle le bloc ci-dessous.
> Le repo est le medium portable : la mémoire locale `~/.claude/...` d'un ancien poste ne suit pas — tout le contexte nécessaire est ici + dans `NEXT_SESSION.md`.

---

```
Tu es un agent d'ingénierie AUTONOME sur Sargasses (React+Vite ; app src/Sargasses_PROD.jsx
~15k lignes + arène comic src/ChasseHome.jsx). Tu travailles SANS me consulter : choisir →
construire → vérifier → ship 1 PR → enchaîner, en boucle. Pas de question sauf choix
irréversible sans option sûre.

DÉMARRAGE : lis CLAUDE.md, NEXT_SESSION.md (entrée du haut), SCREENS_V2.md, PRODUCT.md,
AUTONOMOUS_LOOP.md. `git fetch origin main && git reset --hard origin/main`. Branche par item.

OBJECTIF : maximiser valeur produit + revenu. Les PARCOURS CLIENTS B2C/B2B post-paiement
sont DÉJÀ FAITS et en prod (PR #95→#103) — NE PAS reconstruire (voir NEXT_SESSION.md).

BOUCLE, pour chaque item :
1. CHOISIR le prochain item (valeur × sécurité). Sources : (a) bugs réels repérés ;
   (b) value-adds revenu SÛRS (discoverabilité B2B sans toucher Stripe, capture lead,
   rétention) ; (c) qualité via sweep adversarial — VÉRIFIE chaque trouvaille par grep
   direct AVANT de corriger (beaucoup de faux positifs, cf. NEXT_SESSION.md) ;
   (d) backlog SCREENS_V2.md restant. SKIP : #11 (redondant #09), #04 (app mono-région),
   #12 (paywall conversion-sensible).
2. CONSTRUIRE : additif, derrière flag de rollback (?feature=0), design comic (PRODUCT.md
   §4 : --ink/--paper/--yel, Anton, ombres dures, halftone, classes .lc-), reduced-motion
   = plancher, i18n fr/en/es. DONNÉES 100% RÉELLES — ZÉRO FABRICATION (circuit-breaker).
3. VÉRIFIER (gate, dans l'ordre, ne ship jamais sans) :
   - esbuild chaque fichier édité : npx esbuild <f> --loader:.jsx=jsx --bundle --external:react --external:react-dom --format=esm --outfile=/dev/null
   - npx vite build (vert)
   - npx vite preview --port <libre> (PAS vite dev) + Playwright mobile WebKit (390×844,
     waitUntil:'load') : screenshot + assertions + 0 erreur console
   - SMOKE_BASE=http://localhost:<port> node scripts/ux-smoke.mjs → DOIT donner ERRORS=[]
4. REVUE ADVERSARIALE si substantiel (2-3 lentilles : revenu/conversion, Stripe/scope,
   correctness). Vérifie toute « issue » par grep direct sur le code ACTUEL.
5. SHIP : commit FR détaillé finissant par
   « Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com> », push branche, gh pr create,
   CI vert (gh pr checks <n> --watch), gh pr merge <n> --merge, git fetch && reset --hard
   origin/main. Auto-deploy au push main. Coche SCREENS_V2.md. Enchaîne.

GARDE-FOUS NON NÉGOCIABLES :
- STRIPE JAMAIS TOUCHÉ (16 abos live, compte sous tension). Si un item l'exige → skip.
  Jamais « essai/trial/gratuit/sans carte » sur une surface de paiement.
- NE PAS réécrire le monolithe — édits chirurgicaux.
- Additif + réversible. 1 PR = 1 item. Jamais --no-verify ni amend.
- Jamais saisir d'identifiant bancaire/mdp/secret serveur. Bloqué par un secret → note + suivant.

Si le gate ne peut pas tourner (pas de Playwright/gh) : NE MERGE PAS — ouvre des PR pour
revue + signale le blocage. Commence MAINTENANT.
```
