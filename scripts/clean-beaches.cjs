#!/usr/bin/env node
/**
 * Clean beaches-list.json:
 * 1. Keep ALL original beaches (those with real afai values != 0.2)
 * 2. From new beaches (afai === 0.2), remove those with:
 *    a. Duplicate coordinates (same lat,lng as another beach)
 *    b. Inland coordinates (too far from coast for Martinique/Guadeloupe)
 */
const fs = require('fs')
const path = require('path')

const FILE = path.resolve(__dirname, '../public/data/beaches-list.json')
const beaches = JSON.parse(fs.readFileSync(FILE, 'utf8'))

console.log(`Total beaches before cleaning: ${beaches.length}`)

// Separate originals from new
const originals = beaches.filter(b => b.afai !== 0.2)
const newBeaches = beaches.filter(b => b.afai === 0.2)
console.log(`Original beaches (verified): ${originals.length}`)
console.log(`New beaches (to evaluate): ${newBeaches.length}`)

// ============================================================
// STEP 1: Find duplicate coordinates among ALL beaches
// ============================================================
// Build a map of all coordinates
const coordMap = {}
beaches.forEach(b => {
  const key = `${b.lat},${b.lng}`
  if (!coordMap[key]) coordMap[key] = []
  coordMap[key].push(b)
})

// For duplicate coords: keep the FIRST one (usually the original), remove later duplicates
// But ONLY remove new beaches (never originals)
const dupeRemovals = new Set()
Object.values(coordMap).forEach(group => {
  if (group.length <= 1) return
  // Keep the first beach in the group, flag later ones that are new
  const kept = group[0]
  for (let i = 1; i < group.length; i++) {
    const b = group[i]
    if (b.afai === 0.2) {
      dupeRemovals.add(b.id)
      console.log(`  DUPE: ${b.id} (${b.name}) same coords as ${kept.id} (${kept.name})`)
    }
  }
  // Also check if first is new and there's an original later
  if (kept.afai === 0.2) {
    const originalInGroup = group.find(b => b.afai !== 0.2)
    if (originalInGroup) {
      dupeRemovals.add(kept.id)
      console.log(`  DUPE: ${kept.id} (${kept.name}) same coords as original ${originalInGroup.id} (${originalInGroup.name})`)
    }
  }
})

// ============================================================
// STEP 2: Check for inland coordinates
// ============================================================
// Martinique approximate bounding box for coastal areas:
// The island is roughly 14.39-14.88 lat, -61.23 to -60.81 lng
// Center of island is approximately 14.64, -61.02
// A beach should be near the edges, not in the center.
//
// Guadeloupe is more complex (butterfly shape), harder to filter.
// We'll focus on Martinique for inland detection.

// Known inland coordinates for Martinique (center of island):
// Anything around lat 14.5-14.7, lng -61.0 to -60.95 is likely inland
// unless it's on the coast side

