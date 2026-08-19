// SargaChatB2B.jsx — Chat B2B déterministe pour le concierge 7 jours.
// Commandes regex, pas de NLP. Importé dans Sargasses_PROD.jsx (lazy).
// Phase 3 du vertical slice B2B_CONCIERGE_PLAN.md.
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { track } from "./Sargasses_PROD.jsx"

const API = '/api'

// ─── Regex commands ───────────────────────────────────────────────────
const COMMANDS = [
  { pattern: /^ajoute\s+(?:hôtel|hotel)\s+(.+)/i, handler: 'addProspect' },
  { pattern: /^contacte?\s+(.+)/i, handler: 'contactProspect' },
  { pattern: /^(.+)\s+accepte\s+(?:le\s+)?concierge/i, handler: 'acceptConcierge' },
  { pattern: /^prépare\s+J(\d)\s+(.+)/i, handler: 'prepareForecast' },
  { pattern: /^J(\d)\s+envoyé\s+(.+)/i, handler: 'markDaySent' },
  { pattern: /^demande\s+paiement\s+(.+)/i, handler: 'requestPayment' },
  { pattern: /^score\s+(.+)/i, handler: 'showScore' },
  { pattern: /^liste$/i, handler: 'listProspects' },
  { pattern: /^statut\s+(.+)/i, handler: 'showStatus' },
  { pattern: /^aide|help$/i, handler: 'showHelp' },
]

// ─── Helpers ──────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const resp = await fetch(`${API}/${path}`, opts)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || resp.statusText)
  }
  return resp.json()
}

