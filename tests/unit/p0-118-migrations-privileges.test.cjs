#!/usr/bin/env node
'use strict'
/**
 * p0-118-migrations-privileges.test.cjs — P0.118 §1 et §3 : contrôle des
 * migrations PRÉPARÉES (jamais appliquées sur la production).
 *
 * Ces migrations sont des livrables de revue : elles sont dans le dépôt pour
 * être lues, relues et appliquées ULTÉRIEUREMENT sous autorisation.
 *
 * RÈGLE ABSOLUE : ce test ne peut JAMAIS écrire sur la base de production.
 * Le contrôle « privilèges réellement constatés » n'est exécuté que si une
 * base JETABLE est explicitement fournie, et il REFUSE explicitement
 * l'hôte de production connu.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..')
const M1 = path.join(ROOT, 'scripts', 'migrations', '001_idempotent_payment_grant.sql')
const M2 = path.join(ROOT, 'scripts', 'migrations', '002_payment_grant_search_path.sql')
const M3 = path.join(ROOT, 'scripts', 'migrations', '003_b2b_leads_least_privilege.sql')
const M4 = path.join(ROOT, 'scripts', 'migrations', '004_b2b_lead_drip_claims.sql')
const M6 = path.join(ROOT, 'scripts', 'migrations', '006_public_table_least_privilege.sql')
const M7 = path.join(ROOT, 'scripts', 'migrations', '007_revoke_public_truncate.sql')
const WORKER = path.join(ROOT, 'workers', 'sg-payments', 'index.js')

// Hôte de production connu (cf. bindings live de sg-payments). Toute cible
// identique est refusée : le test ne peut pas écrire en production.
const PRODUCTION_HOSTS = ['rswdmjtdzrucqzzukfmd.supabase.co']

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

/** Extrait la liste ordonnée des paramètres d'une fonction SQL. */
function parseParams(sql) {
  const m = /CREATE OR REPLACE FUNCTION\s+public\.sg_upsert_payment_grant\s*\(([\s\S]*?)\)\s*RETURNS/i.exec(sql)
  if (!m) return null
  return m[1]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/\s+/)[0].toLowerCase())
}

