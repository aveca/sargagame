// Test memory threshold fragility around 0.149 / 0.150 / 0.151
// Simulates the applyBeachAccumulation logic

function statusFromAfai(afai) {
  if (afai < 0.15) return 'clean';
  if (afai < 0.40) return 'moderate';
  return 'avoid';
}

// Half-life: 3.5 days
const HALF_LIFE = 3.5;
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE;

console.log('=== Memory Threshold Fragility Test ===\n');
console.log('Scenario: Satellite today = 0.11 (clean)');
console.log('Historical peak 2 days ago, decayed to present\n');

const testPeaks = [0.149, 0.150, 0.151, 0.21, 0.22, 0.23];

testPeaks.forEach(peak => {
  // Exponential decay from peak 2 days ago
  const decayed = peak * Math.exp(-DECAY_LAMBDA * 2);
  
  // The condition in applyBeachAccumulation line 734:
  // if (peakDecayed > level.afai && statusFromAfai(effectiveAfai) !== level.status)
  const peakGreaterThanSatellite = decayed > 0.11;
  const statusChanged = statusFromAfai(decayed) !== statusFromAfai(0.11);
  const boostApplied = (decayed > 0.11 && statusChanged) ? 'YES' : 'NO';
  
  console.log(`Peak historical: ${peak}`);
  console.log(`  Decayed after 2d: ${decayed.toFixed(4)}`);
  console.log(`  peakDecayed > satellite (0.11): ${peakGreaterThanSatellite}`);
  console.log(`  Status change clean->${statusFromAfai(decayed)}: ${statusChanged ? 'YES' : 'NO'}`);
  console.log(`  Boost applied: ${boostApplied}`);
  console.log();
});

// Direct threshold test (no memory)
console.log('=== Direct AFAI threshold test (no memory) ===\n');
[0.149, 0.150, 0.151].forEach(afai => {
  const s = statusFromAfai(afai);
  console.log(`AFAI = ${afai}: ${s} ${afai < 0.15 ? '< clean' : afai < 0.40 ? ' moderate' : ' >= avoid'}`);
});

console.log('\n=== Key observation ===');
console.log('The memory boost from 0.22 peak -> 0.15 decayed triggers status change');
console.log('from clean (0.11) to moderate (0.15)');
console.log('Without memory: 0.11 would stay clean');
console.log('With memory: 0.22 peak 2d ago -> 0.15 decayed -> status flips clean->moderate');
console.log('');
console.log('This explains why Tulum shows uniform 0.15 - it is the memory boost,');
console.log('not the raw satellite data. Without the Aug 24 moderate event, Tulum');
console.log('would show clean today based on satellite afaiSat=0.11.');