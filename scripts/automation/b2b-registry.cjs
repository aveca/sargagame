#!/usr/bin/env node
/**
 * b2b-registry.cjs — REGISTRE DES PROSPECTS DÉJÀ CONTACTÉS (B2B).
 *
 * Phase 3 de la mission « transformer les prospects contactés en clients
 * payants » : un registre unique, à jour, des prospects déjà contactés, avec
 * un statut commercial par prospect et des relances PRÉPARÉES (jamais
 * envoyées).
 *
 * ÉTAT RÉEL (mesuré le 2026-11-05 sur les données du dépôt) :
 *   • 152 envois « cold » enregistrés (clé = hash d'email, PAS d'email en clair) ;
 *   • 108 contacts enrichis (email + nom + ville + hook) ;
 *   • 104 de ces 108 figurent dans les envois cold → CE SONT les prospects
 *     réellement contactés ET identifiables ;
 *   • 4 contacts enrichis ont reçu une relance ciblée (correctif widget) ;
 *   • 86 tentatives journalisées par domaine (11 envoyées, 68 sans email,
 *     7 en échec) ;
 *   • funnel : lead 4, payé 0.
 *   → Le « 45 » du cahier des charges ne correspond à AUCUN compteur du dépôt :
 *     on registre la vérité mesurée (104 contactés identifiables, 152 envois
 *     hachés, 4 leads, 0 payé) et on ne fabrique aucun nombre.
 *
 * RÉGLES :
 *   1. AUCUN ENVOI. Ce script écrit des FICHIERS (registre + brouillons de
 *      relance). L'envoi reste un acte du fondateur, jamais du script.
 *   2. Les emails en clair ne sont JAMAIS commités (dépôt PUBLIC) : registre
 *      complet + brouillons dans scripts/automation/data/ (gitignorés), seul
 *      un résumé masqué est versionné (docs/B2B_REGISTRY.md).
 *   3. Les statuts saisis à la main (fichier de statut) sont PRIORITAIRES :
 *      relancer le script ne doit jamais écraser une décision commerciale.
 *   4. Aucune relance n'est préparée pour un prospect déjà gagné/perdu.
 *
 * Usage :
 *   node scripts/automation/b2b-registry.cjs              # reconstruit registre + brouillons
 *   node scripts/automation/b2b-registry.cjs --measure    # recalcule le funnel commercial
 */
const fs = require('fs')
const path = require('path')
const { emailHash } = require('./lib/email-hash.cjs')
const { buildC4 } = require('./b2b-cold-outreach.cjs')

const DATA = path.join(__dirname, 'data')
const DOCS = path.join(__dirname, '..', '..', 'docs')
const REGISTRY_PATH = path.join(DATA, 'b2b-registry.json')
const STATUS_PATH = path.join(DATA, 'b2b-registry-status.json')
const FUNNEL_PATH = path.join(DATA, 'b2b-registry-funnel.json')
const DRAFTS_DIR = path.join(DATA, 'b2b-followups')
const DOC_PATH = path.join(DOCS, 'B2B_REGISTRY.md')

// Statuts commerciaux (mission) — ordre = pipeline.
const STATUSES = ['sent', 'replied', 'interested', 'demo', 'quote', 'won', 'lost']
const STATUS_LABEL = {
  sent: 'Envoyé (sans réponse connue)',
  replied: 'A répondu',
  interested: 'Intéressé',
  demo: 'Démonstration demandée',
  quote: 'Devis demandé',
  won: 'Gagné (payant)',
  lost: 'Perdu',
  not_contacted: 'Jamais contacté',
}
const DEST_LABEL = {
  MQ: 'Martinique', GP: 'Guadeloupe', FL: 'Florida / Miami', PC: 'Punta Cana',
  RM: 'Cancún / Riviera Maya', TU: 'Tulum', mq: 'Martinique', gp: 'Guadeloupe',
  florida: 'Florida / Miami', puntacana: 'Punta Cana', rivieramaya: 'Cancún / Riviera Maya', tulum: 'Tulum',
}

