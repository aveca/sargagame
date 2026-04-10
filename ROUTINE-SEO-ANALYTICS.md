# Routine SEO & Analytics — Sargasses Martinique & Guadeloupe

## Outils connectes

| Outil | Martinique | Guadeloupe | URL |
|-------|-----------|------------|-----|
| Google Analytics 4 | G-V8JGMDZZ2Y | G-Q31VV3LLM9 | https://analytics.google.com |
| Microsoft Clarity | w4o6w9aenv | w4oect7ph3 | https://clarity.microsoft.com |
| Google Search Console | sc-domain:sargasses-martinique.com | sc-domain:sargasses-guadeloupe.com | https://search.google.com/search-console |
| GA4 <-> GSC | Associe | Associe | Admin > Associations > Search Console |

---

## Routine hebdomadaire (15 min)

### Lundi — UX (Clarity) — 5 min
1. Ouvrir https://clarity.microsoft.com
2. Regarder **5 session recordings** (filtre : mobile, derniers 7 jours)
3. Noter les frustrations : ou les gens hesitent, quittent, rage-cliquent
4. Verifier le **dashboard rage clicks** — si > 5% des sessions = probleme UX urgent
5. Verifier les **dead clicks** — boutons qui ne marchent pas
6. **Action** : noter les problemes trouves et me les donner pour correction

### Mercredi — SEO (GSC) — 5 min
1. Ouvrir https://search.google.com/search-console
2. Verifier **Indexation > Pages** : nouvelles erreurs 404 ou redirections ?
3. Verifier **Performances** : quels mots-cles apportent du trafic ?
4. Verifier **Core Web Vitals** : tout en vert ?
5. **Sitemaps** : verifier que les sitemaps sont bien lus (derniere lecture < 7 jours)
6. **Action** : si nouvelles erreurs, me les donner pour correction immediate

### Vendredi — Trafic (GA4) — 5 min
1. Ouvrir https://analytics.google.com
2. **Rapports > Engagement > Pages** : quelles pages sont les plus vues ?
3. **Rapports > Acquisition** : d'ou viennent les visiteurs ? (Google, direct, social)
4. **Rapports > Tech** : mobile vs desktop (ratio)
5. **Temps reel** : verifier que le tracking fonctionne (visiter le site et voir le hit)
6. **Action** : identifier les pages populaires pour enrichir leur contenu

---

## Quand me demander d'intervenir

Dis-moi "lance la routine SEO" et je ferai automatiquement :
1. Explorer la GSC pour nouvelles erreurs et les corriger
2. Verifier les Core Web Vitals et optimiser si besoin
3. Analyser les pages les plus performantes et proposer des ameliorations
4. Soumettre les nouvelles URLs a l'indexation
5. Verifier que le deploiement cron n'a rien casse

Dis-moi "lance la routine UX" et je ferai :
1. Verifier le site en mobile et desktop
2. Tester les boutons, la navigation, les formulaires
3. Corriger les problemes de responsive trouves
4. Optimiser les Core Web Vitals (LCP, FID, CLS)

Dis-moi "lance la routine analytics" et je ferai :
1. Verifier que GA4 et Clarity recoivent des donnees
2. Analyser les metriques cles (taux de rebond, duree session, pages/session)
3. Identifier les pages a fort potentiel et proposer des optimisations
4. Creer des evenements personnalises si besoin

---

## Metriques cles a surveiller

| Metrique | Objectif | Ou la voir |
|----------|----------|-----------|
| Pages indexees | > 30 (MQ) + > 30 (GP) | GSC > Indexation |
| Clics organiques/semaine | > 200 | GSC > Performances |
| Taux de rebond | < 60% | GA4 > Engagement |
| Mobile / Desktop | Suivi du ratio | GA4 > Tech |
| Core Web Vitals | Tout en vert | GSC > Experience |
| Rage clicks | < 3% des sessions | Clarity > Dashboard |
| Session recordings | 5/semaine minimum | Clarity > Recordings |
| Erreurs 404 | 0 | GSC > Indexation > Pages |

---

## Checklist mensuelle

- [ ] Verifier que le cron Copernicus tourne (GitHub Actions > dernier run)
- [ ] Verifier que les sitemaps sont a jour (GSC > Sitemaps)
- [ ] Soumettre les nouvelles pages a l'indexation si besoin
- [ ] Analyser les mots-cles en position 5-15 (opportunites de gain rapide)
- [ ] Verifier la validite des donnees structurees (GSC > Ameliorations > FAQ)
- [ ] Comparer le trafic mois N vs mois N-1

---

## Architecture technique

- **Cron quotidien** : GitHub Actions (`daily-copernicus.yml`) a 10h UTC
  - Scrape Copernicus Marine → build Vite → prepare-ftp → FTP deploy
  - `dangerous-clean-slate: false` = ne supprime rien, ne fait que mettre a jour
- **GA4** : balise gtag.js dans `<head>` de index.html, patche par prepare-ftp.cjs pour GP
- **Clarity** : script async dans `<head>`, patche par prepare-ftp.cjs pour GP
- **Sitemaps** : generes dynamiquement pendant `npm run build` (lastmod = date du build)
- **Pages plages** : 20 pages statiques generees pendant le build (10 MQ + 10 GP)
- **Redirections 301** : ~100 regles dans public/.htaccess
