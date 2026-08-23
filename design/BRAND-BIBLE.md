# Bible de marque Sargasses — v1 (22 juin 2026)

> **« Golden-hour comic, discipliné. »** — on ne réinvente rien : on rend l'identité existante
> (golden-hour BD + Le Veilleur) **plus lisible, plus simple, plus cohérente, partout.**
> Source de vérité visuelle. Complète le skill `sg-design-system` (chargé à chaque session) et
> la mémoire projet `project_brand_bible`. Issue du workflow multi-agents `w8crd78xn` (61 agents,
> 5 directions + jury) puis appliquée écran par écran (jurys + vérif navigateur).

North Star (mandat fondateur) : **plaît à tout le monde · lisible · simple · reconnaissable ·
couleurs constantes · réglé · pro · original mais pas complexe.** Mobile-first 380px, i18n fr/en/es,
reduced-motion = plancher dur, **zéro image/vidéo IA** (tout SVG/CSS).

---

## 1. Polices — grammaire fermée (3 max, 4ᵉ INTERDITE)

| Police | Rôle | Règle |
|---|---|---|
| **Anton** | Accent RARE | Titres MAJ ≤4 mots, ≥22px, **1 seul par écran**. JAMAIS body/bouton/label. |
| **Bricolage Grotesque** | LE PILIER (95% des pixels) | Body, CTA, sous-titres, nav, paywall. Poids **400/600/800** uniquement. |
| **JetBrains Mono** | Chiffres only | Score /100, %, prix, dates, compte-à-rebours. JAMAIS un mot. |

⛔ « Comic Neue » bannie (4ᵉ police non chargée → rendait en Arial). Éradiquée le 22/06.

## 2. Couleur — 1 rôle = 1 valeur

- **OR = action premium, RARE** : `#E8A800` fond CTA · `#FFC72C` accent/halo · `#FFE47A` glow.
  **1 seule surface or pleine par écran = le CTA.** Texte sur or = **TOUJOURS encre**.
- **TEAL = mer / confiance / liens / data propre** : `#009E8E` (texte/trait) · `#1EC8B0` (aplats).
- **Statuts = trio EXCLUSIF couleur + FORME-SVG + MOT** : PROPRE `#22C55E` ✓ · MODÉRÉ `#B87A00` ◐ · À ÉVITER `#E8522A` ✕.
  **R3 : JAMAIS l'or sur un statut** (modéré = ambre, pas un gold).
- **INK** `#0D0D0D` (texte + liseré + ombre) · **PAPIER** `#FDFCF7` · **gris secondaire** `#5A5A5A` (relevé AA).
- **5 « pirates » bannies → remap** : violet `#5B3A8E`·`#241246` → fond sombre/teal · verts `#3FD07F`·`#16A34A` → `#22C55E`/`#009E8E` · teal `#4ECDC4` → `#009E8E` · ambre `#F59E0B` → `#B87A00` · corail drifté `#E8322A` → `#E8522A`.

## 3. Tailles — plancher relevé grand public

`micro 12` (le + petit ; labels/unités) · **`body 15`** (lh 1.55) · `lead 17` · `h3 20` (Bricolage 800) ·
`h2 clamp(24,6vw,30)` (Anton) · `h1 clamp(30,8vw,42)` (Anton) · chiffres = Mono.
**Règle dure : aucune phrase < 15px, rien < 12px.**

## 4. Surfaces — une seule recette

Bord **2.5px solid #0D0D0D** + **ombre DURE 0-blur bas-droite** (jamais molle/blur sur un composant).

| Token | Valeur | Usage |
|---|---|---|
| pop-1 | `2px 2px 0 #0D0D0D` | pills, badges, champs |
| pop-2 | `4px 4px 0 #0D0D0D` | cartes, boutons (DÉFAUT) |
| pop-3 | `6px 6px 0 #0D0D0D` | **UN seul** CTA premium / modal par écran |
| pop-press | `1px 1px 0` + translate(2,2) | état pressé (le « clac » BD) |

Rayons : card 16 / soft 12 / pill 999. Grille espacement **4px** (4/8/12/16/24/32/48). Touch ≥ 44px.
Emojis OS → **pictos SVG mono-trait ink** (les emojis « font cheap »).

## 5. Signature reconnaissable (3 traits, jamais plus)

1. **Liseré-ombre comic** (contour ink + ombre dure décalée).
2. **Pastille-verdict + Le Veilleur** (statut couleur+forme+mot ; le satellite désigne le CTA).
3. **Halftone golden-hour** (trame or ~10%, zones-clés).

## 6. Le Veilleur (mascotte) — inchangé

1 seul objet (le satellite). **Il RASSURE, regarde la MER, ne fixe JAMAIS l'utilisateur.**
3 humeurs couleur+forme+posture branchées `window.setVeilleurScore` (≥70 calme teal/vert · 40-69 scan or · <40 alerte corail). Seul personnage, zéro emoji OS.