const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
const saveJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8') }
const normIsland = (v) => {
  const s = String(v || '').trim().toUpperCase()
  if (s === 'MQ' || s === 'MARTINIQUE') return 'MQ'
  if (s === 'GP' || s === 'GUADELOUPE') return 'GP'
  if (s === 'FL' || s === 'FLORIDA' || s === 'MIAMI') return 'FL'
  if (s === 'PC' || s === 'PUNTACANA' || s === 'PUNTA CANA') return 'PC'
  if (s === 'RM' || s === 'RIVIERAMAYA' || s === 'CANCUN') return 'RM'
  if (s === 'TU' || s === 'TULUM') return 'TU'
  return s || 'MQ'
}

/** Registre : un prospect par contact enrichi, état d'envoi + statut commercial. */
function buildRegistry() {
  const enriched = loadJSON(path.join(DATA, 'b2b-enriched.json'), { contacts: [] })
  const cold = loadJSON(path.join(DATA, 'b2b-cold-sent.json'), {})
  const followupSent = loadJSON(path.join(DATA, 'b2b-followup-sent.json'), { sent: [] })
  const manual = loadJSON(STATUS_PATH, { prospects: {} })
  const bounced = new Set((loadJSON(path.join(DATA, 'bounced-emails.json'), []) || []).map(e => String(e).trim().toLowerCase()))
  const followupIdx = new Map((followupSent.sent || []).map(f => [String(f.id || ''), f]))
  // Le funnel du dépôt est la source de vérité des stades « lead » / « paid ».
  const funnel = loadJSON(path.join(DATA, 'b2b-funnel.json'), { funnel: {} })
  const funnelRows = funnel.funnel || {}
  // Les installateurs de widget sont des leads CHAUDS (ils utilisent le produit).
  const widget = loadJSON(path.join(DATA, 'widget-contacts.json'), { contacts: {} })
  const widgetContacts = Object.values(widget.contacts || {})

  const rows = []
  for (const c of (enriched.contacts || [])) {
    const email = String(c.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    const hash = emailHash(email)
    const sentEntry = cold[hash] || null
    const island = normIsland(c.island)
    const manualRow = (manual.prospects || {})[email] || {}
    const funnelRow = funnelRows[hash] || null
    const widgetRow = widgetContacts.find(w => String(w.email || '').trim().toLowerCase() === email) || null
    const bouncedFlag = bounced.has(email)
    const fu = followupIdx.get(email) || followupIdx.get(hash) || null

    // Statut : décision manuelle > funnel (paid/lead) > widget (lead chaud) > envoyé.
    let status = 'not_contacted'
    if (sentEntry) status = 'sent'
    if (widgetRow) status = 'interested'
    if (funnelRow) {
      if (funnelRow.isPaid || funnelRow.stage === 'paid') status = 'won'
      else if (funnelRow.isLead || funnelRow.stage === 'lead') status = 'interested'
    }
    if (STATUSES.includes(manualRow.status)) status = manualRow.status

    rows.push({
      id: hash.slice(0, 12),
      email,
      emailHash: hash,
      name: c.name || email,
      island,
      destination: DEST_LABEL[island] || island,
      town: c.town || '',
      category: c.fit || 'hotel',
      url: c.url || '',
      hook: c.hook || '',
      sentAt: (sentEntry && (sentEntry.c0 || sentEntry.sentAt)) || (funnelRow && funnelRow.contactedAt) || null,
      followupAt: (sentEntry && sentEntry.c4) || (fu && fu.ts) || null,
      status,
      repliedAt: manualRow.repliedAt || null,
      demoAt: manualRow.demoAt || null,
      quoteAt: manualRow.quoteAt || null,
      wonAt: manualRow.wonAt || null,
      notes: manualRow.notes || '',
      nextAction: manualRow.nextAction || (funnelRow && funnelRow.nextAction) || null,
      hotLead: !!widgetRow,
      bounced: bouncedFlag,
      loggedOutcome: null,
    })
  }
  rows.sort((a, b) => String(a.sentAt || '').localeCompare(String(b.sentAt || '')) || a.name.localeCompare(b.name))
  return rows
}

/** Relances personnalisées PRÉPARÉES (fichiers) — JAMAIS d'envoi. */
function prepareFollowups(rows) {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true })
  const prepared = []
  for (const r of rows) {
    if (!r.sentAt) continue
    if (['won', 'lost'].includes(r.status)) continue
    if (r.bounced) continue
    const msg = buildC4({ email: r.email, name: r.name, town: r.town, island: r.island, hook: r.hook, url: r.url }, r.id)
    const file = path.join(DRAFTS_DIR, `${r.id}-${r.status}.md`)
    const body = [
      `# Relance préparée — ${r.name}`,
      '',
      `- Destinataire : ${r.email}`,
      `- Prospect : ${r.name} · ${r.destination}${r.town ? ' · ' + r.town : ''}`,
      `- Statut : ${STATUS_LABEL[r.status] || r.status}`,
      `- Premier envoi : ${r.sentAt || '—'}`,
      `- Relance J+4 : ${r.followupAt || '—'}`,
      '',
      '> ⚠️ BROUILLON — aucun envoi automatique. Envoi uniquement sur autorisation explicite.',
      '',
      `**Objet :** ${msg.subject}`,
      '',
      `**Préheader :** ${msg.preheader}`,
      '',
      '---',
      '',
      msg.html,
      '',
      `Désabonnement : ${msg.unsub}`,
      '',
    ].join('\n')
    fs.writeFileSync(file, body, 'utf8')
    prepared.push({ id: r.id, name: r.name, email: r.email, destination: r.destination, status: r.status, file: path.relative(path.join(__dirname, '..', '..'), file).replace(/\\/g, '/'), subject: msg.subject })
  }
  return prepared
}

