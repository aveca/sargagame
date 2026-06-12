// Audit nom/commune/coords vs OSM — croise beaches-list.json avec osm-gp.json / osm-mq.json
const fs = require('fs');
const beaches = JSON.parse(fs.readFileSync('public/data/beaches-list.json', 'utf8'));

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[''’]/g, "'").replace(/\b(plage|anse|de|du|des|la|le|les|l')\b/g, '')
  .replace(/[^a-z0-9]/g, '');

const dist = (a, b) => {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

for (const island of ['gp', 'mq']) {
  const osm = JSON.parse(fs.readFileSync(`scripts/osm-${island}.json`, 'utf8'));
  const osmNamed = osm.elements.filter(e => e.tags && e.tags.name).map(e => ({
    osmId: `${e.type}/${e.id}`,
    name: e.tags.name,
    lat: e.lat ?? e.center?.lat,
    lng: e.lon ?? e.center?.lon,
  })).filter(e => e.lat != null);

  console.log(`\n===== ${island.toUpperCase()} — ${osmNamed.length} named OSM elements =====`);

  for (const b of beaches.filter(x => x.island === island)) {
    const bn = norm(b.name);
    // 1. name match in OSM → distance to it
    const nameMatches = osmNamed.filter(o => {
      const on = norm(o.name);
      return on && bn && (on === bn || on.includes(bn) || bn.includes(on));
    });
    const best = nameMatches.map(o => ({ ...o, d: dist(b, o) })).sort((x, y) => x.d - y.d)[0];
    // 2. nearest OSM element to our coords (squat detection)
    const nearest = osmNamed.map(o => ({ ...o, d: dist(b, o) })).sort((x, y) => x.d - y.d)[0];

    const flags = [];
    if (best && best.d > 600) flags.push(`NAME-FAR: "${best.name}" (${best.osmId}) à ${best.d}m → ${best.lat},${best.lng}`);
    if (!best && nearest && nearest.d < 120 && norm(nearest.name) !== bn)
      flags.push(`SQUAT?: assis sur "${nearest.name}" (${nearest.osmId}, ${nearest.d}m), aucun match OSM pour "${b.name}"`);
    if (best && best.d <= 600 && nearest && nearest.d < 80 && nearest.osmId !== best.osmId && norm(nearest.name) !== bn)
      flags.push(`AMBIG: match "${best.name}" à ${best.d}m mais assis sur "${nearest.name}" (${nearest.d}m)`);

    if (flags.length) {
      console.log(`\n${b.id} "${b.name}" (${b.commune}) @ ${b.lat},${b.lng}`);
      for (const f of flags) console.log('   ' + f);
      if (!best && nearest) console.log(`   nearest: "${nearest.name}" ${nearest.d}m`);
    }
  }

  // No-OSM-match entries (info)
  const noMatch = beaches.filter(x => x.island === island).filter(b => {
    const bn = norm(b.name);
    return !osmNamed.some(o => { const on = norm(o.name); return on === bn || on.includes(bn) || bn.includes(on); });
  });
  console.log(`\n-- ${noMatch.length} entrées ${island} sans match nom OSM local: ${noMatch.map(b => `${b.id}:"${b.name}"`).join(', ')}`);
}
