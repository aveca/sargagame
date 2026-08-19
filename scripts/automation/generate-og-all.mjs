/**
 * Build script to generate OG cards for ALL 136 beaches
 * Run: node scripts/automation/generate-og-all.mjs
 * Outputs to public/assets/og/
 * 
 * 136 beaches × 3 languages = 408 cards
 */

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const ROOT = join(__dirname, '../..');

// ─── Constants ────────────────────────────────────────────────────────────────

const WIDTH = 1200;
const HEIGHT = 630;

const FONT_ANTON = readFileSync(join(ROOT, 'public/fonts/anton-1Ptgg87LROyAm3K9-C8QSw.woff2'));
const FONT_BRICOLAGE_BOLD = readFileSync(join(ROOT, 'public/fonts/bricolagegrotesque-3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGGInHEVA.woff2'));
const FONT_BRICOLAGE_SEMIBOLD = readFileSync(join(ROOT, 'public/fonts/bricolagegrotesque-3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGIInE.woff2'));
const FONT_BRICOLAGE_REGULAR = readFileSync(join(ROOT, 'public/fonts/bricolagegrotesque-3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGHInHEVA.woff2'));
const FONT_JETBRAINS_MONO = readFileSync(join(ROOT, 'public/fonts/jetbrainsmono-latin-500.woff2'));

// ─── Data ─────────────────────────────────────────────────────────────────────

const BEACHES = JSON.parse(readFileSync(join(ROOT, 'public/data/beaches-list.json'), 'utf-8'));
const SARG_DATA = JSON.parse(readFileSync(join(ROOT, 'public/api/copernicus/sargassum.json'), 'utf-8'));

const LANGS = ['fr', 'en', 'es'];

const OUTPUT_DIR = join(ROOT, 'public/assets/og');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Status Colors ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  clean: { label: { fr: 'PROPRE', en: 'CLEAN', es: 'LIMPIA' }, color: '#6AC15A', bg: '#EAF7F0' },
  moderate: { label: { fr: 'MODÉRÉ', en: 'MODERATE', es: 'MODERADA' }, color: '#F59E0B', bg: '#FEF3C7' },
  avoid: { label: { fr: 'ALERTE', en: 'AVOID', es: 'ALERTA' }, color: '#E8522A', bg: '#FDE8E6' },
};

const TERRITORY_NAMES = {
  mq: { fr: 'Martinique', en: 'Martinique', es: 'Martinica' },
  gp: { fr: 'Guadeloupe', en: 'Guadeloupe', es: 'Guadalupe' },
  florida: { fr: 'Floride', en: 'Florida', es: 'Florida' },
  puntacana: { fr: 'Punta Cana', en: 'Punta Cana', es: 'Punta Cana' },
  rivieramaya: { fr: 'Riviera Maya', en: 'Riviera Maya', es: 'Riviera Maya' },
};

const SEASON_NAMES = {
  fr: { calm: 'saison calme', peak: 'saison de pointe' },
  en: { calm: 'calm season', peak: 'peak season' },
  es: { calm: 'temporada tranquila', peak: 'temporada alta' },
};

