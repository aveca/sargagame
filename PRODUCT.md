# LE VEILLEUR — Produit & Design System (north-star)

> Document fondateur de direction. Créé 2026-06-19 (pivot « trouve LE produit, UX
> fluide, design BD animé »). **À lire en début de session avant tout dev UI.**
> Si une décision UI contredit ce doc → ce doc gagne (ou on met à jour ce doc).

---

## 1. LE PRODUIT EN UNE PHRASE

**Chaque matin, Le Veilleur te dit où te baigner** — un monde **BD animé** qui
transforme la mesure satellite des sargasses en **jeu de cartes à collectionner**.

Ce n'est pas « une carte de données ». C'est **un compagnon quotidien gamifié**.

## 2. LA BOUCLE (le cœur, une seule)

```
Ouvrir l'app
   ↓
🎴 BOOSTER DU JOUR — devine la vedette → 3 cartes-plages se révèlent (série 🔥)
   ↓
🗺️ POKÉDEX — toutes les plages de la région en cartes (collectées / à débloquer)
   ↓
👆 TAPER UNE CARTE → DÉBOUCHE SUR « PLEIN DE TRUCS » (détail in-world) :
     • verdict du matin (BAIGNADE OK / À surveiller / Évite)
     • prévision 7 jours (teaser → premium)
     • accès / familles / snorkeling / distance
     • plages voisines (autres cartes)
     • partage carte
   ↓
💛 PREMIUM = la prévision 7-14j + alerte le jour où ça bascule + brief matin
```

**Règle d'or UX : on ne quitte JAMAIS le monde.** Aucun écran ne doit éjecter
le joueur vers une « autre app ». Tout s'enchaîne comme des **cases de BD**.

## 3. LE BUSINESS (déjà en prod)

- **Abonnement** 4,99 €/mois ou 39,99 €/an (Stripe, live). MRR actuel ~€75 / 15 actifs.
- **Passes one-time** (7,99 / 14,99…) pour les touristes « juste mon séjour ».
- Le **jeu** = rétention (série quotidienne, collection) + acquisition (SEO plages).
- La **conversion** se fait au point de valeur que le gratuit n'a pas : **la prévision
  + l'alerte**. Pas de peur en saison calme → vendre « sache où sera la mer demain ».

## 4. DESIGN SYSTEM — « COMIC-BOOK ANIMÉ / MARVEL » (fin du "design flou")

**Référence-boussole : le clip animé Eminem × Snoop Dogg « From The D 2 The LBC ».**
Énergie = **comic-book Marvel animé** : contours encrés épais, demi-teinte (halftone),
couleurs saturées, **mouvement dynamique** (cases qui claquent, speed-lines, pop, zoom),
poses d'action, onomatopées. Pas statique, pas mou — ça **bouge** et ça **claque**.

Langage visuel unique = **comic-book / ligne claire encrée**, demi-teinte, golden-hour.
Mascotte = **Le Veilleur** (satellite-œil) qui réagit (iris calm/scan/alert) — c'est
notre « super-héros » récurrent à la Marvel.

### Tokens (source unique — déjà dans `.lc-` de ChasseHome.jsx)
```
--ink:   #0d0b14   contours, texte (épais 2.5–3px, ombres portées dures)
--paper: #fdf6e3   surfaces (jamais de blanc pur générique)
--yel:   #ffd23f   action / CTA primaire
--grn:   #27c46b   BAIGNADE OK        --org: #ff8a3d  à surveiller
--red:   #e8322a   évite              --blu: #27a9e3  / --pur: #7b46d6  raretés
fond: halftone (radial dots) + dégradé golden-hour (bleu→ambre→orange)
```
### Typo
- Titres / verdicts / scores : **Anton** (`AntonLC`), capitales, ombre portée 1.5–3px ink.
- Corps : **Comic Neue**.
### Composants (style « case BD »)
- **Bouton** : fond plein coloré, bord ink 2.5px, `box-shadow: Npx Npx 0 ink` (ombre dure BD), léger `rotate(-1.5deg)`. **Jamais** de bouton blanc/transparent nu.
- **Carte (TCG)** : cadre coloré par rareté + foil holo (épique/légendaire), illustration golden-hour, Veilleur.
- **Surface/panneau** : `--paper`, bord ink, ombre dure, coins arrondis 9–14px.
### Animation (« animé »)
- Entrées : `pop-in` (scale .55→1, cubic-bezier overshoot), stagger pour les séries.
- Booster : éventail séquentiel + flash + halo doré (légendaire).
- Transitions d'écran = **transitions de case BD** (slide/wipe court, jamais de fondu mou).
- **Respecter `prefers-reduced-motion`** (plancher statique partout).

## 5. ANTI-PATTERNS À TUER (sources du "fragmenté / flou / lent")