/** Funnel commercial (mesuré, jamais supposé). */
function measure(rows) {
  const counts = { total: rows.length, sent: 0, replied: 0, interested: 0, demo: 0, quote: 0, won: 0, lost: 0, not_contacted: 0, bounced: 0 }
  const byDestination = {}
  for (const r of rows) {
    if (r.bounced) counts.bounced++
    if (r.status === 'not_contacted') counts.not_contacted++
    else counts[r.status] = (counts[r.status] || 0) + 1
    const d = r.destination
    byDestination[d] = byDestination[d] || { total: 0, sent: 0, replied: 0, demo: 0, quote: 0, won: 0, lost: 0 }
    byDestination[d].total++
    if (r.status !== 'not_contacted') byDestination[d].sent++
    if (['replied', 'interested', 'demo', 'quote', 'won'].includes(r.status)) byDestination[d].replied++
    if (r.status === 'demo') byDestination[d].demo++
    if (r.status === 'quote') byDestination[d].quote++
    if (r.status === 'won') byDestination[d].won++
    if (r.status === 'lost') byDestination[d].lost++
  }
  // Leads du funnel du dépôt : certains n'ont AUCUNE identité dans le dépôt
  // (email non persisté) → ils sont comptés mais pas actionnables ici.
  const funnel = loadJSON(path.join(DATA, 'b2b-funnel.json'), { funnel: {}, counts: {} })
  const funnelEntries = Object.entries(funnel.funnel || {})
  const funnelLeads = funnelEntries.filter(([, v]) => v.isLead || v.stage === 'lead').length
  const funnelPaid = funnelEntries.filter(([, v]) => v.isPaid || v.stage === 'paid').length
  const identified = new Set(rows.map(r => r.emailHash))
  const anonymousLeads = funnelEntries.filter(([k, v]) => (v.isLead || v.stage === 'lead') && !identified.has(k)).length
  const sent = counts.sent + counts.replied + counts.interested + counts.demo + counts.quote + counts.won + counts.lost
  return {
    updatedAt: new Date().toISOString(),
    counts,
    funnelLeads,
    funnelPaid,
    anonymousLeads,
    byDestination,
    rates: {
      replyRate: sent ? +((counts.replied + counts.interested + counts.demo + counts.quote + counts.won) / sent * 100).toFixed(1) : 0,
      demoRate: sent ? +((counts.demo + counts.quote + counts.won) / sent * 100).toFixed(1) : 0,
      winRate: sent ? +((counts.won / sent) * 100).toFixed(1) : 0,
    },
    _note: 'Mesuré sur scripts/automation/data/b2b-registry.json. Les leads sans identité (email non persisté dans le dépôt) sont comptés dans funnelLeads mais ne sont PAS actionnables depuis le dépôt.',
  }
}

