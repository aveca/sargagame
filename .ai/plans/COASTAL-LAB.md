# SARGASSUM COASTAL LAB — Littoral Decision Lab

## Spécification persistante — référence pour toutes les sessions futures

---

### 1. PRODUCT CONCEPT

**SARGASSUM COASTAL LAB** — Littoral Decision Lab

Ce n'est PAS :
- une landing page éducative
- un article
- un dashboard froid
- une simple infographie

C'est une expérience interactive expliquant le problème littoral du sargasse et la transformation :

DATA → UNDERSTANDING → DECISION → INTERVENTION → RECOVERY → POTENTIAL VALORIZATION

Le produit doit relier :
OCÉAN → SARGASSE → DONNÉES → PLAGE → TOURISME → ÉCOSYSTÈME → IMPACT → DÉCISION → ACTION → RÉCUPÉRATION → VALORISATION

**Framing produit :**
> "Le vrai problème n'est pas seulement le sargasse sur la plage. C'est la difficulté de transformer un littoral changeant en décision fiable."

Cette phrase est un framing produit, PAS une affirmation scientifique à présenter comme résultat de recherche.

---

### 2. OBJECTIF UTILISATEUR

Le visiteur doit comprendre en moins de 60 secondes :

1. Le littoral change.
2. Le sargasse est un phénomène dynamique.
3. Les données permettent de surveiller ce changement.
4. L'état d'une plage influence son usage, notamment touristique.
5. Les décisions doivent tenir compte de plusieurs dimensions.
6. Retirer la biomasse n'est qu'une partie du système.
7. Récupération, traitement et valorisation ont leurs propres contraintes.
8. Sargagame transforme des données littorales en décisions autour de la plage.

---

### 3. FIVE-LAYER EXPERIENCE

#### 01 — MONITOR
**Objectif :** "Voir ce qui se passe."

Présenter, avec les données réelles disponibles dans le produit :
- état
- observations
- historique
- évolution
- données satellite ERDDAP/Copernicus
- forecast lorsqu'il existe
- reliability/confidence lorsqu'il existe

Construire visuellement la chaîne :
```
OCEAN
↓
DATA
↓
BEACH
↓
STATE
```

Ne jamais inventer de mesures.

---

#### 02 — UNDERSTAND
**Objectif :** "Comprendre l'impact."

Relier :
```
SARGASSUM
↓
BEACH
↓
HUMAN USE
↓
TOURISM
↓
ECOSYSTEM
↓
COASTAL MANAGEMENT
```

Explorer plusieurs dimensions :
- expérience plage
- usage humain
- tourisme
- environnement littoral
- écosystème
- opérations

Important :
- Aucune affirmation scientifique non vérifiée.
- Aucun chiffre inventé.
- Aucune causalité présentée comme certaine sans donnée/source.

---

#### 03 — DECIDE
C'est le cœur du produit.

Montrer :
```
OBSERVE
↓
EVALUATE
↓
DECIDE
↓
ACT
↓
MEASURE
```

Afficher des options conceptuelles :
SURVEILLER | INFORMER | ADAPTER | NETTOYER | PROTÉGER | ORIENTER | SUIVRE

Ne pas présenter ces actions comme des règles réglementaires universelles.

Connecter cette logique au Beach Object existant.

---

#### 04 — RECOVER
**Objectif :** montrer que la récupération crée une chaîne opérationnelle.

Visualiser :
```
COLLECTE
↓
TRI
↓
TRANSPORT
↓
STOCKAGE
↓
TRAITEMENT
↓
SÉCURISATION
```

Montrer clairement que :
> "récupérer" ≠ "problème résolu"

Il existe des contraintes :
- logistiques
- environnementales
- sanitaires
- économiques
- opérationnelles

Ne pas inventer de coûts, rendements ou capacités.

---

#### 05 — VALORIZE
**Objectif :** explorer la question : "Peut-on transformer une partie du problème en ressource ?"

Présenter comme pistes potentielles :
```
BIOMASSE
→ matériaux
→ énergie
→ extraction / molécules
→ usages agricoles potentiels
→ autres filières
```

Pour chaque piste :
- potentiel
- contraintes
- traitement
- contamination éventuelle
- réglementation
- économie
- maturité

Lorsque les données manquent :
- "À documenter"
- "À valider"

Jamais de promesse écologique non démontrée.

---

### 4. THE HARD PROBLEM

Créer une section forte : **WHY THIS IS HARD**

