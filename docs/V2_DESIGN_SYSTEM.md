# Sargagame V2 — Phase 0 : benchmark et design system

Date : 2026-08-02  
Statut : validé pour implémentation V2  
Périmètre : B2C mobile first, carte → fiche plage → verdict → paywall → checkout.

## 1. Intention

Sargagame doit rester le produit du **Veilleur** : chaleureux, direct, un peu
comic, mais assez crédible pour une décision de voyage. La V2 ne remplace pas
la marque existante. Elle resserre l'expérience autour d'une seule promesse par
écran : **voir la situation, comprendre pourquoi, décider quoi faire**.

Le benchmark ci-dessous est une étude de patterns, pas une invitation à copier
une identité visuelle. La règle commune retenue est :

> scan → decide → trust → act

## 2. Benchmark Phase 0 — 24 interfaces premium

| Famille | Interface | Pattern retenu pour Sargagame |
|---|---|---|
| Weather | Apple Weather | état actuel immédiatement lisible, détail progressivement révélé |
| Weather | Windy | timeline et couches puissantes sans masquer l'action principale |
| Weather | AccuWeather | alertes locales, multi-lieux, anticipation pratique |
| Weather | MyRadar | radar compréhensible en quelques secondes |
| Weather | Surfline | décision marine premium : conditions + preuve + contexte |
| Travel | Airbnb | destination d'abord, découverte visuelle, recherche courte |
| Travel | Booking.com | prix et disponibilité visibles, réduction de l'incertitude |
| Travel | Tripadvisor | preuve sociale et préparation du séjour réunies |
| Travel | AllTrails | explorer → sauvegarder → naviguer, détail actionnable |
| Travel | Komoot | contexte de parcours et recommandation située |
| Travel | Citymapper | prochaine action avant l'exhaustivité |
| SaaS | Linear | hiérarchie calme, navigation secondaire moins bruyante |
| SaaS | Notion | divulgation progressive et blocs réutilisables |
| SaaS | Stripe Checkout | confiance, validation en temps réel, mobile et erreurs explicites |
| SaaS | Vercel | promesse courte, preuve technique discrète, forte lisibilité |
| SaaS | Figma | espace principal dominant, outils contextuels |
| Mapping | Google Maps | recherche et bottom sheet comme boucle naturelle |
| Mapping | Mapbox | couches de données élégantes, carte comme produit |
| Mapping | ArcGIS | légende et contrôles de couche explicites |
| Mapping | Waze | signal immédiat et feedback communautaire orienté action |
| AI | ChatGPT | un point d'entrée, réponse progressive, peu de configuration |
| AI | Claude | calme, lisibilité, confiance dans le contexte fourni |
| AI | Perplexity | réponse + sources à proximité, vérifiabilité immédiate |
| AI | Midjourney | galerie et émotion avant la complexité du système |
| AI | Runway | aperçu visuel, statut clair, effet premium sans surcharge |

