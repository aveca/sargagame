# UI findings — screenshot par screenshot (Phase A, 2026-09-08)

> Chaque finding est testable (sélecteur/mesure/repro). IDs stables pour la Phase B.
> Captures : `.ai/ui-audit/shots/`. Métriques : `manifest.json` + `audit2.json`.

---

## 390-home-initial — MAP (P1)

1. HIÉRARCHIE : deux cartes pleines se chevauchent au centre (« 45 plages propres » + « OÙ TE BAIGNER / MEILLEUR CHOIX 86 Grande Anse du Carbet ») + labels carte en dessous → trois couches texte concurrentes au même point.
2. LISIBILITÉ : titre fiche héros et labels illisibles par superposition (ex. « Grande Anse du Carbet » traverse « Anse L'Étang MODÉRÉ »).
3. CONTRASTE : pastilles carte OK en isolation ; dégradé par le chevauchement, pas par la paire couleur/fond.
4. TYPO : H1 32px + H2 24.96px + Anton héros — 2 display concurrents dans le même viewport.
5. BOUTONS : header 7×44px OK ; BottomNav 63-74px OK ; labels carte 44px h OK (largeur variable).
6. NAVIGATION : position claire (carte MQ, BottomNav Carte actif) ; suite (« tap pin ») évidente.
7. ESPACEMENT : zone centrale 300-550px saturée (2 cartes + pins + labels).
8. STRUCTURE : header / RegionNav / hero / carte / day-strip / BottomNav — structure saine, collision hero↔carte.
9. DENSITÉ : 53 labels affichés simultanément à 390px → bruit de fond élevé.
10. SCROLL : aucun (scrollH=844=viewport) — le contenu sous fold n'existe pas, pas de discoverability manquante.
11. A11Y : 7 boutons header nommés (aria-label) ; labels carte = boutons (focusables, 60+ tab stops — verbeux au clavier).
12. MEDIA : carte SVG + Veilleur + yole rendus.
13. MANQUANT : rien de fonctionnel.
14. CONFUS : quelle carte est « la » réponse ? 45 plages (quantité) vs 86/Grande Anse (recommandation).
15. INTENT : « où me baigner aujourd'hui ? » — servi 2× en concurrence.
16. CTA : Voir → (fiche héros).
17. NEXT : fiche plage.
18. SEVERITY : **P1** (MAP-01 : chevauchement hero-cards ↔ labels/pins, 390+1440).

## 1440-home-initial — MAP (P1, mêmes + spécifiques desktop)

1-14 : identiques au 390 (double carte, chevauchements). Spécifiques : badge « DONNÉE EN RETARD il y a 3 j » chevauche la barre « Chercher… » (MAP-02) ; règle d'échelle « 1 km » chevauche la rose des vents ; BottomNav en pilule centrée flottante au-dessus d'un bandeau noir (jambe visuelle) ; day-strip Auj/+5j centré sans label de section.
18. SEVERITY : **P1** (MAP-01) + **P2** (MAP-02 : badge recherche, échelle/compas).

## 390-list-view / verify — LISTE (P0)

1. HIÉRARCHIE : aucune — vide noir entre RegionNav et BottomNav.
5. BOUTONS : BottomNav « Plages » actif (état correct) mais contenu absent.
7. STRUCTURE (mesurée) : lignes liste présentes en DOM (bouton « MEILLEURE AUJOURD'HUI… » top=153 h=104, fond blanc texte noir, `visibility:visible`) mais **clippées par un ancêtre `position:absolute` h=19px** → `#root` effondré à 19px (`body.theme-comic`, marqueur MINE-ROOT-RELATIVE connu) + `elementFromPoint(195,400)=BODY`.
10. SCROLL : aucun scroll possible (rien à scroller).
15. INTENT : « parcourir/comparer les plages » — impossible.
18. SEVERITY : **P0** (LST-01 : onglet Plages = vide noir sur 390/768/1440 présumé — reproduit 3/3 captures 390 ; DOM prouve le contenu, le paint est clippé). Cause candidate : la vue liste rendue **dans** `#root` effondré au lieu d'un portal/`fixed` (carte et sheets utilisent `fixed`/portal et s'affichent). À confirmer dans le code Phase B.

## 390-sheet-initial — BEACH SHEET comic, Plage des Salines (P1/P2)

1. HIÉRARCHIE : identité (Plage des Salines) → statut (À SURVEILLER) → preuve fraîcheur (satellite il y a 3 j) → Pourquoi ce verdict ? → score 72/100 → chips → CTA 7 jours → odeur → Partager/Fiche complète. Ordre globalement bon.
2. LISIBILITÉ : bonne au premier écran.
5. BOUTONS : CTA 354×54 (≥44 ✓) ; chips 44px h ✓ ; **✕ fermeture 32×46 à top=-4** (largeur <44 + partiellement hors viewport) → SHEET-02 **P1**.
7. ESPACEMENT : sain.
11. A11Y : `role=dialog` présent (dialogs=1) ; Échap à vérifier Phase C sur sheet.
13. MANQUANT : photo/vidéo de la plage (preuve visuelle — voir asset-map) ; distance/temps d'accès.
18. SEVERITY : **P1** (SHEET-02) ; le reste P3/polish. Détail exhaustif : `beach-sheet-audit.md`.

## 390-sheet-mid/lower — SHEET scroll interne (P1/P2)

- Contenu riche et lisible : signalements terrain (Propre/Modéré/Beaucoup ≥44px), divergence signalée honnêtement (« Signalements terrain divergents 0.84 » — moat visible), alternatives TCG (ANSE MEUNIER 77 / CARITAN 77 / TRABAUD 72 + attributs SNORKELING/FAMILLES/PARKING + distances ~3km), « REPÈRE DE SAISON — pas une prévision » (honnêteté).
- **P1 SHEET-01** : la barre RegionNav fixe (z 2001, 9 boutons régions) **recouvre le haut du sheet pendant la lecture** (visible mid+lower) → chrome de navigation concurrent du contenu + risque de perte de contexte au tap.
- P3 : émojis OS (🌊🧹📣🍂) là où la bible impose des pictos SVG mono-trait.

## 390-paywall-initial — PAYWALL (P1)

1. HIÉRARCHIE : mascotte → promesse → preuves (5 régions/136+ plages/4×/jour) → email → reco du jour → prix. Bonne.
2. LISIBILITÉ : bonne sauf carte blanche basse.
4. TYPO : 2 H2 display concurrents (« VOTRE PLAGE… » 20px + « SACHE OÙ SERA LA MER… » 27px) — redondance de promesse.
5. BOUTONS : ✕ 44×44 ✓ ; email 44px+ ✓ ; **compétition CTA : « Payer 4,99 € — activer maintenant » (350×54, top=593) + « Débloquer · 14,99 € » + « Commencer maintenant » (coupé) dans le même modal, deux prix sans relation expliquée** → PAY-01 **P1** (obstruction conversion : quel prix pour quoi ?).
13. MANQUANT : explication du rapport 4,99€/14,99€ au point de décision.
14. CONFUS : **texte pâle sur carte blanche** (« Mollie · Sans engagement · 2 clics » quasi invisible sur capture) → PAY-02 **P0 à confirmer dans le code** (paire couleur/fond à lire ; si blanc sur blanc → P0 bloquant paiement).
17. NEXT : payer — mais lequel ?
18. SEVERITY : **P1** (PAY-01) ; PAY-02 P0-si-confirmé-code.

## 390-paywall-lower — bas du modal (P1/P2)

- Preuve fiabilité riche (76 % / 97 % backtest, chips 97 %/Copernicus/12k+, 5 régions·136+·score, satellite 4×/j, J+7 + push) puis « Plus tard » blanc bien visible **mais uniquement après scroll interne** (top=1879) → PAY-03 **P1** (sortie cachée sous fold interne).
- **P1/P2 TRUST-01** : trois chiffres de fiabilité cohabitent sans articulation (« 76 % mer propre vérifiées » / « 97 % fiabilité globale backtest » / « 87 % de fiabilité globale » dans le corps) → confusion sur le moat ; la doctrine impose le chiffre plancher contextualisé + lien /fiabilite/ (absent du modal).

## 390-b2b-initial — B2B `?pro=1` (P2)

- Message unique (« VOS PLAGES, CE MATIN. MESURÉES, PAS DEVINÉES »), preuve (11/11 + âge satellite), 1 CTA or 312×54, prix tôt (79 €/essai 30 j/690 €) → structure conversion saine.
- **P2 B2B-01** : BottomNav (Carte/Plages/Premium) visible etactive derrière le modal → chrome concurrent + tap-nav derrière un dialog.
- Formulaire « Votre plage (optionnel) » : select natif OK.

## 390-static-plages / previsions (P2)

- H1 statiques présents (« Toutes les plages de Martinique », « Prévisions sargasses… ») puis **hydratation → carte** : l'intention « parcourir une liste » reçoit la carte. SEO intact (crawler lit le statique), UX discutable → REG-01 **P2** (IA : route liste → vue carte).

## 390-static-beach-anse-mitan (P2)

- Hydrate vers la **variante legacy** (Fermer, Voir la distance, Débloquer les prévisions, Suivre, Oui/Non, Propre/Modéré/Beaucoup, Débloquer 7 jours, Voir la preuve) ≠ variante comic du pin → SHEET-03 **P2** (deux sheets, deux contenus, deux CTA patterns pour le même objet).

## 390-static-fiabilite (P2 — positif + 1 fix)

- Seule page restant statique (scroll document 4071px, H1 unique, H2 structurés) — bien.
- **P2 FIA-01** : CTA « Recevoir » 103×39 (<44px h) sous le fold.

## 390-cookie-banner (P1)

- Texte clair, 2 choix symétriques (pas de dark pattern), « En savoir plus » présent.
- **P1 COO-01** : boutons 179×**40** (<44) ; **la bannière recouvre le day-strip Auj/+1j et le CTA « Une plage propre près de moi »** (top=628 bottom=728 ; capture concurrente `list--` le montre) → navigation primaire masquée à la 1re visite.

---

# BUTTON AUDIT (échantillon testable, 390)

| Bouton | But | Hiérarchie | Contraste (code à lire) | Touch | Clavier/focus | Position | Destination |
|---|---|---|---|---|---|---|---|
| Header ×7 (Accueil/MQ/GP/cloche/compte/theme/EN) | nav/région/compte | secondaire, uniforme | à lire (tokens) | 44×44 ✓ | nommés ✓ | header fixe | régions/comptes |
| BottomNav Carte/Plages/Premium | nav primaire | primaire, 1 indicateur actif | encre sur carte blanche ✓ (capture) | 63-96px ✓ | focusables | fixe bas | vues / paywall |
| Pin labels carte (53) | ouvrir fiche | bruit (53 concurrents) | **à lire (ratio auto invalide sur fond carte)** | h=44 ✓ | 60+ stops — verbeux | carte | fiche |
| Sheet ✕ | fermer | affaibli (petit, coupé) | — | **32×46 ✗, top=-4 coupé** | à tester C | sheet | retour carte |
| VOIR LES 7 PROCHAINS JOURS → | forecast gated | primaire or unique ✓ | noir-sur-or ✓ (capture ; ratio auto 1.03 = artefact gradient) | 354×54 ✓ | — | sheet | mur forecast |
| Payer 4,99€ / Débloquer 14,99€ / Commencer… | payer | **3 primaires concurrents ✗** | carte blanche à lire | ✓ tailles | — | paywall | checkout Mollie |
| Plus tard | sortir | caché sous fold interne ✗ | blanc sur blanc ✓ (capture) | 294×44 ✓ | Échap ✓ (testé) | bas modal | retour verdict |
| B2B « Voir la semaine… » | Kč lead B2B | primaire unique ✓ | noir-sur-or 18.11 ✓ (mesuré) | 312×54 ✓ | — | modal | essai/paylink |
| Cookie Accepter/Refuser | consentement | symétriques ✓ | à lire | 179×**40 ✗** | — | bannière | consentement |
| Fiabilite Recevoir | newsletter | unique | 12.46 ✓ | 103×**39 ✗** | — | sous fold | submit |
| FAB Veilleur 46×46 | chat | flottant | 18.09 ✓ | 46 ✓ | 2 éléments sans nom accessible (P2 A11Y-01) | carte | chat |

Ghost/white-on-white/icon-only : PAY-02 (carte blanche, à confirmer code) ; 2 focusables sans nom (A11Y-01 P2) ;
CTA competition : paywall (P1) ; dead-looking : labels carte OK ; hidden-by-overlay : Plages tab hit=svg une fois
(NAV-01 P1 à lever en code : icône propre du bouton vs overlay — clic Playwright réel flaké 1/3 runs).

# NAVIGATION AUDIT

> Question : l'utilisateur sait-il où il est, ce qu'il regarde, ce qu'il peut faire ensuite ?

| Transition | Ce qui arrive | Attente | UI dit | Cliquable | Confus ? |
|---|---|---|---|---|---|
| HOME→pin→SHEET | fiche comic par-dessus carte | fiche de CETTE plage | identité+statut+score ✓ | ✕ 32px, RegionNav par-dessus | P1 (fermeture + overlay) |
| SHEET→VOIR 7 JOURS | mur forecast/paywall | prévision | teaser + Débloquer | CTA or unique ✓ | non |
| *→PAYWALL | modal sombre, fond assombri ? **pas de backdrop dim visible** | focus achat | 2 prix + 3 CTA | oui | **P1 quel prix ?** |
| PAYWALL→Plus tard/✕/Échap | retour verdict (Échap vérifié ✓) | retour | Plus tard caché sous scroll | Échap ✓, ✕ ✓ | P1 sortie cachée |
| HOME→Plages | **vide noir** | liste | BottomNav actif, rien d'autre | rien | **P0** |
| HOME→Premium | paywall (openPremium nav) | offres | modal | oui | P1 prix |
| SHEET→RegionNav (par-dessus) | change de région, perd la fiche ? | rester sur la fiche | chrome global persistant | oui | P1 perte contexte |
| /plages/→app | carte au lieu de liste | liste | carte | — | P2 |
| /beach/x→app | fiche legacy ≠ fiche pin | même fiche | variante différente | oui | P2 |
| B2B modal→BottomNav derrière | nav possible derrière dialog ? | modal modal | nav visible | **à vérifier (focus-trap ?)** | P2 |
| Cookie→choix | Accept/Refuser persistés (`sg_cookie_consent`) | ne plus voir | bannière récurrente ? | 40px h | P1 taille+recouvrement |

# INFORMATION ARCHITECTURE (écart constaté)

- MAP : PRIMARY « où me baigner ? » servi 2× (45 plages vs Meilleur choix 86) → recommandation : **1 réponse primaire** (Meilleur choix + score + Voir), quantité en supporting sous le hero.
- SHEET : PRIMARY « puis-je m'y baigner ? » ✓ (statut+score au 1er écran) ; SECONDARY « pourquoi ? » ✓ ; SUPPORTING forecast/photo/preuve — photo/vidéo absente (asset-map) ; ACTION compar/upgrade ✓ (alternatives + Débloquer).
- PAYWALL : PRIMARY « combien, pour quoi ? » ✗ (2 prix) → recommandation : 1 offre primaire + secondaire repliée + mécanisme (Mollie/onsite) en supporting lisible (fond carte à corriger).
- LIST : PRIMARY « comparer » ✗ (vide) → P0.

# AHA / NEXT ACTION par écran

| Écran | Message 1 | Action 1 | Next évident ? | AHA |
|---|---|---|---|---|
| MAP | partiel (2 messages concurrents) | tap pin ✓ | oui | « je sais où aller » — affaibli par doublon |
| SHEET | oui (« À SURVEILLER 72/100, satellite il y a 3 j ») | VOIR 7 JOURS ✓ | oui | « je comprends + je sais quoi faire » ✓ |
| PAYWALL | non (2 prix) | payer — lequel ? | non | « je gagne du temps » ✗ |
| LIST | non (vide) | — | non | ✗ |
| B2B | oui (plages mesurées ce matin) | Voir la semaine ✓ | oui | « je gagne du temps » ✓ |

# ACCESSIBILITÉ (mesuré, headless)

- Clavier : 80 focusables (paywall) ; 0 tabindex négatif ; 2 sans nom accessible (A11Y-01 P2) ; focus = `outline:none` + `box-shadow 2px 2px` (A11Y-02 P2 : visibilité du focus à valider sur fond sombre/or en code).
- Dialogs : `role=dialog` sheet + paywall + B2B ✓ ; Échap ferme le paywall ✓ (testé) ; focus-trap + restauration à tester Phase C (B2B derrière-nav en doute).
- Touch : 3 contrôles <44 (✕ sheet 32, cookie 40, Recevoir 39) → P1/P2 ci-dessus.
- Reduced motion : 0 animation infinie restante sous `reduce` ✓ (6. audit2).
- Zoom/320px : non testé (Phase C : 360px + 200 %).
- Info jamais couleur-seule : statuts = couleur+mot (+forme sur pastilles carte) ✓.

# RESPONSIVE (mesuré)

- 390/768/1440 : `overflowX=false` partout ✓ ; 0 texte coupé horizontalement ; CTA jamais masqués latéralement.
- 768 : mise en page identique au 390 (colonne unique étirée) — pas de profit tablette (P3 : grille 2 col. liste/alternatives ≥768).
- 1440 : hero overlap + badge/recherche + échelle/compas (MAP-02 P2) ; modals en colonne téléphone centrée (acceptable, P3 : max-width + backdrop dim).

# RÉGRESSION VISUELLE (baseline Phase A)

Baseline = 35 PNG `.ai/ui-audit/shots/` + `manifest.json` + `audit2.json` (build v219, 2026-9-08).
Phase C : re-capture via les 2 scripts et comparaison BEFORE/AFTER par ID dans le rapport de fix.