Montrer les contraintes interconnectées :
PREDICTION | DATA | WEATHER | OCEAN | BEACH | TOURISM | LOGISTICS | COLLECTION | STORAGE | TREATMENT | ENVIRONMENT | ECONOMICS | REGULATION

Le but : faire comprendre qu'il n'existe pas un bouton magique "REMOVE SARGASSUM" mais un système complexe de décision littorale.

---

### 5. THE BEACH AS DIGITAL OBJECT

Créer l'AHA du Lab :
> "UNE PLAGE N'EST PAS JUSTE UNE PLAGE."

Le Beach Object existant doit devenir le centre visuel.

Structure :
```
PHOTO
+ STATE
+ DATA
+ FORECAST
+ RELIABILITY
+ USE
+ IMPACT
+ DECISION
+ ALTERNATIVE
```

Même noyau pour :
- B2C : "Puis-je profiter de cette plage aujourd'hui ?"
- B2B : "Que se passe-t-il sur cette plage ?"
- B2G / COASTAL OPERATIONS : "Quelle décision opérationnelle envisager ?"

**NE PAS créer trois architectures séparées.** Réutiliser le Beach Object existant.

---

### 6. INTERACTIVE BEACH EXPLORER

Créer un composant / module permettant :
sélection d'une plage → état → preuves → impact → options → alternative

Exemple conceptuel :
```
[ PHOTO ]
PLAGE
État aujourd'hui ████████░░
Pourquoi ?
• donnée
• tendance
• fiabilité

QUE PEUT-ON FAIRE ?
[ SURVEILLER ] [ INFORMER ] [ ADAPTER ] [ ALTERNATIVE ]
```

Les données doivent venir du système existant. Pas de faux contenu.

---

### 7. TOURISM CONNECTION

Le tourisme est fondamental.

Montrer :
```
DREAM
↓
CHOOSE
↓
PLAN
↓
MONITOR
↓
ADAPT
↓
ENJOY
```

Le Lab doit expliquer pourquoi Sargagame possède une valeur utilisateur :
MONITORING + FORECAST + RELIABILITY + ALTERNATIVES + PLANNING

Il ne faut pas transformer le Lab en paywall.

Le Lab doit d'abord produire :
- compréhension
- confiance
- intérêt
- envie d'explorer

Puis connecter naturellement vers les fonctionnalités existantes :
- Explore beaches
- Plan my stay
- Monitor my beaches

---

### 8. ECOSYSTEM VIEW

Créer une représentation simple :
```
OCEAN
↓
LITTORAL
↓
BEACH
↓
HUMAN USE
↓
ECOSYSTEM
```

Puis montrer quatre dimensions :
TOURISM | ENVIRONMENT | OPERATIONS | ECONOMICS

Pas de cours universitaire. Pas de mur de texte.

---

### 9. VISUAL DIRECTION

Direction : PREMIUM TRAVEL APP + SCIENTIFIC FIELD LABORATORY + INTERACTIVE EDITORIAL EXPERIENCE

Utiliser le Visual OS déjà présent.

Réutiliser :
- typography
- spacing
- colors
- cards
- motion
- media
- icon system

Éviter :
- bento générique
- glassmorphism partout
- gradients partout
- dashboard corporate froid
- emoji comme icon system
- illustrations AI génériques
- faux chiffres
- mur de texte

**PRIORITÉ :** MEDIA > LAYOUT > MOTION > TEXT

Utiliser les vrais médias présents dans le repo.

---

### 10. MOTION

Les animations doivent expliquer des relations.

Créer éventuellement :
- flux Ocean → Data → Beach
- propagation de l'information
- changement d'état
- transitions entre les 5 couches
- révélation du Beach Object
- transition impact → decision
- transition collection → recovery

Respecter le système motion existant (sg-motion.css, 180–500ms, transform/opacity, reduced-motion obligatoire).

---

### 11. MOBILE FIRST

Tester : 390×844 | 768×1024 | 1280+

Le mobile doit être pensé comme une expérience native. Pas de desktop compressé.

Utiliser scroll-snap / horizontal interaction lorsqu'utile. CTA accessibles. Pas d'overflow.

---

### 12. ACCESSIBILITY

Respecter :
- semantic HTML
- keyboard navigation
- focus visible
- contrast
- aria
- reduced motion
- information not conveyed only by color

---

### 13. DATA INTEGRATION

Réutiliser les systèmes existants. Chercher avant de créer :
- Beach Object
- beach metadata
- ERDDAP/Copernicus
- forecast
- reliability
- media-art-direction
- existing routes
- existing analytics
- existing components
- existing icons
- existing motion utilities

