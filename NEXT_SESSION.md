# NEXT_SESSION — sargagame

*Session 41 (soirée 2026-06-11, large partie en autonomie). Détail : memory `project_session41_done.md`. Dernier commit : b4546e2.*

## 🟢 Shippé session 41 (10+ pushes)
- **Processus du jour** : health-check post-deploy vérifie que le deploy a PRIS (version SW live = repo, 5 domaines) + gardes incidents/Resend ; crons command-center réactivés (daily-sargasses-check 09h01 → vérité Stripe commitée chaque matin ; éval A/B lundi 09h35, RECOMMEND-only).
- **Bug Cancún** (report user) : heatmap AFAI + bancs étaient filtrés À VIDE sur les 3 régions USD (filtres lat/island hérités MQ/GP) — 1 398 points + 15 bancs invisibles. Fixé (MapView), MQ prouvé inchangé.
- **Clics** (report user) : pins sains une fois la carte posée (53/53 MQ, 25/25 GP, 12/12 Cancún live) ; vraie cause = rebuild des markers à chaque refresh data sans changement matériel → fenêtres de clics morts. Fixé (garde par signature). + Hero : tap photo/nom/verdict = fiche plage (716 rage+dead clicks Clarity éteints).
- **Jeu** : fond = SVG illustré golden-hour STATIQUE (2 décisions user : pas d'animation — mal de tête — pas de photo — pas assez HD). KPI série : beacons analytics_event (start/end/share/cta). SW v59.
- **Drip EN/ES J+7/J+14** : séquence complète régions USD, vraies plages du jour, no-trial, prix/liens régionaux. Fuite marque corrigée (« SARGASSES/Se désabonner » partait en FR sur les emails EN/ES).
- **SEO maillage** : footer réseau USD sur les 136 pages plages MQ/GP ; **7 hubs zones côtières** (/plages/<zone>/, classement par commune, 136/136 mappées) + lien remontant ; **cross-links mois** entre les 5 destinations (mois courant, slugs localisés).
- **Héros DepthFlow** : pipeline vidéo 2.5D local GRATUIT (RTX 4060 Ti, .venv-depthflow, ~3 s/clip) — 5 clips palindrome (1 par domaine) commités `assets/hero-depthflow/`, overlay dans make-hero-loops avant manifest. Higgsfield : MCP installé + audité (.mcp.json), clés user OK, **manque les crédits Cloud API** (achat user).
- **CI ux-report** : 2 runs ont perdu le rapport GA4 réussi (audit-capture pendait > timeout job) → commit du rapport AVANT le step fragile + timeout step 9 min. Run #3 relancé.

## ⚠️ REPRISE IMMÉDIATE
1. **Vérifier le train final** (run de b4546e2) : SW v59 sur 5 domaines (health-check le fait), puis QA live : 7 hubs `/plages/<zone>/`, cross-links mois, tap hero→fiche, scène SVG jeu, couches sargasses Cancún ENFIN visibles, héros DepthFlow (mq014/gp024/fl011/pc007/rm011).
2. **Rapport UX run #3** (27384974783) : si vert → chiffres GA4/Clarity frais à analyser (le commit arrive AVANT capture désormais). Si capture-audit pend encore : root-cause dans scripts/audit-capture.cjs (timeout interne par domaine manquant).
3. **KPI jeu** : vérifier les premiers sg_game_* dans la sheet events (J+1).
4. **Éval A/B lundi** (cron) — premier rapport pw_cta_order + pw_prelude.

## ⚖️ Décisions user en attente
Crédits Higgsfield Cloud API (pack min ~100-150 crédits → 5 héros « vraies vagues » + pub Nettoyeur) · Cloudflare token · GO publication FB briefs vidéo · Share-promo USD · Apple Pay sur device réel · ESA BIC Sud (SASU).

## 📋 Backlog (autonome)
#19 pages santé Q&A → #21 pages EN (enPath:null) → #22 épuré carte → #38 webhook régions hardcodées (AVANT région 6) → #27 GA4 dans la série → #30 re-engagement + webhook Resend bounces → #23 scène three.js → #25 région suivante (DR/BS). DepthFlow : étendre aux 73 photos si le rendu plaît (batch ~20 min local). Différés post-éval A/B pw_* : réordonnancement preuve modal, titre nominatif plage, guarantee-as-feature.

## Garde-fous inchangés
EUR/MQ-GP intouchables (Payment Links, A/B pw_*, trial copy byte-identique — smoke à chaque touche de Sargasses_PROD.jsx) · seuils pipeline interdits · SW bump à chaque deploy code (prochain : v60) · grouper les pushes · jamais de step CI nouveau sans preuve EN CI · **jamais un step fragile entre une donnée et son commit** · état email commité immédiatement · **jamais d'animation de fond dans le jeu** · Chrome=user, Edge=automation FB.
