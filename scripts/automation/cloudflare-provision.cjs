#!/usr/bin/env node
/**
 * cloudflare-provision.cjs — Ajoute les domaines à Cloudflare et configure le DNS,
 * de façon IDEMPOTENTE et SÛRE pour des sites en production.
 *
 * Pourquoi token et pas session dashboard : le WAF de dash.cloudflare.com bloque
 * les mutations (POST) programmatiques (403 challenge) et le SPA gèle sous
 * automation CDP. Un token API (api.cloudflare.com/client/v4, Bearer) bypasse
 * tout ça et rend l'opération rejouable depuis Bash ET GitHub Actions.
 *
 * Création du token (1× — voir docs/OPERATIONS.md §Cloudflare) :
 *   dash.cloudflare.com → My Profile → API Tokens → Create Token →
 *   "Edit zone DNS" + permission "Zone:Zone:Edit" + "Account:... " (toutes zones).
 *   Scope : tout le compte. Puis : gh secret set CLOUDFLARE_API_TOKEN
 *   (et localement : ajouter CLOUDFLARE_API_TOKEN=... à .env).
 *
 * Usage :
 *   CLOUDFLARE_API_TOKEN=... node scripts/automation/cloudflare-provision.cjs           # tous les domaines manquants
 *   CLOUDFLARE_API_TOKEN=... node scripts/automation/cloudflare-provision.cjs --only=sargazotulum.com   # canari
 *   CLOUDFLARE_API_TOKEN=... node scripts/automation/cloudflare-provision.cjs --dry      # n'écrit rien
 *
 * Séquence SÛRE pour un site live :
 *   1. crée la zone (type full) — le site continue de servir via l'ancien DNS
 *   2. CF scanne et importe les records existants ; on VÉRIFIE qu'A + MX + www
 *      sont présents (sinon on les ajoute depuis les valeurs lues en DNS public)
 *   3. on imprime les 2 nameservers CF à poser chez Namecheap (étape NS = manuelle
 *      ou via Namecheap API ; tant que les NS ne changent pas, ZÉRO impact)
 *   Le script ne change JAMAIS les NS lui-même : pas de coupure surprise.
 */
const https = require('https')
const dns = require('dns').promises
const fs = require('fs')
const path = require('path')

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''
const DRY = process.argv.includes('--dry')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '')

// Domaines à gérer (hors MQ/GP déjà sur CF). Origine cPanel mutualisé.
const DOMAINS = ['sargassumpuntacana.com', 'sargassumcancun.com', 'sargassummiami.com', 'sargazotulum.com']
const ORIGIN_IP = '162.0.229.47' // A record cPanel (vérifié en DNS public 2026-06-10)

function api(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request(`https://api.cloudflare.com/client/v4${urlPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let b = ''
      res.on('data', c => b += c)
      res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(new Error(`parse ${res.statusCode}: ${b.slice(0, 200)}`)) } })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function publicDns(name, type) {
  try { return await dns.resolve(name, type) } catch { return [] }
}

async function ensureZone(domain) {
  const list = await api('GET', `/zones?name=${domain}`)
  if (!list.success) throw new Error(`zones list: ${JSON.stringify(list.errors)}`)
  if (list.result.length) {
    const z = list.result[0]
    console.log(`  zone existe (${z.status}) — NS: ${z.name_servers.join(', ')}`)
    return z
  }
  if (DRY) { console.log(`  [dry] créerait la zone ${domain}`); return null }
  // accountId requis : pris du premier compte du token
  const accts = await api('GET', '/accounts')
  const accountId = accts.result?.[0]?.id
  const created = await api('POST', '/zones', { name: domain, account: { id: accountId }, type: 'full' })
  if (!created.success) throw new Error(`zone create: ${JSON.stringify(created.errors)}`)
  console.log(`  ✓ zone créée — NS à poser chez Namecheap : ${created.result.name_servers.join(', ')}`)
  return created.result
}

async function ensureRecord(zoneId, rec) {
  const existing = await api('GET', `/zones/${zoneId}/dns_records?type=${rec.type}&name=${rec.name}`)
  if (existing.result?.length) {
    console.log(`  = ${rec.type} ${rec.name} déjà présent`)
    return
  }
  if (DRY) { console.log(`  [dry] ajouterait ${rec.type} ${rec.name} → ${rec.content}`); return }
  const r = await api('POST', `/zones/${zoneId}/dns_records`, rec)
  console.log(r.success ? `  ✓ ${rec.type} ${rec.name} → ${rec.content} (proxied:${!!rec.proxied})` : `  ✗ ${rec.type} ${rec.name}: ${JSON.stringify(r.errors)}`)
}

async function main() {
  if (!TOKEN) { console.error('CLOUDFLARE_API_TOKEN manquant. Voir docs/OPERATIONS.md §Cloudflare.'); process.exit(1) }
  const verify = await api('GET', '/user/tokens/verify')
  if (!verify.success) { console.error('Token invalide:', JSON.stringify(verify.errors)); process.exit(1) }
  console.log('Token OK.\n')

  const targets = ONLY ? DOMAINS.filter(d => d === ONLY) : DOMAINS
  const nsToSet = []
  for (const domain of targets) {
    console.log(`=== ${domain} ===`)
    const zone = await ensureZone(domain)
    if (!zone) continue
    if (zone.status !== 'active') nsToSet.push({ domain, ns: zone.name_servers })

    // Records sûrs : A apex + www (proxied = CDN/cache/SSL), MX préservé (DNS only)
    const mx = await publicDns(domain, 'MX')
    await ensureRecord(zone.id, { type: 'A', name: domain, content: ORIGIN_IP, proxied: true, ttl: 1 })
    await ensureRecord(zone.id, { type: 'CNAME', name: `www.${domain}`, content: domain, proxied: true, ttl: 1 })
    for (const m of mx) {
      await ensureRecord(zone.id, { type: 'MX', name: domain, content: m.exchange, priority: m.priority, ttl: 1 })
    }
    console.log('')
  }

  if (nsToSet.length) {
    console.log('\n⚠️  NAMESERVERS À CHANGER CHEZ NAMECHEAP (Domain List → Manage → Custom DNS) :')
    for (const n of nsToSet) console.log(`   ${n.domain} → ${n.ns.join(' , ')}`)
    console.log('   Tant que les NS ne sont pas changés : zéro impact (le site sert via l\'ancien DNS).')
    console.log('   Après changement : propagation ~5-30 min, CF émet le SSL automatiquement.')
    // Persiste pour le runbook / une future automatisation Namecheap API
    const out = path.resolve(__dirname, 'data', 'cloudflare-ns-pending.json')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify(nsToSet, null, 2))
    console.log(`   (sauvegardé dans ${path.relative(process.cwd(), out)})`)
  } else {
    console.log('\n✓ Toutes les zones ciblées sont actives sur Cloudflare.')
  }
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
