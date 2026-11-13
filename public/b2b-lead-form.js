/* Formulaire B2B. Succès uniquement si un serveur confirme l'enregistrement.
   1) POST /api/b2b-lead (Worker → table b2b_leads) quand il est déployé.
   2) Sinon le collecteur Apps Script déjà en production (email_signup).
   Aucun succès affiché sur un envoi no-cors. */
(function (global) {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
  function text(lang, ok) {
    if (ok) return lang === 'es' ? 'Solicitud registrada.' : lang === 'en' ? 'Request stored.' : 'Demande enregistrée.'
    return lang === 'es' ? 'No se guardó. Reintenta.' : lang === 'en' ? 'Nothing was stored. Try again.' : 'Rien n’a été enregistré. Réessayez.'
  }
  async function workerStore(body) {
    var r = await fetch('/api/b2b-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    var data = null
    try { data = await r.json() } catch (_) {}
    return r.ok && data && data.ok === true
  }
  function bind(form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault()
      var lang = form.getAttribute('data-lang') || 'fr'
      var btn = form.querySelector('button')
      if (btn) btn.disabled = true
      var body = {
        email: (form.email && form.email.value || '').trim(),
        organization: (form.organization && form.organization.value || '').trim(),
        beach: (form.beach && form.beach.value || '').trim(),
        region: form.getAttribute('data-region') || '',
      }
      var payload = {
        type: 'email_signup',
        email: body.email,
        source: 'b2b_offer',
        island: body.region,
        hotel: body.organization,
        beach: body.beach,
      }
      workerStore(body).then(function (ok) {
        if (ok) return true
        if (!global.sgB2BCapture) return false
        return global.sgB2BCapture(ENDPOINT, payload, { form: form, lang: lang, source: 'b2b_offer' }).then(function (data) {
          return !!(data && data.ok === true)
        })
      }).then(function (ok) {
        var note = form.querySelector('[data-sg-lead-status]')
        if (!note) {
          note = global.document.createElement('p')
          note.setAttribute('data-sg-lead-status', '')
          note.setAttribute('role', 'status')
          form.appendChild(note)
        }
        note.textContent = text(lang, ok)
        if (!ok && btn) btn.disabled = false
      }).catch(function () {
        if (btn) btn.disabled = false
      })
    })
  }
  function boot() {
    var forms = global.document.querySelectorAll('form[data-sg-lead]')
    for (var i = 0; i < forms.length; i++) bind(forms[i])
  }
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot)
  else boot()
})(typeof window !== 'undefined' ? window : globalThis)
