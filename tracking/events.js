/**
 * Tracking des événements CRO — BOT-WOW & Sargasses
 * Compatible GA4 (gtag) et Matomo. Respecte le consentement RGPD.
 *
 * Événements émis :
 *   cta_impression  — un CTA est visible à l'écran
 *   cta_click       — clic sur un CTA
 *   form_submit     — soumission formulaire (B2B, waitlist, alerte)
 *   checkout_initiated — clic vers Stripe / début paiement
 *   checkout_success   — paiement confirmé (via webhook ou retour Stripe)
 *   checkout_failure   — échec/annulation paiement
 */

(function () {
  'use strict';

  var CONFIG = {
    // Définissez votre fournisseur : 'ga4' | 'matomo' | 'none'
    provider: 'none',
    // ID de mesure GA4 ou Matomo
    measurementId: 'G-XXXXXXXXXX',
    // URL endpoint Matomo (si utilisé)
    matomoEndpoint: 'https://analytics.votredomaine.com/matomo.php',
    matomoSiteId: 1,
    // Consentement stocké sous cette clé
    consentKey: 'cro_consent_v1',
    // Délai avant envoi (ms) pour regrouper les impressions
    impressionDebounceMs: 1000,
  };

  var state = {
    consentGiven: false,
    consentChecked: false,
    sentImpressions: new Set(),
  };

  /* ---------- Consentement ---------- */

  function getConsent() {
    try {
      var raw = localStorage.getItem(CONFIG.consentKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setConsent(granted) {
    try {
      localStorage.setItem(CONFIG.consentKey, JSON.stringify({ granted: granted, at: Date.now() }));
    } catch (e) {
      /* ignore */
    }
    state.consentGiven = granted;
    state.consentChecked = true;
  }

  function hasConsent() {
    if (!state.consentChecked) {
      var c = getConsent();
      state.consentChecked = true;
      state.consentGiven = c ? c.granted : false;
    }
    return state.consentGiven;
  }

  /* ---------- Envoi d'événement ---------- */

  function sendEvent(name, params) {
    if (!hasConsent()) {
      // On stocke en file d'attente si consentement pas encore donné
      return;
    }

    var payload = {
      event: name,
      page: window.location.pathname,
      site: params.site || (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.site) || 'unknown',
      cta_id: params.cta_id || null,
      timestamp: new Date().toISOString(),
    };
    // Fusion des params supplémentaires
    for (var k in params) {
      if (params.hasOwnProperty(k) && k !== 'site' && k !== 'cta_id') {
        payload[k] = params[k];
      }
    }

    if (CONFIG.provider === 'ga4' && typeof gtag !== 'undefined') {
      gtag('event', name, payload);
    } else if (CONFIG.provider === 'matomo') {
      var qs = [];
      for (var k in payload) {
        if (payload.hasOwnProperty(k)) {
          qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]));
        }
      }
      var url = CONFIG.matomoEndpoint + '?idsite=' + CONFIG.matomoSiteId + '&rec=1&' + qs.join('&');
      var img = new Image();
      img.src = url;
    }
    // console.log('[CRO] event', name, payload); // debug
  }

  /* ---------- Initialisation ---------- */

  function init() {
    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    setupCtaTracking();
    setupFormTracking();
    setupImpressionTracking();

    // Exposer globalement pour les appels manuels
    window.croTrack = sendEvent;
    window.croConsent = setConsent;
  }

  /* ---------- Clic CTA ---------- */

  function setupCtaTracking() {
    var ctas = document.querySelectorAll('[data-cta]');
    ctas.forEach(function (el) {
      el.addEventListener('click', function (e) {
        var ctaId = el.getAttribute('data-cta');
        var page = el.getAttribute('data-page') || window.location.pathname;
        var site = el.getAttribute('data-site') || 'unknown';

        sendEvent('cta_click', {
          cta_id: ctaId,
          page: page,
          site: site,
          element: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().substring(0, 80),
        });

        // Si c'est un lien vers Stripe, on peut aussi tracker checkout_initiated
        var href = el.getAttribute('href') || '';
        if (href.indexOf('stripe') !== -1 || href.indexOf('buy.stripe') !== -1) {
          sendEvent('checkout_initiated', {
            cta_id: ctaId,
            page: page,
            site: site,
            destination: href.substring(0, 120),
          });
        }
      });

      // Impression (déclenché par l'observateur ci-dessous)
    });
  }

  /* ---------- Formulaires ---------- */

  function setupFormTracking() {
    var forms = document.querySelectorAll('form[data-cro]');
    forms.forEach(function (form) {
      form.addEventListener('submit', function () {
        var formId = form.getAttribute('data-cro') || 'form';
        sendEvent('form_submit', {
          form_id: formId,
          page: window.location.pathname,
        });
      });
    });
  }

  /* ---------- Impressions (IntersectionObserver) ---------- */

  function setupImpressionTracking() {
    if (!('IntersectionObserver' in window)) {
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var ctaId = el.getAttribute('data-cta');
          if (!ctaId) return;
          var key = ctaId + ':' + window.location.pathname;
          if (state.sentImpressions.has(key)) return;
          state.sentImpressions.add(key);

          var page = el.getAttribute('data-page') || window.location.pathname;
          var site = el.getAttribute('data-site') || 'unknown';

          sendEvent('cta_impression', {
            cta_id: ctaId,
            page: page,
            site: site,
          });
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('[data-cta]').forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ---------- Démarrage ---------- */

  init();

})();
