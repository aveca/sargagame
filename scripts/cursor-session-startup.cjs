#!/usr/bin/env node
/**
 * Moteur de bootstrap de session PORTABLE (desktop + mobile/web) — reprend les checks
 * « session startup » de CLAUDE.md. Tout l'état chiffré est DÉRIVÉ au read-time depuis des
 * fichiers git-trackés (donc présents même quand le dossier mémoire ~/.claude est absent) :
 *   - fraîcheur pipeline  → public/api/copernicus/sargassum.json
 *   - métriques + MRR     → scripts/automation/data/daily-metrics.json (bloc `stripe` = MRR,
 *                           source de vérité ; JAMAIS le funnel Apps Script, sous-compte ~7×)
 * Le dossier mémoire ~/.claude/.../memory/ est DESKTOP-ONLY (optionnel) : absent sur mobile/web,
 * le script le signale comme NOMINAL et retombe sur la tête de NEXT_SESSION.md. Sortie stdout
 * uniquement (rien n'est écrit/committé → zéro collision de merge).
 * Usage : node scripts/cursor-session-startup.cjs   (alias : npm run session)
 *
 * Variables optionnelles :
 *   SKIP_GH=1        — ne pas appeler gh (runs + workflow STALE)
 *   SKIP_STALE_RUN=1 — ne pas lancer gh workflow run si données STALE
 */
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const os = require("os")

const REPO = "aveca/sargagame"
const STALE_H = 12      // âge du run pipeline (updatedAt) — re-run le corrige
const SAT_STALE_H = 36  // âge du composite satellite (erddapTimestamp) — re-run ne corrige PAS (ERDDAP en retard)
const MEM_DIR = path.join(
  os.homedir(),
  ".claude",
  "projects",
  "C--Users-user-Desktop-Backup-sargagame",
  "memory"
)
// Liste indicative DESKTOP (dossier mémoire du fondateur). Source portable = NEXT_SESSION.md
// (tête) + les 2 JSON trackés. Absente sur mobile/web → fallback géré au check [5].
const MEM_FILES = [
  "MEMORY.md",
  "project_roadmap.md",
  "project_metrics.md",
  "project_next_session.md",
]

