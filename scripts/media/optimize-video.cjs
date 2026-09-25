#!/usr/bin/env node
/**
 * optimize-video.cjs — VIDEO OPTIMIZATION PIPELINE (2026-09-25K, §10).
 *
 * master (MP4/MOV) → web video (VP9/WebM, H.264/MP4 fallback) +
 * mobile video (H.264/MP4, lower bitrate) + poster (JPG, frame @1s).
 *
 * Optimise : codec, bitrate, duration, resolution.
 * Conditions runtime : reduced-motion / saveData / 2G / mobile low-data
 * → PHOTO fallback (jamais de vidéo forcée).
 *
 * Usage (DRY-RUN par défaut) :
 *   node scripts/media/optimize-video.cjs [--write] [--only=id1,id2]
 *
 * Sources attendues :
 *   - Atmosphérique : public/media/atmosphere/master/<id>.mp4
 *   - Hero plage : public/videos/hero/master/<id>.mp4 (si existant)
 * Sorties :
 *   - public/media/atmosphere/<id>/{web.webm,web.mp4,mobile.mp4,poster.jpg}
 *   - public/videos/hero/<id>.mp4 (web) + <id>-w.mp4 (mobile) + poster
 */

const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")

const ROOT = path.resolve(__dirname, "..", "..")
const ATMOSPHERE_MASTER = path.join(ROOT, "public", "media", "atmosphere", "master")
const HERO_MASTER = path.join(ROOT, "public", "videos", "hero", "master")
const ATMOSPHERE_OUT = path.join(ROOT, "public", "media", "atmosphere")
const HERO_OUT = path.join(ROOT, "public", "videos", "hero")

const WRITE = process.argv.includes("--write")
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean)

const WEB_CRF = 28
const MOBILE_CRF = 32
const WEB_MAX_BITRATE = "800k"
const MOBILE_MAX_BITRATE = "400k"
const MAX_DURATION = 15 // secondes max pour loops atmosphériques

function hasFFmpeg() {
  try { require("child_process").execSync("ffmpeg -version", { stdio: "ignore" }); return true } catch { return false }
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    p.stderr.on("data", d => stderr += d.toString())
    p.on("close", code => code === 0 ? resolve() : reject(new Error(stderr.slice(-500))))
  })
}

async function optimizeVideo(input, outDir, base, opts = {}) {
  const { web = true, mobile = true, poster = true, maxDur = MAX_DURATION } = opts
  const results = { web: null, mobile: null, poster: null }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  if (web) {
    const webm = path.join(outDir, `${base}.webm`)
    const mp4 = path.join(outDir, `${base}.mp4`)
    // WebM VP9 (meilleur compression)
    await runFFmpeg(["-y", "-i", input, "-t", String(maxDur), "-c:v", "libvpx-vp9", "-crf", String(WEB_CRF), "-b:v", "0", "-an", "-pass", "1", "-f", "webm", "/dev/null"])
    await runFFmpeg(["-y", "-i", input, "-t", String(maxDur), "-c:v", "libvpx-vp9", "-crf", String(WEB_CRF), "-b:v", "0", "-an", "-pass", "2", webm])
    // MP4 H.264 fallback
    await runFFmpeg(["-y", "-i", input, "-t", String(maxDur), "-c:v", "libx264", "-crf", String(WEB_CRF), "-maxrate", WEB_MAX_BITRATE, "-bufsize", "1600k", "-preset", "slow", "-an", "-movflags", "+faststart", mp4])
    results.web = { webm: fs.existsSync(webm) ? webm : null, mp4: fs.existsSync(mp4) ? mp4 : null }
  }
  if (mobile) {
    const mobileMp4 = path.join(outDir, `${base}-mobile.mp4`)
    await runFFmpeg(["-y", "-i", input, "-t", String(maxDur), "-c:v", "libx264", "-crf", String(MOBILE_CRF), "-maxrate", MOBILE_MAX_BITRATE, "-bufsize", "800k", "-vf", "scale='min(720,iw)':-2", "-preset", "slow", "-an", "-movflags", "+faststart", mobileMp4])
    results.mobile = fs.existsSync(mobileMp4) ? mobileMp4 : null
  }
  if (poster) {
    const posterJpg = path.join(outDir, `${base}-poster.jpg`)
    await runFFmpeg(["-y", "-i", input, "-ss", "00:00:01", "-vframes", "1", "-q:v", "2", posterJpg])
    results.poster = fs.existsSync(posterJpg) ? posterJpg : null
  }
  return results
}

