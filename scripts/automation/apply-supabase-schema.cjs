'use strict'
/**
 * apply-supabase-schema — applique supabase/schema.sql à la base Supabase LIVE via
 * l'API Management (POST /v1/projects/{ref}/database/query), sans que le fondateur
 * touche le SQL Editor du dashboard.
 *
 * Pourquoi : le schéma (tables `photos`, `planner_alerts`, `beach_reports` + RLS +
 * bucket Storage) est idempotent (`create table if not exists`, `on conflict`,
 * `drop policy if exists`) → safe à (re)appliquer à chaque changement. Sans ça, un
 * bloc ajouté au repo (ex. `beach_reports`, panel 2026-07-01) reste absent de la
 * prod tant que personne ne colle le SQL à la main → la feature front tape une table
 * 404 (« Signalement indisponible pour l'instant »). Ce script referme cette dérive.
 *
 * SOURCE UNIQUE = le fichier supabase/schema.sql (on ne recopie AUCUN SQL ici → zéro
 * divergence avec ce que le reste du code lit).
 *
 * Env :
 *   SUPABASE_ACCESS_TOKEN  — jeton Management (Account → Access Tokens). REQUIS.
 *   SUPABASE_PROJECT_REF   — (optionnel) ref projet, défaut rswdmjtdzrucqzzukfmd.
 *
 * Usage :
 *   node scripts/automation/apply-supabase-schema.cjs          # applique
 *   node scripts/automation/apply-supabase-schema.cjs --dry    # affiche, n'applique pas
 */

const fs = require('fs')
const path = require('path')

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'rswdmjtdzrucqzzukfmd'
const DRY = process.argv.slice(2).includes('--dry')
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'supabase', 'schema.sql')

async function main() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf-8')
  console.log(`=== apply-supabase-schema === project=${PROJECT_REF} | source=supabase/schema.sql (${sql.length} chars) | mode=${DRY ? 'DRY-RUN' : 'APPLY'}`)

  if (DRY) {
    console.log('[dry] SQL non envoyé. Extrait :\n' + sql.split('\n').slice(0, 12).join('\n') + '\n...')
    return
  }
  if (!ACCESS_TOKEN) {
    console.error('SUPABASE_ACCESS_TOKEN manquant — impossible d\'appliquer le schéma.')
    process.exit(1)
  }

  let res
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (e) {
    console.error('Requête Management API échouée:', e.message)
    process.exit(1)
  }

  const bodyText = await res.text().catch(() => '')
  if (!res.ok) {
    console.error(`Management API HTTP ${res.status} — schéma NON appliqué.\n${bodyText.slice(0, 800)}`)
    process.exit(1)
  }
  console.log('[ok] schéma Supabase appliqué (idempotent) — tables photos / planner_alerts / beach_reports + RLS + bucket assurés.')
}

main()
