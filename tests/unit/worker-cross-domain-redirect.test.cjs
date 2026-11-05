// Regression: preserve organic equity when a GP-owned page is removed from the MQ package.
const assert = require('node:assert/strict');

async function main() {
  const { default: worker } = await import('../../workers/sargagame/index.js');
  const env = {
    ASSETS: {
      fetch: async () => new Response('static asset', { status: 200 }),
    },
  };
  const dispatch = (method, url) => worker.fetch(new Request(url, { method }), env);
  let passed = 0;
  const check = (name, condition) => {
    assert.ok(condition, name);
    passed += 1;
    console.log('  ✓ ' + name);
  };

  const canonical = 'https://sargasses-guadeloupe.com/meteo-sargasses-guadeloupe/';

  const noSlash = await dispatch(
    'GET',
    'https://sargasses-martinique.com/meteo-sargasses-guadeloupe'
  );
  check('GET without trailing slash returns a permanent redirect', noSlash.status === 301);
  check('GET redirect targets the Guadeloupe canonical URL', noSlash.headers.get('location') === canonical);
  check('permanent redirect has a bounded cache lifetime', noSlash.headers.get('cache-control') === 'public, max-age=300');

  const withQuery = await dispatch(
    'GET',
    'https://sargasses-martinique.com/meteo-sargasses-guadeloupe/?utm_source=google&gclid=abc'
  );
  check('GET with trailing slash preserves the complete query string',
    withQuery.status === 301 &&
    withQuery.headers.get('location') === canonical + '?utm_source=google&gclid=abc');

  const head = await dispatch(
    'HEAD',
    'https://sargasses-martinique.com/meteo-sargasses-guadeloupe/'
  );
  check('HEAD receives the same permanent redirect', head.status === 301);
  check('HEAD redirect has no response body', (await head.text()) === '');

  const gpHost = await dispatch(
    'GET',
    'https://sargasses-guadeloupe.com/meteo-sargasses-guadeloupe/'
  );
  check('Guadeloupe canonical host is never redirected', gpHost.status === 200 && !gpHost.headers.has('location'));

  const floridaHost = await dispatch(
    'GET',
    'https://sargassummiami.com/meteo-sargasses-guadeloupe/'
  );
  check('other regional hosts are never redirected', floridaHost.status === 200 && !floridaHost.headers.has('location'));

  const prefixPath = await dispatch(
    'GET',
    'https://sargasses-martinique.com/meteo-sargasses-guadeloupe-extra/'
  );
  check('similar or prefix paths are not redirected', prefixPath.status === 200 && !prefixPath.headers.has('location'));

  const nestedPath = await dispatch(
    'GET',
    'https://sargasses-martinique.com/meteo-sargasses-guadeloupe/extra'
  );
  check('nested paths are not redirected', nestedPath.status === 200 && !nestedPath.headers.has('location'));

  const post = await dispatch(
    'POST',
    'https://sargasses-martinique.com/meteo-sargasses-guadeloupe/'
  );
  check('non-GET/HEAD methods are not redirected', post.status === 200 && !post.headers.has('location'));

  const legacyAliases = [
    {
      host: 'sargasses-martinique.com',
      canonical: 'https://sargasses-martinique.com/carte-sargasses/',
    },
    {
      host: 'sargasses-guadeloupe.com',
      canonical: 'https://sargasses-guadeloupe.com/carte-sargasses/',
    },
  ];

  for (const { host, canonical: mapCanonical } of legacyAliases) {
    const noSlash = await dispatch('GET', `https://${host}/sarg_carte_satellite_app`);
    check(`${host} extensionless legacy map redirects permanently`, noSlash.status === 301);
    check(`${host} legacy map redirects to its regional canonical`, noSlash.headers.get('location') === mapCanonical);

    const slashAndQuery = await dispatch(
      'GET',
      `https://${host}/sarg_carte_satellite_app/?utm_source=google&gclid=abc`
    );
    check(`${host} trailing-slash legacy map preserves query`,
      slashAndQuery.status === 301 &&
      slashAndQuery.headers.get('location') === mapCanonical + '?utm_source=google&gclid=abc');

    const htmlAlias = await dispatch('GET', `https://${host}/sarg_carte_satellite_app.html`);
    check(`${host} legacy .html alias redirects directly to canonical`,
      htmlAlias.status === 301 && htmlAlias.headers.get('location') === mapCanonical);

    const headAlias = await dispatch('HEAD', `https://${host}/sarg_carte_satellite_app`);
    check(`${host} HEAD legacy alias redirects without a body`,
      headAlias.status === 301 && (await headAlias.text()) === '');
  }

  for (const host of [
    'sargassummiami.com',
    'sargassumpuntacana.com',
    'sargassumcancun.com',
    'sargazotulum.com',
  ]) {
    const legacy = await dispatch('GET', `https://${host}/sarg_carte_satellite_app`);
    check(`${host} is not redirected by the MQ/GP legacy alias`,
      legacy.status === 200 && !legacy.headers.has('location'));
  }

  const prefixPath = await dispatch('GET', 'https://sargasses-guadeloupe.com/sarg_carte_satellite_app-extra');
  check('similar prefix paths are not redirected',
    prefixPath.status === 200 && !prefixPath.headers.has('location'));

  const nestedPath = await dispatch('GET', 'https://sargasses-guadeloupe.com/sarg_carte_satellite_app/extra');
  check('nested paths are not redirected',
    nestedPath.status === 200 && !nestedPath.headers.has('location'));

  const postAlias = await dispatch('POST', 'https://sargasses-guadeloupe.com/sarg_carte_satellite_app');
  check('non-GET/HEAD methods are not redirected',
    postAlias.status === 200 && !postAlias.headers.has('location'));

  console.log('\n' + passed + ' cross-domain redirect checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