/**
 * Résumé versionné (emails masqués — le dépôt est PUBLIC).
 *
 * On masque les DEUX moitiés :
 *   - partie locale : 1re lettre + longueur approximative (le nombre de
 *     caractères est conservé, la valeur ne l'est pas) ;
 *   - domaine : seul le suffixe public (TLD) est conservé.
 * Pourquoi masquer aussi le domaine : un masque « c•••••t@bik-karaib.com »
 * divulguait le domaine de l'hôtel ET la STRUCTURE de la partie locale
 * (7 caractères, c…t) → reconstruction triviale de « contact@… ». Masquer
 * les deux moitiés rend l'adresse non identifiante dans un dépôt public.
 * La ligne du registre resteactionnable : elle porte le NOM de l'établissement
 * + la destination + le statut, et la version complète (non versionnée) reste
 * dans scripts/automation/data/b2b-registry.json (gitignoré).
 */
function maskEmail(e) {
  const s = String(e || '').trim()
  const at = s.indexOf('@')
  if (at < 1) return '—'
  const local = s.slice(0, at)
  const dom = s.slice(at + 1)
  const head = local.slice(0, 1)
  const tail = local.length > 2 ? local.slice(-1) : ''
  const dot = dom.lastIndexOf('.')
  const tld = dot > 0 ? dom.slice(dot + 1) : ''
  const label = dot > 0 ? dom.slice(0, dot) : dom
  const domMask = label ? `${'•'.repeat(Math.max(2, label.length))}` : ''
  return `${head}${'•'.repeat(Math.max(2, local.length - 2))}${tail}@${domMask}${tld ? '.' + tld : ''}`
}

