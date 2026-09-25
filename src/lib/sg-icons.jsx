/**
 * sg-icons.jsx — micro-bibliothèque SVG propriétaire Sargagame (2026-09-25E)
 *
 * Des glyphes organiques, 2 traits, viewBox commun 0 0 24 24, currentColor.
 * Remplace les emojis sur les surfaces premium (rendu garanti identique sur
 * tous les devices/OS, marque cohérente). Poids : ~150-300 octets/glyph.
 *
 * Usage : <Icon name="wave" size={16} color="#0d0b14" title="Mer" />
 *   ou  : <Icon name="wave" size={16} color="#0d0b14" />  (aria-hidden si pas de title)
 */
export const ICONS = {
  // Mer — 2 vagues décalées
  wave: "M2 16c3-2 5-2 8 0 3 2 5 2 8 0 1.5-1 3-1.2 4-.6M2 20c3-2 5-2 8 0 3 2 5 2 8 0 1.5-1 3-1.2 4-.6",
  // Soleil couchant — demi-arc + horizon
  sunset: "M3 18h18M12 18a5.5 5.5 0 0 1 11 0M1 18h0M12 8.5V6M5.7 10.6 4.4 9.3M18.3 10.6l1.3-1.3",
  // Plage — parasol planté + sable ondulé
  beach: "M2 20c3.5-.8 5 .6 8 0 3-.6 5-1.2 7.5-.5M12.5 16.5 9.8 3.8m3 .5A4.5 4.5 0 1 0 9 11.5",
  // Bateau voile
  sail: "M13 4.5 19.5 12H13V4.5ZM12 12H4.8L8.2 17h7L19.3 12M12 17v3",
  // Masque de snorkeling (masque + tuba)
  snorkel: "M3 11v3c0 3 2.4 5.5 5.5 5.5 2 0 3.8-1.2 4.6-3M3 11c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4v1H3v-1Zm15 1v4a3.5 3.5 0 0 1-3.5 3.5M18 12V5.5",
  // Famille ― parent (rond 3.5) + enfant (rond 2.5)
  family: "M10.5 20.5v-2.6a3.2 3.2 0 0 0-3.2-3.2H6.7a3.2 3.2 0 0 0-3.2 3.2v2.6M11 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm12 12.5v-2.3a2.7 2.7 0 0 0-2.7-2.7h-.6M20.5 9.4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  // Parking P encadré
  parking: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm5.5 4.5v7m0-3.5h2.5a2.2 2.2 0 0 0 0-4.4h-2.5",
  // Pin de localisation
  pin: "M12 21.5S5 15.8 5 10.5a7 7 0 1 1 14 0c0 5.3-7 11-7 11Zm0-8.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  // Plan (calendrier + coche)
  plan: "M3.5 6.5h17v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-12Zm0 4h17M8 3.5V8m8-4.5V8M9 14.5l2.4 2.3 4.6-4.6",
  // Alternative — flèche qui bifurque (plan B)
  alternative: "M5 7h7c3.5 0 5 2.5 7 2.5m0 0-2.4-2.2M19 9.5 21.4 12M5 17h6c3 0 4.5-2 7.5-2",
  // Alerte — triangle ponctué
  alert: "M12 4.2 3 20h18L12 4.2Zm0 6.2v3.4m0 3.4h.01",
  // Sargasses — filaments marrons flottants
  sargassum: "M3.5 17.5c1.2-1 1.4-2.6 2.6-2.6s2.4 1.1 3.6 0M14.5 18.5c1.2-1 1.4-2.6 2.6-2.6s2.4 1.1 3.6 0M7 12c1.2-1 1.4-2.6 2.6-2.6s2.4 1.1 3.6 0M13 8.5c1.2-1 1.4-2.6 2.6-2.6s2.4 1.1 3.6 0M10 20.5c1-1 1.2-2 2.3-2",
  // Soleil levain (jour ok) — plus net, pas sunset
  sun: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0-4v2M4.5 12H2.5M12 17v4m8.5-9H19M6.1 6.1 4.8 4.8m14.4 0-1.4 1.3",
  // Poisson (faune marine)
  fish: "M2.5 12c2.5-3.2 5.5-4.8 8.8-4.8 3.8 0 6.9 2.1 9.2 4.8-2.3 2.7-5.4 4.8-9.2 4.8-3.3 0-6.3-1.6-8.8-4.8Zm8.8 0h.01M20.5 12l2-2.5M20.5 12l2 2.5",
  // Bateau coque (sorties mer)
  boat: "M3 15.5h18l-2.2 3.8a1.5 1.5 0 0 1-1.3.7H6.5a1.5 1.5 0 0 1-1.3-.7L3 15.5ZM12 15.5V6m0 0H7m5 0h5M8.5 19.5 12 15.5l3.5 4",
  // Boussole (orientation / trip)
  compass: "M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19Zm4.5-11.5-2 5-5 2 2-5 5-2Z",
  // Route (itinéraire / plan)
  route: "M5 19.5A2.5 2.5 0 1 0 5 14.5a2.5 2.5 0 0 0 0 5Zm14-11A2.5 2.5 0 1 0 19 3.5a2.5 2.5 0 0 0 0 5ZM5 17c0-5 4-6 6.5-6s3.5-2 3.5-4.5",
  // Satellite (mesure, preuve)
  satellite: "M13.5 10.5l-4 4m7.5-7.5-4 4M9 15l-4.5 4.5M14 5l5.5-1.5L18 9M4 20l1.5-5.5L11 9m7.5-2.5a2.1 2.1 0 1 0-3-3",
}

export function iconPath(name) {
  return ICONS[name] || null
}

export function Icon({ name, size = 14, color = "currentColor", title = null, style = null, strokeWidth = 2 }) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true}
      aria-label={title || undefined} style={style || undefined}>
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  )
}

export default Icon
