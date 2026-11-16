/**
 * mailer.mjs — Envoi du diagnostic (PDF en pièce jointe) via l'API Resend.
 *
 * IDEMPOTENCE
 *   L'en-tête `Idempotency-Key` (Resend : unique par requête, 24 h) empêche
 *   qu'un rejeu de webhook ou une reprise de script produise DEUX emails
 *   identiques. La clé est dérivée du paiement + du SHA du document.
 *
 * SÉCURITÉ
 *   - clé API lue dans l'environnement du processus, jamais affichée ;
 *   - `dryRun` (défaut) : aucun appel réseau, aucun envoi ;
 *   - aucune donnée de carte, aucun secret dans le corps du message.
 */

import fs from 'node:fs';
import path from 'node:path';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function createMailer({ apiKey, from, dryRun = true, fetchImpl = fetch } = {}) {
  const key = String(apiKey || '');
  const sender = String(from || 'SargaGame <alerte@sargasses-martinique.com>');

  async function sendDiagnostic({ to, subject, html, text, attachmentPath, attachmentName, idempotencyKey }) {
    const recipient = String(to || '').trim();
    if (!recipient) return { ok: false, sent: false, error: 'missing_recipient' };
    if (!subject) return { ok: false, sent: false, error: 'missing_subject' };
    if (!html) return { ok: false, sent: false, error: 'missing_html' };

    const attachments = [];
    if (attachmentPath) {
      if (!fs.existsSync(attachmentPath)) {
        return { ok: false, sent: false, error: `attachment_missing:${path.basename(attachmentPath)}` };
      }
      attachments.push({
        filename: attachmentName || path.basename(attachmentPath),
        content: fs.readFileSync(attachmentPath).toString('base64'),
      });
    }

    if (dryRun) {
      return {
        ok: true,
        sent: false,
        dryRun: true,
        error: null,
        recipient,
        subject,
        attachments: attachments.map((a) => a.filename),
        idempotencyKey: idempotencyKey || null,
      };
    }

    if (!key) return { ok: false, sent: false, error: 'resend_key_missing' };

    const payload = {
      from: sender,
      to: [recipient],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(attachments.length ? { attachments } : {}),
    };

    const headers = {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 256);

    try {
      const res = await fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      let body = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        body = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          sent: false,
          error: `resend_http_${res.status}:${bodyText.slice(0, 160)}`,
          recipient,
          subject,
        };
      }
      return {
        ok: true,
        sent: true,
        id: body && body.id ? body.id : null,
        error: null,
        recipient,
        subject,
        attachments: attachments.map((a) => a.filename),
        idempotencyKey: idempotencyKey || null,
      };
    } catch (e) {
      return {
        ok: false,
        sent: false,
        error: `resend_network:${String(e?.message || e).slice(0, 120)}`,
        recipient,
        subject,
      };
    }
  }

  return { sendDiagnostic, dryRun: Boolean(dryRun), from: sender };
}

/** Corps texte (version sans HTML) de l'email de livraison du diagnostic. */
export function buildDeliveryText({ order, sector, snapshot, generatedAt }) {
  const lines = [];
  lines.push('Votre Diagnostic Sargasses Express');
  lines.push('');
  lines.push(`Secteur : ${sector?.name || order?.sector || '—'}`);
  if (sector?.commune) lines.push(`Commune : ${sector.commune}`);
  lines.push(`Etablissement : ${order?.establishment || '—'}`);
  lines.push('');
  lines.push('DERNIERE OBSERVATION SATELLITE PUBLIEE');
  lines.push(`Horodatage : ${snapshot?.observedAt || '—'} (heure locale Martinique)`);
  lines.push(`Indice AFAI : ${snapshot?.observation?.afai ?? '—'}`);
  lines.push(`Statut : ${snapshot?.observation?.status || '—'}`);
  lines.push(`Confiance : ${snapshot?.observation?.confidence ?? '—'}/100`);
  lines.push('');
  lines.push('Le document PDF joint detaille les observations, les tendances,');
  lines.push('le niveau de vigilance, les limites des donnees satellitaires et les');
  lines.push('recommandations de communication pour votre etablissement.');
  lines.push('');
  lines.push('Une observation satellite est une mesure indirecte : elle ne constitue');
  lines.push('pas un constat physique sur place.');
  if (generatedAt) lines.push(`Document emis le ${generatedAt}.`);
  return lines.join('\n');
}
