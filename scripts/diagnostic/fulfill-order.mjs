#!/usr/bin/env node
/**
 * fulfill-order.mjs — Production et livraison du diagnostic d'une commande.
 *
 * PAR DÉFAUT : SIMULATION (dry-run)
 *   le PDF est produit localement (preuve que le document est générable),
 *   l'email N'EST PAS envoyé, la commande reste en `ready`.
 *   `--execute` autorise l'envoi réel (et la transition `delivered`).
 *
 * COMMANDES
 *   --list                 liste les commandes à produire (lecture seule)
 *   --order <payment_id>   produit/livre une commande
 *   --all                  reprend toutes les commandes éligibles
 *   --execute              envoie réellement l'e-mail (sinon simulation)
 *
 * OPTIONS
 *   --file <snapshot.json> snapshot ERDDAP local (sinon endpoint public)
 *   --url <url>            endpoint du snapshot
 *   --max-age <minutes>    fraîcheur maximale acceptée (défaut 900)
 *   --out <dossier>        dossier des PDF (défaut scripts/diagnostic/out)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSupabaseClient } from './lib/supabase.mjs';
import { createMailer } from './lib/mailer.mjs';
import { fulfillOrder } from './lib/fulfillment.mjs';
import { resolveSector } from './lib/sectors.mjs';
import {
  loadRawSnapshot,
  extractSnapshot,
  snapshotFingerprint,
  DEFAULT_SNAPSHOT_URL,
  DEFAULT_MAX_DATA_AGE_MINUTES,
} from './lib/data-source.mjs';
import { buildPdf, DEFAULT_OUT_DIR } from './build-report.mjs';
import { renderDeliveryEmailHtml } from './lib/report-html.mjs';
import { isProductionCandidate } from './lib/order-state.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** États qui doivent être repris (production en cours ou à relancer). */
const PRODUCTION_STATES = ['paid', 'processing', 'ready', 'manual_review'];
const PRODUCTION_FILTER = `&status=in.(${PRODUCTION_STATES.map((s) => encodeURIComponent(s)).join(',')})`;

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

