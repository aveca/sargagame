#!/usr/bin/env node
'use strict'
/**
 * SIRENE client — Phase 2 B2B sales engine.
 *
 * SIRENE (INSEE) is the SINGLE source of legal truth for French companies.
 * This module is a pure mapping/validation layer plus an injectable HTTP
 * transport: NO network happens at import, NO writes anywhere, and the
 * caller decides what to do with rows. It NEVER fabricates identifiers,
 * names, emails, phones or geocoordinates — fields absent from the API
 * stay null.
 *
 * API refs (Sirene v3.11, api.insee.fr):
 *   token : POST {SIRENE_TOKEN_URL}  grant_type=client_credentials (Basic ck:cs)
 *   query : GET  {SIRENE_BASE_URL}/siret?q=...&curseur=...&nombre=<=1000
 * Both URLs are env-configurable so an INSEE portal migration is config-only.
 */

const DEFAULT_BASE_URL = 'https://api.insee.fr/api-sirene/3.11'
const DEFAULT_TOKEN_URL = 'https://api.insee.fr/token'
const MQ_DEPARTEMENT = '972'

// ---------------------------------------------------------------------------
// Identifiers (Luhn). Exception connue : les SIRET La Poste (siren 356000000)
// ne vérifient pas Luhn — tolérance ciblée, pas de contournement générique.
// ---------------------------------------------------------------------------
function digitsOnly(v) { return typeof v === 'string' ? v.replace(/\D+/g, '') : '' }

