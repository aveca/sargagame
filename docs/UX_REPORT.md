# Runbook — traiter un rapport d'auto-veille UX (déclencheur fondateur)

> **But** : le fondateur reçoit par mail un digest « [Sargasses] UX : N à corriger ». Il **ne colle PLUS le contenu**. Il envoie un **déclencheur court** et l'agent fait tout, en autonomie (mandat 100 % mobile).

## Déclencheurs reconnus (tous équivalents)

- `/ux` (éventuellement `/ux <url>` ou `/ux mq`/`gp`/`florida`…)
- juste **l'URL du rapport** collée seule
- « traite le rapport UX » / « le dernier mail UX »

Dès qu'un de ces déclencheurs arrive, **exécute ce runbook sans redemander** (mandat fondateur).

## 1. Charger le rapport (source de vérité)

- **URL `http…` fournie** → `WebFetch` cette URL (JSON).
- **Chemin fourni** → `Read`.
- **Sinon** (rien, ou juste une région) → lis le rapport **committé dans le repo** :
  `scripts/automation/data/ux-report.json` — régénéré chaque semaine par `weekly-ux-report.yml`, **toujours présent dans le repo** ⇒ aucun copier-coller nécessaire.

Extrais **en priorité les problèmes NOMMÉS et actionnables** :

```bash
node -e "
const r=JSON.parse(require('fs').readFileSync('scripts/automation/data/ux-report.json','utf8'));
console.log('generatedAt', r.generatedAt);
for(const [k,s] of Object.entries(r.sites||{})){
  (s.issues||[]).filter(i=>i.locatable && /-el\$/.test(i.type||''))
    .forEach(i=>console.log(k,'|',i.type,'|',i.count,'|',i.target,'|',(i.metric||'').slice(0,70)));
}
"
```

- **`dead-click-el` / `rage-click-el`** (`locatable:true`, champ **`target`** = sélecteur CSS réel) = **CE QUI SE CORRIGE**. Le `target` donne l'élément (`svg[role=img]`, `div.sg-onink-scope`…), le suffixe `(world)`/`(home)` la vue.
- **`dead-click` / `rage-click` sans `target`** (`locatable:false`, « page hotspot, element unknown ») = GA4 ne nomme pas l'élément → **non directement actionnables**. Les mentionner brièvement, **ne pas inventer de coupable** (loi « 0 fabrication »).

## 2. Reproduire AVANT de corriger (anti-faux-positif)

Pour chaque `target`, confirme qu'il existe vraiment et mappe-le au composant :

```bash
rg -n "role=\"img\"|sg-onink-scope|<sélecteur>" src/
```

- `svg[role=img]` (world) → `src/WorldMapView.jsx` (fond de carte).
- `div.sg-onink-scope` → un `createPortal(…, document.body)` + classe `sg-onink-scope` (WeekHub / onboarding / feuille portalisée).
- `div` nu → conteneur de la vue concernée.

Clic mort = **clic sans effet** (ni nav, ni mutation DOM). Causes typiques : élément non interactif là où l'utilisateur attend une action ; geste (pan/scroll) compté comme clic ; cible trop petite manquée. Diagnostique la cause réelle avant de coder.

## 3. Corriger — dans la doctrine UX (CLAUDE.md, loi)

- **Jamais de cul-de-sac** : un clic perdu devient productif (rattaché à l'action visée), ouvre un plan B, ou ferme proprement — jamais un no-op silencieux.
- **Mobile-first** : ≥44px, `useSwipeClose`, 4 voies de sortie, `clamp()`, portals hors couche gestes carte.
- **Flag rollback `?xxx=0` obligatoire** (pas de flag = pas de merge).
- **`WorldMapView`** : changer la logique (handlers) est ok ; refacto du RENDU ⇒ screenshot de régression.
- **i18n** `_t(fr,en,es)`, a11y (`role=dialog`, Échap, focus-trap, `prefers-reduced-motion`).

## 4. Gate de ship

```bash
for f in $(git diff --name-only --diff-filter=ACM | grep -E '\.(jsx?|mjs|cjs)$'); do \
  npx esbuild "$f" --bundle=false --log-level=error --outfile=/dev/null || exit 1; done
npm run build && node scripts/check-bundle-budget.cjs
```

Smoke UI (`ux-smoke.mjs`) souvent KO dans le conteneur web (ressources externes bloquées → `ERR_CONNECTION_CLOSED` identiques sur `main` = environnemental). À défaut, **vérif Playwright ciblée** sur le build preview avec le chromium local :
`chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})` (390×844, `hasTouch`) → prouver que le clic mort visé produit désormais une action.

## 5. Livrer + rendre compte

- Branche → commit clair → push → **PR draft** (github MCP, repo `aveca/sargagame`, base `main`).
- Rapport final : `target` corrigés, cause, remède, flag rollback, résultat du gate. Les hotspots `locatable:false` : listés « non nommés par GA4, non actionnables sans tracking nommé ».

## Précédent

- **2026-07-01 — PR #383** : `svg[role=img]` (world) 56 MQ + 11 GP → fond de carte `WorldMapView`. Fix : pan-ghost-click neutralisé + snap à la plage la plus proche (≤90px) sur tap franc dans le vide. Flag `?mapsnap=0`.
