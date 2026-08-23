#!/usr/bin/env node
/**
 * gen-favicon.cjs — génère la famille de favicons SEO-optimale à partir du cœur
 * golden-hour (jade #10AA95 + anneau dégradé or→orange).
 *
 * Source : https://nathanlove.com/.../favicon.png (32×32, trop petit pour 180/192/512)
 * → on revectorise le cœur en SVG net, puis on rend chaque taille à sa résolution
 *   native via sharp (aucun upscaling flou). Couleurs échantillonnées au pixel.
 *
 * Sorties dans public/ :
 *   favicon.svg            (vectoriel, transparent — favicon moderne, net partout)
 *   favicon.ico            (16/32/48 multi-résolution — /favicon.ico legacy)
 *   favicon-16x16.png
 *   favicon-32x32.png
 *   apple-touch-icon.png   (180, fond opaque #0d1117 — iOS n'aime pas la transparence)
 *   icon-192.png           (fond opaque, zone de sécurité maskable — PWA + logo schema)
 *   icon-512.png           (idem)
 *
 * Usage : node scripts/gen-favicon.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC = path.join(__dirname, '..', 'public');
const BG = '#0d1117'; // background_color de la marque (manifest)

// --- Cœur vectoriel, viewBox 100×100, couleurs échantillonnées sur la source ---
const HEART_PATH =
  'M50 82 C26 62 17 49 17 36 C17 25 25 19 34 19 C41 19 47 23 50 30 ' +
  'C53 23 59 19 66 19 C75 19 83 25 83 36 C83 49 74 62 50 82 Z';

function svgCore({ transparentBg = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFC95C"/>
      <stop offset="0.45" stop-color="#F7A23C"/>
      <stop offset="1" stop-color="#F2602A"/>
    </linearGradient>
  </defs>
  ${transparentBg ? '' : `<rect width="100" height="100" fill="${BG}"/>`}
  <path d="${HEART_PATH}" fill="#10AA95" stroke="url(#ring)" stroke-width="6"
        stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

const FAVICON_SVG = svgCore({ transparentBg: true });

// rend le cœur transparent à `size` px
const renderCore = (size) =>
  sharp(Buffer.from(FAVICON_SVG)).resize(size, size).png().toBuffer();

// cœur sur fond opaque (apple/PWA) : cœur à ~74% centré, padding = zone de sécurité maskable
async function renderOnBg(size) {
  const inner = Math.round(size * 0.74);
  const core = await renderCore(inner);
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: core, gravity: 'center' }])
    .png()
    .toBuffer();
}

// encodeur ICO minimal (PNG embarqué, supporté par tous les navigateurs modernes + IE11)
function buildIco(entries /* [{size, buf}] */) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  const bufs = [];
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 0); // width
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(e.buf.length, o + 8); // size
    dir.writeUInt32LE(offset, o + 12); // offset
    offset += e.buf.length;
    bufs.push(e.buf);
  });
  return Buffer.concat([header, dir, ...bufs]);
}

(async () => {
  fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), FAVICON_SVG);

  const p16 = await renderCore(16);
  const p32 = await renderCore(32);
  const p48 = await renderCore(48);
  fs.writeFileSync(path.join(PUBLIC, 'favicon-16x16.png'), p16);
  fs.writeFileSync(path.join(PUBLIC, 'favicon-32x32.png'), p32);

  fs.writeFileSync(
    path.join(PUBLIC, 'favicon.ico'),
    buildIco([
      { size: 16, buf: p16 },
      { size: 32, buf: p32 },
      { size: 48, buf: p48 },
    ])
  );

  fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), await renderOnBg(180));
  fs.writeFileSync(path.join(PUBLIC, 'icon-192.png'), await renderOnBg(192));
  fs.writeFileSync(path.join(PUBLIC, 'icon-512.png'), await renderOnBg(512));

  console.log('✓ favicon family written to public/');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