// Simple approach for MQ: Use distance to nearest original coastal beach
// If a new MQ beach is >3km from ANY original MQ beach, flag it for review

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Martinique coastline reference points (from verified original beaches + known coast points)
const MQ_COAST_POINTS = [
  // Southern coast (Sainte-Anne area)
  { lat: 14.3958521, lng: -60.8689802 }, // Salines
  { lat: 14.4260922, lng: -60.8876691 }, // Caritan
  { lat: 14.4144971, lng: -60.8872148 }, // Meunier
  { lat: 14.4304809, lng: -60.8849519 }, // Bourg SA
  { lat: 14.4101296, lng: -60.8482068 }, // Trabaud
  { lat: 14.437773, lng: -60.8258012 },  // Michel
  // Southeast coast
  { lat: 14.505925, lng: -60.8235499 },  // Macabou
  { lat: 14.4605782, lng: -60.9104676 }, // Figuier
  { lat: 14.4533661, lng: -60.90242566 }, // Borgnesse
  // Southwest coast (Trois-Ilets, Anses-d'Arlet)
  { lat: 14.5410671, lng: -61.0657633 }, // Anse a l'Ane
  { lat: 14.5522593, lng: -61.0552056 }, // Mitan
  { lat: 14.5277232, lng: -61.0873771 }, // Noire
  { lat: 14.5256583, lng: -61.08949844 }, // Dufour
  { lat: 14.5027854, lng: -61.0856311 }, // Grande Anse Arlet
  { lat: 14.4758027, lng: -61.0314046 }, // Diamant
  { lat: 14.46926902, lng: -61.04569643 }, // Cafard
  // South coast (Sainte-Luce)
  { lat: 14.4658147, lng: -60.9260982 }, // Gros Raisins
  { lat: 14.46469668, lng: -60.93956904 }, // Pont Cafe
  { lat: 14.4656037, lng: -60.9423696 }, // Corps de Garde
  { lat: 14.46801066, lng: -60.95755056 }, // Mabouya
  // West coast (Fort-de-France, Schoelcher)
  { lat: 14.6011133, lng: -61.0674743 }, // Francaise
  { lat: 14.6177983, lng: -61.1036302 }, // Madame
  { lat: 14.6147915, lng: -61.1010321 }, // Case Navire
  { lat: 14.62183945, lng: -61.10756925 }, // Collat
  // West coast (Case-Pilote, Bellefontaine) - fill gap between Schoelcher and Carbet
  { lat: 14.64192241, lng: -61.13879442 }, // Bourg Case-Pilote (known coastal)
  { lat: 14.6334662, lng: -61.1309528 },  // Vetiver Case-Pilote (known coastal)
  { lat: 14.67320445, lng: -61.16511236 }, // Bourg Bellefontaine (known coastal)
  // Northwest coast (Carbet, St-Pierre, Precheur)
  { lat: 14.7126886, lng: -61.1840442 }, // Carbet
  { lat: 14.7278647, lng: -61.1803843 }, // Turin
  { lat: 14.7404792, lng: -61.1768484 }, // St Pierre
  { lat: 14.8333961, lng: -61.224677 },  // Belleville
  { lat: 14.8418367, lng: -61.2198551 }, // Couleuvre
  { lat: 14.83325984, lng: -61.22447763 }, // Ceron
  // Northeast coast (Trinite)
  { lat: 14.7507215, lng: -60.9256857 }, // Tartane
  { lat: 14.7542793, lng: -60.9462446 }, // Bonneville
  { lat: 14.765875, lng: -60.9058586 },  // L'Etang
  { lat: 14.7424251, lng: -60.9429967 }, // Raisiniers
  { lat: 14.7704908, lng: -60.9796444 }, // L'Autre Bord
  // East coast
  { lat: 14.6619988, lng: -60.8834495 }, // Baie Coco
  { lat: 14.5413754, lng: -60.8291578 }, // Pointe Faula
  { lat: 14.4840623, lng: -60.8129297 }, // Grosse Roche
  // North coast
  { lat: 14.8711392, lng: -61.1833745 }, // Sinai
  { lat: 14.8741957, lng: -61.1773891 }, // Grand'Riviere
  { lat: 14.8086385, lng: -61.0172223 }, // Charpentier
  { lat: 14.7856693, lng: -60.9931755 }, // Bourg Ste Marie
]

