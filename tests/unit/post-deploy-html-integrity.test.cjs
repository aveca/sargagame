'use strict';

const assert = require('node:assert/strict');
const { extractHtmlFingerprint, compareHtmlFingerprint, REQUIRED_OPEN_METEO } =
  require('../../scripts/autopilot/html-integrity.cjs');

const csp = "default-src 'self'; script-src 'self' https://js.mollie.com; style-src 'self'; connect-src 'self' " +
  REQUIRED_OPEN_METEO.join(' ') + '; base-uri ' + "'self'";
const goodHtml = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="/assets/index-abc.css">
<title>Sargagame — contrôle de build</title>
<meta name="description" content="Contrôle reproductible de l'intégrité HTML, CSP et bundle du build préparé.">
</head>
<body><div id="root"></div><script type="module" crossorigin src="/assets/index-xyz.js"></script></body>
</html>` + '<!-- ' + 'representative prepared HTML fixture '.repeat(25) + ' -->';

function check(value, label) {
  assert.ok(value, label);
  console.log('OK  ' + label);
}

const expected = extractHtmlFingerprint(goodHtml, 'sargasses-guadeloupe.com');
check(expected.ok, 'l’empreinte de build valide est extraite');
check(expected.cssSrcs.length === 1, 'le bundle CSS local est inclus dans l’empreinte');

const exact = compareHtmlFingerprint(goodHtml, expected, 'sargasses-guadeloupe.com');
check(exact.ok, 'HTML servi identique pour CSP et chemins des bundles JS/CSS');

const staleWithoutCsp = goodHtml.replace(`<meta http-equiv="Content-Security-Policy" content="${csp}">\n`, '');
const noCsp = compareHtmlFingerprint(staleWithoutCsp, expected, 'sargasses-guadeloupe.com');
check(!noCsp.ok && /meta CSP compte=0/.test(noCsp.reason),
  'cas P0 détecté : version.json neuf mais HTML servi sans CSP');

const alteredCsp = goodHtml.replace('connect-src', 'connect-xyz');
const badPolicy = compareHtmlFingerprint(alteredCsp, expected, 'sargasses-guadeloupe.com');
check(!badPolicy.ok, 'une CSP différente du build préparé est refusée');

const staleBundle = goodHtml.replace('/assets/index-xyz.js', '/assets/index-old.js');
const badBundle = compareHtmlFingerprint(staleBundle, expected, 'sargasses-guadeloupe.com');
check(!badBundle.ok && /bundle module live/.test(badBundle.reason),
  'un HTML qui référence un bundle ancien est refusé');

const missingOrigin = goodHtml.replace(' https://marine-api.open-meteo.com', '');
const badOrigins = extractHtmlFingerprint(missingOrigin, 'sargasses-guadeloupe.com');
check(!badOrigins.ok && /marine-api.open-meteo.com/.test(badOrigins.reason),
  'une CSP sans origine marine Open-Meteo est refusée');

const crossOrigin = goodHtml.replace('/assets/index-xyz.js', 'https://attacker.example/index.js');
const badOrigin = extractHtmlFingerprint(crossOrigin, 'sargasses-guadeloupe.com');
check(!badOrigin.ok && /origine incorrecte/.test(badOrigin.reason),
  'un bundle d’entrée externe est refusé');

console.log('POST_DEPLOY_HTML_INTEGRITY_TESTS PASS');
