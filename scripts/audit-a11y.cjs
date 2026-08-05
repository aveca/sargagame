#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const srcFiles = [
  'src/Sargasses_PROD.jsx',
  'src/PremiumModal.jsx',
  'src/PassOffer.jsx',
  'src/ArenaSplash.jsx',
  'src/MapView.jsx',
  'src/WorldMapView.jsx',
  'src/ComicDetail.jsx',
  'src/VeilleurHero.jsx',
  'src/CleanList.jsx',
  'src/HomeJuicy.jsx',
  'src/HomeAZ.jsx',
  'src/Conditions.jsx',
  'src/Fiabilite.jsx',
  'src/ProLanding.jsx',
  'src/ScrollStory.jsx',
  'src/WelcomePoste.jsx',
  'src/PaidOnboarding.jsx',
  'src/ArenaOnboarding.jsx',
  'src/WeekHub.jsx',
  'src/StoryScenes.jsx',
  'src/VerticalesMap.jsx',
  'src/ArchipelView.jsx',
  'src/BriefMatin.jsx',
  'src/DemoReel.jsx',
  'src/SargaChat.jsx',
  'src/AccountSheet.jsx',
  'src/WhatsNewJournal.jsx',
  'src/ContextVeilleur.jsx',
  'src/DiveTransition.jsx',
  'src/SeqPrimitives.jsx',
  'src/VeilleurRepond.jsx',
  'src/WorldView3D.jsx',
  'src/perf-vitals.jsx',
];

let totalButtons = 0;
let buttonsNoA11y = [];

for (const f of srcFiles) {
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<button') || line.includes('role="button"')) {
      totalButtons++;
      const hasAriaLabel = line.includes('aria-label');
      const hasAriaLabelledby = line.includes('aria-labelledby');
      const hasInnerText = line.match(/<button[^>]*>([^<]+)<\/button>/) || line.match(/role="button"[^>]*>([^<]+)</);
      
      if (!hasAriaLabel && !hasAriaLabelledby && !hasInnerText) {
        buttonsNoA11y.push({ file: f, line: i+1, code: line.trim().substring(0, 200) });
      }
    }
  }
}

console.log('Total buttons found:', totalButtons);
console.log('Buttons without accessible name:', buttonsNoA11y.length);
for (const b of buttonsNoA11y) {
  console.log('  ' + b.file + ':' + b.line + ' -> ' + b.code);
}

// Also check for form inputs without labels
console.log('\n=== Form inputs without labels ===');
for (const f of srcFiles) {
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<input') || line.includes('<select') || line.includes('<textarea')) {
      const hasId = line.includes('id=');
      const hasAriaLabel = line.includes('aria-label');
      const hasAriaLabelledby = line.includes('aria-labelledby');
      // Check if wrapped in label
      const prevLine = i > 0 ? lines[i-1] : '';
      const nextLine = i < lines.length - 1 ? lines[i+1] : '';
      const wrappedInLabel = prevLine.includes('<label') || nextLine.includes('</label>');
      
      if (hasId && !hasAriaLabel && !hasAriaLabelledby && !wrappedInLabel) {
        // Check if there's a label[for] elsewhere in the file
        const idMatch = line.match(/id=["']([^"']+)["']/);
        if (idMatch) {
          const id = idMatch[1];
          const hasLabelFor = content.includes('label[for="' + id + '"]') || content.includes("label[for='" + id + "']") || content.includes('htmlFor="' + id + '"') || content.includes("htmlFor='" + id + "'");
          if (!hasLabelFor) {
            console.log('  ' + f + ':' + (i+1) + ' -> ' + line.trim().substring(0, 200) + ' (id=' + id + ', no label[for])');
          }
        } else {
          console.log('  ' + f + ':' + (i+1) + ' -> ' + line.trim().substring(0, 200) + ' (no id, no aria-label, no wrapping label)');
        }
      } else if (!hasId && !hasAriaLabel && !hasAriaLabelledby && !wrappedInLabel) {
        console.log('  ' + f + ':' + (i+1) + ' -> ' + line.trim().substring(0, 200) + ' (no id, no aria-label, no wrapping label)');
      }
    }
  }
}

// Check fiabilite form specifically
console.log('\n=== Fiabilite form check ===');
const fiabiliteFiles = ['src/Fiabilite.jsx', 'src/ProLanding.jsx'];
for (const f of fiabiliteFiles) {
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf-8');
  console.log('\n--- ' + f + ' ---');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<form') || lines[i].includes('<input') || lines[i].includes('<button')) {
      console.log('  ' + (i+1) + ': ' + lines[i].trim().substring(0, 200));
    }
  }
}