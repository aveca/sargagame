# Kit de prospection B2B — Le Veilleur Pro (sargasses)

> But : décrocher **3 hôtels qui PAIENT en 21 jours** (le test décisif du mémo stratégique 28/06).
> Méthode : **outreach automatisé self-serve** — l'email amène le prospect sur `/pro/espace/`
> où il démarre lui-même son **essai 21 jours, sans carte**. Relance J+3 et J+7. Zéro call, zéro activation manuelle.
> La liste enrichie (emails réels) est dans `data/b2b-enriched.json` (généré par l'agent d'enrichissement).

---

## L'offre (rappel, grille figée)

| Produit | Prix | Cible |
|---|---|---|
| **Brief** quotidien | 29 €/mois (290 €/an, 2 mois offerts) | gîtes, restos, clubs plage |
| **Pro** (widget marque-blanche + brief + alertes + prévision 7j) | **79 €/mois** (690 €/an) | hôtels, resorts |
| **Territoire** (multi-plages + rapports + API) | dès 199 €/mois | communes, offices |

**Essai 21 jours gratuit, sans carte** (le brief tourne déjà → coût marginal nul). **Pousser l'annuel** (cash d'avance = immunise contre le creux hors-saison).

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

Vous l'essayez **21 jours, gratuitement, sans carte** — vous voyez si c'est utile.
Ensuite c'est 79 €/mois si vous gardez. **Vous démarrez l'essai vous-même ici, en 2 min :**
sargasses-martinique.com/pro/espace/

{TonPrénom}
```

> Le CTA est **un lien self-serve** : le prospect lance lui-même l'essai sur `/pro/espace/`, pas de rendez-vous, pas d'activation manuelle.

---

## EMAIL 2 — relance J+3 (si pas de réponse)

**Objet :** `Re: {objet initial}`

```
Bonjour {Prénom},

Juste au cas où mon message serait passé sous la pile — la saison sargasses bat son
plein et c'est maintenant que le brief sert le plus.

Vous démarrez votre essai 21 jours en 2 minutes, sans carte, sans engagement, ici :
sargasses-martinique.com/pro/espace/

{TonPrénom}
```

## EMAIL 3 — relance J+7 (dernier contact, valeur + porte ouverte)

**Objet :** `Dernière relance — votre plage ce matin à {Ville}`

```
Bonjour {Prénom},

Je ne vais pas insister davantage. Pour info, voici l'état de vos plages ce matin
selon le satellite : {1 ligne réelle — ex: « Grande Anse : propre · Le Diamant : modéré »}.

Si un jour vous voulez recevoir ça chaque matin (+ l'alerte avant échouage), vous
démarrez l'essai 21 jours vous-même ici : sargasses-martinique.com/pro/espace/

Bonne saison,
{TonPrénom}
```

---

## RÉPONSES TYPES (quand un hôtel répond)

**« Oui / ça m'intéresse / activez »**
```
Super. Tout est self-serve : vous démarrez l'essai 21 jours et choisissez vos plages
directement ici → sargasses-martinique.com/pro/espace/. Le 1er brief part le lendemain
matin, et le bout de code du widget est dans votre espace pour le coller sur votre site.
```
→ L'essai et le brief se configurent dans `/pro/espace/` (le pipeline tourne). À J+18, le drip relance automatiquement : « On continue à 79 €/mois ? Lien de paiement dans votre espace (ou −2 mois en annuel). »

**« C'est combien ? »**
```
79 €/mois pour l'hôtel (widget + brief quotidien + alertes + prévision 7 jours), ou
690 €/an (2 mois offerts). Mais commencez par l'essai 21 jours gratuit, sans carte —
vous le lancez vous-même ici et vous décidez après l'avoir vu tourner :
sargasses-martinique.com/pro/espace/
```

**« Envoyez-moi de la doc / je vais voir »**
```
Bien sûr — le plus parlant c'est de le voir en vrai : démarrez l'essai gratuit sur vos
plages en 2 min, vous recevez le 1er brief demain matin et vous jugez sur pièce.
Tout est ici → sargasses-martinique.com/pro/espace/
```
→ Toujours ramener à **l'action self-serve** (le lien `/pro/espace/`), pas au PDF.

---

## RÈGLES (mémo)

1. **Self-serve, zéro call.** Chaque email route vers `/pro/espace/` où le prospect lance lui-même l'essai 21j — aucune activation manuelle, aucun rendez-vous.
2. **Délivrabilité** : envoyer depuis une adresse dédiée (pas alerte@ — protège le domaine drip).
3. **Relance** systématique J+3 et J+7 (80 % des réponses viennent des relances).
4. **La seule métrique qui compte : un PAIEMENT.** Pas un « intéressant », pas un email collecté.
5. **Go/no-go à J+21 :** 3 hôtels payants → on industrialise. 0-1 sur 30-40 sollicitations sérieuses → le marché local est trop mince / la vente ne tient pas → on accepte le plafond ou on repense un pivot.
