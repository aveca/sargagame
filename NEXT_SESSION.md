# NEXT_SESSION — sargagame

*Session 2026-06-10 (suite « 0→1 » + tour site-par-site). Audit live 6 agents (1/domaine + cross-site) + verify adversarial : **0 critical/high** — sites sains. 13 mediums → tous les actionnables corrigés + funnel/notifs/°F/banks shippés. ~4 commits poussés (dernier : 2eb55c8).*

## 🎯 État cash USD
| Région | Domaine | Site | Payment Links | GSC sitemap |
|---|---|---|---|---|
| Punta Cana | sargassumpuntacana.com | ✅ LIVE | ✅ $9.99/$79 + prefill+attribution | ✅ soumis 06-10 |
| Riviera Maya | sargassumcancun.com | ✅ LIVE (ES) | ✅ | ✅ soumis |
| Florida | sargassummiami.com | ✅ LIVE (°F/mph dès deploy) | ✅ | ✅ soumis |

- MRR funnel affiche €4,99/1 payant = **fenêtre 28j** (les 7 paiements d'avril sont sortis de la fenêtre) — PAS une régression. Vrai MRR à établir demain via réconciliation.

## 🟢 Shippé cette session (tout poussé)
- **Funnel** (vérifié live sur les bundles) : Payment Links avec `prefilled_email` + `client_reference_id=<region>_<plan>_<source>` ; paywall repositionné alertes (« Sois prévenu avant que ta plage tourne » EN/ES aussi) ; annuel par défaut + équivalent €/mois. MQ intact (pw_prelude/EUR prouvés au bundle).
- **Apps Script @42** (clasp) : sheet `subscription_events` (invoice.payment_succeeded / subscription.deleted / payment_failed — étaient PERDUS en unknown_type → renouvellements+churn enfin enregistrés) + colonne `ref` (attribution) dans payments. Testé live.
- **Bancs+grille par région** : pipeline étape 8 (regionCtx), prepare-ftp les sert (fin des 2×404 console USD), workflow les committe. Banc à 20km de Bávaro au 1er run.
- **GP** : miroirs _gp/ assainis à la source (toGpMirror : og:site_name/SearchAction/GA4/Clarity/geo/FAQPage hérité) — l'overlay écrasait le patcher. « 82→83 plages ».
- **MQ** : `/plages/` hub enfin servi (la règle .htaccess `^plages/?$→/` legacy l'enterrait, d'où « Duplicate not selected » GSC) ; « 134→53 plages » ; /a-propos/ au sitemap.
- **SERP resorts PC+MIA** : fini les titles coupés en plein mot (templates de repli + smartTrim).
- **Forecast chips EN/ES** : remap des jours FR du JSON au rendu (fcDay).
- **Floride** : °F/mph/ft/in (WeatherCards + raisons score, gate countryCode US).
- **Push primer** : fallback 30/60s ne tire plus le prompt natif à froid (cooldown 7j respecté).
- **Notifs** (run précédent, confirmé déployé) : alertes favoris MQ/GP livrées (mismatch ids) + dédup inter-runs.
- **Diag sans fix (légitime)** : scores PC quasi uniformes = géographie (25km homogènes), pas un bug. SW v34.

## ⚠️ À FAIRE (ordre)
1. **Vérifier deploy 27270122674 en prod** (watcher armé en fin de session) : `curl https://sargassumpuntacana.com/api/copernicus/sargassum-banks.json` (200 attendu), `/plages/` MQ → 200 hub « Toutes les plages », GP `/conditions/mer-calme/` og:site_name Guadeloupe, titles resorts Miami propres, °F dans la sheet Miami.
2. **Réconciliation webhook J+1 (2026-06-11)** : Stripe (subscriptions actives par région) vs Sheets payments+subscription_events. Établir le VRAI MRR (7 EUR d'avril : actifs ? churnés ?). `scripts/audit-stripe-duplicates.cjs` a le pattern d'auth Stripe.
3. **Chip user Cloudflare** : token API → `gh secret set CLOUDFLARE_API_TOKEN` puis `node scripts/automation/cloudflare-provision.cjs --only=sargazotulum.com` (canari) puis les 3 sites.
4. **Indexation** : sitemaps USD soumis aujourd'hui (04:44, provision-gsc) — suivre impressions GSC sous 7j. MQ : la fin du 301 /plages/ devrait résoudre le « Duplicate, submitted URL not selected ».
5. **Backlog** : stripe-webhook $KNOWN_REGIONS hardcodé (région 6) ; Resend 1 domaine/100 mails-jour (plafond ~100 subs) ; FTP uploader assets/ avant racine ; Apps Script digest FR pour non-GP ; bulletin weekend à confirmer vendredi ; capture email landing (vrai gap — HeroReco/DailyRecoStrip sont du code MORT, brief UX requis avant de coder, cf feedback_no_code_before_ux).

## Notes
- Rôles navigateurs (FERME) : Chrome=provisioning user, Edge=automation FB. docs/OPERATIONS.md.
- A/B MQ/GP : pw_prelude seul vivant. Ne pas toucher.
- `scripts/ux-clicktest.cjs` désormais committé (Playwright 5 domaines). Les « CRITICAL » mq/gp qu'il sort sur le clic marqueur = artefacts harnais (navigation SW pendant evaluate), pas des bugs site.
- FB groupes PC : 8 join requests en attente d'approbation → dès approbation, `fb-post-groups.cjs` (Edge).
