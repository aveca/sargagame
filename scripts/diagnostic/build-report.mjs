#!/usr/bin/env node
/**
 * build-report.mjs — Production du PDF « Diagnostic Sargasses Express ».
 *
 * RENDU 100 % LOCAL
 *   Chromium (Playwright, déjà dépendance du repo) + polices auto-hébergées
 *   embarquées en base64 → aucun appel réseau, aucun envoi, aucune donnée
 *   exfiltrée. Le PDF porte l'identité Sargasses Martinique.
 *
 * CLI (génération seule, aucun email)
 *   node scripts/diagnostic/build-report.mjs \
 *     --sector "Pointe Faula" --establishment "Village de la Pointe" \
 *     --email contact@example.test --payment-id tr_EXEMPLE
 *
 *   --file <snapshot.json>  snapshot ERDDAP local (sinon URL publique)
 *   --out <dossier>        dossier de sortie (défaut scripts/diagnostic/out)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import { resolveSector } from './lib/sectors.mjs';
import {
  loadRawSnapshot,
  extractSnapshot,
  snapshotFingerprint,
  DEFAULT_SNAPSHOT_URL,
  DEFAULT_MAX_DATA_AGE_MINUTES,
} from './lib/data-source.mjs';
import { renderReportHtml } from './lib/report-html.mjs';
import { buildDeliveryText } from './lib/mailer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT_DIR = path.join(HERE, 'out');

function sanitize(value, fallback = 'diagnostic') {
  const s = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

/**
 * Génère le HTML + le PDF du diagnostic.
 * @returns {Promise<{ok:boolean, path?:string, sha256?:string, bytes?:number, html?:string, text?:string, filename?:string, error?:string}>}
 */
export async function buildPdf({
  order = {},
  sector = null,
  snapshot,
  outDir = DEFAULT_OUT_DIR,
  generatedAt = new Date().toISOString(),
  snapshotSha = null,
  snapshotUrl = DEFAULT_SNAPSHOT_URL,
  ref = null,
} = {}) {
  if (!snapshot) return { ok: false, error: 'missing_snapshot' };

  const html = renderReportHtml({ order, sector, snapshot, generatedAt, snapshotSha, snapshotUrl, ref });
  const text = buildDeliveryText({ order, sector, snapshot, generatedAt });

  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (e) {
    return { ok: false, error: `outdir_failed:${String(e?.message || e).slice(0, 80)}` };
  }

  const stamp = sanitize(String(generatedAt).replace(/[:.]/g, '-'));
  const beachPart = sanitize(sector?.beachId || sector?.levelId || order.sector || 'secteur');
  const paymentPart = sanitize(order.payment_id || ref || 'sans-ref');
  const baseName = `diagnostic-${beachPart}-${paymentPart}-${stamp}`;
  const htmlPath = path.join(outDir, `${baseName}.html`);
  const pdfPath = path.join(outDir, `${baseName}.pdf`);

  try {
    fs.writeFileSync(htmlPath, html, 'utf8');
  } catch (e) {
    return { ok: false, error: `html_write_failed:${String(e?.message || e).slice(0, 80)}` };
  }

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
    const context = await browser.newContext({ colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
    });
    fs.writeFileSync(pdfPath, pdfBuffer);
    const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    return {
      ok: true,
      path: pdfPath,
      htmlPath,
      sha256,
      bytes: pdfBuffer.length,
      html,
      text,
      filename: path.basename(pdfPath),
      error: null,
    };
  } catch (e) {
    return { ok: false, error: `pdf_failed:${String(e?.message || e).slice(0, 120)}` };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* fermeture best-effort */
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sectorInput = args.sector || 'Pointe Faula';
  const resolved = resolveSector(sectorInput);
  if (!resolved.ok) {
    console.error(`FAIL  secteur non résolu : ${resolved.error} (${sectorInput})`);
    process.exit(2);
  }
  const sector = resolved.sector;

  const order = {
    payment_id: args['payment-id'] || 'SIMULATION',
    establishment: args.establishment || 'Établissement (simulation)',
    sector: sector.name,
    client_email: args.email || 'contact@example.test',
    status: args.status || 'paid',
    amount: '49.00',
    currency: 'EUR',
  };

  const maxAge = Number(args['max-age'] || DEFAULT_MAX_DATA_AGE_MINUTES);
  let raw;
  let origin;
  try {
    const loaded = await loadRawSnapshot({
      url: args.url || DEFAULT_SNAPSHOT_URL,
      file: args.file || null,
    });
    raw = loaded.raw;
    origin = loaded.origin;
  } catch (e) {
    console.error(`FAIL  snapshot illisible : ${String(e?.message || e).slice(0, 120)}`);
    process.exit(2);
  }

  const extracted = extractSnapshot(raw, { levelId: sector.levelId, sector, now: new Date(), maxDataAgeMinutes: maxAge });
  if (!extracted.ok) {
    console.error(`FAIL  données non exploitables : ${extracted.error}`);
    console.error(JSON.stringify(extracted.detail || {}, null, 2));
    process.exit(3);
  }

  const result = await buildPdf({
    order,
    sector,
    snapshot: extracted.snapshot,
    outDir: args.out ? path.resolve(String(args.out)) : DEFAULT_OUT_DIR,
    snapshotSha: snapshotFingerprint(raw),
    snapshotUrl: origin,
    ref: order.payment_id,
  });

  if (!result.ok) {
    console.error(`FAIL  ${result.error}`);
    process.exit(4);
  }

  console.log('OK    PDF généré (aucun email envoyé)');
  console.log(`      secteur      : ${sector.name} (${sector.commune}) — id satellite ${sector.levelId}`);
  console.log(`      observation  : ${extracted.snapshot.observedAt} (âge ${extracted.snapshot.dataAgeMinutes} min)`);
  console.log(`      fichier      : ${result.path}`);
  console.log(`      sha256       : ${result.sha256}`);
  console.log(`      taille       : ${result.bytes} o`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`ERREUR ${String(e?.message || e).slice(0, 200)}`);
    process.exit(1);
  });
}