Ne dupliquer aucune donnée déjà disponible.

---

### 14. ANALYTICS

Ajouter seulement les événements nécessaires et suivant les conventions existantes.

Proposition :
- sg_lab_open
- sg_lab_step_view
- sg_lab_beach_select
- sg_lab_decision_view
- sg_lab_recovery_view
- sg_lab_valorization_view
- sg_lab_cta

Pas d'événements artificiels. Ne jamais mélanger tests/synthetic avec trafic réel.

---

### 15. B2B / B2G

Ajouter une lecture conceptuelle : **COASTAL OPERATIONS**

Montrer :
BEACH → STATE → FORECAST → RELIABILITY → IMPACT → ACTION → HISTORY

Cibles potentielles :
- hôtels
- collectivités
- gestionnaires de plage
- acteurs touristiques
- opérateurs littoraux

Mais :
- NE PAS créer de faux CRM.
- NE PAS créer de faux backend B2B.
- NE PAS inventer de clients.
- NE PAS inventer de métriques.

---

### 16. PERFORMANCE

Respecter strictement : EAGER GZIP ≤ 210 KB

Ne pas ajouter une grosse dépendance sans justification. Réutiliser les dépendances existantes.

Lazy-load :
- médias lourds
- composants lourds
- visualisations secondaires

Ne pas utiliser Three.js simplement pour décorer.

---

### 17. ROUTING / PRODUCT INTEGRATION

Choisir une route cohérente avec l'architecture existante.

Exemple possible : `/coastal-lab/`

La route doit :
- fonctionner directement
- être responsive
- ne pas casser les routes existantes
- être accessible depuis une zone cohérente du produit

---

### 18. TESTS

Après implémentation :
- npm test
- npm run build
- bundle budget
- ux-smoke
- funnel-payment E2E
- regions validation
- PHP lint si fichiers PHP touchés

Ajouter des tests spécifiques Coastal Lab.

Tester au minimum :
- ouverture de la route
- navigation des 5 étapes
- sélection d'une plage
- état sans données
- absence de données inventées
- responsive
- reduced motion
- absence de console errors
- absence d'overflow

---

### 19. VISUAL QA

Inspecter au minimum : 390×844 | 768×1024 | 1280×900

Vérifier :
- aucune image cassée
- aucun overflow
- aucun texte coupé
- aucune animation infinie
- aucun CTA hors écran
- bonne hiérarchie
- bonne lisibilité
- Beach Object lisible
- transitions compréhensibles

Corriger puis retester.

---

### 20. REGRESSION PROTECTION

NE PAS casser :
- map
- Beach Experience
- Beach Object
- paywall
- Mollie
- payment grants
- Trip Planner
- Sea Rail
- recommendation / AHA
- analytics existants
- ERDDAP
- forecast
- reliability
- media pipeline
- existing visual OS

Avant toute modification : chercher les implémentations existantes.

---

### 21. GIT WORKFLOW

Branche : `agent/coding/coastal-lab`

Ne mélange pas d'autres tâches dans cette branche.

Avant commit :
- git status
- git diff
- git diff --stat

Vérifier :
- aucun secret
- aucun fichier temporaire
- aucun artefact inutile
- aucun dist/
- aucun changement sans rapport avec Coastal Lab

Mettre à jour :
- .ai/current_state.md
- .ai/changelog.md
- .ai/tasks.md

Créer le commit selon la convention du repo. Push. Créer PR. Attendre les checks GitHub réels. Ne jamais écrire "CI green" sans vérifier le nouveau HEAD.

---

### 22. IMPORTANT — PERSISTENT MEMORY

Après création de la feature : `.ai/plans/COASTAL-LAB.md` doit devenir la référence persistante pour les prochaines sessions.

Le handoff doit contenir :
- route
- architecture
- composants
- données utilisées
- tests
- PR
- HEAD SHA
- problèmes restants
- prochaine étape

---

### 23. EXECUTION PROTOCOL

ORDRE OBLIGATOIRE :
```
READ REPO
↓
CREATE SPEC .ai/plans/COASTAL-LAB.md
↓
ADD TASK .ai/tasks.md
↓
AUDIT EXISTING CODE
↓
REGRESSION MAP
↓
DESIGN
↓
IMPLEMENT
↓
INTEGRATE
↓
TEST
↓
VISUAL QA
↓
CORRECT
↓
COMMIT
↓
PUSH
↓
PR
↓
VERIFY GITHUB
↓
HANDOFF
```

Ne demande jamais "GO ?". Commence maintenant.