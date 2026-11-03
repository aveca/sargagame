#!/usr/bin/env node
/**
 * outbound-network-mock.cjs — MOCK RESEAU PARTAGÉ pour les tests de régression
 * sortants (mission P0.23 / #1157). Usage :
 *
 *   node --require tests/helpers/outbound-network-mock.cjs <script> [args...]
 *
 * Aucun appel réseau réel n'est possible depuis le processus enfant :
 *   - `globalThis.fetch` est remplacé par un enregistreur ;
 *   - `nodemailer.createTransport()` renvoie un transporteur fantôme ;
 *   - `basic-ftp` (remove/upload/rename/mkdir) est neutralisé ;
 *   - `ssh2-sftp-client` est neutralisé s'il est installé.
 *
 * Chaque effet externe est écrit dans `OUTBOUND_MOCK_LOG` (une ligne JSON par
 * appel) afin que le processus parent puisse affirmer « ZÉRO écriture externe ».
 *
 * Variables d'environnement :
 *   OUTBOUND_MOCK_LOG           chemin du journal JSONL (défaut : aucun)
 *   OUTBOUND_MOCK_FAIL_ON_WRITE si truthy, le processus est TUÉ (exit 99) dès
 *                               le premier effet externe — filet de sécurité
 *                               contre un script qui masquerait sa trace.
 *   OUTBOUND_MOCK_MODE          'permissive' (défaut) ou 'empty' : la réponse
 *                               fantôme renvoyée par le fetch.
 */
'use strict';

const fs = require('fs');

const LOG = process.env.OUTBOUND_MOCK_LOG || '';
const FAIL_ON_WRITE = process.env.OUTBOUND_MOCK_FAIL_ON_WRITE === '1' ||
  String(process.env.OUTBOUND_MOCK_FAIL_ON_WRITE || '').toLowerCase() === 'true';
const EMPTY = process.env.OUTBOUND_MOCK_MODE === 'empty';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function record(kind, method, target) {
  const entry = { kind, method: String(method || '').toUpperCase(), target: String(target || '') };
  if (LOG) fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
  if (FAIL_ON_WRITE) {
    // Les lectures sont tolérrables ; toute ÉCRITURE externe est un échec dur.
    const mut = kind !== 'fetch' || MUTATING.has(entry.method);
    if (mut) {
      process.stderr.write(
        `MOCK_VIOLATION effet externe interdit : ${entry.kind} ${entry.method} ${entry.target}\n`
      );
      process.exit(99);
    }
  }
  return entry;
}

/** Réponse fantôme compatible client-fetch / Supabase PostgREST. */
function mockResponse(status, opts) {
  const o = opts || {};
  const headers = new Map();
  for (const [k, v] of Object.entries(o.headers || {})) headers.set(String(k).toLowerCase(), String(v));
  if (o.contentRange != null) headers.set('content-range', String(o.contentRange));
  const body = o.json != null ? JSON.stringify(o.json) : (EMPTY ? '[]' : '[]');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) || null },
    json: async () => (o.json != null ? o.json : []),
    text: async () => body,
  };
}

globalThis.fetch = async function mockFetch(input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const method = (init && init.method) || 'GET';
  record('fetch', method, url);
  return mockResponse(200, { contentRange: '0-0/0' });
};

// ── nodemailer : sendMail enregistré, jamais exécuté ──────────────────────────
try {
  const nodemailer = require('nodemailer');
  nodemailer.createTransport = function mockCreateTransport() {
    return {
      sendMail: async function (msg) {
        record('email', 'SEND', (msg && (msg.to || msg.subject)) || '(inconnu)');
        return { messageId: 'mock-message-id', mocked: true };
      },
      verify: async () => true,
      close: () => {},
    };
  };
} catch (_) { /* nodemailer absent : rien à neutraliser */ }

// ── basic-ftp : opérations d'écriture neutralisées ────────────────────────────
try {
  const basicFtp = require('basic-ftp');
  const Client = basicFtp.Client;
  if (Client && Client.prototype) {
    for (const m of ['remove', 'upload', 'rename', 'mkdir', 'cd', 'ensureDir']) {
      Client.prototype[m] = async function (...args) {
        record('ftp', m.toUpperCase(), String(args[0] || ''));
        return m === 'remove' ? undefined : true;
      };
    }
    Client.prototype.send = async function (cmd) { record('ftp', 'SEND', String(cmd || '')); return 200; };
  }
} catch (_) { /* basic-ftp absent */ }

// ── ssh2-sftp-client (si installé) ────────────────────────────────────────────
try {
  const sftp = require('ssh2-sftp-client');
  if (sftp && sftp.prototype) {
    for (const m of ['put', 'get', 'delete', 'mkdir', 'rename']) {
      sftp.prototype[m] = async function (...args) {
        record('sftp', m.toUpperCase(), String(args[0] || ''));
        return m === 'get' ? Buffer.from('') : 'ok';
      };
    }
  }
} catch (_) { /* ssh2-sftp-client absent */ }
