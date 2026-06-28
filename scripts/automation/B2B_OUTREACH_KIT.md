# Kit de prospection B2B — Le Veilleur Pro (sargasses)

> But : décrocher **3 hôtels qui PAIENT en 14 jours** (le test décisif du mémo stratégique 28/06).
> Méthode : **manuel d'abord** — 10 emails/jour, perso, depuis une adresse qui te ressemble
> (pas alerte@). Relance J+3 et J+7. On automatise SEULEMENT quand ce message a converti 1 fois.
> La liste enrichie (emails réels) est dans `data/b2b-enriched.json` (généré par l'agent d'enrichissement).

---

## L'offre (rappel, grille figée)

| Produit | Prix | Cible |
|---|---|---|
| **Brief** quotidien | 29 €/mois (290 €/an, 2 mois offerts) | gîtes, restos, clubs plage |
| **Pro** (widget marque-blanche + brief + alertes + prévision 7j) | **79 €/mois** (790 €/an) | hôtels, resorts |
| **Territoire** (multi-plages + rapports + API) | dès 199 €/mois | communes, offices |

**Essai 14 jours gratuit, sans carte** (le brief tourne déjà → coût marginal nul). **Pousser l'annuel** (cash d'avance = immunise contre le creux hors-saison).

---

## EMAIL 1 — premier contact (cold)

> Court, concret, une seule question qui force une réponse. Personnaliser les `{…}`.

**Objet (A/B) :**
- `Sargasses à {Ville} : vos clients prévenus avant vous ?`
- `{NomHôtel} — l'état de votre plage chaque matin`

**Corps :**

```
Bonjour {Prénom ou « l'équipe de {NomHôtel} »},

Je suis {TonPrénom}, je fais Le Veilleur — la surveillance satellite des sargasses
plage par plage en Martinique & Guadeloupe (les vacanciers l'utilisent déjà chaque
matin pour choisir leur plage).

Pour un hôtel comme le vôtre à {Ville}, une plage envahie un matin = des clients
déçus, des avis, parfois des remboursements — et vous l'apprenez souvent en même
temps qu'eux.

Je propose aux hôtels un brief quotidien de VOS plages (état réel + alerte avant
échouage + prévision 7 jours), et un widget « plages surveillées » à mettre sur
votre site pour rassurer avant la réservation.

Je vous l'offre **14 jours, gratuitement, sans carte** — vous voyez si c'est utile.
Ensuite c'est 79 €/mois si vous gardez. **Je vous active ça aujourd'hui, ça vous va ?**

{TonPrénom}
{lien: sargasses-martinique.com}
```

> La dernière phrase est le **forçage** : elle demande un oui/non explicite, pas « ça vous intéresse ? ».

---

## EMAIL 2 — relance J+3 (si pas de réponse)

**Objet :** `Re: {objet initial}`

```
Bonjour {Prénom},

Juste au cas où mon message serait passé sous la pile — la saison sargasses bat son
plein et c'est maintenant que le brief sert le plus.

Je peux activer votre essai 14 jours en 5 minutes, sans engagement. Je le lance ?

{TonPrénom}
```

## EMAIL 3 — relance J+7 (dernier contact, valeur + porte ouverte)

**Objet :** `Dernière relance — votre plage ce matin à {Ville}`

```
Bonjour {Prénom},

Je ne vais pas insister davantage. Pour info, voici l'état de vos plages ce matin
selon le satellite : {1 ligne réelle — ex: « Grande Anse : propre · Le Diamant : modéré »}.

Si un jour vous voulez recevoir ça chaque matin (+ l'alerte avant échouage), répondez
juste « ok » et je vous active l'essai.

Bonne saison,
{TonPrénom}
```

---

## RÉPONSES TYPES (quand un hôtel répond)

**« Oui / ça m'intéresse / activez »**
```
Super. Je vous active l'essai 14 jours tout de suite. Sur quelles plages voulez-vous
le brief (les plus proches de l'hôtel) ? Et un email pour le recevoir chaque matin ?
Je vous envoie aussi le bout de code du widget pour votre site si vous le voulez.
```
→ Puis : crée le brief (le pipeline tourne), envoie le 1er email le lendemain matin. À J+12, relance : « On continue à 79 €/mois ? Je vous envoie le lien de paiement (ou −2 mois en annuel). »

**« C'est combien ? »**
```
79 €/mois pour l'hôtel (widget + brief quotidien + alertes + prévision 7 jours), ou
790 €/an (2 mois offerts). Mais commencez par l'essai 14 jours gratuit — vous décidez
après l'avoir vu tourner.
```

**« Envoyez-moi de la doc / je vais voir »**
```
Bien sûr — le plus parlant c'est de le voir en vrai : laissez-moi activer l'essai
gratuit sur vos plages, vous recevez le 1er brief demain matin et vous jugez sur pièce.
Ça vous va ?
```
→ Toujours ramener à **l'action** (activer l'essai), pas au PDF.

---

## RÈGLES (mémo)

1. **Manuel d'abord.** Pas d'automation tant que ce message n'a pas converti 1 hôtel payant.
2. **10/jour**, depuis une adresse perso (pas alerte@ — protège la délivrabilité du domaine drip).
3. **Relance** systématique J+3 et J+7 (80 % des réponses viennent des relances).
4. **La seule métrique qui compte : un PAIEMENT.** Pas un « intéressant », pas un email collecté.
5. **Go/no-go à J+14 :** 3 hôtels payants → on industrialise (automation b2b déjà construite). 0-1 sur 30-40 sollicitations sérieuses → le marché local est trop mince / la vente ne tient pas → on accepte le plafond ou on repense un pivot.