// ─── Component ────────────────────────────────────────────────────────
export default function SargaChatB2B({ onClose }) {
  const [msgs, setMsgs] = useState([
    {
      who: 'bot',
      text: 'Mode concierge B2B. Tape "aide" pour voir les commandes disponibles.',
      chips: [
        { k: 'help', label: 'Aide' },
        { k: 'list', label: 'Liste prospects' },
      ],
    },
  ])
  const [typing, setTyping] = useState(false)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [msgs, typing])

  const addBotMsg = useCallback((text, chips = []) => {
    setMsgs(m => [...m, { who: 'bot', text, chips }])
  }, [])

  const addUserMsg = useCallback((text) => {
    setMsgs(m => [...m, { who: 'me', text }])
  }, [])

  // ─── Command handlers ──────────────────────────────────────────────

  const handlers = {
    async addProspect(match) {
      const name = match[1].trim()
      addUserMsg(`ajoute hôtel ${name}`)
      setTyping(true)
      try {
        const prospect = await api('POST', 'b2b-prospects.php', { name, status: 'new' })
        try { track("sg_b2b_prospect_created", { prospect_id: prospect.id, name, island: "unknown" }) } catch (_) {}
        addBotMsg(`Prospect créé : ${prospect.name} (${prospect.id.slice(0, 8)}…)`, [
          { k: `contact:${prospect.id}`, label: `Contactez ${name}` },
          { k: 'help', label: 'Autre commande' },
        ])
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    async contactProspect(match) {
      const name = match[1].trim()
      addUserMsg(`contacte ${name}`)
      setTyping(true)
      try {
        const rows = await api('GET', `b2b-prospects.php?status=new`)
        const prospect = rows.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (!prospect) {
          addBotMsg(`Aucun prospect trouvé pour "${name}". Utilise "ajoute hôtel X" d'abord.`)
          setTyping(false)
          return
        }
        await api('POST', 'b2b-contacts.php', {
          prospect_id: prospect.id,
          channel: 'chat',
          summary: 'Contact initial via chat B2B',
        })
        await api('PATCH', `b2b-prospects.php?id=${prospect.id}`, { status: 'contacted' })
        addBotMsg(`Contact enregistré pour ${prospect.name}. Prochaine étape : capture le problème.`, [
          { k: `problem:${prospect.id}`, label: `Capture problème` },
          { k: 'help', label: 'Autre commande' },
        ])
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    async acceptConcierge(match) {
      const name = match[1].trim()
      addUserMsg(`${name} accepte le concierge`)
      setTyping(true)
      try {
        const rows = await api('GET', `b2b-prospects.php`)
        const prospect = rows.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (!prospect) {
          addBotMsg(`Aucun prospect trouvé pour "${name}".`)
          setTyping(false)
          return
        }
        const concierge = await api('POST', 'b2b-concierge.php', { prospect_id: prospect.id })
        try { track("sg_b2b_concierge_started", { prospect_id: prospect.id, concierge_id: concierge.id, end_date: concierge.end_date }) } catch (_) {}
        addBotMsg(`Concierge démarré pour ${prospect.name} ! Fin le ${concierge.end_date}. Jour 1 prêt à être préparé.`, [
          { k: `prepare:1:${prospect.id}`, label: 'Prépare J1' },
          { k: 'help', label: 'Autre commande' },
        ])
      } catch (e) {
        if (e.message.includes('409')) {
          addBotMsg(`Un concierge actif existe déjà pour ce prospect.`)
        } else {
          addBotMsg(`Erreur : ${e.message}`)
        }
      }
      setTyping(false)
    },

    async prepareForecast(match) {
      const day = parseInt(match[1])
      const name = match[2].trim()
      addUserMsg(`prépare J${day} ${name}`)
      setTyping(true)
      try {
        const rows = await api('GET', `b2b-prospects.php`)
        const prospect = rows.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (!prospect) { addBotMsg(`Aucun prospect trouvé pour "${name}".`); setTyping(false); return }

        const concierge = await api('GET', `b2b-concierge.php?prospect_id=${prospect.id}`)
        if (!concierge) { addBotMsg(`Pas de concierge actif pour ${prospect.name}.`); setTyping(false); return }

        // Fetch forecast from sargassum.json
        const forecastResp = await fetch('/api/copernicus/sargassum.json')
        const forecastData = await forecastResp.json()
        const beaches = forecastData.beaches || []
        const beach = beaches[0] || {}
        const today = new Date().toISOString().slice(0, 10)
        const riskLevel = beach.status || 'unknown'
        const confidence = beach.confidence || 0

        const delivery = await api('POST', 'b2b-forecast-delivery.php', {
          concierge_id: concierge.id,
          prospect_id: prospect.id,
          beach: beach.name || 'Plage principale',
          forecast_date: today,
          day_number: day,
          risk_level: riskLevel,
          confidence: confidence,
          explanation: `Prévision J+${day - 1} pour ${beach.name || 'votre plage'}`,
          recommended_action: riskLevel === 'clean' ? 'Conditions favorables' : 'Précautions recommandées',
        })
        addBotMsg(`J${day} préparé (${riskLevel}, conf ${confidence}%). Prêt à envoyer.`, [
          { k: `send:${day}:${prospect.id}`, label: `Envoyer J${day}` },
          { k: 'help', label: 'Autre commande' },
        ])
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    async markDaySent(match) {
      const day = parseInt(match[1])
      const name = match[2].trim()
      addUserMsg(`J${day} envoyé ${name}`)
      setTyping(true)
      try {
        const rows = await api('GET', `b2b-prospects.php`)
        const prospect = rows.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (!prospect) { addBotMsg(`Aucun prospect trouvé pour "${name}".`); setTyping(false); return }

        const concierge = await api('GET', `b2b-concierge.php?prospect_id=${prospect.id}`)
        if (!concierge) { addBotMsg(`Pas de concierge actif.`); setTyping(false); return }

        const deliveries = await api('GET', `b2b-forecast-delivery.php?concierge_id=${concierge.id}`)
        const delivery = deliveries.find(d => d.day_number === day)
        if (!delivery) { addBotMsg(`Pas de prévision J${day} préparée.`); setTyping(false); return }

        await api('PATCH', `b2b-forecast-delivery.php?id=${delivery.id}`, { action: 'sent' })
        await api('PATCH', `b2b-concierge.php?id=${concierge.id}`, { action: 'advance_day', day })

        try { track("sg_b2b_day_sent", { prospect_id: prospect.id, concierge_id: concierge.id, day }) } catch (_) {}

        if (day === 7) {
          addBotMsg(`J${day} envoyé. Dernier jour du concierge. Tu peux demander le paiement.`, [
            { k: `pay:${prospect.id}`, label: `Demande paiement` },
          ])
        } else {
          addBotMsg(`J${day} envoyé. Prochain : J${day + 1}.`, [
            { k: `prepare:${day + 1}:${prospect.id}`, label: `Prépare J${day + 1}` },
            { k: 'help', label: 'Autre commande' },
          ])
        }
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    async requestPayment(match) {
      const name = match[1].trim()
      addUserMsg(`demande paiement ${name}`)
      setTyping(true)
      try {
        const rows = await api('GET', `b2b-prospects.php`)
        const prospect = rows.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (!prospect) { addBotMsg(`Aucun prospect trouvé pour "${name}".`); setTyping(false); return }

        const concierge = await api('GET', `b2b-concierge.php?prospect_id=${prospect.id}`)
        if (!concierge) { addBotMsg(`Pas de concierge actif.`); setTyping(false); return }

        await api('PATCH', `b2b-concierge.php?id=${concierge.id}`, { action: 'payment_requested' })

        try { track("sg_b2b_payment_requested", { prospect_id: prospect.id, concierge_id: concierge.id }) } catch (_) {}

        const checkout = await api('POST', 'b2b-create-checkout.php', {
          prospect_id: prospect.id,
          concierge_id: concierge.id,
          email: prospect.email || `${prospect.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
          name: prospect.name,
        })

        try { track("sg_b2b_checkout_created", { prospect_id: prospect.id, concierge_id: concierge.id, subscription_id: checkout.subscriptionId, checkout_url: checkout.checkoutUrl }) } catch (_) {}

        addBotMsg(`Lien de paiement créé : ${checkout.checkoutUrl || 'URL non disponible'}. Envoie-le au client.`, [
          { k: 'help', label: 'Autre commande' },
        ])
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    async showScore(match) {
      const name = match[1].trim()
      addUserMsg(`score ${name}`)
      setTyping(true)
      try {
        const rows = await api('GET', `b2b-prospects.php`)
        const prospect = rows.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (!prospect) { addBotMsg(`Aucun prospect trouvé pour "${name}".`); setTyping(false); return }

        const score = await api('GET', `b2b-scores.php?prospect_id=${prospect.id}`)
        if (!score) {
          addBotMsg(`Pas de score pour ${prospect.name}. Utilise "score ${name} P F C W" pour en créer un.`)
        } else {
          addBotMsg(`${prospect.name} : P=${score.problem_score} F=${score.frequency_score} C=${score.cost_score} W=${score.willingness_score} → Total ${score.total_score}/12`)
        }
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    async listProspects() {
      addUserMsg('liste')
      setTyping(true)
      try {
        const rows = await api('GET', 'b2b-prospects.php')
        if (!rows.length) {
          addBotMsg('Aucun prospect. Utilise "ajoute hôtel X" pour commencer.')
        } else {
          const list = rows.map(p => `• ${p.name} [${p.status}]`).join('\n')
          addBotMsg(`${rows.length} prospect(s) :\n${list}`)
        }
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    async showStatus(match) {
      const name = match[1].trim()
      addUserMsg(`statut ${name}`)
      setTyping(true)
      try {
        const rows = await api('GET', `b2b-prospects.php`)
        const prospect = rows.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (!prospect) { addBotMsg(`Aucun prospect trouvé pour "${name}".`); setTyping(false); return }

        const concierge = await api('GET', `b2b-concierge.php?prospect_id=${prospect.id}`)
        const score = await api('GET', `b2b-scores.php?prospect_id=${prospect.id}`)
        const events = await api('GET', `b2b-events.php?prospect_id=${prospect.id}`)

        let status = `${prospect.name} [${prospect.status}]\n`
        if (score) status += `Score : ${score.total_score}/12\n`
        if (concierge) status += `Concierge : jour ${concierge.current_day}/7 (${concierge.status})\n`
        if (events?.length) status += `${events.length} événement(s) enregistré(s)\n`

        addBotMsg(status, [
          { k: 'help', label: 'Autre commande' },
        ])
      } catch (e) {
        addBotMsg(`Erreur : ${e.message}`)
      }
      setTyping(false)
    },

    showHelp() {
      addUserMsg('aide')
      addBotMsg(
        'Commandes disponibles :\n' +
        '• ajoute hôtel NOM — créer un prospect\n' +
        '• contacte NOM — enregistrer un contact\n' +
        '• NOM accepte le concierge — démarrer 7 jours\n' +
        '• prépare J1 NOM — créer la prévision\n' +
        '• J1 envoyé NOM — marquer envoyé\n' +
        '• demande paiement NOM — créer lien paiement\n' +
        '• score NOM — voir le score P×F×C×V\n' +
        '• statut NOM — voir le statut complet\n' +
        '• liste — tous les prospects',
        [{ k: 'list', label: 'Liste prospects' }]
      )
    },
  }

  // ─── Command router ────────────────────────────────────────────────

  const handleCommand = async (text) => {
    const trimmed = text.trim()

    // Check regex commands
    for (const cmd of COMMANDS) {
      const match = trimmed.match(cmd.pattern)
      if (match && handlers[cmd.handler]) {
        await handlers[cmd.handler](match)
        return
      }
    }

    // Check chip actions
    addUserMsg(trimmed)
    addBotMsg('Commande non reconnue. Tape "aide" pour voir les options.')
  }

  // ─── Chip click handler ────────────────────────────────────────────

  const onChip = (chip) => {
    if (chip.k === 'help') { handlers.showHelp(); return }
    if (chip.k === 'list') { handlers.listProspects(); return }
    if (chip.k.startsWith('contact:')) {
      const id = chip.k.split(':')[1]
      handlers.contactProspect([null, chip.label.replace('Contactez ', '')])
      return
    }
    if (chip.k.startsWith('prepare:')) {
      const [, day, id] = chip.k.split(':')
      handlers.prepareForecast([null, day, chip.label.replace('Prépare J', '')])
      return
    }
    if (chip.k.startsWith('send:')) {
      const [, day, id] = chip.k.split(':')
      handlers.markDaySent([null, day, ''])
      return
    }
    if (chip.k.startsWith('pay:')) {
      handlers.requestPayment([null, chip.label.replace('Demande paiement ', '')])
      return
    }
    if (chip.k === 'root') {
      setMsgs(m => [...m, { who: 'me', text: chip.label }])
      handlers.showHelp()
      return
    }
  }

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div role="dialog" aria-modal="true" aria-label="Concierge B2B" style={{
      position: 'fixed', right: 0, bottom: 0, left: 0, zIndex: 1090,
      display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto', width: '100%', maxWidth: 420,
        margin: '0 10px calc(10px + env(safe-area-inset-bottom))',
        background: '#120821', border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 18px 60px rgba(0,0,0,.55)',
        display: 'flex', flexDirection: 'column', maxHeight: 'min(72vh,560px)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.10)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
              <g transform="translate(32,33)">
                <circle r="20" fill="#FFC72C" opacity=".18"/>
                <rect x="-11" y="-11" width="22" height="22" rx="6" fill="#0A1714"/>
                <rect x="-11" y="-11" width="22" height="6" rx="6" fill="#FFC72C"/>
                <circle cx="0" cy="2" r="3.4" fill="#FFC72C"/>
              </g>
            </svg>
            <div>
              <strong style={{ fontSize: 13.5, color: '#fff', lineHeight: 1.2 }}>
                Concierge B2B
              </strong>
              <span style={{
                display: 'block', fontSize: 10.5, fontWeight: 800,
                color: '#FFC72C', letterSpacing: '.04em',
              }}>
                Mode fondateur
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,.6)',
            fontSize: 18, cursor: 'pointer', padding: 12, minWidth: 44, minHeight: 44,
          }}>✕</button>
        </div>

        {/* Messages */}
        <div ref={bodyRef} style={{
          overflowY: 'auto', overflowX: 'hidden', padding: '14px 12px',
          display: 'flex', flexDirection: 'column', gap: 10, flex: 1,
        }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.who === 'me' ? 'flex-end' : 'flex-start',
              maxWidth: '86%',
              background: m.who === 'me' ? '#FFC72C' : 'rgba(255,255,255,.07)',
              color: m.who === 'me' ? '#120821' : '#fff',
              fontSize: 13.5, lineHeight: 1.5, padding: '10px 13px',
              borderRadius: m.who === 'me' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              whiteSpace: 'pre-wrap',
            }}>{m.text}</div>
          ))}
          {typing && (
            <div style={{
              alignSelf: 'flex-start', background: 'rgba(255,255,255,.07)',
              color: 'rgba(255,255,255,.7)', fontSize: 13.5, padding: '10px 14px',
              borderRadius: '16px 16px 16px 4px', letterSpacing: 2,
            }}>•••</div>
          )}
          {!typing && msgs[msgs.length - 1]?.who === 'bot' && msgs[msgs.length - 1]?.chips && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
              {msgs[msgs.length - 1].chips.map((c, i) => (
                <button key={i} onClick={() => onChip(c)} style={{
                  background: 'rgba(255,199,44,.1)',
                  border: '1px solid rgba(255,199,44,.45)',
                  color: '#FFC72C', fontFamily: 'inherit', fontWeight: 700,
                  fontSize: 12.5, padding: '9px 13px', minHeight: 44,
                  borderRadius: 999, cursor: 'pointer', textAlign: 'left',
                }}>{c.label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,.10)' }}>
          <form onSubmit={(e) => {
            e.preventDefault()
            const input = e.target.elements.b2bInput
            if (input.value.trim()) {
              handleCommand(input.value)
              input.value = ''
            }
          }} style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              name="b2bInput"
              type="text"
              placeholder="Commande..."
              style={{
                flex: 1, background: 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.20)', borderRadius: 12,
                padding: '10px 14px', color: '#fff', fontSize: 13.5,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button type="submit" style={{
              background: '#FFC72C', border: 'none', borderRadius: 12,
              padding: '0 18px', minHeight: 44, color: '#120821',
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
            }}>▶</button>
          </form>
        </div>
      </div>
    </div>
  )
}
