# Analyse concurrentielle — Sargazo Watch (sargazowatch.com)

> Daté du 2026-06-28. Concurrent **direct** sur le marché USD/Caraïbe (Cancún, Riviera Maya, Punta Cana).

## TL;DR

Sargazo Watch et nous attaquons le même problème (« la plage est-elle propre aujourd'hui ? ») par **deux bouts opposés** :

- **Eux = preuve visuelle + crowdsourcing, gratuit.** Webcams hôtelières en direct + photos visiteurs + carte « plages propres » du jour. Pas de paywall, pas d'app, pas d'alertes. Couverture concentrée Riviera Maya / Caraïbe mexicaine.
- **Nous = prédiction + alertes, monétisé.** Forecast satellite ERDDAP par plage avec intervalle de confiance, 4×/j, PWA installable, push d'alerte, verdict quotidien par plage, 136+ pages SEO, modèle pass payant (Mollie). Couverture MQ/GP + USD (Floride, Punta Cana, Cancún).

Sur le **chevauchement Cancún/Riviera Maya, ils sont devant** : leur produit répond à la question avec une certitude qu'on n'a pas (une caméra ne ment pas). Nous sommes devant sur le **futur** (prédire) et la **rétention** (alertes/PWA/paiement). Pour être « au moins aussi bons », il faut combler le **trou de la preuve présente**.

---

## Ce qu'ils font mieux que nous (à rattraper)

1. **Webcams de plage en direct — leur arme nº1.** Une caméra hôtelière qui stream maintenant = confiance instantanée, zéro modèle à expliquer. C'est notre plus gros gap. On vend une *prédiction* ; eux montrent la *réalité*. Pour un touriste qui réserve, voir > prévoir.
2. **Photos & rapports visiteurs (citizen science).** Flux de photos terrain fraîches + rapports = vérité terrain + UGC + contenu SEO + boucle d'engagement gratuite. On a déjà le composant `BeachReport` — sous-exploité.
3. **Outlook régional long (2–4 semaines).** Ils corrèlent les Petites Antilles → impact Mexique via NOAA SIR (AOML/CoastWatch) + AFAI (NASA/USF) : composite densité 7j, flèches de courants, historique 6 mois. Nous sommes excellents en court terme par plage, faibles sur l'horizon régional « ça arrive dans X semaines ».
4. **Gratuit / friction zéro.** Aucun paywall : capte tout le trafic top-funnel et le SEO « sargassum cancun today » sans barrière.

## Ce qu'on fait mieux qu'eux (à défendre et marketer)

1. **Vrai forecast par plage + confiance.** Pipeline v3 ERDDAP-live, persistance exponentielle (half-life 5j), intervalle de confiance. Eux = « outlook régional, pas une garantie par plage ». **Notre moat technique.**
2. **Alertes push + PWA installable.** Le seul mécanisme de *rétention* du secteur. Eux : aucune app, aucune notif → site « one-shot ». On revient dans la poche du user chaque matin.
3. **Verdict quotidien par plage + profondeur SEO (136+ pages).** Granularité plage-par-plage qu'ils renvoient explicitement à leur carte faute de l'avoir en forecast.
4. **Modèle économique fonctionnel.** Pass Mollie (EUR 7,99/14,99/24,99 · USD 5,99/11,99/19,99) + MRR Stripe legacy. Eux : aucune monétisation visible → fragile dans la durée.
5. **Multi-marchés.** MQ/GP + USD vs leur mono-région Riviera Maya.

---

## Plan d'action — « au moins aussi bien qu'eux »

### P0 — combler le trou de la preuve présente
- [ ] **Webcams en direct** sur nos plages USD/Antilles. Embarquer les webcams publiques existantes (offices de tourisme, hôtels, surf-cams) ; à défaut, partenariats hôtels. Même 3–5 cams sur les plages phares change la perception « ils devinent » → « ils montrent ».
- [ ] **Activer/valoriser `BeachReport` en flux UGC** : soumission photo + état par les users, modération légère, affichage « dernière photo il y a Xh ». Vérité terrain + SEO + engagement, coût quasi nul (composant déjà là).

### P1 — neutraliser leur avantage forecast régional
- [ ] **Outlook régional 2–4 semaines** en complément du court terme par plage : composite densité offshore + flèches de courants (sources NOAA SIR / USF AFAI, déjà publiques) pour le « pourquoi / ça arrive ».
- [ ] **Carte « plages propres aujourd'hui »** : vue agrégée verte/rouge du jour, leur format le plus partagé/SEO-friendly.

### P2 — presser nos avantages
- [ ] Mettre en avant **confiance + alertes + installable** dans le pitch (ce qu'ils n'ont pas) sur la home et les pages SEO USD.
- [ ] Garder une **couche gratuite généreuse** (cams + carte du jour) pour matcher leur friction-zéro, le pass reste sur le *futur* (forecast/alertes premium).

## À surveiller
- S'ils ajoutent **alertes / app** → ils ferment notre principal avantage de rétention. À monitorer.
- S'ils **monétisent** (le jour où le trafic le justifie), ils valident notre modèle ou cassent les prix.

## Sources
- [Sargazo Watch — Home](https://www.sargazowatch.com/)
- [Sargazo Watch — Forecast](https://www.sargazowatch.com/forecast)
- Méthodo forecast concurrent : NOAA Sargassum Inundation Risk (AOML/CoastWatch) + AFAI NASA/NESDIS, données University of South Florida.
