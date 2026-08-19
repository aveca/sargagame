# Template message concierge — WhatsApp / Email

> **Usage** : envoyer CHAQUE MATIN à 7h aux hôtels en mode concierge.
> **Format** : WhatsApp (prioritaire) ou email (si pas de WhatsApp).
> **Durée** : 7 jours. Le J7, demander le paiement. Pas 30 jours.
> **Règle** : pas de faux signal d'intérêt. 7 jours suffisent pour savoir si l'info est utile.

---

## Template WhatsApp (jour typique)

```
Bonjour [nom] 🌊

Voici l'état de [plage] ce matin :

🟢 Propre — Aucune sargasse détectée
📍 Indice AFAI : 0.08 (seuil alerte : 0.40)
📅 Prévision demain : Propre
📅 Prévision 3 jours : Propre
📅 Prévision 7 jours : [propres / modéré / alerte]

✅ Aujourd'hui, vous pouvez rassurer vos clients.

Source : satellite Copernicus Marine, vérifié à [heure]h.
Fiabilité : [X]% (audité sur /fiabilite/)

—
Le Veilleur · veille côtière, Martinique
```

---

## Template WhatsApp (jour avec alerte)

```
Bonjour [nom] ⚠️

Voici l'état de [plage] ce matin :

🔴 Alert — Des sargasses sont détectées
📍 Indice AFAI : 0.52 (seuil alerte : 0.40)
📅 Prévision demain : Modéré
📅 Prévision 3 jours : Alert
📅 Prévision 7 jours : Alert

⚠️ Aujourd'hui, vos clients pourraient être déçus s'ils vont à [plage].
Conseil : orientez-les vers [plage alternative propre], à [distance].

Source : satellite Copernicus Marine, vérifié à [heure]h.
Fiabilité : [X]% (audité sur /fiabilite/)

—
Le Veilleur · veille côtière, Martinique
```

---

## Template WhatsApp (jour modéré)

```
Bonjour [nom] 🟠

Voici l'état de [plage] ce matin :

🟠 Modéré — Présence de sargasses en diminution
📍 Indice AFAI : 0.28 (seuil alerte : 0.40)
📅 Prévision demain : [modéré / propre / alerte]
📅 Prévision 3 jours : [etc.]
📅 Prévision 7 jours : [etc.]

🟡 Conseil : la plage est praticable mais des sargasses sont visibles.
Vos clients préféreront peut-être [plage alternative].

Source : satellite Copernicus Marine, vérifié à [heure]h.
Fiabilité : [X]% (audité sur /fiabilite/)

—
Le Veilleur · veille côtière, Martinique
```

---

## Template email (si pas de WhatsApp)

**Objet** : [Plage X] — prévisions sargasses [date]

**Corps** :

```
Bonjour [nom],

Voici les prévisions pour [plage] de votre hôtel :

Aujourd'hui : [vert/orange/rouge] — [description courte]
Demain : [etat]
Dans 3 jours : [etat]
Dans 7 jours : [etat]

Source : satellite Copernicus Marine, vérifié à [heure]h.
Fiabilité : [X]% (audité sur /fiabilite/).

[Si alerte] : Conseil : orientez vos clients vers [plage alternative], à [distance].

Si vous souhaitez recevoir ces prévisions chaque matin automatiquement, répondez à cet email.

—
Le Veilleur · veille côtière, Martinique
```

---

## Template de proposition concierge (premier contact email)

**Objet** : [Plage X] — je surveille votre plage, gratuitement pendant 7 jours

**Corps** :

```
Bonjour [nom],

Votre hôtel est juste devant [plage X]. Je surveille les sargasses par satellite pour cette plage.

Pendant 7 jours, je peux vous envoyer les prévisions chaque matin :
- État actuel (vert/orange/rouge)
- Prévision demain, dans 3 jours, dans 7 jours
- Alerte si la plage bascule dans la nuit

Vous n'avez rien à installer. C'est gratuit. À la fin de la semaine, on en reparle.

Vous voulez que je commence ? Donnez-moi votre numéro WhatsApp ou email, et demain matin à 7h vous recevez la première prévision.

—
[ton nom]
Le Veilleur · sargasses-martinique.com
```

---

## Calendrier d'envoi (7 jours, pas 30)

| Jour | Heure | Contenu | Action |
|------|-------|---------|--------|
| J1 (Lundi) | 7h00 | 1ère prévision | — |
| J2 (Mardi) | 7h00 | 2ème prévision | — |
| J3 (Mercredi) | 7h00 | 3ème prévision | Appel feedback |
| J4 (Jeudi) | 7h00 | 4ème prévision | — |
| J5 (Vendredi) | 7h00 | 5ème prévision | — |
| J6 (Samedi) | 7h00 | 6ème prévision | — |
| J7 (Dimanche) | 7h00 | 7ème prévision | **DEMANDE DE PAIEMENT** |

---

## Transition concierge → SaaS (Jour 7)

Après 7 jours, **3 questions dans l'ordre** :

> **1. "Est-ce que cette information vous a été utile cette semaine ?"**
>
> Si oui →
>
> **2. "Vous voudriez continuer à la recevoir automatiquement ?"**
>
> Si oui →
>
> **3. "Je vous l'active à 29 €/mois ?"**

**Puis tu attends. Ne dis rien. Laisse le silence travailler.**

Pas :
> ❌ "Ça vous intéresserait ?"

Mais :
> ✅ **"Je vous l'active à 29 €/mois ?"**

Si non à la question 3 : "D'accord. Qu'est-ce qui manquerait pour que ça vaille 29€ ?"

---

## Données à tracker pour chaque envoi

| Champ | Source | Usage |
|-------|--------|-------|
| Hôtel | | |
| Plage | | |
| Date envoi | | |
| Heure envoi | | |
| Canal | WhatsApp / Email | |
| Indice AFAI | `public/api/copernicus/sargassum.json` | |
| État | vert / orange / rouge | |
| Lu ? | WhatsApp blue checks / email open | Utilisé pour le feedback |
| Réponse ? | | Signal d'intérêt |
| Action | | |
