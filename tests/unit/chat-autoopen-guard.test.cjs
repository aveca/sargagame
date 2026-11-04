#!/usr/bin/env node
'use strict';
// Garde anti-popup : le chat ne doit plus s'ouvrir sur simple lecture immobile.
// - hesitation => jamais d'auto-open (cause : overlay masquait la carte)
// - signaux actifs => 1 seule fois/session, jamais si déjà ouvert ou après dismiss
const assert = require('node:assert/strict');

(async () => {
  const m = await import('../../src/frustrationGuard.js');
  const { shouldAutoOpenChat, FRUSTRATION_AUTO_OPEN_TYPES } = m;
  let n = 0;
  const t = (v, label) => { n++; assert.ok(v, label); console.log('OK  ' + label); };

  t(typeof shouldAutoOpenChat === 'function', 'shouldAutoOpenChat est exporte');
  t(!FRUSTRATION_AUTO_OPEN_TYPES.includes('hesitation'), 'hesitation exclu des types auto-open');
  t(FRUSTRATION_AUTO_OPEN_TYPES.includes('rage-click'), 'rage-click garde auto-open');
  t(FRUSTRATION_AUTO_OPEN_TYPES.includes('scroll-frenzy'), 'scroll-frenzy garde auto-open');
  t(FRUSTRATION_AUTO_OPEN_TYPES.includes('mouse-shake'), 'mouse-shake garde auto-open');

  t(shouldAutoOpenChat('hesitation', {}) === false, 'hesitation idle 10s => PASS (pas d auto-open)');
  t(shouldAutoOpenChat('hesitation', { alreadyAutoOpened: false, dismissed: false, chatOpen: false }) === false, 'hesitation meme primo-session => bloque');
  t(shouldAutoOpenChat('rage-click', {}) === true, 'rage-click primo-session => ouvre');
  t(shouldAutoOpenChat('scroll-frenzy', {}) === true, 'scroll-frenzy primo-session => ouvre');
  t(shouldAutoOpenChat('rage-click', { alreadyAutoOpened: true }) === false, '2e signal meme session => bloque (1 seule fois)');
  t(shouldAutoOpenChat('rage-click', { chatOpen: true }) === false, 'chat deja ouvert => bloque');
  t(shouldAutoOpenChat('rage-click', { dismissed: true }) === false, 'apres fermeture manuelle => bloque');
  t(shouldAutoOpenChat('unknown-type', {}) === false, 'type inconnu => bloque');

  console.log(`\n${n}/${n} assertions OK`);
})().catch((e) => { console.error('ECHEC chat-autoopen-guard:', e); process.exit(1); });
