# Infrastructure d'audit automatisé Sargagame

> **Objectif** : Permettre aux agents IA (Nemotron, GLM, MiniMax, Inkling...) d'analyser des résultats **déjà produits** sans consommer de tokens pour piloter le navigateur.  
> **Principe** : Séparation stricte — **capture** (Playwright, Node) ≠ **analyse** (LLM sur JSON/HTML/MD).

---

## Architecture

```
automation/
├── config.mjs              # Configuration centrale (viewports, routes, seuils, sélecteurs)
├── run-all.mjs             # Orchestrateur pipeline complet
├── screenshots.mjs         # Captures multi-viewport, multi-routes
├── audit-ui.mjs            # Audit UI (boutons fantômes, visibilité, overflow, erreurs console)
├── audit-network.mjs       # Audit réseau (requêtes, tailles, erreurs 4xx/5xx, timing)
├── audit-accessibility.mjs # Audit a11y (reduced-motion, contraste WCAG AA, ARIA, landmarks)
├── audit-performance.mjs   # Audit perf (Core Web Vitals, bundle, ressources, médiane N runs)
├── report-builder.mjs      # Génère report.json + report.html + report.md
└── output/                 # Généré à l'exécution
    ├── screenshots/
    │   ├── mobile/
    │   ├── tablet/
    │   └── desktop/
    ├── report.json         # Données brutes consolidées (source unique pour agents LLM)
    ├── report.html         # Rapport visuel navigable
    ├── report.md           # Rapport Markdown (lisible en CLI, diffable)
    ├── network.json        # Détail requêtes/réponses
    ├── accessibility.json  # Détail a11y
    └── performance.json    # Détail perf (médianes + runs bruts)
```

---

## Installation

```bash
# Déjà dans package.json devDependencies
npm install  # installe playwright, sharp, etc.

# Installer les navigateurs Playwright (une seule fois)
npx playwright install chromium webkit
```

---

## Utilisation rapide

### Pipeline complet (recommandé)

```bash
# 1. Build + preview + tous les audits + rapport
node automation/run-all.mjs

# 2. Résultats dans automation/output/
ls automation/output/
```

### Étapes individuelles (développement/debug)

```bash
# Build seulement
npm run build

# Preview seulement (dans un terminal à part)
npx vite preview --port 4173

# Captures d'écran
node automation/screenshots.mjs
node automation/screenshots.mjs --viewport=mobile --route=home
node automation/screenshots.mjs --list  # lister viewports/routes

# Audit UI (boutons fantômes, erreurs console, overflow)
node automation/audit-ui.mjs
node automation/audit-ui.mjs --viewport=tablet

# Audit Réseau
node automation/audit-network.mjs

# Audit Accessibilité (reduced-motion, contraste, ARIA)
node automation/audit-accessibility.mjs

# Audit Performance (Core Web Vitals, 3 runs par route)
node automation/audit-performance.mjs
node automation/audit-performance.mjs --runs=5

# Générer rapport à partir des JSON existants
node automation/report-builder.mjs
node automation/report-builder.mjs --format=html
```

### Mode headed (debug visuel)

```bash
node automation/run-all.mjs --headed
node automation/screenshots.mjs --headed
```

---

## Configuration (`automation/config.mjs`)

### Viewports par défaut
| Nom | Width | Height | DPR | Mobile | Touch | User Agent |
|-----|-------|--------|-----|--------|-------|------------|
| mobile | 390 | 844 | 2 | ✅ | ✅ | iPhone 17 Safari |
| tablet | 768 | 1024 | 2 | ✅ | ✅ | iPad 17 Safari |
| desktop | 1440 | 900 | 1 | ❌ | ❌ | Chrome 120 Mac |

### Routes auditées
| Name | Path | WaitFor | Timeout | Funnel |
|------|------|---------|---------|--------|
| home | `/` | `.sg-maplabel` | 30s | ❌ |
| plages | `/plages/` | `.sg-maplabel` | 30s | ❌ |
| alertes | `/alertes/` | `h1` | 15s | ❌ |
| previsions | `/previsions/` | `h1` | 15s | ❌ |
| faq | `/faq/` | `h1` | 15s | ❌ |
| fiabilite | `/fiabilite/` | `h1` | 15s | ❌ |
| b2b | `/sargasses-pour-hotels/` | `h1` | 15s | ❌ |
| en-home | `/en/` | `.sg-maplabel` | 30s | ❌ |
| es-home | `/es/` | `.sg-maplabel` | 30s | ❌ |
| paywall | `/?paywall=1` | `[role="dialog"]` | 20s | ✅ |
| beach-sheet | `/` (clic label) | `.lc-detail, .sheet` | 15s | ✅ |

### Budgets performance
```javascript
performanceBudgets: {
  lcp: 2500,           // ms
  fid: 100,            // ms
  cls: 0.1,            // score
  fcp: 1800,           // ms
  ttfb: 800,           // ms
  totalJsGzipped: 210 * 1024,  // 210 Ko
  totalCssGzipped: 50 * 1024,  // 50 Ko
}
```

### Reduced-motion
Classes tolérées pour animations infinies (loaders/skeletons) :
- `sg-sk*`, `skeleton*`, `lc-spin*`, `sg-spin*`

---

## Formats de sortie

### `report.json` (source unique pour agents LLM)
Structure consolidée, toutes les données brutes :
```json
{
  "meta": { "generatedAt": "...", "baseUrl": "..." },
  "summary": { "viewports": [...], "routes": [...], "totals": { "ghostButtons": 0, "consoleErrors": 0, ... } },
  "ui": [...],
  "network": [...],
  "accessibility": [...],
  "performance": [...]
}
```
**Les agents LLM ne lisent QUE ce fichier** (ou `report.md` pour un résumé).