Sources de patterns : [Windy](https://www.windy.com/subscription),
[AllTrails](https://support.alltrails.com/hc/en-us/articles/44409942124052-Understanding-AllTrails-App),
[Tripadvisor](https://www.tripadvisor.com/app),
[Linear](https://linear.app/now/behind-the-latest-design-refresh),
[Stripe Checkout](https://stripe.com/payments/checkout),
[Google Maps](https://support.google.com/maps/answer/16833938?hl=en).

## 3. Design system Sargagame V2

### 3.1 Tokens

Les tokens sont volontairement peu nombreux pour ne pas créer un second thème
concurrent. Ils prolongent `Themes.css`, `app-runtime.css`, Anton et Bricolage
Grotesque.

| Token | Valeur | Usage |
|---|---|---|
| `--sg-v2-ink` | `#0D0B14` | texte fort, contour, preuve |
| `--sg-v2-paper` | `#FDF6E3` | surface fiche et zones de lecture |
| `--sg-v2-gold` | `#FFC72C` | action primaire, accent premium |
| `--sg-v2-gold-soft` | `#FFE47A` | badge, highlight, focus |
| `--sg-v2-teal` | `#009E8E` | donnée, live, source |
| `--sg-v2-clean` | `#22C55E` | verdict favorable |
| `--sg-v2-check` | `#F59E0B` | vigilance |
| `--sg-v2-avoid` | `#E8522A` | éviter |
| `--sg-v2-radius-card` | `16px` | carte de décision |
| `--sg-v2-radius-sheet` | `26px` | fiche et paywall |
| `--sg-v2-shadow-hard` | `3px 3px 0 #0D0B14` | signature comic, petits éléments |
| `--sg-v2-shadow-soft` | `0 14px 40px rgba(13,11,20,.18)` | surface premium, avec parcimonie |

Échelle d'espacement : `4 / 8 / 12 / 16 / 24 / 32 / 48`.  
Largeur de lecture : `min(100% - 32px, 680px)`.  
Touch target minimal : `44px`.

### 3.2 Hiérarchie visuelle

1. Une seule décision dominante dans le premier viewport : **où aller ou ne
   pas aller**.
2. Le verdict combine toujours couleur, icône et libellé ; la couleur seule
   n'est jamais l'unique signal.
3. La preuve Copernicus est placée près de la décision, pas enterrée en bas.
4. Le CTA primaire est gold, large, verbal et orienté résultat ; les liens
   secondaires sont calmes.
5. L'information B2B reste accessible sans voler le premier geste B2C.
6. Les détails scientifiques et l'historique se dévoilent après le verdict.

### 3.3 Composants V2

- `MapIntro`: promesse courte + contexte région + carte immédiatement visible.
- `MapAction`: recherche/near-me avec une action primaire identifiable.
- `BeachDecisionCard` / `ComicDetail`: nom, statut, score, raison courte,
  dernière mesure et action atteignable.
- `TrustProof`: source, fraîcheur, méthodologie et lien `/fiabilite/`.
- `BeachSheet` (fallback) et `ComicDetail` (fiche par défaut) : scène,
  verdict, preuve, CTA sticky.
- `PaywallOffer`: bénéfice avant fonctionnalité, prix unique, sans abonnement,
  preuve et CTA dans la même surface.
- `CheckoutPanel`: même langage de confiance, sans changer le prestataire ni
  le parcours de paiement.

### 3.4 Motion et interaction

- Entrée de carte/fiche : `180–420ms`, ease-out, une seule direction claire.
- Press CTA : translation comic de `2–3px`, jamais de bounce prolongé.
- Révélation du score : une fois, courte, avec état final stable.
- Aucun mouvement décoratif infini ajouté à la V2.
- `prefers-reduced-motion: reduce` désactive transition, transform et animation.
- Fiche et paywall gardent les quatre sorties : X, Escape, backdrop, swipe.
- Les contrôles actifs ont un focus visible et un libellé accessible.
- La carte ne devient jamais un écran de chargement silencieux : fallback et
  état live restent compréhensibles.

### 3.5 Garde-fous produit/performance

- Aucune modification de `startCheckout`, `payWithWallet`, Mollie ou Stripe
  legacy.
- Aucun nouvel asset image lourd : réutiliser SVG, scènes et composants
  existants.
- CSS global dans `app-runtime.css` pour éviter une nouvelle requête et
  préserver le budget eager.
- Activation V2 réversible avec `?sguxv2=0`.
- GA4 et événements funnel existants conservés ; toute instrumentation doit
  être additive.
- SEO, routes et structure des pages restent inchangés.

## 4. Critères de validation Phase 0

- Première minute : région → plage → verdict visible sans recherche de CTA.
- Paywall : offre, prix, paiement unique, preuve et sortie visibles.
- Checkout : aucun changement fonctionnel, aucune nouvelle étape.
- Mobile iPhone 12 : pas de scroll horizontal, CTA atteignable, texte lisible.
- Desktop : carte dominante sans grand vide inutile, sheet centrée et stable.
- Reduced motion : zéro boucle ajoutée et états finaux immédiatement visibles.
