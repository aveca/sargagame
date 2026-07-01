# Analyse concurrentielle — Sargatrack (sargatrack, Samuel Fourmy)

> Daté du 2026-07-01. Concurrent **direct sur notre marché domestique EUR** (Martinique, Guadeloupe, Saint-Martin). Pendant "home turf" de `competitor-sargazowatch.md` (qui, lui, couvre l'USD/Caraïbe).

## TL;DR

**Non, ils ne nous dépassent pas — mais ils attaquent notre angle mort (preuve du présent + communauté) sur notre cœur EUR.**

Sargatrack fait du **bruit sur Facebook** parce que leur moteur de croissance EST la communauté (signalement citoyen viral). C'est un **avantage de distribution/notoriété top-funnel**, pas une supériorité produit : ils ne prennent aucun de nos leviers de moat (forecast par plage + confiance auditée, alertes push/PWA, monétisation, profondeur SEO, multi-marchés). Leur "noise" doit alerter, pas faire paniquer.

Le point structurant : la **preuve du présent + boucle UGC communautaire** est désormais attaquée sur **deux fronts** — Sargazo Watch en USD, Sargatrack en EUR domestique. C'est exactement le **P0 déjà identifié** (`competitor-sargazowatch.md`) : activer `BeachReport` / photos visiteurs (backend Supabase) en flux UGC. Sargatrack rend ce P0 plus urgent.

---

## Faits vérifiés (sources en bas)

- **Lancé mi-avril 2026** par **Samuel Fourmy**. Couverture : **Martinique + Guadeloupe + Saint-Martin** (Antilles françaises uniquement).
- **Modèle = signalement citoyen collaboratif** : l'utilisateur photographie les sargasses (échouées ou au large), l'app modélise, crée des points de données et "apprend" en recroisant les photos d'un même banc dans le temps. Combine **data satellite officielle + rapports citoyens**, affichés sur carte.
- **Positionnement civique/communautaire, gratuit** : "faire le lien entre décideurs et citoyens", "organiser le chaos des sargasses". Cible = **résident / collectivité / acteur du territoire**, PAS le touriste qui réserve.
- **Traction (depuis avril)** : ~16 000 visites, ~850 inscrits. Web + iOS + Android. ⚠️ Ne pas confondre avec l'app Android homonyme "SargaTrack" d'un éditeur "Sithislas" (~400 téléchargements, sans rapport apparent) — le concurrent réel est celui de Samuel Fourmy.
- **Distribution = Facebook / communauté** (viralité citoyenne, groupes locaux sargasses).

## Ce qu'ils font mieux que nous (à rattraper — même gap que Sargazo Watch)

1. **Boucle communautaire virale sur Facebook.** Le signalement citoyen EST le produit ET le canal de croissance. Notoriété organique locale "sargasses martinique aujourd'hui" à coût ~0.
2. **Preuve du présent par photo terrain.** Vérité terrain fraîche + UGC + contenu. Nous vendons une *prédiction* ; ils montrent la *réalité constatée*. Notre `BeachReport`/photos visiteurs (Supabase) répond exactement à ça mais reste **sous-exploité**.

## Ce qu'on fait mieux qu'eux (à défendre et marketer)

1. **Vrai forecast par plage + confiance auditée** (`/fiabilite/`, pipeline v3 ERDDAP-live, half-life 5j). Eux montrent le présent constaté, ils ne prédisent pas le futur. **Notre moat.**
2. **Alertes push + PWA installable** = le seul mécanisme de rétention. Eux : app de signalement, pas de "verdict qui revient dans ta poche chaque matin".
3. **Monétisation fonctionnelle** (pass Mollie + MRR). Eux : zéro revenu visible → fragile dans la durée.
4. **Profondeur SEO (136+ pages, EN/ES) + multi-marchés** (MQ/GP + 3 domaines USD). Eux : mono-langue, Antilles FR uniquement.
5. **Cas d'usage voyageur payant** vs leur cible résident/décideur — audiences et intentions différentes.

---

## Plan d'action

### P0 — combler le trou de la preuve présente (déjà prioritaire, maintenant urgent sur 2 fronts)
- [ ] **Activer/valoriser les photos visiteurs (`BeachReport` + Supabase) en flux UGC visible** : "dernière photo il y a Xh", preuve terrain par plage. Composant + backend déjà là, coût quasi nul.

### P1 — presser notre wedge (ne PAS jouer leur jeu civique frontal)
- [ ] Marketer **"mesuré au satellite, pas deviné" + fiabilité auditée + alertes + installable** — ce qu'ils n'ont pas — sur la home et les pages SEO MQ/GP.
- [ ] Garder une **couche gratuite généreuse** (verdict du jour + photos) pour matcher leur friction-zéro ; le pass reste sur le *futur* (forecast/alertes premium).

## À surveiller
- S'ils ajoutent **forecast par plage ou alertes push** → ils grignotent notre moat/rétention. À monitorer.
- S'ils **monétisent** → valident notre modèle ou cassent les prix sur le marché EUR domestique.
- Volume Facebook / croissance des inscrits (baseline ~850 au 2026-07-01) comme proxy de la menace top-funnel.

## Sources
- [RCI — Samuel Fourmy crée Sargatrack](https://rci.fm/martinique/infos/Environnement/Samuel-Fourmy-cree-Sargatrack-une-application-pour-surveiller-les-sargasses)
- [Cap-Infos — "organiser le chaos des sargasses"](https://cap-infos.fr/sargatrack-une-appli-pour-organiser-le-chaos-des-sargasses/)
- [Hubmonster — SargaTrack](https://www.hubmonster.io/p/sargatrack)
- Doc jumeau (USD/Caraïbe) : `docs/competitor-sargazowatch.md`.
