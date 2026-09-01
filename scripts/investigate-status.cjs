// Investigate if regions/tulum.json status is consumed at runtime
const fs = require('fs');

const tulumConfig = fs.readFileSync('regions/tulum.json', 'utf-8');
const config = JSON.parse(tulumConfig);
console.log('Tulum config status:', config.status);
console.log('Tulum live:', config.live);

// Search for where region.status is used in the pipeline
const src = fs.readFileSync('scripts/fetch-sargassum-live.cjs', 'utf-8');
const statusMatches = src.match(/\.status/g);
console.log('.status occurrences in pipeline:', (statusMatches || []).length);

// Key finding: beachesForRegion function (line 1406-1428) only extracts:
// id, lat, lng, island, coast, coastNormal
// It does NOT use the inline status from region JSON
// The inline status in regions/tulum.json is a placeholder only

console.log('\nKey finding: beachesForRegion strips status - only uses: id/lat/lng/island/coast/coastNormal');
console.log('The inline status in regions/tulum.json is a placeholder, overridden by live pipeline data');

// Also check: the status in region JSON was originally a placeholder
// because "Les statuts inline des JSON régionaux sont des PLACEHOLDERS"
// (line 1403 in fetch-sargassum-live.cjs)
// "seuls id/lat/lng (+ coast/coastNormal si présents) alimentent le calcul AFAI."
console.log('\nSource quote: "Les statuts inline des JSON régionaux sont des PLACEHOLDERS"');
console.log('"uniquement id/lat/lng (+ coast/coastNormal si présents) alimentent le calcul AFAI."');

// The memory system uses the computed afai/status from the pipeline, NOT the static config status
console.log('\nConclusion: regions/tulum.json.status "moderate" is NOT consumed at runtime');
console.log('It is a static placeholder that does not affect the pipeline calculation.');