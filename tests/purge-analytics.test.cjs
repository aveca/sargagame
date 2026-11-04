#!/usr/bin/env node
/**
 * purge-analytics.test.cjs — contrat READ-ONLY de la mesure de rétention.
 *
 * Tests hermétiques : fetch est toujours simulé et aucune clé réelle n'est
 * utilisée. Le script ne contient plus de fonction de suppression.
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const MOD = path.join(__dirname, '..', 'scripts', 'automation', 'purge-analytics.cjs');
const { main, countRows, resolveOptions, MIN_DAYS } = require(MOD);

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

function response(total, status = 200, contentRange) {
  const headers = new Map();
  if (contentRange !== undefined) headers.set('content-range', contentRange);
  else if (total !== null) headers.set('content-range', `0-0/${total}`);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) || null },
    text: async () => 'synthetic response',
  };
}

async function mainTest() {
  // 1. Le comptage est une seule requête GET avec count=exact.
  {
    const calls = [];
    const total = await countRows(
      '2026-01-01T00:00:00Z',
      async (url, options) => {
        calls.push({ url, options });
        return response(123456);
      },
      'synthetic-test-key',
    );
    record('countRows : une seule requête', calls.length === 1, `calls=${calls.length}`);
    record('countRows : méthode GET explicite', calls[0]?.options?.method === 'GET');
    record('countRows : Range 0-0', calls[0]?.options?.headers?.Range === '0-0');
    record('countRows : Prefer count=exact', calls[0]?.options?.headers?.Prefer === 'count=exact');
    record('countRows : total lu dans content-range', total === 123456, `total=${total}`);
  }

  // 2. Les arguments historiquement destructeurs ne changent jamais le mode.
  {
    const cases = [
      ['sans argument', []],
      ['--dry', ['--dry']],
      ['--execute', ['--execute']],
      ['--execute + identité arbitraire', ['--execute', '--approved-by=github:someone']],
      ['--approved-by seul', ['--approved-by=operator']],
      ['--delete', ['--delete']],
    ];
    for (const [label, argv] of cases) {
      const options = resolveOptions(argv);
      record(`options ${label} : aucun mode destructeur`,
        !Object.prototype.hasOwnProperty.call(options, 'execute') &&
        !Object.prototype.hasOwnProperty.call(options, 'approvedBy'));
    }
  }

  // 3. Le vrai entrypoint main reste GET-only, même avec les anciens flags.
  {
    const cases = [
      ['cron standard', []],
      ['ancien dry flag', ['--dry']],
      ['ancien execute flag', ['--execute']],
      ['execute + identité non authentifiée', ['--execute', '--approved-by=github:someone']],
      ['option delete inconnue', ['--delete']],
      ['jours longs + anciens flags', ['--days=365', '--execute', '--approved-by=operator']],
    ];
    for (const [label, argv] of cases) {
      const methods = [];
      const result = await main(argv, {
        serviceKey: 'synthetic-test-key',
        now: Date.UTC(2026, 10, 4, 0, 0, 0),
        fetchImpl: async (_url, options) => {
          methods.push(options.method);
          return response(42);
        },
      });
      record(`main ${label} : comptage lecture seule`,
        result.dryRun === true && result.eligible === 42 && methods.length === 1 && methods[0] === 'GET',
        `result=${JSON.stringify(result)} methods=${methods.join(',')}`);
    }
  }

  // 4. Un service key absent ne déclenche aucune requête.
  {
    let calls = 0;
    const result = await main([], {
      serviceKey: '',
      fetchImpl: async () => { calls++; return response(0); },
    });
    record('clé absente : aucun appel réseau', result.skipped === true && calls === 0);
  }

  // 5. Un content-range manquant/invalide n'est jamais interprété comme zéro.
  {
    let missingRejected = false;
    try {
      await countRows('2026-01-01T00:00:00Z', async () => response(null), 'synthetic-test-key');
    } catch (error) {
      missingRejected = /content-range/.test(error.message);
    }
    record('content-range absent : erreur explicite', missingRejected);
  }
  {
    let invalidRejected = false;
    try {
      await countRows('2026-01-01T00:00:00Z', async () => response(null, 200, '*/unknown'), 'synthetic-test-key');
    } catch (error) {
      invalidRejected = /content-range/.test(error.message);
    }
    record('content-range invalide : erreur explicite', invalidRejected);
  }

  // 6. Erreur HTTP : aucune tentative d'écriture.
  {
    const methods = [];
    const result = await main([], {
      serviceKey: 'synthetic-test-key',
      fetchImpl: async (_url, options) => {
        methods.push(options.method);
        return response(null, 503, '0-0/0');
      },
    });
    record('erreur HTTP : sortie en lecture seule', result.error === true && methods.join(',') === 'GET');
  }

  // 7. Le plancher contractuel ne peut pas être raccourci.
  {
    record('MIN_DAYS reste fixé à 90', MIN_DAYS === 90);
    record('--days=7 est ramené à 90', resolveOptions(['--days=7']).days === 90);
    record('--days=7 reste visible pour diagnostic', resolveOptions(['--days=7']).daysRequested === 7);
    record('--days=365 est conservé', resolveOptions(['--days=365']).days === 365);
    record('90 jours est la valeur par défaut', resolveOptions([]).days === 90);
  }

  console.log(failures === 0
    ? '\\nPURGE_ANALYTICS_TESTS PASS'
    : `\\nPURGE_ANALYTICS_TESTS FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

mainTest().catch((error) => {
  console.error('ERREUR FATALE :', error && error.stack ? error.stack : error);
  process.exit(1);
});