### `report.html` (visualisation humaine)
- Cartes résumé (totaux par catégorie)
- Sections pliables par viewport/route
- Codes couleur : ✅ vert / ❌ rouge / ⚠️ jaune
- Détails boutons fantômes, requêtes échouées, animations infinies, problèmes contraste

### `report.md` (CLI / diff / Git)
```markdown
# Rapport d'audit automatisé Sargagame

## Résumé global
| Métrique | Valeur |
|----------|--------|
| Boutons fantômes/invisibles | 0 |
| Erreurs console | 0 |
| Animations infinies (a11y) | 0 |
| Violations budget perf | 0 |

## Audit UI (mobile)
### home (/)
- Boutons fantômes: **0** ✅
- Erreurs console: **0** ✅
- Overflow horizontal: NON ✅
```

---

## Tokens de compatibilité CI (Gate de ship)

Les scripts émettent sur `stdout` les tokens attendus par le Gate de ship (`ux-smoke.mjs`) :

| Script | Token | Exemple |
|--------|-------|---------|
| `audit-ui.mjs` | `WHITE_OR_TRANSPARENT_BUTTONS=[...]` | Boutons fantômes/invisibles |
| `audit-ui.mjs` | `ERRORS=[...]` | Erreurs console filtrées |
| `audit-accessibility.mjs` | `RM_INFINITE=[...]` | Animations infinies sous reduced-motion |

> **Note** : `FUNNEL_REACHED` n'est pas émis (spécifique au parcours funnel complet). Utilisez `ux-smoke.mjs` pour le Gate officiel.

---

## Intégration agents IA

### Workflow recommandé
```bash
# 1. CI/CD ou développeur lance le pipeline
node automation/run-all.mjs

# 2. Agent LLM lit le rapport
cat automation/output/report.json | jq '.summary.totals'
# ou
cat automation/output/report.md

# 3. Agent analyse et propose des corrections
# (sans jamais lancer Playwright)
```

### Exemple prompt pour agent LLM
```
Tu es un agent QA. Voici le rapport d'audit automatisé (report.json joint).
Analyse les violations et propose des corrections priorisées.

Règles :
- Ne JAMAIS proposer de lancer le navigateur
- Base-toi UNIQUEMENT sur les données du rapport
- Priorise : budget perf > a11y > UI > réseau
- Format réponse : JSON { "violations": [...], "fixes": [...] }
```

---

## Dépannage

### `vite preview` ne démarre pas
```bash
# Vérifier port libre
lsof -i :4173
# Tuer processus existant
kill -9 <PID>
# Relancer
npx vite preview --port 4173 --strictPort
```

### Playwright timeout navigation
- Augmenter `timeouts.navigation` dans `config.mjs`
- Vérifier que le build est à jour (`npm run build`)
- Mode headed pour debug : `--headed`

### Budgets performance dépassés
```bash
# Vérifier bundle
npm run build
node scripts/check-bundle-budget.cjs

# Analyser les gros chunks
node automation/audit-network.mjs --route=home
# Regarder topBySize dans network.json
```

### Erreurs console "fantômes" (CSP, PHP, TDZ)
Filtrées automatiquement dans `audit-ui.mjs` (même logique que `ux-smoke.mjs`) :
- Content Security Policy (CI sans domaines allowlistés)
- Refused to connect (analytics bloqués)
- Unexpected token (réponse PHP au lieu de JSON)
- referral_claim, Cannot access 'rt' (bugs connus non-bloquants)

---

## Extensibilité

### Ajouter une route
Dans `config.mjs` → `routes` :
```javascript
{ path: '/nouvelle-page/', name: 'nouvelle', waitFor: 'h1', timeout: 15000 }
```

### Ajouter un viewport
Dans `config.mjs` → `viewports` :
```javascript
{ name: 'mobile-small', width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: '...' }
```

### Ajouter un check custom
1. Créer `automation/audit-custom.mjs` (modèle sur `audit-ui.mjs`)
2. Ajouter dans `run-all.mjs` → `STEPS`
3. Lire dans `report-builder.mjs` → section dédiée

---

## Bonnes pratiques

1. **Toujours builder avant d'auditer** : `npm run build` → `vite preview` → audits
2. **Versionner `report.md`** : commiter pour historique/diff entre PRs
3. **Ne pas modifier `dist/`** : c'est un artefact de build
4. **Un seul `vite preview`** : le pipeline le gère, ne pas en lancer plusieurs
5. **Agents LLM = lecture seule** : ils ne pilotent jamais Playwright

---

## Fichiers liés

- `scripts/ux-smoke.mjs` — Smoke test funnel officiel (Gate de ship)
- `tests/e2e/funnel-critical.spec.ts` — Tests Playwright E2E (parcours utilisateur)
- `playwright.config.ts` — Config Playwright partagée
- `CLAUDE.md` — Doctrine projet (Gate de ship, budgets, interdits)
- `AGENTS.md` — Contrat agents IA (rôles, workflow, handoff)

---

## Commandes utiles

```bash
# Pipeline complet
node automation/run-all.mjs

# Pipeline sans rebuild (preview déjà lancé)
node automation/run-all.mjs --skip-build --skip-preview

# Une seule étape
node automation/run-all.mjs --only=audit-performance

# Debug visuel
node automation/run-all.mjs --headed

# Nettoyer output
rm -rf automation/output

# Voir rapport HTML
open automation/output/report.html  # macOS
start automation/output/report.html # Windows
```