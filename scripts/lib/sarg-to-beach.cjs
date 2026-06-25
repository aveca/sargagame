// Mapping clé d'archive Copernicus (IDs hebdo SARG courts) → id beaches-list.json.
//
// SOURCE DE VÉRITÉ PARTAGÉE — consommée par :
//   • vite.config.js (génération des 136 pages plages, via _require)
//   • scripts/automation/seo-enrich-content.cjs (jointure de l'historique satellite
//     → metaTitle/metaDesc data-driven sur les fiches plage)
//
// Historique : la map était dupliquée inline dans vite.config.js seulement ; la jointure
// SEO (seo-enrich) clé sur beach.slug/beach.id ne matchait donc QUE 3/136 fiches (celles
// dont le slug == clé SARG par accident). En centralisant ici + en re-clé sur l'id, les
// 20 plages à archive réelle (têtes de longue traîne touristique) s'allument. Ajouter une
// plage ici la propage AUTOMATIQUEMENT au build ET à l'enrichissement SEO (anti-drift).
const SARG_TO_BEACH = {
  "grande-anse": "mq014",
  "anse-mitan": "mq011",
  "anse-noire": "mq012",
  "tartane": "mq034",
  "anse-madame": "mq024",
  "diamant": "mq016",
  "pt-marin": "mq008",
  "sainte-anne": "mq004",
  "les-salines": "mq001",
  "vauclin": "mq044",
  "gp-grande-anse": "gp021",
  "gp-malendure": "gp031",
  "gp-sainte-anne": "gp010",
  "gp-pt-chateaux": "gp005",
  "gp-gosier": "gp012",
  "gp-caravelle": "gp009",
  "gp-bas-du-fort": "gp014",
  "gp-deshaies": "gp024",
  "gp-moule": "gp080",
  "gp-vieux-fort": "gp042"
}

module.exports = { SARG_TO_BEACH }