// Guadeloupe coastline reference points
const GP_COAST_POINTS = [
  // Grande-Terre south coast
  { lat: 16.2521, lng: -61.2644 },     // St-Francois
  { lat: 16.2469172, lng: -61.2864305 }, // Raisins Clairs
  { lat: 16.2597, lng: -61.214 },      // Gourde
  { lat: 16.2531027, lng: -61.2306694 }, // Chateaux
  { lat: 16.2564, lng: -61.1986 },     // Tarare
  { lat: 16.2373343, lng: -61.3491006 }, // Bois Jolan
  { lat: 16.2181, lng: -61.3965 },     // Caravelle
  { lat: 16.2226, lng: -61.3828 },     // Ste-Anne
  { lat: 16.2048, lng: -61.4947 },     // Datcha
  { lat: 16.2140114, lng: -61.5237064 }, // Bas-du-Fort
  // Grande-Terre north coast
  { lat: 16.4861861, lng: -61.4416828 }, // Porte d'Enfer
  { lat: 16.4840401, lng: -61.5014268 }, // Laborde
  { lat: 16.4222, lng: -61.5337 },     // Souffleur
  { lat: 16.329701, lng: -61.3409379 }, // Autre Bord PL
  { lat: 16.3356823, lng: -61.3586839 }, // St Felix
  { lat: 16.4856804, lng: -61.4973785 }, // Anse-Bertrand N
  // Basse-Terre west coast
  { lat: 16.3053509, lng: -61.7950711 }, // Deshaies
  { lat: 16.3544093, lng: -61.7529087 }, // Clugny
  { lat: 16.3552287, lng: -61.7591678 }, // Vieux-Fort
  { lat: 16.2354834, lng: -61.7923244 }, // Baille-Argent
  { lat: 16.1720515, lng: -61.7767401 }, // Malendure
  { lat: 16.01, lng: -61.726 },         // Vieux-Habitants
  { lat: 15.9589717, lng: -61.6719389 }, // Grande Anse
  { lat: 15.863176, lng: -61.5777867 }, // Grande Anse Deshaies
  // Basse-Terre east coast
  { lat: 16.1649476, lng: -61.5842398 }, // Petit-Bourg
  { lat: 16.0931635, lng: -61.559275 },  // Capesterre-Belle-Eau coast
  { lat: 16.048, lng: -61.588 },         // South Basse-Terre east coast
  // South Basse-Terre coast
  { lat: 15.9589717, lng: -61.6719389 }, // Trois-Rivieres south
  { lat: 16.0272932, lng: -61.7483834 }, // Baillif area
  { lat: 16.0402721, lng: -61.7549166 }, // Vieux-Habitants north
  // Islands
  { lat: 16.2938849, lng: -61.0937489 }, // Desirade
  { lat: 15.8858408, lng: -61.2261838 }, // Marie-Galante
  { lat: 15.8789306, lng: -61.3089004 }, // Marie-Galante GB
  { lat: 15.8721723, lng: -61.5708634 }, // Pompierre
  { lat: 15.8635, lng: -61.5988 },      // Pain de Sucre
  { lat: 16.3029048, lng: -61.0697215 }, // Desirade Baie Mahault
  { lat: 16.3103402, lng: -61.0450143 }, // Souffleur Desirade
  // More Desirade points
  { lat: 16.2512974, lng: -61.1862385 }, // Desirade west
  { lat: 15.9111055, lng: -61.1998476 }, // Desirade south
  { lat: 15.9323909, lng: -61.1964738 }, // Grande Anse Desirade
  // More Marie-Galante
  { lat: 15.9526203, lng: -61.320184 },  // MG north
  { lat: 15.9819535, lng: -61.3057874 }, // Anse Canot MG
  { lat: 15.9780289, lng: -61.3113527 }, // Petit-Havre MG
  { lat: 15.9493507, lng: -61.3233611 }, // MG northeast
  // More Saintes
  { lat: 15.85904, lng: -61.5883611 },   // Vieux-Fort Saintes
  { lat: 15.8579651, lng: -61.579543 },  // Feuillere Terre-de-Bas
  { lat: 15.8732946, lng: -61.5786862 }, // Saintes north
  { lat: 15.8555027, lng: -61.6204834 }, // Saintes west
  { lat: 15.8577736, lng: -61.6030399 }, // Anse Figuier Saintes
  { lat: 15.8761973, lng: -61.5796963 }, // Saintes
  { lat: 15.86462, lng: -61.5848797 },   // Saintes south
  // North Grande-Terre / Morne-a-l'Eau area coast
  { lat: 16.3410517, lng: -61.5265237 }, // Babin area
  { lat: 16.4125789, lng: -61.5329735 }, // North GT coast
  { lat: 16.4721758, lng: -61.5109255 }, // Anse-Bertrand west
]

const inlandRemovals = new Set()

newBeaches.forEach(b => {
  if (dupeRemovals.has(b.id)) return // Already flagged

  const coastPoints = b.island === 'mq' ? MQ_COAST_POINTS : GP_COAST_POINTS
  let minDist = Infinity
  let nearestRef = null

  coastPoints.forEach(cp => {
    const d = haversineKm(b.lat, b.lng, cp.lat, cp.lng)
    if (d < minDist) {
      minDist = d
      nearestRef = cp
    }
  })

  // For MQ: island is small (~60km long, ~20km wide)
  // A beach >4km from nearest known coastal point is suspicious
  // For GP: island is larger and more complex, use 6km threshold
  const threshold = b.island === 'mq' ? 4 : 6

  if (minDist > threshold) {
    inlandRemovals.add(b.id)
    console.log(`  INLAND: ${b.id} (${b.name}) - ${minDist.toFixed(1)}km from nearest coast point`)
  }
})

