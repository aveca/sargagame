/**
 * season-climatology.cjs — Position SAISONNIÈRE régionale du sargasse (orientation
 * moyen terme J+14-21), encodée depuis la LITTÉRATURE PUBLIÉE, jamais inventée.
 *
 * POURQUOI (le moat = honnêteté) : au-delà de ~4 jours notre modèle physique n'a
 * AUCUNE skill par plage (cf. scripts/lib/forecast.cjs, half-life 5,0 j). On ne peut
 * donc PAS donner un verdict daté à 2-3 semaines. Ce qu'on PEUT dire honnêtement,
 * c'est « où on en est dans la saison » — un fait climatologique régional, sourcé,
 * qui aide une décision de réservation (B2C) ou de planification de ramassage (B2B)
 * SANS prétendre prédire une couleur de plage à une date donnée.
 *
 * Sortie = un label ORDINAL strict {hors-saison / approche-saison / pleine-saison}.
 * AUCUN pourcentage, AUCune tonne, AUCune date. La courbe est une CONSTANTE éditable
 * avec sa source citée par région — une courbe non sourcée serait une fabrication.
 *
 * Sources (saison d'AFFLUENCE aux côtes, hémisphère Nord) :
 *  - Wang, M. & Hu, C. et al. (2019), « The great Atlantic Sargassum belt », Science 365:83-87
 *    → la ceinture atlantique culmine en été boréal (≈ avr→août), minimum en hiver.
 *  - USF Optical Oceanography Lab — Sargassum Watch System (SaWS), bulletins mensuels
 *    (Outlook of Sargassum, par sous-région : Caraïbe est, golfe du Mexique, Atlantique tropical).
 *  - Antilles françaises : observations Météo-France / AFAI (afflux marqués mai→août).
 *  - Caraïbe mexicaine : van Tussenbroek et al. ; Red de Monitoreo del Sargazo (Q. Roo),
 *    pics mai→août, parfois jusqu'en septembre.
 *
 * NB : la saisonnalité est RÉGIONALE (toute une zone partage la même fenêtre) ; ce qui
 * diffère PLAGE par plage c'est l'EXPOSITION (côte au vent vs abritée) — traité dans
 * orientation.cjs, pas ici.
 */

// Phases ordinales (du plus calme au plus chargé). Ordre = sévérité croissante.
const PHASES = ['hors-saison', 'approche-saison', 'pleine-saison']

// Alias d'île → région climatologique canonique. (rivieramaya = id interne du domaine
// sargassumcancun.com ; 'mq'/'' par défaut = Martinique.)
const REGION_ALIAS = {
  mq: 'lesser-antilles', martinique: 'lesser-antilles',
  gp: 'lesser-antilles', guadeloupe: 'lesser-antilles',
  barbados: 'lesser-antilles',
  puntacana: 'hispaniola-east', 'punta-cana': 'hispaniola-east',
  rivieramaya: 'mexican-caribbean', cancun: 'mexican-caribbean', 'riviera-maya': 'mexican-caribbean',
  florida: 'florida',
  '': 'lesser-antilles',
}

// Profil mensuel par région climatologique. Index 0 = janvier … 11 = décembre.
// Valeurs = phase ordinale. Encodé depuis les sources ci-dessus (fenêtre d'affluence
// AUX CÔTES, pas la masse au large). Éditable — toute modif doit rester sourçable.
const CLIMATOLOGY = {
  // Petites Antilles (MQ/GP/Barbade). Afflux marqués mai→août, épaules avril & sept-oct.
  'lesser-antilles': {
    source: 'Wang & Hu 2019 (Science) + USF SaWS (Caraïbe est) + Météo-France/AFAI Antilles',
    // J   F   M   A   M   J   J   A   S   O   N   D
    months: [0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
  },
  // Caraïbe mexicaine (Riviera Maya / Cancún). Pics mai→août, parfois jusqu'en sept.
  'mexican-caribbean': {
    source: 'USF SaWS (golfe/Caraïbe ouest) + van Tussenbroek et al. + Red de Monitoreo del Sargazo (Q. Roo)',
    months: [0, 0, 1, 1, 2, 2, 2, 2, 2, 1, 0, 0],
  },
  // Hispaniola est (Punta Cana, RD). Côte exposée plein est, proche du profil Petites Antilles.
  'hispaniola-east': {
    source: 'USF SaWS (Caraïbe centrale) + Wang & Hu 2019',
    months: [0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
  },
  // Floride (côte atlantique / Keys). Affluence ≈ mai→août, épaules avril & sept.
  'florida': {
    source: 'USF SaWS (Florida / Straits of Florida) bulletins mensuels',
    months: [0, 0, 0, 1, 2, 2, 2, 1, 1, 0, 0, 0],
  },
}

function canonicalRegion(island) {
  const key = String(island || '').toLowerCase().trim()
  return REGION_ALIAS[key] || 'lesser-antilles'
}

/**
 * Phase saisonnière d'une région à une date donnée.
 * @param {string} island - id d'île/région ('mq','gp','florida','puntacana','rivieramaya','barbados'...)
 * @param {Date|string} [date] - date d'évaluation (défaut : maintenant). String ISO acceptée.
 * @returns {{ phase:'hors-saison'|'approche-saison'|'pleine-saison', region:string, source:string, monthIndex:number }}
 */
function phaseForRegion(island, date) {
  const region = canonicalRegion(island)
  const profile = CLIMATOLOGY[region] || CLIMATOLOGY['lesser-antilles']
  const d = date == null ? new Date() : (date instanceof Date ? date : new Date(date))
  const monthIndex = isNaN(d) ? new Date().getMonth() : d.getMonth()
  const phaseIdx = profile.months[monthIndex] != null ? profile.months[monthIndex] : 0
  return { phase: PHASES[phaseIdx], region, source: profile.source, monthIndex }
}

/**
 * Profil saisonnier 12 mois d'une région (index 0 = janvier … 11 = décembre),
 * en phases ordinales SOURCÉES. Sert au front (WeekHub planner) à répondre
 * honnêtement « à quelle période l'afflux est historiquement le plus rare »
 * pour une date de réservation lointaine — SANS prétendre prédire une couleur
 * de plage à une date précise (le moat = honnêteté).
 * @param {string} island
 * @returns {{ region:string, source:string, months:string[] }}
 */
function monthsForRegion(island) {
  const region = canonicalRegion(island)
  const profile = CLIMATOLOGY[region] || CLIMATOLOGY['lesser-antilles']
  return { region, source: profile.source, months: profile.months.map(i => PHASES[i]) }
}

module.exports = { phaseForRegion, canonicalRegion, monthsForRegion, PHASES, CLIMATOLOGY }
