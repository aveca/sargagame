# Design REFERENCES — sources open source (2026-09-25J)

> D'où viennent nos méthodes. On reprend des TECHNIQUES, jamais des styles.
> Licences vérifiées à la date indiquée — revérifier avant tout nouveau
> prélèvement de code (seules les idées ci-dessous sont utilisées, aucun
> code tiers n'est copié dans ce cycle).

| Source | Licence (vérifier au repo) | Usage autorisé | Technique reprise | Élément Sargagame |
|---|---|---|---|---|
| Anthropic `anthropics/skills` → `frontend-design` | Apache-2.0 (repo public) | Adapter la méthode | Itération visuelle rapide, hiérarchie display/body/meta, contraste, densité | `.agents/skills/frontend-design`, couche 3.0 |
| Motion One / Motion (`motion.dev`) | MIT | Étude + usage éventuel | Physique légère, durées 180-500 ms, `backwards`, stagger | Grammaire SGM (réimplémentée sans dep, voir décision) |
| Embla Carousel (`davidjerleke/embla-carousel`) | MIT | **Installée (`embla-carousel-react`)** | Drag + snap + settle, CSS légère, a11y | Compare A↔B (lazy chunk) |
| Rive (`rive-app/*` runtimes) | MIT (runtimes) mais **poids ~100 Ko+** | Évaluée → **rejetée** | Vectoriel temps réel | Aucun (doctrine calme + budget ; SVG statiques suffisent) |
| React Three Fiber (`pmndrs/react-three-fiber`) | MIT | Évaluée → **pas de nouveau usage** | 3D déclarative | `WorldView3D.jsx` existant seul (Three déjà en dep, chunk lazy 135 Ko — ne pas étendre sans WOW prouvé) |
| MapLibre (`maplibre/maplibre-gl-js`) | BSD-3 | Étudiée → **non retenue** | Cartes vectorielles libres | Carte = SVG primaire (choix produit verrouillé ; Leaflet = fallback `?nav=map` uniquement) |

## Décisions dépendances (2026-09-25J)
- **Installée : `embla-carousel-react` uniquement** (~5 Ko gzip, lazy
  chunk compare — zéro eager). Moteur tactile pour UNE surface (compare).
- **Motion lib : NON installée** — SGM + Web Animations API native
  couvrent reveal/swap/sheet/settle/shared-illusion pour ~0 octet.
  Réévaluer si chorégraphie multi-étapes avec timeline le justifie.
- **Rive : NON** — coût runtime injustifié pour du décoratif (doctrine
  calme) ; mascotte = SVG statique (`VeilleurMark`).
- **Three : gelé à l'existant** — `WorldView3D` lazy ; aucun nouveau
  canvas (perf mobile 390px + saveData). Prototype micro-globe : NON —
  pas de WOW proportionné au coût (décision documentée §12).
- **MapLibre : NON** — carte SVG verrouillée (funnel vedette, jamais de
  refacto sans screenshot de régression).
- Budget tenu : eager ≤210 Ko gzip (vérifié `check-bundle-budget.cjs`).