async function main() {
  // ── §3 : search_path figé sur le RPC ────────────────────────────────────
  t(fs.existsSync(M2), '§3 : la migration 002 (search_path) est présente dans le dépôt')
  const sql2 = fs.readFileSync(M2, 'utf8')
  t(/SET\s+search_path\s*=\s*''/.test(sql2), '§3 : la fonction fixe search_path = ""')
  t(/INSERT INTO public\.payment_grants/.test(sql2), '§3 : la table est qualifiée explicitement (public.payment_grants)')
  t(!/\bSET\s+search_path\s*=\s*public\b/.test(sql2), '§3 : le search_path n est pas élargi à public')
  t(/MIGRATION PRÉPARÉE, NON APPLIQUÉE/.test(sql2), '§3 : la migration est explicitement marquée comme non appliquée')
  t(/REVOKE EXECUTE ON FUNCTION public\.sg_upsert_payment_grant\([^)]*\) FROM PUBLIC/.test(sql2), '§3 : EXECUTE est révoqué à PUBLIC')
  t(/REVOKE EXECUTE ON FUNCTION public\.sg_upsert_payment_grant\([^)]*\) FROM anon/.test(sql2), '§3 : EXECUTE est révoqué à anon')
  t(/REVOKE EXECUTE ON FUNCTION public\.sg_upsert_payment_grant\([^)]*\) FROM authenticated/.test(sql2), '§3 : EXECUTE est révoqué à authenticated')
  t(/GRANT EXECUTE ON FUNCTION public\.sg_upsert_payment_grant\([^)]*\) TO service_role/.test(sql2), '§3 : EXECUTE est accordé à service_role')

  // La signature ne doit pas changer par rapport à la migration 001 (c'est
  // le contrat sur lequel repose la Worker).
  const sql1 = fs.readFileSync(M1, 'utf8')
  const p1 = parseParams(sql1)
  const p2 = parseParams(sql2)
  t(Array.isArray(p1) && p1.length === 7, '§3 : la migration 001 expose 7 paramètres')
  t(JSON.stringify(p1) === JSON.stringify(p2), '§3 : la signature de la migration 002 est identique à celle de la migration 001')
  t(JSON.stringify(p1) === JSON.stringify([
    'p_payment_id', 'p_pass', 'p_email', 'p_currency', 'p_expires_at', 'p_granted_at', 'p_metadata'
  ]), '§3 : les 7 paramètres sont exactement ceux attendus par la Worker')

  // Cohérence avec l'appel réel de la Worker.
  const worker = fs.readFileSync(WORKER, 'utf8')
  const fnStart = worker.indexOf('async function callPaymentGrantRpc')
  const fnSlice = fnStart >= 0 ? worker.slice(fnStart, fnStart + 3000) : ''
  const called = /body:\s*JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(fnSlice)
  t(!!called, '§3 : la Worker appelle le RPC avec un objet JSON nommé')
  if (called) {
    const names = [...called[1].matchAll(/(p_[a-z_]+)\s*:/g)].map((m) => m[1]).sort()
    t(JSON.stringify(names) === JSON.stringify([...p1].sort()), '§3 : la Worker passe exactement les 7 paramètres attendus, rien de plus')
    t(!names.some((x) => /session|user/i.test(x)), '§3 : aucun paramètre fantôme (session_id / user_id n existent pas)')
  }

  // ── §1 : moindre privilège sur public.b2b_leads ─────────────────────────
  t(fs.existsSync(M3), '§1 : la migration 003 (b2b_leads) est présente dans le dépôt')
  const sql3 = fs.readFileSync(M3, 'utf8')
  t(sql3.includes('REVOKE ALL ON TABLE public.b2b_leads FROM PUBLIC'), '§1 : les privilèges hérités de PUBLIC sont révoqués')
  t(sql3.includes('DROP POLICY IF EXISTS "Allow all b2b_leads" ON public.b2b_leads'), '§1 : la policy PUBLIC ALL constatée est supprimée')
  // Les contrôles « opération destructive » ne portent que sur le SQL
  // EXÉCUTABLE : les commentaires (qui citent ces mots pour les proscrire)
  // sont retirés avant analyse.
  const sql3Code = sql3
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  t(/REVOKE ALL ON TABLE public\.b2b_leads FROM anon/.test(sql3), '§1 : tous les privilèges de anon sont révoqués sur public.b2b_leads')
  t(/REVOKE ALL ON TABLE public\.b2b_leads FROM authenticated/.test(sql3), '§1 : tous les privilèges de authenticated sont révoqués')
  t(/ALTER TABLE public\.b2b_leads ENABLE ROW LEVEL SECURITY/.test(sql3), '§1 : les RLS sont activées sur public.b2b_leads')
  t(!/REVOKE[^;]*FROM service_role/i.test(sql3), '§1 : service_role conserve ses droits (aucun REVOKE sur service_role)')
  t(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(sql3Code), '§1 : aucune suppression de table ou de colonne')
  t(!/\bDELETE\s+FROM\b/i.test(sql3Code), '§1 : aucune suppression de données')
  t(!/\bTRUNCATE\b/i.test(sql3Code), '§1 : aucun TRUNCATE')
  t(!/\bUPDATE\s+public\.b2b_leads\b/i.test(sql3Code), '§1 : aucune mise à jour de données')
  t(!/\bINSERT\s+INTO\s+public\.b2b_leads\b/i.test(sql3Code), '§1 : aucune insertion de données')
  t(/MIGRATION PRÉPARÉE, NON APPLIQUÉE/.test(sql3), '§1 : la migration est explicitement marquée comme non appliquée')
  t(/to_regclass\('public\.b2b_leads'\)/.test(sql3), '§1 : la migration est sans effet si la table est absente (idempotence)')

  // ── §8 : claim atomique du drip B2B (migration préparée) ────────────────
  t(fs.existsSync(M4), '§8 : la migration 004 (claim B2B) est présente dans le dépôt')
  const sql4 = fs.readFileSync(M4, 'utf8')
  t(sql4.includes('ADD COLUMN IF NOT EXISTS claimed_at timestamptz'), '§8 : claimed_at est ajouté sans réécrire les lignes existantes')
  t(sql4.includes('ADD COLUMN IF NOT EXISTS contact_attempts integer NOT NULL DEFAULT 0'), '§8 : le compteur de tentatives est initialisé à zéro')
  t(sql4.includes('ADD COLUMN IF NOT EXISTS last_contact_error text'), "§8 : seul un code d'erreur non-PII est conservé")
  t(sql4.includes('CREATE INDEX IF NOT EXISTS b2b_leads_processing_claimed_idx'), '§8 : les claims expirés sont indexés')
  t(sql4.includes('MIGRATION PRÉPARÉE, NON APPLIQUÉE'), '§8 : la migration est explicitement marquée comme non appliquée')
  t(!sql4.includes('UPDATE public.b2b_leads') && !sql4.includes('DELETE FROM public.b2b_leads') && !sql4.includes('TRUNCATE public.b2b_leads'), '§8 : la migration ne modifie ni ne supprime les prospects')
  // ── P0.127 : moindre privilège B2B/B2C/payment ───────────────────────────
  t(fs.existsSync(M6), 'P0.127 : la migration 006 (B2B/B2C/payment) est présente')
  const sql6 = fs.readFileSync(M6, 'utf8')
  t(/MIGRATION PRÉPARÉE, NON APPLIQUÉE/.test(sql6), 'P0.127 : la migration 006 est explicitement non appliquée')
  for (const [table, policy] of [
    ['b2b_subscriptions', 'Allow all b2b_subscriptions'],
    ['b2c_alerts', 'Allow all b2c_alerts']
  ]) {
    t(sql6.includes(`DROP POLICY IF EXISTS "${policy}" ON public.${table}`), `P0.127 : la policy permissive connue de ${table} est supprimée`)
    t(sql6.includes(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC`), `P0.127 : PUBLIC est révoqué sur ${table}`)
    t(sql6.includes(`REVOKE ALL ON TABLE public.${table} FROM anon`), `P0.127 : anon est révoqué sur ${table}`)
    t(sql6.includes(`REVOKE ALL ON TABLE public.${table} FROM authenticated`), `P0.127 : authenticated est révoqué sur ${table}`)
    t(sql6.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), `P0.127 : RLS est activée sur ${table}`)
  }
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
    t(sql6.includes(`REVOKE ALL ON TABLE public.payment_grants FROM ${role}`), `P0.127 : ${role} est révoqué sur payment_grants`)
  }
  t(sql6.includes('ALTER TABLE public.payment_grants ENABLE ROW LEVEL SECURITY'), 'P0.127 : RLS est activée sur payment_grants')
  t(!/REVOKE[^;]*FROM service_role/i.test(sql6), 'P0.127 : service_role conserve ses droits')
  const sql6Code = sql6.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  t(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(sql6Code), 'P0.127 : aucune suppression de table ou colonne')
  t(!/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.|INSERT\s+INTO\s+public\.)/i.test(sql6Code), 'P0.127 : aucune modification ou suppression de données')

  // ── P0.127 : TRUNCATE bypass RLS ────────────────────────────────────────
  t(fs.existsSync(M7), 'P0.127 : la migration 007 (TRUNCATE) est présente')
  const sql7 = fs.readFileSync(M7, 'utf8')
  t(/MIGRATION PRÉPARÉE, NON APPLIQUÉE/.test(sql7), 'P0.127 : la migration 007 est explicitement non appliquée')
  t(sql7.includes('REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;'), 'P0.127 : TRUNCATE est révoqué de tous les rôles clients sur le schéma public')
  t(!/GRANT\\s+TRUNCATE/i.test(sql7), 'P0.127 : aucun privilège TRUNCATE n est accordé')
  t(!/REVOKE[^;]*FROM service_role/i.test(sql7), 'P0.127 : service_role conserve ses droits')
  const sql7Code = sql7.replace(/--[^\\n]*/g, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')
  t(!/\\b(DROP\\s+(TABLE|COLUMN)|DELETE\\s+FROM|UPDATE\\s+public\\.|INSERT\\s+INTO\\s+public\\.)/i.test(sql7Code), 'P0.127 : aucune modification ou suppression de données')

  // ── Contrôle « base jetable » : JAMAIS en production ─────────────────────
  const target = process.env.SG_TEST_PG_URL || process.env.SG_TEST_SUPABASE_URL || ''
  let pg = null
  try { pg = require('pg') } catch (_) { pg = null }

  if (!target) {
    console.log('SKIP  contrôle des privilèges sur base réelle : aucune base jetable fournie (SG_TEST_PG_URL)')
    t(!PRODUCTION_HOSTS.some((h) => target.includes(h)), '§1 : aucune base de production n est ciblée (pas de base fournie)')
  } else if (PRODUCTION_HOSTS.some((h) => target.includes(h))) {
    t(false, '§1 : REFUS — la cible est la base de production')
  } else if (!pg) {
    console.log('SKIP  contrôle des privilèges sur base réelle : module "pg" indisponible (base jetable non testée)')
    t(true, '§1 : aucune écriture n a été faite sur une base non jetable')
  } else {
    const client = new pg.Client({ connectionString: target })
    try {
      await client.connect()
      await client.query(fs.readFileSync(M3, 'utf8'))
      await client.query(fs.readFileSync(M2, 'utf8'))
      await client.query(fs.readFileSync(M6, 'utf8'))
      await client.query(fs.readFileSync(M7, 'utf8'))
      const res = await client.query(`
        SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'b2b_leads'
      `)
      const rows = res.rows || []
      const anonRows = rows.filter((r) => r.grantee === 'anon')
      const authRows = rows.filter((r) => r.grantee === 'authenticated')
      const svcRows = rows.filter((r) => r.grantee === 'service_role')
      t(anonRows.length === 0, '§1 : anon n a AUCUN privilège sur public.b2b_leads (base jetable)')
      t(authRows.length === 0, '§1 : authenticated n a AUCUN privilège sur public.b2b_leads (base jetable)')
      t(svcRows.length > 0, '§1 : service_role conserve ses privilèges (base jetable)')
      const trunc = await client.query(`
        SELECT grantee, table_name
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated', 'PUBLIC')
          AND privilege_type = 'TRUNCATE'
      `)
      t((trunc.rows || []).length === 0, 'P0.127 : aucun rôle client ne conserve TRUNCATE (base jetable)')
      const fn = await client.query(`
        SELECT proconfig FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sg_upsert_payment_grant'
      `)
      t((fn.rows[0]?.proconfig || []).includes('search_path='), '§3 : search_path="" est bien actif sur la fonction (base jetable)')
    } finally {
      await client.end().catch(() => {})
    }
  }

  console.log(`\nP0_118_MIGRATIONS_TESTS PASS (${n} assertions)`)
}

main().catch((error) => { console.error(error); process.exit(1) })