function readEnv(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function maskEmail(email) {
  const s = String(email || '');
  if (!s.includes('@')) return '(invalide)';
  const [a, b] = s.split('@');
  return `${a.slice(0, 1)}***@${b}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const execute = Boolean(args.execute);
  const maxAge = Number(args['max-age'] || DEFAULT_MAX_DATA_AGE_MINUTES);
  const outDir = args.out ? path.resolve(String(args.out)) : DEFAULT_OUT_DIR;
  const snapshotUrl = String(args.url || DEFAULT_SNAPSHOT_URL);
  const snapshotFile = args.file ? path.resolve(String(args.file)) : null;

  const supabase = createSupabaseClient({
    url: readEnv('SG_SUPABASE_URL', 'SUPABASE_URL'),
    key: readEnv('SG_SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_KEY'),
  });

  if (!supabase.configured) {
    console.error('FAIL  Supabase non configuré (SG_SUPABASE_URL / SG_SUPABASE_SERVICE_KEY absents).');
    process.exit(2);
  }

  // ── --list ──────────────────────────────────────────────────────────────
  if (args.list) {
    const res = await supabase.select('diagnostic_orders', {
      filter: PRODUCTION_FILTER,
      columns: 'order_id,payment_id,status,establishment,sector,client_email,amount,currency,created_at,updated_at,error',
      limit: 50,
      order: 'created_at.desc',
    });
    if (!res.ok) {
      console.error(`FAIL  lecture des commandes : ${res.error}`);
      process.exit(3);
    }
    const rows = res.rows || [];
    console.log(`Commandes à produire : ${rows.length}`);
    for (const r of rows) {
      console.log(
        `  - ${String(r.payment_id).padEnd(28)} ${String(r.status).padEnd(14)} ${String(r.establishment || '').slice(0, 34).padEnd(34)} ${maskEmail(r.client_email)} ${r.amount} ${r.currency}${r.error ? `  [${String(r.error).slice(0, 60)}]` : ''}`,
      );
    }
    if (!rows.length) console.log('  (aucune commande en attente de production)');
    return;
  }

  const wantsAll = Boolean(args.all);
  const paymentId = args.order ? String(args.order) : null;
  if (!wantsAll && !paymentId) {
    console.error('Usage : --list | --order <payment_id> | --all   (ajouter --execute pour envoyer)');
    process.exit(2);
  }

  // ── Sélection des commandes ─────────────────────────────────────────────
  let orders = [];
  if (wantsAll) {
    const res = await supabase.select('diagnostic_orders', {
      filter: PRODUCTION_FILTER,
      columns: '*',
      limit: 25,
      order: 'created_at.asc',
    });
    if (!res.ok) {
      console.error(`FAIL  lecture des commandes : ${res.error}`);
      process.exit(3);
    }
    orders = res.rows || [];
  } else {
    const res = await supabase.select('diagnostic_orders', {
      filter: `&payment_id=eq.${encodeURIComponent(paymentId)}`,
      columns: '*',
      limit: 1,
    });
    if (!res.ok) {
      console.error(`FAIL  lecture de la commande : ${res.error}`);
      process.exit(3);
    }
    orders = res.rows || [];
    if (!orders.length) {
      console.error(`FAIL  aucune commande pour ${paymentId}`);
      process.exit(4);
    }
  }

  if (!orders.length) {
    console.log('Aucune commande éligible.');
    return;
  }

  // ── Dépendances réelles ─────────────────────────────────────────────────
  const mailer = createMailer({
    apiKey: readEnv('SG_RESEND_API_KEY', 'RESEND_API_KEY'),
    from: 'SargaGame <alerte@sargasses-martinique.com>',
    dryRun: !execute,
  });

  const deps = {
    now: new Date(),
    supabase,
    log: (m) => console.log(m),
    async loadSnapshot({ order }) {
      const resolved = resolveSector(order.sector);
      if (!resolved.ok) return { ok: false, error: `sector:${resolved.error}` };
      let raw;
      let origin;
      try {
        const loaded = await loadRawSnapshot({ url: snapshotUrl, file: snapshotFile });
        raw = loaded.raw;
        origin = loaded.origin;
      } catch (e) {
        return { ok: false, error: `snapshot:${String(e?.message || e).slice(0, 80)}` };
      }
      const extracted = extractSnapshot(raw, {
        levelId: resolved.sector.levelId,
        sector: resolved.sector,
        now: new Date(),
        maxDataAgeMinutes: maxAge,
      });
      if (!extracted.ok) return { ok: false, error: extracted.error, detail: extracted.detail, snapshot: extracted.snapshot };
      extracted.snapshot.__origin = origin;
      extracted.snapshot.__sha = snapshotFingerprint(raw);
      extracted.snapshot.__sector = resolved.sector;
      return { ok: true, snapshot: extracted.snapshot };
    },
    async buildPdf({ order, snapshot }) {
      const sector = snapshot.__sector || null;
      const result = await buildPdf({
        order,
        sector,
        snapshot,
        outDir,
        snapshotSha: snapshot.__sha || null,
        snapshotUrl: snapshot.__origin || snapshotUrl,
      });
      if (!result.ok) return result;
      result.html = renderDeliveryEmailHtml({ order, sector, snapshot });
      return result;
    },
    async sendEmail({ to, subject, html, text, attachmentPath, attachmentName, idempotencyKey }) {
      return mailer.sendDiagnostic({ to, subject, html, text, attachmentPath, attachmentName, idempotencyKey });
    },
  };

  if (!execute) {
    console.log('SIMULATION (aucun email envoyé) — ajouter --execute pour livrer');
    console.log(`snapshot : ${snapshotFile || snapshotUrl}`);
    console.log('');
  }

  let delivered = 0;
  let manual = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of orders) {
    const result = await fulfillOrder(order, deps);
    const tag = {
      delivered: 'LIVRÉ',
      dry_run: 'SIMULÉ',
      manual_review: 'REPRISE MANUELLE',
      skipped: 'DÉJÀ TRAITÉ',
      ignored: 'IGNORÉ',
      failed: 'ÉCHEC',
    }[result.outcome] || result.outcome;

    console.log(`[${tag}] ${result.paymentId}`);
    console.log(`  établissement : ${order.establishment || '—'} · secteur ${order.sector || '—'} · ${maskEmail(order.client_email)}`);
    if (result.transitions?.length) {
      console.log(`  transitions   : ${result.transitions.map((t) => `${t.from}→${t.to}`).join(', ')}`);
    }
    if (result.document) {
      console.log(`  document      : ${result.document.path}`);
      console.log(`  sha256        : ${result.document.sha256}`);
    }
    if (result.error) console.log(`  erreur        : ${result.error}`);
    if (result.reason) console.log(`  motif         : ${result.reason}`);

    if (result.outcome === 'delivered') delivered += 1;
    else if (result.outcome === 'manual_review') manual += 1;
    else if (result.outcome === 'skipped' || result.outcome === 'ignored') skipped += 1;
    else if (result.outcome === 'failed') failed += 1;
  }

  console.log('');
  console.log(`Bilan : ${delivered} livré(s) · ${manual} en reprise manuelle · ${skipped} ignoré(s)/déjà traité(s) · ${failed} échec(s)`);
  if (failed) process.exit(5);
}

main().catch((e) => {
  console.error(`ERREUR ${String(e?.message || e).slice(0, 200)}`);
  process.exit(1);
});