## 7. ⚠️ Réalité technique — le thème forcé

L'app tourne sous `src/Themes.css` : **`body.theme-comic`** (défaut, surfaces crème forcées
`!important`) + `theme-dark` (toggle). ⇒ **consomme `var(--sg-*)`**, ne hardcode pas. Pour battre le
skin forcé sur un composant, **classe scopée `!important`** — patterns en place :
`.sg-live` · `.sg-onink-scope` · `.sg-toast` · `.sg-sortseg` · `.bsc-gobtn`.

---

## 8. Journal du programme (10/10 écrans, déployés + vérifiés)

| Écran | Commit | Gain principal |
|---|---|---|
| Quick wins | `0e8c8964` | Comic Neue→Bricolage (capture rendait en Arial) + contraste AA app-wide |
| Liste des plages | `a46d2928` | **+ CTA Premium** (manquait) · statuts trio SVG · scores Mono |
| Recherche + filtres | `90c9bfef` | **+ contrôle de tri** (manquait) · 3 champs fusionnés · chips comic |
| Carte (couleurs) | `7789a76f` | Palette statuts → trio (cohérence) + R3 |
| Header + nav | `d88cef37` | **Bug layout 380px corrigé** · pill EN DIRECT teal · chrome comic · emojis→SVG |
| Carte (chrome) | `14b2d0a8` | Pill teal · 6 emojis→SVG (0 emoji WorldMapView) |
| Modals + Journal | `a9bbbf4a` | 5 pirates purgées · Veilleur humeur data-driven · dé-jargon AFAI |
| États + micro-copy | `ff34da60` | **Toast canonique** `.sg-toast` (tue les `alert()` OS) · Veilleur états vides |
| Capture exit-Veilleur | `63084684` | VeilleurGlyph teal/or · backdrop sans blur · emojis→SVG (A/B + form intacts) |
| Fiche plage | `4bee6d11` | Anton confiné au nom · score Mono · statuts SVG · dé-jargon (A/B fiche-dive intact) |
| Paywall | `8d6f3bb9` | 0 emoji (prix laissés en Bricolage = chaleureux > Mono sur un achat conso) |

Bibliothèque design (mockups standalone) : `design/ui-polish/*.html` + `design/wow-candidates/paywall-*.html` (`c9001137`).
Refonte paywall amont (gagnant jury « world-continuity », passé 100%) : `b7be7d10` → `6ec8f290`.

**Méthode** : délégation agent par écran (mockup + bible + thème) → relecture du diff (grep
logique = 0 ligne touchée) → vérif navigateur perso → commit séparé → deploy auto. Aucune logique
métier/paiement/A-B touchée.

## 9bis. Contraste & thèmes — lisibilité permanente (22/06)

L'app a un **picker de thèmes opt-in** (🎨). Après audit fond-sur-fond (workflow w71fbv5el,
74 cas) : **manga / arcade / sticker RETIRÉS** (illisibles ~1:1) ; picker = **golden · comic · soft**.
Le polish avait été vérifié en comic → les autres thèmes recoloraient `button`/`[class*="cta"]`/`h2`
en `!important` et cassaient. **3 règles pour rester lisible dans tous les thèmes** :

1. **Surface à fond NON-carte (modal sombre, scène, chrome carte)** → lui mettre la classe
   **`.sg-onink-scope`** (neutralise le re-skin des `button` ET `h2/h3` du thème). C'est le CONTRAT.
2. **CTA premium (doit rester OR partout)** → classe **`.sg-paygold`** (Themes.css ; nom sans "cta"
   pour échapper à `[class*="cta"]`, spécificité qui bat `.theme-X button`). Ne JAMAIS laisser un
   thème le repeindre teal/noir/rose.
3. **Texte sur fond clair (papier)** → **ENCRE `#0D0D0D`**, jamais or/teal/vert-clair en texte
   (ils tombent < AA). Blanc seulement sur surface ≥ corail-foncé.

⚠️ Tout nouveau thème ou écran se vérifie **en soft AUSSI**, pas que comic. Commits : remédiation +
retrait `eb582511` ; CTA paywall or-tous-thèmes `bf699e0f` ; CTA capture `234d187c`.

## 9. Reste mineur (non bloquant) & à surveiller

- Laissés exprès : emojis partagés `ST` (app-wide, effet de bord), micro-labels <12px en fiche
  (risque de reflow), pirates dans surfaces hors-périmètre (`satelliteBeats`, `StationStory`, share-cards).
- **À surveiller** : MRR (paywall 100%) + taux de capture (carte exit-intent re-skinnée). Aucune
  logique touchée, mais on garde l'œil. Rollback dispo écran par écran (`git revert`).
- ⚠️ **NE PAS** : rebrand from-scratch · réintroduire « Comic Neue »/4ᵉ police · l'or sur un statut ·
  une 2ᵉ surface or pop-3 par écran · emojis OS.