1. ❌ **Les ~39 A/B en parallèle** → mosaïque incohérente. On fige UN parcours.
   (Accueil déjà unifié 19/06 : arène par défaut, `home_az` off.)
2. ❌ **L'app sombre « satellite qu'on scrolle »** (HeroVerdict) — le fondateur en a
   marre. Remplacée par l'arène + détail in-world. Reste à purger des bras morts.
3. ❌ **Le paywall blanc générique** (cards blanches sur vert sombre) — **MOCHE, à
   refaire en BD** (next, voir §6). Paiement Stripe à NE PAS casser.
4. ❌ **Styles inline éparpillés** → pas de design system. Migrer vers `.lc-` tokens.
5. ❌ **Lenteur** : trop d'animations infinies simultanées → `content-visibility` sur
   les listes, foil seulement sur cartes possédées/visibles.

## 6. ROADMAP (ordre de priorité, tout réversible + flag-gated si revenu)

- [x] Accueil unique = arène (19/06)
- [x] Détail plage in-world comic (19/06)
- [x] Couleurs rareté + paliers + tension du pull (19/06)
- [ ] **Détail-carte « débouche sur plein de trucs »** : prévision 7j teaser, plages
      voisines, partage — EN COURS.
- [ ] **Refonte paywall en BD** (reskin du `PremiumModal` au niveau tokens, garder
      `startCheckout`/`startTripPass`/plans/EUR/source intacts). MOCHE aujourd'hui.
- [ ] **Transitions de case BD** entre booster → détail → premium.
- [ ] Purge des A/B morts (paywall : ~25 flags non concluants à ce trafic).
- [ ] Mascotte Le Veilleur enrichie (réactions, micro-anim).

## 7. RÈGLES DE TRAVAIL (qualité)

- App **buildée** + vrai input ; vérifier au **screenshot Playwright mobile WebKit**
  (`/tmp/journey.mjs` copié en `_journey.mjs` dans le repo pour résoudre playwright).
- ⚠️ Captures headless peuvent fuiter `forced-colors` → juger couleurs via computed styles.
- **Jamais de WIP montré au fondateur** ; ship derrière flag si ça touche le revenu.
- Le paiement Stripe est **sacré** : reskin visuel OK, logique de checkout NON touchée.

## 8. INVENTAIRE DES ÉCRANS & CONNEXIONS (checklist du build « tout cohérent »)

Parcours-or (conversion) = **Splash → Onboarding → Arène → Détail carte → Paywall →
Paiement → Onboarding payant**. Chaque écran doit être 100% monde comic + animé +
**connecté sans éjection**. État :

| # | Écran | Fichier | Comic ? | Connexion |
|---|-------|---------|---------|-----------|
| 1 | Splash | `ArenaSplash` (Sargasses_PROD) | ✅ (Veilleur/pow/Anton) | → Onboarding |
| 2 | Onboarding 3 étapes | `src/ArenaOnboarding.jsx` | ✅ (fidèle arena.html) | → Arène |
| 3 | **Accueil = Arène** | `src/ChasseHome.jsx` | ✅ booster+dex+FX | → Détail / Paywall / Carte |
| 4 | **Détail plage in-world** | `ChasseDetail` (ChasseHome) | ✅ verdict+score+facts+7j+VOISINES+speed-lines | → Paywall / voisines / Fiche complète |
| 5 | **Paywall** | `PremiumModal` (Sargasses_PROD) | 🟡 partiel (plan cards/CTA/garantie/timeline/halftone) | → Paiement / close |
| 6 | Paiement on-site | `PayStep` overlay (PremiumModal) | ⚠️ à auditer | → succès → onboarding payant |
| 7 | Onboarding payant | `src/PaidOnboarding.jsx` | ⚠️ style data (Bricolage, rgba translucides) | → Arène premium |
| 8 | **Carte** | `src/WorldMapView.jsx` | ✅ golden-hour pour tous | pins → (encore fiche data, à router vers détail comic) |
| 9 | Fiche plage data complète | `BeachDive`/`BeachSheet` | ⚠️ autre style (« scroll satellite » que le fondateur déteste) | depuis « Fiche complète » + pins carte |
| 10 | Liste plages | `BeachListView` | ⚠️ (souvent recouverte) | → Détail |
| 11 | Feedback | (Sargasses_PROD) | ⚠️ | overlay |

Mascotte **Le Veilleur** : ✅ clignement comic steppé (arène + détail).

**Prochaines passes (ordre) :** (7) onboarding payant en comic (rapide, contenu) → (6) paiement on-site → finir variants paywall (scene/constel headers) → (9) fiche data OU router pins carte → détail comic (au lieu de la fiche data) → transitions de **case BD** entre écrans top-niveau.
**Anti-régression :** chaque écran vérifié au screenshot mobile WebKit + scan boutons blancs (`_journey.mjs`), checkout Stripe jamais touché, tout réversible.
