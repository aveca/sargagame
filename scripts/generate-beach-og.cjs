#!/usr/bin/env node
/**
 * generate-beach-og.cjs — Generates dynamic Open Graph PNG images for each beach.
 * Uses `sharp` to rasterize the golden-hour SVGs into PNGs.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { buildHeroSvg } = require('./lib/scene-svg.cjs');

const ROOT = path.resolve(__dirname, '..');
const BEACHES_JSON = path.join(ROOT, 'public', 'data', 'beaches-list.json');
const DIST_BEACHES = path.join(ROOT, 'dist', 'beaches');

async function run() {
  if (!fs.existsSync(BEACHES_JSON)) {
    console.error('✗ beaches-list.json not found');
    process.exit(1);
  }

  const beaches = JSON.parse(fs.readFileSync(BEACHES_JSON, 'utf-8'));
  fs.mkdirSync(DIST_BEACHES, { recursive: true });

  let count = 0;
  for (const b of beaches) {
    if (!b.id) continue;
    
    // Determine a basic status/afai if not provided
    const status = b.status || 'clean';
    const afai = b.afai || 0.2;
    const score = b.score || undefined;
    
    // We use the slug. If the beach object doesn't have a slug, we compute it.
    const slugify = n => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = b.slug || slugify(b.name || '');
    if (!slug) continue;

    const outPath = path.join(DIST_BEACHES, `og-${slug}.png`);
    
    // Generate the SVG
    try {
      const svg = buildHeroSvg(
        b, 
        { status, score, afai }, 
        { updatedAt: new Date().toISOString() }, 
        { phase: 'golden', label: 'LIVE' }
      );
      
      const svgBuffer = Buffer.from(svg);
      
      await sharp(svgBuffer)
        .resize(1200, 630, { fit: 'cover' })
        .png()
        .toFile(outPath);
        
      count++;
    } catch (err) {
      console.error(`✗ Error generating OG for ${b.name}:`, err.message);
    }
  }

  console.log(`✓ Generated ${count} beach OG images in dist/beaches/`);
}

run();
