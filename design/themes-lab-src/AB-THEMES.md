# A/B THÈMES — plan & résolution 24h

## Thèmes disponibles (in-app, opt-in)
golden (contrôle, app d'origine) · comic/TCG · manga N&B · arcade néon · sticker kawaii.
Sélection : picker flottant 🎨 (tous les visiteurs) · `?theme=<id>` · alias `?comic=1` · `?themes=0` masque.
Défaut = golden → **aucun skin forcé** (le tunnel premium reste l'app d'origine pour qui ne choisit pas).

## A/B live : `theme_nudge` (control vs nudge) 50/50
- **Hypothèse** : faire « pulser » le picker (arm `nudge`) augmente l'ADOPTION des thèmes
  (vibe jeu) **sans** dégrader la conversion premium.
- **Events trackés** (funnel Apps Script) :
  - `ui_theme_view {nudge}` — exposition (1×/session au mount).
  - `ui_theme_pick {theme,nudge}` — adoption (clic sur un thème).
  - `premium_modal_cta` / `premium_modal_redirect` — garde-fou conversion.
- **Métrique primaire** : taux d'adoption = `ui_theme_pick / ui_theme_view` par arm.
- **Garde-fou** : `cta_rate` du gagnant >= 90 % du `cta_rate` control (sinon on garde control).

## Résolution à ~24h (automatisable)
`node scripts/resolve-theme-ab.cjs export-events.json` applique la règle :
- attendre >= **24h** ET >= **200 vues/arm** ;
- **ship:nudge** si adoption(nudge) − adoption(control) >= **2 pts** ET conversion préservée ;
- **keep:control** si nudge dégrade la conversion ou n'aide pas ;
- sinon **inconclusive** → prolonger.
Sans argument, le script imprime la règle (doc exécutable / dry-run).

## Étape suivante (sur GO fondateur)
Passer d'un A/B d'ADOPTION (opt-in, sûr) à un A/B de CONVERSION (distribuer un skin, ex. comic,
à X % des visiteurs y compris paywall) = changer `abVariant("ui_theme",[...],[poids])` dans
`Sargasses_PROD.jsx` (1 ligne). Non activé tant que le skin in-app n'est pas validé écran par écran
(le tunnel paiement notamment). La refonte illustrée ARENA v2 doit d'abord être portée in-app.
