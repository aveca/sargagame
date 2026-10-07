# SEO-DOMAIN-CONTENT-GP-MQ-20260930-1228 — Stop GP domain serving indexable Martinique content

- **source** : production-seo-sentinel issue #780
- **sévérité** : high · **confiance** : observed
- **actionable** : agent
- **preuve** : LIVE evidence observed on 2026-09-30: /plages/pointe-faula/ identifies Pointe Faula, Le Vauclin, Martinique; /plages/anse-madame/ identifies Anse Madame, Schoelcher, Martinique; /conditions/plages-enfants/ is explicitly a Martinique page; /conditions/baignade-ideale/ is explicitly a Martinique page. Control evidence: genuine GP beach pages such as Caravelle and Pointe de la Verdure correctly identify Guadeloupe. Repository contracts already include region filtering/cross-domain duplicate prevention in scripts/prepare-ftp.cjs and sitemap cross-domain checks in scripts/automation/seo-sitemap-check.cjs.
- **impact attendu** : Count of MQ-owned indexable URLs served on sargasses-guadeloupe.com; target = 0.
- **rollback** : Revert the isolated domain-isolation commit if production verification shows unintended GP route loss; restore the previously valid sitemap/domain contract.
- **statut** : new

_Généré par l'autopilot le 2026-10-05T21:34:43.185Z_
