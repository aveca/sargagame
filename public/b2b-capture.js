/* b2b-capture.js — accusé serveur RÉEL pour les captures B2B (lead capture).
 *
 * POURQUOI CE FICHIER EXISTE
 * Les pages B2B (hotels, collectivités, brief gratuit) affirmaient « merci /
 * you're in / listo » SANS confirmation serveur. Le POST partait en `no-cors`
 * (ou en `sendBeacon`, sans réponse possible) : le navigateur ne pouvait pas
 * savoir si la demande avait réellement été enregistrée. Un prospect perdu se
 * voyait donc comme un succès — 0 signal, 0 relance possible, 0 vente.
 *
 * CE QUE FAIT CE HELPER
 *   1. POST vers l'Apps Script en `mode:'cors'` + `Content-Type: text/plain`
 *      → requête « simple » (AUCUN preflight) ; l'Apps Script renvoie
 *      `Access-Control-Allow-Origin: *` et un JSON `{ok:true,action:...}`.
 *   2. Le succes n'est affiché que si le serveur CONFIRME `{ok:true}`.
 *   3. Sinon : le formulaire reste visible, un message d'erreur est affiché,
 *      le bouton est réactivé et l'utilisateur peut réessayer. L'Apps Script
 *      déduplique par email → un réessai ne crée pas de doublon.
 *   4. Un événement `sg_b2b_capture_failed` est émis → les CTA en échec
 *      deviennent mesurables (ils ne l'étaient pas).
 *
 * AUCUN état serveur nouveau : la destination reste l'Apps Script existante
 * (le sink des prospects). Aucun secret, aucun prix, aucune donnée inventée.
 */
(function (global) {
  'use strict'

  var MESSAGES = {
    fr: "L'envoi n'a pas abouti — votre demande n'est pas enregistrée. Reessayez.",
    en: 'The request did not go through — nothing was saved. Please try again.',
    es: 'El envio no se completo — no se guardo nada. Intentalo de nuevo.',
  }

  function errorBox(form) {
    if (!form || typeof form.querySelector !== 'function') return null
    var el = form.querySelector('[data-sg-capture-error]')
    if (!el && global.document && global.document.createElement) {
      el = global.document.createElement('p')
      el.setAttribute('data-sg-capture-error', '')
      el.setAttribute('role', 'alert')
      el.style.cssText = 'margin-top:10px;font-size:13px;font-weight:600;color:#b42318;line-height:1.45'
      form.appendChild(el)
    }
    return el
  }

  function showError(form, lang) {
    var el = errorBox(form)
    if (!el) return
    el.textContent = MESSAGES[lang] || MESSAGES.fr
    el.style.display = 'block'
  }

  function hideError(form) {
    if (!form || typeof form.querySelector !== 'function') return
    var el = form.querySelector('[data-sg-capture-error]')
    if (el) el.style.display = 'none'
  }

  /**
   * capture(endpoint, payload, opts)
   * opts.form      élément formulaire (pour le message d'erreur)
   * opts.lang      'fr' | 'en' | 'es'
   * opts.source    libellé technique (ex. 'hotels', 'leadmagnet')
   * opts.button    bouton à réactiver en cas d'échec
   * opts.keepalive true pour un envoi pendant la fermeture de l'onglet
   * opts.onSuccess fonction appelée UNIQUEMENT si le serveur a confirmé
   * opts.onFailure fonction appelée si l'envoi n'est pas confirmé
   * @returns Promise<data|null>
   */
  function capture(endpoint, payload, opts) {
    var o = opts || {}
    var form = o.form || null
    var lang = o.lang || 'fr'
    var button = o.button || (form && typeof form.querySelector === 'function' ? form.querySelector('button') : null)
    if (button) button.disabled = true
    hideError(form)

    var init = {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    }
    if (o.keepalive) init.keepalive = true

    var pending
    try {
      pending = global.fetch(endpoint, init)
    } catch (e) {
      pending = Promise.reject(e)
    }
    if (!pending || typeof pending.then !== 'function') {
      pending = Promise.reject(new Error('fetch_unavailable'))
    }

    return pending
      .then(function (res) {
        if (!res || !res.ok) throw new Error('http_' + (res && res.status))
        return res.json()
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error('not_saved')
        return data
      })
      .then(function (data) {
        if (typeof o.onSuccess === 'function') o.onSuccess(data)
        return data
      })
      .catch(function (err) {
        if (button) button.disabled = false
        if (typeof o.onFailure === 'function') o.onFailure(err)
        showError(form, lang)
        try {
          if (global.gtag) global.gtag('event', 'sg_b2b_capture_failed', { source: o.source || 'b2b', lang: lang })
        } catch (_) {}
        return null
      })
  }

  global.sgB2BCapture = capture
})(typeof window !== 'undefined' ? window : globalThis)