async function main() {
  if (!hasFFmpeg()) { console.log("[optimize-video] ffmpeg non installé — skip (install: apt/brew install ffmpeg)"); return }
  const tasks = []
  // Atmosphérique
  if (fs.existsSync(ATMOSPHERE_MASTER)) {
    for (const f of fs.readdirSync(ATMOSPHERE_MASTER)) {
      if (!/\.mp4$/i.test(f)) continue
      const id = f.replace(/\.mp4$/i, "")
      if (ONLY.length && !ONLY.includes(id)) continue
      const outDir = path.join(ATMOSPHERE_OUT, id)
      tasks.push({ id, input: path.join(ATMOSPHERE_MASTER, f), outDir, type: "atmosphere" })
    }
  }
  // Hero (si master existe)
  if (fs.existsSync(HERO_MASTER)) {
    for (const f of fs.readdirSync(HERO_MASTER)) {
      if (!/\.mp4$/i.test(f)) continue
      const id = f.replace(/\.mp4$/i, "")
      if (ONLY.length && !ONLY.includes(id)) continue
      tasks.push({ id, input: path.join(HERO_MASTER, f), outDir: HERO_OUT, type: "hero" })
    }
  }
  if (!tasks.length) { console.log("[optimize-video] aucun master trouvé — rien à faire"); return }

  for (const t of tasks) {
    console.log(`[optimize-video] ${t.id} (${t.type}) ${WRITE ? "ÉCRIT" : "DRY-RUN"}…`)
    if (!WRITE) continue
    try {
      if (t.type === "atmosphere") {
        const r = await optimizeVideo(t.input, t.outDir, t.id)
        console.log(`  → web: ${r.web?.webm ? "webm" : "x"} ${r.web?.mp4 ? "mp4" : "x"} | mobile: ${r.mobile ? "ok" : "x"} | poster: ${r.poster ? "ok" : "x"}`)
      } else {
        // Hero : web (mp4 + -w.mp4 mobile) + poster
        const webMp4 = path.join(t.outDir, `${t.id}.mp4`)
        const mobileMp4 = path.join(t.outDir, `${t.id}-w.mp4`)
        const posterJpg = path.join(t.outDir, `${t.id}-poster.jpg`)
        await runFFmpeg(["-y", "-i", t.input, "-t", "30", "-c:v", "libx264", "-crf", "26", "-maxrate", "1200k", "-bufsize", "2400k", "-preset", "slow", "-an", "-movflags", "+faststart", webMp4])
        await runFFmpeg(["-y", "-i", t.input, "-t", "30", "-c:v", "libx264", "-crf", "30", "-maxrate", "600k", "-bufsize", "1200k", "-vf", "scale='min(720,iw)':-2", "-preset", "slow", "-an", "-movflags", "+faststart", mobileMp4])
        await runFFmpeg(["-y", "-i", t.input, "-ss", "00:00:01", "-vframes", "1", "-q:v", "2", posterJpg])
        console.log(`  → web: ${fs.existsSync(webMp4) ? "ok" : "x"} | mobile(-w): ${fs.existsSync(mobileMp4) ? "ok" : "x"} | poster: ${fs.existsSync(posterJpg) ? "ok" : "x"}`)
      }
    } catch (e) { console.error(`  ✗ ${t.id}:`, e.message) }
  }
  console.log("[optimize-video] terminé")
}

main().catch(e => { console.error(e); process.exit(1) })