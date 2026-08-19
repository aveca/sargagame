# Sprint Concierge 7 jours — "Le service avant le logiciel"

> **Règle** : ZÉRO ligne de code. ZÉRO automatisation. ZÉRO pitch produit.
>
> **Objectif** : 1 hôtel qui dit "oui, je paie pour cette information".
>
> **Méthode** : Deviens temporairement le service. Envoie les prévisions MANUELLEMENT
> pendant 7 jours. Le J7, demande le paiement. Pas avant. Pas après.

---

## Le test fondamental

Tu ne cherches PAS à prouver : "Mon algorithme est bon."

Tu cherches à prouver : **"Un hôtel considère cette information suffisamment utile pour que je sorte ma carte."**

---

## Phase 1 — 30 hôtels, pas 148 (Jour 1, matin)

**Ne contacte PAS les 148.** 30 maximum. Classe-les :

| Grade | Critère | Action |
|-------|---------|--------|
| **A** | Plage directement devant · clientèle touristique importante · problème sargasses évident | Appeler en premier |
| **B** | Plage proche · intérêt probable | Appeler si temps |
| **C** | Intérêt faible | Ignorer pour l'instant |

**Commence uniquement par les A.**

Pour chaque cible A, noter :
- Nom
- Plage la plus proche
- Téléphone
- Pourquoi grade A (1 phrase)

---

## Phase 2 — 5 appels/jour, 3 questions (Jours 1-4)

**Script d'appel** :

> "Bonjour, je m'appelle [ton nom]. Je surveille les sargasses par satellite pour plusieurs plages des Antilles. Votre hôtel est juste devant [plage X]. Est-ce que je peux vous poser une question ?"
>
> **[ Attendre "oui" ]**
>
> **"Aujourd'hui, comment vous savez si vous allez avoir des sargasses demain ?"**
>
> **[ SE TAIRE. 10 secondes de silence. ]**

### Les 3 seules choses que tu cherches à savoir :