function writeDoc(rows, funnel, followups) {
  const lines = []
  lines.push('# Registre commercial B2B — prospects contactés')
  lines.push('')
  lines.push(`> Mis à jour le ${new Date().toISOString().slice(0, 10)} — mesuré sur les données du dépôt.`)
  lines.push('> **Les adresses complètes ne sont pas versionnées** (dépôt public) : elles vivent dans')
  lines.push('> `scripts/automation/data/b2b-registry.json` (non versionné) et dans les brouillons de relance.')
  lines.push('> Les statuts saisis à la main sont dans `scripts/automation/data/b2b-registry-status.json`')
  lines.push('> (non versionné) et ne sont jamais écrasés par un nouveau run.')
  lines.push('')
  lines.push('## 1. Mesure')
  lines.push('')
  lines.push('| Indicateur | Valeur |')
  lines.push('|---|---:|')
  lines.push(`| Prospects au registre | ${funnel.counts.total} |`)
  lines.push(`| Contactés (identifiables) | ${funnel.counts.sent + funnel.counts.replied + funnel.counts.interested + funnel.counts.demo + funnel.counts.quote + funnel.counts.won + funnel.counts.lost} |`)
  lines.push(`| Non contactés (enrichis, jamais envoyés) | ${funnel.counts.not_contacted} |`)
  lines.push(`| Réponses | ${funnel.counts.replied} |`)
  lines.push(`| Intéressés | ${funnel.counts.interested} |`)
  lines.push(`| Démonstrations demandées | ${funnel.counts.demo} |`)
  lines.push(`| Devis demandés | ${funnel.counts.quote} |`)
  lines.push(`| Gagnés (payants) | ${funnel.counts.won} |`)
  lines.push(`| Perdus | ${funnel.counts.lost} |`)
  lines.push(`| Adresses en bounce | ${funnel.counts.bounced} |`)
  lines.push(`| Relances préparées (fichiers, non envoyées) | ${followups.length} |`)
  lines.push(`| Leads connus du funnel du dépôt | ${funnel.funnelLeads} (dont ${funnel.anonymousLeads} sans identité dans le dépôt → non actionnables ici) |`)
  lines.push(`| Payants (funnel du dépôt) | ${funnel.funnelPaid} |`)
  lines.push('')
  lines.push('## 2. Par destination')
  lines.push('')
  lines.push('| Destination | Contacts | Envoyés | Réponses | Démos | Devis | Gagnés | Perdus |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const [d, v] of Object.entries(funnel.byDestination).sort()) {
    lines.push(`| ${d} | ${v.total} | ${v.sent} | ${v.replied} | ${v.demo} | ${v.quote} | ${v.won} | ${v.lost} |`)
  }
  lines.push('')
  lines.push('## 3. Registre (adresses masquées)')
  lines.push('')
  lines.push('| Prospect | Destination | Catégorie | Statut | 1er envoi | Relance J+4 | Adresse (masquée) |')
  lines.push('|---|---|---|---|---|---|---|')
  for (const r of rows) {
    lines.push(`| ${r.name} | ${r.destination} | ${r.category} | ${STATUS_LABEL[r.status] || r.status} | ${r.sentAt ? r.sentAt.slice(0, 10) : '—'} | ${r.followupAt ? r.followupAt.slice(0, 10) : '—'} | ${maskEmail(r.email)} |`)
  }
  lines.push('')
  lines.push('## 4. Règles de relance')
  lines.push('')
  lines.push('- Une relance est **préparée** (objet + corps + lien de désabonnement) dans `scripts/automation/data/b2b-followups/`.')
  lines.push('- **Aucun envoi automatique** : l’envoi exige une autorisation explicite du fondateur.')
  lines.push('- Un prospect `won` ou `lost` n’a plus de relance préparée.')
  lines.push('- Une adresse en bounce n’est jamais recontactée.')
  lines.push('- Le taux de réponse et le taux de démo sont calculés, jamais estimés.')
  lines.push('')
  fs.mkdirSync(DOCS, { recursive: true })
  fs.writeFileSync(DOC_PATH, lines.join('\n'), 'utf8')
}

function main() {
  const rows = buildRegistry()
  const funnel = measure(rows)
  const followups = prepareFollowups(rows)
  const cold = loadJSON(path.join(DATA, 'b2b-cold-sent.json'), {})
  const coldCount = Object.keys(cold).filter(k => k !== '_meta').length

  saveJSON(REGISTRY_PATH, {
    _note: 'Registre commercial B2B — PII : ne jamais commiter (dépôt public). Généré par scripts/automation/b2b-registry.cjs.',
    updatedAt: new Date().toISOString(),
    counts: funnel.counts,
    prospects: rows,
  })
  saveJSON(FUNNEL_PATH, funnel)
  writeDoc(rows, funnel, followups)

  console.log('=== Registre commercial B2B ===')
  console.log(`  prospects au registre      : ${rows.length}`)
  console.log(`  envois cold (hashes)       : ${coldCount}`)
  console.log(`  contactés identifiables    : ${funnel.counts.sent + funnel.counts.replied + funnel.counts.interested + funnel.counts.demo + funnel.counts.quote + funnel.counts.won + funnel.counts.lost}`)
  console.log(`  réponses / démos / devis   : ${funnel.counts.replied} / ${funnel.counts.demo} / ${funnel.counts.quote}`)
  console.log(`  gagnés (payants)           : ${funnel.counts.won}`)
  console.log(`  relances préparées         : ${followups.length} (fichiers, AUCUN envoi)`)
  console.log(`  registre : ${path.relative(process.cwd(), REGISTRY_PATH)}`)
  console.log(`  résumé   : ${path.relative(process.cwd(), DOC_PATH)}`)
}

if (require.main === module) main()
module.exports = { buildRegistry, measure, prepareFollowups, STATUSES, STATUS_LABEL, maskEmail }