function gh(args) {
  if (process.env.SKIP_GH === "1") return null
  try {
    return execSync(`gh ${args}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch {
    return null
  }
}

function main() {
  const root = path.join(__dirname, "..")
  const lines = []

  console.log("=== Sargasses — session startup (équivalent CLAUDE.md) ===\n")

  // 1) Pipeline freshness
  let stale = false
  let src = "?"
  let ageH = "?"
  try {
    const p = path.join(root, "public", "api", "copernicus", "sargassum.json")
    const d = JSON.parse(fs.readFileSync(p, "utf8"))
    src = d.source || "?"
    // (a) Âge du RUN pipeline (updatedAt = now à chaque run) → re-run le corrige
    const h = (Date.now() - new Date(d.updatedAt)) / 3.6e6
    ageH = h.toFixed(1)
    stale = h >= STALE_H
    const ok = h < STALE_H ? "OK" : "STALE"
    // (b) Âge du COMPOSITE satellite (vraie fraîcheur des données) → re-run NE corrige PAS
    const satMs = d.erddapTimestamp ? new Date(d.erddapTimestamp).getTime() : null
    const satH = satMs != null ? (Date.now() - satMs) / 3.6e6 : null
    const satStale = d.stale === true || (satH != null && satH >= SAT_STALE_H)
    const satTxt = satH != null ? `${satH.toFixed(1)}h${satStale ? " STALE" : " OK"}` : "n/a"
    console.log(`[1] Pipeline : source=${src} | run=${ageH}h (<${STALE_H}h → ${ok}) | satellite=${satTxt} (<${SAT_STALE_H}h)`)
    if (satStale) console.log(`    ⚠️  Composite satellite périmé — ERDDAP en retard, un re-run NE le rafraîchira PAS. Vérifier la source ERDDAP.`)
    lines.push(`Pipeline ${src} run ${ageH}h ${ok} | sat ${satTxt}`)
  } catch (e) {
    console.log("[1] Pipeline : ERREUR lecture sargassum.json —", e.message)
    lines.push("Pipeline ERREUR")
  }

  // 2) Métriques business + 3) MRR (dérivés du MÊME JSON tracké → portables sur mobile/web)
  try {
    const p = path.join(root, "scripts", "automation", "data", "daily-metrics.json")
    const arr = JSON.parse(fs.readFileSync(p, "utf8"))
    const l = arr[arr.length - 1]
    console.log(
      `[2] Métriques : last=${l.date} | pay=${l.payments} | emails=${l.emails} | fb=${l.feedbacks}`
    )
    lines.push(`Métriques ${l.date} pay=${l.payments} em=${l.emails}`)

    // 3) MRR — Stripe legacy = source de vérité ; JAMAIS le funnel (sous-compte ~7×).
    const s = [...arr].reverse().find((x) => x.stripe && x.stripe.active != null)
    if (s && s.stripe.mrr && s.stripe.mrr.eur != null) {
      const st = s.stripe
      console.log(
        `[3] MRR (Stripe legacy = vérité, JAMAIS le funnel) : €${st.mrr.eur} | ${st.active} actifs | pastDue ${st.pastDue} | cancel ${st.cancelScheduled}`
      )
      lines.push(`MRR €${st.mrr.eur} | ${st.active} actifs | pastDue ${st.pastDue}`)
    } else {
      console.log("[3] MRR : bloc `stripe` absent de daily-metrics.json (rien à dériver)")
      lines.push("MRR N/A")
    }
  } catch (e) {
    console.log("[2/3] Métriques/MRR : indisponible —", e.message)
    lines.push("Métriques/MRR N/A")
  }

  // 4) gh run list
  console.log("")
  const runs = gh(`run list --repo ${REPO} --limit 5`)
  if (runs) {
    console.log("[4] Derniers workflows GitHub :")
    console.log(runs.trimEnd())
    lines.push("gh: OK")
  } else {
    console.log("[4] gh : ignoré (SKIP_GH=1 ou non authentifié ; fallback mcp__github__actions_list)")
    lines.push("gh: skip")
  }

  // 5) Mémoire projet — DESKTOP-ONLY ; fallback repo (NEXT_SESSION.md) sur mobile/web.
  console.log("")
  const memPresent = fs.existsSync(MEM_DIR)
    ? MEM_FILES.filter((f) => fs.existsSync(path.join(MEM_DIR, f)))
    : []
  if (memPresent.length > 0) {
    console.log("[5] Mémoire Claude (~/.claude/.../memory/ — desktop, optionnel) :")
    for (const f of MEM_FILES) {
      const fp = path.join(MEM_DIR, f)
      if (fs.existsSync(fp)) {
        const st = fs.statSync(fp)
        const head = fs.readFileSync(fp, "utf8").split("\n").slice(0, 3).join(" ").slice(0, 120)
        console.log(`    ✓ ${f} (${st.size}b) — ${head}…`)
      } else {
        console.log(`    — ${f} (absent)`)
      }
    }
    lines.push(`Mémoire: ${memPresent.length}/${MEM_FILES.length} fichiers (desktop)`)
  } else {
    // Conteneur mobile/web : le dossier mémoire ne suit pas — NOMINAL, pas une erreur.
    console.log("[5] Mémoire ~/.claude ABSENTE (normal sur mobile/web) → fallback repo : NEXT_SESSION.md (tête)")
    try {
      const nsPath = path.join(root, "NEXT_SESSION.md")
      const nsHead = fs
        .readFileSync(nsPath, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
      for (const s of nsHead) console.log("    " + s.slice(0, 140))
    } catch (e) {
      console.log("    (NEXT_SESSION.md illisible —", e.message, ")")
    }
    lines.push("Mémoire: repo-only (NEXT_SESSION.md tête)")
  }

  // 6) STALE → workflow
  console.log("")
  if (stale && process.env.SKIP_STALE_RUN !== "1" && process.env.SKIP_GH !== "1") {
    const w = gh(`workflow run daily-copernicus.yml --repo ${REPO} --ref main`)
    if (w !== null) {
      console.log(`[6] Données > ${STALE_H}h → gh workflow run daily-copernicus.yml lancé.`)
      lines.push("STALE→workflow lancé")
    } else {
      console.log(`[6] STALE mais gh indisponible — lance manuellement : gh workflow run daily-copernicus.yml --repo ${REPO} --ref main`)
      lines.push("STALE, gh KO")
    }
  } else if (stale) {
    console.log(`[6] STALE (SKIP_STALE_RUN ou SKIP_GH — pas de lancement auto)`)
    lines.push("STALE skip auto")
  } else {
    console.log("[6] Pipeline OK — pas de relance workflow.")
    lines.push("Pas de relance")
  }

  console.log("\n--- Résumé ---")
  lines.slice(0, 8).forEach((s) => console.log(" •", s))
  console.log("")
}

main()