| Question | Pourquoi |
|----------|----------|
| **1. Comment ils savent ?** | Leur méthode actuelle (ou l'absence de méthode) |
| **2. Qu'est-ce qu'ils font quand ils ne savent pas ?** | La conséquence comportementale |
| **3. Quelle conséquence pour l'hôtel / les clients ?** | Le coût réel du problème |

### Puis tu mesures :

```
PROBLÈME × FRÉQUENCE × COÛT × VOLONTÉ DE PAYER
```

| Champ | Ce que tu notes | Exemple |
|-------|----------------|---------|
| **Problème** | Est-ce qu'ils ont un vrai problème ? | "Oui, on ne sait jamais" |
| **Fréquence** | À quelle fréquence ? | "Tous les jours en saison" |
| **Coût** | Combien ça leur coûte ? | "2 avis négatifs en juin sur Booking" |
| **Volonté de payer** | Est-ce qu'ils paieraient pour l'éviter ? | "Oui, si c'est pas cher" |

**NE note PAS "intéressé" ou "pas intéressé".** Note les **mots exacts**.

> ❌ "Il a dit que c'était intéressant"
> ✅ "Il a dit : 'Les clients nous posent la question tous les matins, on ne sait jamais quoi répondre'"

---

## Phase 3 — 3 hôtels en concierge (Jours 2-7)

**Ne prends PAS 20 hôtels.** 3 maximum. Les premiers qui disent **réellement oui** au concierge.

### Proposition concierge (après l'appel, si intérêt détecté) :

> "Écoutez, pendant 7 jours, je surveille votre plage et je vous envoie les prévisions chaque matin par WhatsApp. Vous n'avez rien à installer. C'est gratuit. Si ça vous sert, on en reparle à la fin de la semaine. Ça vous dit ?"

### Format d'envoi quotidien (chaque matin à 7h) :

```
Prévision plage [X] — [date]

État : faible / modérée / forte
Fenêtre : prochaines 24-48h
Confiance : [X]%
Action : [recommandation concrète]

Source : satellite Copernicus Marine
```

### Pas de 30 jours gratuits.

**7 jours.** Le J7, tu demandes le paiement.

Pourquoi ? Parce que tu veux le signal rapide :

> **"Cette information est suffisamment utile pour que je sorte ma carte."**

Si tu attends 30 jours, tu risques de fabriquer un faux signal d'intérêt.

---

## Phase 4 — Le test de paiement (Jour 7)

Pour chaque hôtel concierge, **3 questions dans l'ordre** :

> **1. "Est-ce que cette information vous a été utile cette semaine ?"**
>
> Si oui →
>
> **2. "Vous voudriez continuer à la recevoir automatiquement ?"**
>
> Si oui →
>
> **3. "Je vous l'active à 29 €/mois ?"**

**Puis tu attends.**

Pas :
> ❌ "Ça vous intéresserait ?"

Mais :
> ✅ **"Je vous l'active à 29 €/mois ?"**

C'est le moment où tu distingues **l'intérêt poli** de **la vraie demande**.

---

## Grille de décision finale

| Résultat | Signification | Action |
|----------|--------------|--------|
| **0/3 paient** | Le problème n'est pas assez douloureux, ou la cible est mauvaise | Retour terrain. Ne rien coder. |
| **1/3 paie** | Signal intéressant. Début de product-market fit sur ce segment | Itérer : pourquoi les 2 autres n'ont pas payé ? |
| **2/3 ou 3/3 paient** | Tu as trouvé quelque chose | **Arrête presque tout le reste.** Industrialiser. |

### Si 2/3 ou 3/3 paient, l'ordre d'industrialisation :

```
concierge → produit → automatisation → acquisition
```

Pas l'inverse.

---

## KPIs du sprint

| Étape | Cible | Réel |
|-------|-------|------|
| Hôtels grade A identifiés | 15+ | 0 |
| Appels passés | 20+ | 0 |
| Conversations avec les 3 questions | 15+ | 0 |
| Problèmes avec score P×F×C×V élevé | 5+ | 0 |
| Hôtels en mode concierge | 3 | 0 |
| Prévisions envoyées | 15+ (5j × 3) | 0 |
| Hôtels qui lisent les prévisions | 2+ | 0 |
| Réponses "oui, utile" | 2+ | 0 |
| Réponses "oui, continuez" | 2+ | 0 |
| **"Je vous l'active à 29€ ?"** | **3** | **0** |
| **Paiements** | **1+** | **0** |

---

## Ce que tu apprends (même avec 0 paiement)

1. **Le problème existe-t-il ?** → Si oui, quel est le coût réel ?
2. **La fréquence est-elle suffisante ?** → 1x/an ne justifie pas 29€/mois
3. **Le format est-il le bon ?** → WhatsApp vs email vs autre
4. **La cible est-elle la bonne ?** → Grands hôtels vs petits vs offices
5. **Le prix est-il le bon ?** → 29€ ? 10€ ? Gratuit ?

---

## Règles d'or

1. **Ne JAMAIS mentir** sur les données satellite. Si on ne sait pas, on dit "on ne sait pas".
2. **La question + le silence** comptent plus que n'importe quel pitch.
3. **Le concierge = la preuve**. Si personne ne veut le service gratuit, personne ne paiera le logiciel.
4. **Noter les mots exacts** — pas des interprétations.
5. **ZÉRO code.** Si tu penses "il faudrait modifier X", note-le et passe à la suite.
6. **ZÉRO automatisation.** Si tu penses "il faudrait automatiser X", note-le et passe à la suite.
7. **7 jours, pas 30.** Le J7, tu demandes le paiement. Point.
8. **"Je vous l'active à 29€ ?"** est plus puissant que "ça vous intéresserait ?"
9. **Ne change PAS le produit pendant le sprint.** Si l'hôtel A veut WhatsApp, l'hôtel B veut un email et l'hôtel C veut un dashboard, tu ne construis pas 3 produits. Tu notes. Après 3-5 hôtels, tu cherches le pattern commun.
10. **Ne retourne pas coder immédiatement si 1 hôtel paie.** Fais 10 conversations de plus pour voir si c'est reproductible. Le passage de "quelqu'un aime mon produit" à "j'ai identifié un marché qui paie" nécessite 3+ paiements, pas 1.

---

## Le tableau de bord du soir (5 questions)

Chaque soir, tu dois pouvoir répondre à **seulement 5 questions** :

| # | Question | Réponse |
|---|----------|---------|
| 1 | **Combien d'humains ai-je réellement parlé ?** | |
| 2 | **Quel problème concret ont-ils décrit ?** | |
| 3 | **Combien ont accepté de recevoir les prévisions ?** | |
| 4 | **Combien les ont réellement utilisées ?** | |
| 5 | **Combien ont payé ?** | |

Si tu peux répondre **précisément** à ces 5 questions au bout de 7 jours, tu auras appris énormément.

---

## Quand un hôtel dit "non, 29€ c'est trop cher"

Ce "non" est beaucoup moins intéressant qu'il n'y paraît. La vraie question :

> **"Qu'est-ce qui ferait que 29€ serait évident pour vous ?"**

Tu vas alors découvrir si le problème vient :

| Réponse | Ce que ça révèle |
|---------|-----------------|
| "C'est trop cher" | → Le prix n'est pas aligné avec la valeur perçue |
| "J'ai besoin d'un widget" | → Le format ne colle pas |
| "Pas tous les jours" | → La fréquence ne justifie pas l'abonnement |
| "Je ne suis pas sûr que ce soit fiable" | → Le manque de confiance bloque |
| "C'est pas moi qui décide" | → Mauvais interlocuteur |
| "On n'a pas vraiment ce problème" | → Absence de douleur réelle |

**Ce "non" est plus précieux que 10 "oui" polis.** Note-le mot pour mot.
