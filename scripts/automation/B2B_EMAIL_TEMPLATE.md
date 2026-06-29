# Template email B2B (outreach hôtels) — forgé par panel storytelling 2026-06-29

> Modèle réutilisable pour tout futur établissement. Remplace les {{placeholders}}, garde la colonne vertébrale (faille spécifique du prospect → cadeau widget corrigé → douleur du matin → guide+honnêteté → offre essai 30j → CTA espace perso). 100% self-serve, ZÉRO call. Adaptable EN/ES.

**Objet (A/B) :** Anoli, votre widget surveille la mauvaise plage / Anoli, votre widget surveille la mauvaise plage / Vos clients vont aux Salines. Votre widget regarde le Bourg. / Sainte-Anne : votre widget rassure vos clients à tort

---

## Template email B2B — « Le Veilleur » (réutilisable, FR · adaptable EN/ES)

**Objet :** `{{nom}}, votre widget surveille la mauvaise plage`
*(variante : `Vos clients vont à {{plage}}. Votre widget regarde {{plage_repli}}.`)*

---

Bonjour l'équipe de {{nom}},

J'écris depuis {{territoire}}. En passant sur votre site, j'ai remarqué un détail : votre widget sargasses semble réglé sur **{{plage_repli}}**. Si c'est bien le cas, ça vaut la peine d'y regarder, parce que vos clients, eux, vont à **{{plage}}**, à {{distance}}.

Et ce ne sont pas la même mer. {{contraste_geo : pourquoi {{plage_repli}} est abritée et {{plage}} exposée}}. Certains matins, {{plage_repli}} affiche **vert** pendant que {{plage}} vire au **rouge** — votre site rassure alors vos voyageurs sur une plage où ils ne mettront pas les pieds.

Si vous voulez le corriger vous-même, voici le réglage sur {{plage}}, en marque blanche. Rien à payer, rien à activer :

```html
<div style="max-width:520px">
  <iframe
    src="https://{{domaine}}/widget/embed/?beach={{slug}}&name={{nom_url}}"
    width="100%" height="168" frameborder="0"
    title="Conditions de plage — {{nom}}"
    style="border:0;width:100%"></iframe>
</div>
```

Vous le retrouverez aussi prêt à copier dans votre espace, plus bas. Même si vous fermez cet email ici, votre site sera juste — on est quittes.

---

Le vrai sujet tient en une phrase. Quand une plage bascule dans la nuit, vous l'apprenez d'habitude **en même temps que vos clients** — à l'accueil, déçus, parfois suivi d'un avis tiède. L'idée du Veilleur, c'est d'inverser l'ordre : l'alerte « le matin où ça bascule » vous arrive **avant** l'échouage.

Un satellite surveille la mer — données publiques Copernicus + NOAA — traduite en prévision **par plage**, J+1→J+7. Opéré depuis {{territoire}}. Notre seule promesse, c'est l'honnêteté : on **publie et on audite notre taux d'erreur chaque jour**, réussites comme ratés, sur **/fiabilite/**. Vérifiez avant de nous croire.

Ce que le Pro inclut : alerte par plage · prévision 7 j · widget à votre marque · encart « Partenaire — {{nom}} » sur la fiche de {{plage}}, quand un voyageur vérifie avant de réserver (il ne touche jamais le verdict de la plage).

**Essai : {{jours_essai}} jours gratuits, sans carte.** Ensuite, si ça vous sert : **{{prix_mois}}/mois** ou **{{prix_an}}/an**, garantie 30 j, résiliable. 100 % libre-service, zéro appel.

**→ [Voir mes plages en direct & activer l'essai](https://{{domaine}}/pro/espace/?beach={{slug}}&name={{nom_url}}&partner={{partner}})**

À très vite,
**Le Veilleur** — *Sargasses {{territoire}}. Il regarde la mer, jamais vos clients.*

---

### Notes d'emploi
1. **Hedge obligatoire sur le hook** : toujours « semble réglé sur » + « si c'est bien le cas ». Le constat plage-par-plage est l'arme n°1, mais s'il est faux et asséné, l'email s'effondre et vexe. Le conditionnel le rend increvable.
2. **Cadeau ≠ injonction** : « si vous voulez le corriger vous-même » et non « collez à la place de l'ancien ». On ne touche jamais à leur code ; on offre, ils décident. Toujours fournir la version marque blanche (drop le crédit « par Sargasses » → ajoute `&k={{token}}` si compte Pro).
3. **Chemins vérifiés** : `/widget/embed/?beach={{slug}}` (height 168, wrapper max-width:520px) et `/pro/espace/?beach&name&partner`. `{{nom_url}}` = nom URL-encodé. GP → domaine `sargasses-guadeloupe.com`.
4. **Prix tôt + honnêteté chiffrée** : jamais enterrer le tarif après 600 mots. Ne PAS balancer un taux de réussite « 100 % » (esbroufe en saison calme) ; renvoyer vers /fiabilite/ et laisser vérifier. Si on cite un chiffre, citer le global tous-régimes (~76 %), pas le flatteur.
5. **Longueur cible : ≤ 280 mots de corps.** Une douleur = une phrase. Zéro prose (« magicien », scènes de petit-déj, heures précises répétées). Le sceptique débordé décroche sinon.
6. **EN/ES** : traduire sans toucher la structure. EN territoire = « from Florida / Punta Cana » ; signature « He watches the sea, never your guests ». ES = « Mira el mar, nunca a tus clientes ». Garder /fiabilite/ (ou /reliability/, /fiabilidad/ selon route).