// Also specifically check MQ beaches with rounded/approximate coordinates
// that look like they were placed at the center of a commune
const MQ_INLAND_SUSPECTS = [
  // mq052: Anse Azur at 14.8275, -61.0775 - this is inland Sainte-Marie (mountains)
  // mq059: Anse Rivière-Salée at 14.5175, -60.953 - Rivière-Salée is an inland commune
  // mq070: Anse Rivière-Pilote Sud at 14.4915, -60.916 - check if near coast
  // mq043: Plage du Robert at 14.682, -60.928 - Le Robert is a bay area, could be coast
]

// Check mq059 specifically - Rivière-Salée is definitively inland (mangrove, not a beach commune)
// Its coords 14.5175, -60.953 are in the interior of the island
const mq059 = newBeaches.find(b => b.id === 'mq059')
if (mq059 && !dupeRemovals.has('mq059') && !inlandRemovals.has('mq059')) {
  // Rivière-Salée is between the two halves of Martinique, mostly mangrove - no real beach
  const distToCoast = Math.min(...MQ_COAST_POINTS.map(cp => haversineKm(mq059.lat, mq059.lng, cp.lat, cp.lng)))
  console.log(`  mq059 (Anse Rivière-Salée) distance to coast: ${distToCoast.toFixed(1)}km - Rivière-Salée is inland mangrove`)
  if (distToCoast > 2) {
    inlandRemovals.add('mq059')
    console.log(`  INLAND (manual): mq059 Anse Rivière-Salée - inland commune`)
  }
}

// mq052 Anse Azur - 14.8275, -61.0775 is in the mountains of northern MQ
const mq052 = newBeaches.find(b => b.id === 'mq052')
if (mq052 && !dupeRemovals.has('mq052') && !inlandRemovals.has('mq052')) {
  const distToCoast = Math.min(...MQ_COAST_POINTS.map(cp => haversineKm(mq052.lat, mq052.lng, cp.lat, cp.lng)))
  console.log(`  mq052 (Anse Azur) distance to coast: ${distToCoast.toFixed(1)}km`)
  // 14.8275, -61.0775 is indeed in the Morne area, inland
  if (distToCoast > 3) {
    inlandRemovals.add('mq052')
    console.log(`  INLAND (manual): mq052 Anse Azur - coordinates in mountain area`)
  }
}

// GP specific inland checks
// gp058: 16.2, -61.568 - this is in the middle of Grande-Terre lagoon area
// gp067: 16.265, -61.504 - could be near the coast but check
// gp086: 16.048, -61.588 - inland Basse-Terre

// ============================================================
// STEP 3: Build clean list
// ============================================================
const allRemovals = new Set([...dupeRemovals, ...inlandRemovals])

// Never remove originals
originals.forEach(b => {
  if (allRemovals.has(b.id)) {
    console.log(`  KEEPING original: ${b.id} (${b.name}) despite duplicate flag`)
    allRemovals.delete(b.id)
  }
})

const cleanBeaches = beaches.filter(b => !allRemovals.has(b.id))

console.log(`\n=== SUMMARY ===`)
console.log(`Removed (duplicate coords): ${dupeRemovals.size}`)
console.log(`Removed (inland): ${inlandRemovals.size}`)
console.log(`Total removed: ${allRemovals.size}`)
console.log(`Beaches remaining: ${cleanBeaches.length}`)
console.log(`  MQ: ${cleanBeaches.filter(b => b.island === 'mq').length}`)
console.log(`  GP: ${cleanBeaches.filter(b => b.island === 'gp').length}`)

console.log(`\nRemoved beach IDs:`)
const removedList = [...allRemovals].sort()
removedList.forEach(id => {
  const b = beaches.find(x => x.id === id)
  const reason = dupeRemovals.has(id) ? 'DUPE' : 'INLAND'
  console.log(`  ${id} (${b.name}) [${reason}]`)
})

// Write clean file
fs.writeFileSync(FILE, JSON.stringify(cleanBeaches, null, 2) + '\n')
console.log(`\nWritten clean beaches-list.json with ${cleanBeaches.length} beaches.`)
