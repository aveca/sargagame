/**
 * Spike run for Riviera Maya — deterministic swim/surf scoring
 * Reads public/api/weather/beaches-weather.json and public/api/copernicus/sargassum.json
 */
const fs = require('fs');
const path = require('path');
const { swimSurfScore } = require('./lib/swim-surf-score.cjs');

const weatherPath = path.join(__dirname, '..', 'public', 'api', 'weather', 'beaches-weather.json');
const sargPath = path.join(__dirname, '..', 'public', 'api', 'copernicus', 'sargassum.json');

const weather = JSON.parse(fs.readFileSync(weatherPath, 'utf8'));
const sarg = JSON.parse(fs.readFileSync(sargPath, 'utf8'));

// Riviera Maya beach ids
const rmIds = Array.from({ length: 20 }, (_, i) => 'rm' + String(i + 1).padStart(3, '0'));

console.log('beachId,status,afaiStatus,waveHeight,windSpeed,windDir,confidence,reason');
let counts = { baignade:0, surf:0, eviter:0 };
for (const id of rmIds) {
  const res = swimSurfScore(id, sarg, weather);
  console.log(`${res.beachId},${res.status},${res.data.afaiStatus},${res.data.waveHeight},${res.data.windSpeed},${res.data.windDir},${res.confidence},${res.reason}`);
  counts[res.status] ??= 0;
  counts[res.status]++;
}
console.log('\nCounts:', counts);