function luhnOk(num) {
  let sum = 0
  for (let i = 0; i < num.length; i++) {
    let d = num.charCodeAt(num.length - 1 - i) - 48
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

function isValidSiren(siren) {
  const s = digitsOnly(siren)
  return s.length === 9 && luhnOk(s)
}

function isValidSiret(siret) {
  const s = digitsOnly(siret)
  if (s.length !== 14) return false
  return luhnOk(s) || s.startsWith('356000000')
}

// ---------------------------------------------------------------------------
// Status mapping. SIRENE: etatAdministratif* : 'A' = active, 'F' = fermée.
// Anything else/missing is EXPLICITLY 'unknown' — never guessed.
// ---------------------------------------------------------------------------
function mapStatus(code) {
  if (code === 'A') return 'active'
  if (code === 'F') return 'inactive'
  return 'unknown'
}

function clean(v) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Normalize ONE raw SIRENE establishment (API v3.11 shape) into our row pair
 * { company, establishment } matching supabase/schema.sql Phase 1 columns.
 * Returns null when the record cannot be trusted (missing/invalid siret).
 */
function normalizeEstablishment(raw, opts) {
  if (!raw || typeof raw !== 'object') return null
  const siret = digitsOnly(raw.siret)
  const siren = digitsOnly(raw.siren)
  if (!isValidSiret(siret) || !isValidSiren(siren)) return null
  if (!siret.startsWith(siren)) return null // SIRET must embed its SIREN

  const ul = raw.uniteLegale && typeof raw.uniteLegale === 'object' ? raw.uniteLegale : {}
  const addr = raw.adresseEtablissement && typeof raw.adresseEtablissement === 'object'
    ? raw.adresseEtablissement : {}

  // Legal name: denomination for companies; for EI the SIRENE payload carries
  // nomUniteLegale + prenom1UniteLegale (that IS the legal name — kept as-is).
  const legalName = clean(ul.denominationUniteLegale)
    || [clean(ul.nomUniteLegale), clean(ul.prenom1UniteLegale)].filter(Boolean).join(' ').trim() || null
  if (!legalName) return null

  const cj = clean(ul.categorieJuridiqueUniteLegale)
  // 1000 = entrepreneur individuel (micro). Other codes = not micro.
  const isMicro = cj === '1000' ? true : (cj ? false : null)

  const addrParts = [
    clean(addr.numeroVoieEtablissement),
    clean(addr.typeVoieEtablissement),
    clean(addr.libelleVoieEtablissement),
  ].filter(Boolean)

  const company = {
    legal_name: legalName,
    trading_name: clean(ul.sigleUniteLegale),
    siren,
    legal_form: cj,
    ape_code: clean(ul.activitePrincipaleUniteLegale),
    ape_label: null, // libellé NAF non fourni par l'API — rempli par enrichissement futur
    legal_status: mapStatus(ul.etatAdministratifUniteLegale),
    is_micro_enterprise: isMicro,
    employee_range: clean(ul.trancheEffectifsUniteLegale),
    creation_date: clean(ul.dateCreationUniteLegale),
    country_code: 'FR',
    source: 'sirene',
    source_record_id: siren,
  }

  const establishment = {
    siret,
    nic: clean(raw.nic),
    establishment_name: clean(raw.denominationUsuelleEtablissement) ||
      clean(raw.enseigne1Etablissement) || null,
    siege: raw.etablissementSiege === true,
    ape_code: clean(raw.activitePrincipaleEtablissement),
    status: mapStatus(raw.etatAdministratifEtablissement),
    address_line1: addrParts.length ? addrParts.join(' ') : null,
    address_line2: clean(addr.complementAdresseEtablissement),
    postal_code: clean(addr.codePostalEtablissement),
    city: clean(addr.libelleCommuneEtablissement),
    region_code: clean(addr.codeCommuneEtablissement)
      ? clean(addr.codeCommuneEtablissement).slice(0, 3)
      : null,
    country_code: 'FR',
    latitude: null,  // jamais inventé — géocodage = enrichissement ultérieur
    longitude: null,
    source: 'sirene',
    source_record_id: siret,
  }

  return { company, establishment }
}

// ---------------------------------------------------------------------------
// HTTP layer (fetchFn injectable — tests never touch the network).
// ---------------------------------------------------------------------------
async function fetchToken(deps) {
  const fetchFn = deps && deps.fetchFn
  if (typeof fetchFn !== 'function') throw new Error('sirene: fetchFn requis')
  const key = deps.consumerKey
  const secret = deps.consumerSecret
  if (!key || !secret) throw new Error('sirene: SIRENE_CONSUMER_KEY/SECRET manquants')
  const tokenUrl = deps.tokenUrl || DEFAULT_TOKEN_URL
  const res = await fetchFn(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(key + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res || !res.ok) {
    throw new Error('sirene: token HTTP ' + (res ? res.status : 'no-response'))
  }
  const body = await res.json()
  if (!body || typeof body.access_token !== 'string' || !body.access_token) {
    throw new Error('sirene: réponse token invalide')
  }
  return body.access_token
}

/**
 * Fetch ONE page of establishments. Structural validation only.
 * Returns { etablissements: [...], curseurSuivant: string|null, total: number|null }
 */
async function fetchSiretPage(deps) {
  const fetchFn = deps.fetchFn
  if (typeof fetchFn !== 'function') throw new Error('sirene: fetchFn requis')
  const baseUrl = deps.baseUrl || DEFAULT_BASE_URL
  const dept = deps.departement || MQ_DEPARTEMENT
  const nombre = Math.min(Math.max(deps.nombre || 1000, 1), 1000)
  const q = deps.query || ('codeDepartementEtablissement:' + dept)
  const params = new URLSearchParams({ q, nombre: String(nombre) })
  if (deps.cursor) params.set('curseur', deps.cursor)

  const res = await fetchFn(`${baseUrl}/siret?${params.toString()}`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + deps.token,
    },
  })
  if (!res) throw new Error('sirene: pas de réponse')
  if (res.status === 429) {
    const err = new Error('sirene: rate limited (429)')
    err.rateLimited = true
    throw err
  }
  if (!res.ok) throw new Error('sirene: siret HTTP ' + res.status)
  const body = await res.json()
  const header = body && body.header ? body.header : {}
  const list = Array.isArray(body && body.etablissements) ? body.etablissements : []
  return {
    etablissements: list,
    curseurSuivant: typeof header.curseurSuivant === 'string' && header.curseurSuivant
      ? header.curseurSuivant : null,
    total: typeof header.total === 'number' ? header.total : null,
  }
}

/**
 * Iterate ALL pages with a cursor, yielding raw establishments in batches.
 * maxPages is a hard safety bound. sleepMs paces requests (rate limiting).
 */
async function iterateEstablishments(deps) {
  const maxPages = deps.maxPages || 500
  const sleepMs = deps.sleepMs == null ? 2000 : deps.sleepMs
  const sleep = deps.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)))
  let cursor = null
  let pages = 0
  let total = null
  for (;;) {
    console.log('[sirene] page', pages + 1, cursor ? '(suite)' : '(début)')
    let page
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        page = await fetchSiretPage(Object.assign({}, deps, { cursor }))
        break
      } catch (e) {
        if (e && e.rateLimited && attempt < 3) {
          console.log('[sirene] 429 — backoff', (attempt + 1) * 30, 's')
          await sleep((attempt + 1) * 30000)
          continue
        }
        throw e
      }
    }
    pages++
    if (page.total != null) total = page.total
    if (deps.onPage) await deps.onPage(page.etablissements, pages)
    const next = page.curseurSuivant
    if (!next || next === cursor || pages >= maxPages) {
      return { pages, total, truncated: !!(next && next !== cursor && pages >= maxPages) }
    }
    cursor = next
    await sleep(sleepMs)
  }
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_TOKEN_URL,
  MQ_DEPARTEMENT,
  isValidSiren,
  isValidSiret,
  luhnOk,
  mapStatus,
  normalizeEstablishment,
  fetchToken,
  fetchSiretPage,
  iterateEstablishments,
}
