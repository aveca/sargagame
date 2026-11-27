/**
 * Gestionnaire de consentement RGPD / CNIL
 * Affiche le bandeau, enregistre le choix, initialise le tracking après consentement.
 */

(function () {
  'use strict';

  var banner = document.getElementById('gdpr-banner');
  if (!banner) return;

  var btnAccept = document.getElementById('gdpr-accept');
  var btnDecline = document.getElementById('gdpr-decline');
  var btnSettings = document.getElementById('gdpr-settings');

  var COOKIE_KEY = 'cro_consent_v1';

  function isConsentAlreadyGiven() {
    try {
      var raw = localStorage.getItem(COOKIE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      return c.granted === true || c.granted === false ? c.granted : null;
    } catch (e) {
      return null;
    }
  }

  function hideBanner() {
    banner.style.display = 'none';
  }

  function showBanner() {
    banner.style.display = 'block';
  }

  function recordConsent(granted) {
    try {
      localStorage.setItem(COOKIE_KEY, JSON.stringify({ granted: granted, at: Date.now() }));
    } catch (e) {
      /* ignore */
    }
    // Exposer au tracker
    if (typeof window.croConsent === 'function') {
      window.croConsent(granted);
    }
    hideBanner();
  }

  // Décider si on affiche
  var existing = isConsentAlreadyGiven();
  if (existing === null) {
    showBanner();
  } else {
    hideBanner();
    if (typeof window.croConsent === 'function') {
      window.croConsent(existing);
    }
  }

  // Événements boutons
  if (btnAccept) {
    btnAccept.addEventListener('click', function () { recordConsent(true); });
  }
  if (btnDecline) {
    btnDecline.addEventListener('click', function () { recordConsent(false); });
  }
  if (btnSettings) {
    btnSettings.addEventListener('click', function () {
      // Ouvrir un modal de préférences (à implémenter selon vos besoins)
      // Pour l'instant : refuser le tracking optionnel, accepter les fonctionnels
      recordConsent(false);
    });
  }

})();
