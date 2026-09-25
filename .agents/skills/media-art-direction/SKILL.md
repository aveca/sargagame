# Skill: media-art-direction (Sargagame)

> Décide QUEL asset va OÙ, avec QUELLE taille, pour QUEL slot — depuis le
> stock réel uniquement. Implémentation : `src/lib/media-art-direction.js`
> + `photo-classes.json` (HERO/CARD/THUMB/REJECT) + quarantaine.

## Slots (règle d'or : jamais de générique comme photo de lieu)
| Slot | Exigence | Exemples |
|---|---|---|
| `hero` | HERO/CARD, ≥1280px, non exclu | ExpMedia plein-bleed, today 16/9, cine-home |
| `hero_mobile` | HERO/CARD (même master, `object-position` + crop CSS) | hero 390px |
| `card` | CARD/THUMB (≤160px affichés) | BeachCard, plan, trip, proximité |
| `portrait` | **MANQUANT** (documenté, jamais fabriqué) | — |
| `gallery` | **MANQUANT** (1 photo/lieu max aujourd'hui) | — |
| `poster` | = photo du lieu (jamais de stock) | video poster |
| `atmosphere` | **RÉSERVÉ** : média d'ambiance licencié, JAMAIS présenté comme lieu (slot séparé + licence + label). Aucun asset aujourd'hui. | — |
| `reject` | THUMB faible / REJECT / exclu → scène SVG | quarantaine gp118/gp119 |

## Règles
1. **Lieu d'abord** : même-lieu prouvé (nom exact / dHash + distance) ou
   rien. Voisin ≠ lieu (cf. Îlet_du_Gosier ≠ Plage du Gosier).
2. **Classe d'abord** : un 1600px mauvais ne devient jamais HERO.
3. **Séparation PLACE vs ATMOSPHERIC** : tout asset d'ambiance porte
   `license` + `label` (« Ambiance Caraïbes — photo d'illustration ») et
   ne transite JAMAIS par `beachImageUrl`.
4. **ToS Google** : pas de bulk statique (legacy gelé) ; migration = proxy
   ≤30 j + attributions (décision fondateur). Ce skill ne télécharge rien.
5. **Livraison** : `srcset`/`sizes` quand des variantes existent ;
   `loading="lazy"` partout sauf LCP (`fetchpriority="high"`) ;
   `onError-hide` systématique.

## Outils
- `npm run media:audit` → report + contact-sheet (validation humaine :
  TOP50 / WORST / DUPLICATES côte à côte / LOW / MISSING).
- `score-photo-quality.cjs` : technique 50 + visuel 50, déterministe.