const DOMAIN_MAP = {
  mq: 'sargasses-martinique.com',
  gp: 'sargasses-guadeloupe.com',
  florida: 'sargassummiami.com',
  puntacana: 'sargassumpuntacana.com',
  rivieramaya: 'sargassumcancun.com',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBeachStatus(beachId) {
  const level = SARG_DATA.levels?.find(l => l.id === beachId);
  return level ? {
    status: level.status,
    confidence: level.confidence,
    score: level.score,
    afai: level.afai,
  } : null;
}

function getRegionFromIsland(island) {
  const regionMap = { mq: 'mq', gp: 'gp', florida: 'florida', puntacana: 'puntacana', rivieramaya: 'rivieramaya' };
  return regionMap[island] || island;
}

function getSeason(regionId) {
  const month = new Date().getMonth();
  return (month >= 3 && month <= 8) ? 'peak' : 'calm';
}

function formatDate(lang) {
  const now = new Date();
  const day = now.getDate();
  const monthNames = {
    fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'],
  };
  const month = monthNames[lang][now.getMonth()];
  return `${day} ${month}`.toLowerCase();
}

function formatTime() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}h${now.getMinutes().toString().padStart(2, '0')}`;
}

// ─── SVG Template Generator ───────────────────────────────────────────────────

function createOGCard(beach, statusData, lang) {
  const regionId = getRegionFromIsland(beach.island);
  const statusConfig = STATUS_CONFIG[statusData.status] || STATUS_CONFIG.clean;
  const statusLabel = statusConfig.label[lang] || statusConfig.label.fr;
  const statusColor = statusConfig.color;
  const statusBg = statusConfig.bg;
  const territoryName = TERRITORY_NAMES[regionId]?.[lang] || TERRITORY_NAMES[regionId]?.fr;
  const seasonName = SEASON_NAMES[lang][getSeason(regionId)];
  const domain = DOMAIN_MAP[regionId] || 'sargasses-martinique.com';
  const dateStr = formatDate(lang);
  const timeStr = formatTime();

  const gradientId = 'golden-hour';

  // SVG Template
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="golden-hour" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B2230"/>
      <stop offset="30%" stop-color="#155A5A"/>
      <stop offset="60%" stop-color="#C97E3A"/>
      <stop offset="100%" stop-color="#F2B05E"/>
    </linearGradient>
  </defs>
  
  <!-- Background: golden hour gradient -->
  <rect width="1200" height="630" fill="url(#golden-hour)"/>
  
  <!-- Top-left: Le Veilleur silhouette -->
  <g transform="translate(60, 60) scale(0.12)" opacity="0.85">
    <path d="M200 400 L400 100 L600 400" stroke="#FFC72C" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.6"/>
    <circle cx="300" cy="300" r="80" fill="#FFC72C"/>
    <circle cx="300" cy="280" r="40" fill="#0B2230"/>
    <circle cx="300" cy="280" r="15" fill="#FFC72C"/>
  </g>
  
  <!-- Center: Beach name -->
  <text x="600" y="275" text-anchor="middle" dominant-baseline="middle" 
        font-family="Anton" font-size="64" font-weight="400" fill="#FFFFFF" letter-spacing="-1.28px">
    ${beach.name.toUpperCase()}
  </text>
  
  <!-- Commune -->
  <text x="600" y="335" text-anchor="middle" dominant-baseline="middle" 
        font-family="Bricolage Grotesque" font-size="24" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="0.5px">
    ${beach.commune}
  </text>
  
  <!-- Status trio -->
  <g transform="translate(300, 390)">
    <g transform="translate(-180, 0)">
      <circle cx="24" cy="24" r="24" fill="#EAF7F0"/>
      <circle cx="24" cy="24" r="12" fill="#6AC15A"/>
      <text x="60" y="34" font-family="Bricolage Grotesque" font-size="28" font-weight="800" fill="#FFFFFF">PROPRE</text>
    </g>
    <g transform="translate(0, 0)">
      <circle cx="24" cy="24" r="24" fill="#FEF3C7"/>
      <circle cx="24" cy="24" r="12" fill="#F59E0B"/>
      <text x="60" y="34" font-family="Bricolage Grotesque" font-size="28" font-weight="800" fill="#FFFFFF">MODÉRÉ</text>
    </g>
    <g transform="translate(180, 0)">
      <circle cx="24" cy="24" r="24" fill="#FDE8E6"/>
      <circle cx="24" cy="24" r="12" fill="#E8522A"/>
      <text x="60" y="34" font-family="Bricolage Grotesque" font-size="28" font-weight="800" fill="#FFFFFF">ALERTE</text>
    </g>
  </g>
  
  <!-- Current beach status highlight -->
  <g transform="translate(300, 390)">
    <g transform="translate(-180, 0)">
      <circle cx="24" cy="24" r="24" fill="${statusBg}"/>
      <circle cx="24" cy="24" r="12" fill="${statusColor}"/>
      <text x="60" y="34" font-family="Bricolage Grotesque" font-size="28" font-weight="800" fill="#FFFFFF">${statusLabel}</text>
    </g>
  </g>
  
  <!-- Bottom-left: Territory · Season -->
  <text x="60" y="570" font-family="Bricolage Grotesque" font-size="22" font-weight="600" fill="#5A5A5A">
    ${territoryName} · ${seasonName}
  </text>
  
  <!-- Bottom-right: Date + time -->
  <text x="1140" y="570" text-anchor="end" font-family="JetBrains Mono" font-size="22" font-weight="400" fill="#5A5A5A">
    verdict ${dateStr} · ${timeStr}
  </text>
  
  <!-- Footer CTA: domain + Veilleur watermark -->
  <g transform="translate(60, 510)">
    <circle cx="12" cy="12" r="12" fill="#FFC72C"/>
    <circle cx="12" cy="12" r="6" fill="#0B2230"/>
    <circle cx="12" cy="12" r="2" fill="#FFC72C"/>
    <text x="32" y="20" font-family="Bricolage Grotesque" font-size="20" font-weight="600" fill="#EAF7F4">
      ${domain}/${beach.slug}
    </text>
  </g>
</svg>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎨 Generating OG cards for ALL 136 beaches...\n');

  // Filter valid beaches
  const validBeaches = BEACHES.filter(b => b.slug && b.name && b.commune && b.island);
  
  if (validBeaches.length === 0) {
    console.error('❌ No valid beaches found');
    process.exit(1);
  }

  console.log(`Found ${validBeaches.length} beaches`);
  console.log(`Generating ${validBeaches.length * LANGS.length} OG cards...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const beach of validBeaches) {
    const statusData = getBeachStatus(beach.id) || { status: 'clean', confidence: 80, score: 80 };
    
    for (const lang of LANGS) {
      try {
        const svg = createOGCard(beach, statusData, lang);
        
        // Render via resvg directly (SVG -> PNG)
        const resvg = new Resvg(svg, {
          fitTo: { mode: 'width', value: WIDTH },
        });
        
        const pngData = resvg.render().asPng();
        
        const filename = `${beach.slug}-${lang}.png`;
        const filepath = join(OUTPUT_DIR, filename);
        writeFileSync(filepath, pngData);
        
        successCount++;
        if (successCount % 50 === 0) {
          console.log(`  Progress: ${successCount}/${validBeaches.length * LANGS.length} cards generated`);
        }
        
      } catch (err) {
        errorCount++;
        console.error(`  ❌ ${beach.slug}-${lang}: ${err.message}`);
      }
    }
  }

  console.log(`\n✅ OG card generation complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Output: ${OUTPUT_DIR}`);
  console.log(`   Total size: ${Math.round(successCount * 270 / 1024)} MB (approx)`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});