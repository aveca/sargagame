/**
 * Petit utilitaire de tests A/B côté client — BOT-WOW & Sargasses
 * Utilisation : data-ab="nom_du_test" sur l'élément à tester,
 *               data-ab-variants='["A","B"]' pour la liste des variantes.
 *
 * L'utilitaire assigne une variante au visiteur (stockée dans localStorage),
 * ajoute un attribut data-ab-variant et tracke un événement cta_click
 * avec la variante pour comparaison dans GA4/Matomo.
 *
 * Respecte le consentement RGPD : ne tracke qu'après consentement.
 */

(function () {
  'use strict';

  function getVariant(testName, variants) {
    var key = 'cro_ab_' + testName;
    try {
      var stored = localStorage.getItem(key);
      if (stored) return stored;
    } catch (e) {}

    var idx = Math.floor(Math.random() * variants.length);
    var variant = variants[idx];
    try {
      localStorage.setItem(key, variant);
    } catch (e) {}
    return variant;
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    var els = document.querySelectorAll('[data-ab]');
    els.forEach(function (el) {
      var testName = el.getAttribute('data-ab');
      var variantsRaw = el.getAttribute('data-ab-variants');
      var variants = ['A', 'B'];
      if (variantsRaw) {
        try { variants = JSON.parse(variantsRaw); } catch (e) {}
      }

      var variant = getVariant(testName, variants);
      el.setAttribute('data-ab-variant', variant);

      var originalClick = el.onclick;
      el.onclick = function (e) {
        if (typeof window.croTrack === 'function') {
          window.croTrack('cta_click', {
            cta_id: el.getAttribute('data-cta') || testName,
            page: window.location.pathname,
            site: document.documentElement.dataset.site || 'unknown',
            ab_test: testName,
            ab_variant: variant,
            element: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().substring(0, 80),
          });
        }
        if (typeof originalClick === 'function') {
          originalClick.call(el, e);
        }
      };
    });
  }

  init();

  // Expose pour tests manuels
  window.croAB = { getVariant: getVariant };

})();
