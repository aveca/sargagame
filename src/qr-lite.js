// Encodeur QR autonome — byte mode, niveau de correction M, versions 1–10.
// Zéro dépendance, ZÉRO appel réseau runtime : le mode vitrine (?demo=1, DemoReel)
// doit rendre un QR scannable même sur une tablette de hall au wifi capricieux —
// une image QR externe (api.qrserver…) flasherait/casserait hors-ligne. Le panel
// adverse (2026-07-02) a explicitement interdit l'image externe au runtime.
// Réf: ISO/IEC 18004, implémentation façon Nayuki (RS + placement + masques).
// Correction VÉRIFIÉE au test par décodage jsQR (scratchpad/qr-verify.mjs) — ne
// PAS modifier l'algo sans relancer cette vérif (un QR faux ne "plante" pas, il
// ne scanne juste pas → tombe sur le fondateur, loi "le fondateur n'est pas la QA").

// ── GF(256), polynôme primitif 0x11d ────────────────────────────────────────
const GF_EXP = new Uint8Array(256)
const GF_LOG = new Uint8Array(256)
;(function initGF () {
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
})()
function gfMul (a, b) {
  if (a === 0 || b === 0) return 0
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255]
}

// ── Tables niveau M, versions 1–10 ──────────────────────────────────────────
// EC_M[v] = [ecCodewordsParBloc, [[nbBlocs, dataCwParBloc], …]]
const EC_M = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]]
}
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
}
function totalDataCw (v) { let s = 0; for (const [n, d] of EC_M[v][1]) s += n * d; return s }
function byteCapacity (v) {
  const countBits = v <= 9 ? 8 : 16
  return Math.floor((totalDataCw(v) * 8 - 4 - countBits) / 8)
}
function pickVersion (len) {
  for (let v = 1; v <= 10; v++) if (byteCapacity(v) >= len) return v
  throw new Error('qr-lite: contenu trop long (' + len + ' octets, max ' + byteCapacity(10) + ')')
}

// ── Reed-Solomon (Nayuki) ───────────────────────────────────────────────────
function rsDivisor (degree) {
  const result = new Uint8Array(degree)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMul(root, 2)
  }
  return result
}
function rsRemainder (data, divisor) {
  const result = new Uint8Array(divisor.length)
  for (const b of data) {
    const factor = b ^ result[0]
    for (let i = 0; i < result.length - 1; i++) result[i] = result[i + 1]
    result[result.length - 1] = 0
    for (let i = 0; i < result.length; i++) result[i] ^= gfMul(divisor[i], factor)
  }
  return result
}

// ── Flux de données (byte mode) → codewords entrelacés ──────────────────────
function makeCodewords (text) {
  const bytes = new TextEncoder().encode(text)
  const version = pickVersion(bytes.length)
  const cap = totalDataCw(version) * 8
  const bits = []
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1) }
  push(0b0100, 4)                         // indicateur mode = byte
  push(bytes.length, version <= 9 ? 8 : 16) // compteur de caractères
  for (const b of bytes) push(b, 8)
  push(0, Math.min(4, cap - bits.length)) // terminateur
  while (bits.length % 8 !== 0) bits.push(0) // alignement octet
  const pad = [0xec, 0x11]
  let pi = 0
  while (bits.length < cap) { push(pad[pi % 2], 8); pi++ } // codewords de bourrage

  const dataCw = new Uint8Array(cap / 8)
  for (let i = 0; i < dataCw.length; i++) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j]
    dataCw[i] = v
  }

  const [ecPerBlock, groups] = EC_M[version]
  const divisor = rsDivisor(ecPerBlock)
  const blocks = []
  let off = 0
  for (const [numBlocks, dataCwPerBlock] of groups) {
    for (let b = 0; b < numBlocks; b++) {
      const d = dataCw.slice(off, off + dataCwPerBlock)
      off += dataCwPerBlock
      blocks.push({ data: d, ec: rsRemainder(d, divisor) })
    }
  }
  const out = []
  const maxData = Math.max(...blocks.map(b => b.data.length))
  for (let i = 0; i < maxData; i++) for (const blk of blocks) if (i < blk.data.length) out.push(blk.data[i])
  for (let i = 0; i < ecPerBlock; i++) for (const blk of blocks) out.push(blk.ec[i])
  return { codewords: Uint8Array.from(out), version }
}

// ── Construction de la matrice ──────────────────────────────────────────────
const getBit = (x, i) => ((x >>> i) & 1) !== 0

function buildMatrix (version, allCw) {
  const size = version * 4 + 17
  const mods = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (x, y, dark) => { mods[y][x] = dark; fn[y][x] = true }

  // Timing patterns (ligne/colonne 6)
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }

  // Finder patterns + séparateurs (dark si distance de Chebyshev ∉ {2,4})
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy
        if (x < 0 || x >= size || y < 0 || y >= size) continue
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        set(x, y, dist !== 2 && dist !== 4)
      }
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)

  // Réserver les zones de format (drawFormat les remplira plus tard)
  const reserveFormat = () => {
    for (let i = 0; i <= 8; i++) { if (i !== 6) { fn[i][8] = true; fn[8][i] = true } }
    for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true }
  }
  reserveFormat()

  // Alignment patterns (dark si distance ≠ 1) hors coins des finders
  const pos = ALIGN[version]
  for (const r of pos) {
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy))
          set(c + dx, r + dy, dist !== 1)
        }
      }
    }
  }

  // Version info (v ≥ 7) — BCH 18 bits
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const vbits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = getBit(vbits, i)
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, bit); set(b, a, bit)
    }
  }

  // Placement des codewords (zigzag) — seulement sur les modules non-fonction
  let bi = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!fn[y][x] && bi < allCw.length * 8) {
          mods[y][x] = getBit(allCw[bi >>> 3], 7 - (bi & 7))
          bi++
        }
      }
    }
  }

  // Masque + format bits
  const maskCond = (m, x, y) => {
    switch (m) {
      case 0: return (x + y) % 2 === 0
      case 1: return y % 2 === 0
      case 2: return x % 3 === 0
      case 3: return (x + y) % 3 === 0
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
      case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    }
    return false
  }
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskCond(m, x, y)) mods[y][x] = !mods[y][x]
  }
  const drawFormat = (mask) => {
    const data = (0b00 << 3) | mask // niveau M = 0b00
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) set(8, i, getBit(bits, i))
    set(8, 7, getBit(bits, 6)); set(8, 8, getBit(bits, 7)); set(7, 8, getBit(bits, 8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, getBit(bits, i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, getBit(bits, i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, getBit(bits, i))
    set(8, size - 8, true) // module toujours noir
  }

  // Pénalité (Nayuki) — pour choisir le masque le plus scannable
  const RUN = () => [0, 0, 0, 0, 0, 0, 0]
  const finderPatterns = (h) => {
    const n = h[1]
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0)
  }
  const addHist = (run, h) => { if (h[0] === 0) run += size; h.pop(); h.unshift(run) }
  const termCount = (color, run, h) => { if (color) { addHist(run, h); run = 0 } run += size; addHist(run, h); return finderPatterns(h) }
  const penalty = () => {
    let score = 0
    // Règle 1 (lignes) + règle 3 (motifs finder)
    for (let y = 0; y < size; y++) {
      let color = false, run = 0; const h = RUN()
      for (let x = 0; x < size; x++) {
        if (mods[y][x] === color) { run++; if (run === 5) score += 3; else if (run > 5) score++ } else { addHist(run, h); if (!color) score += finderPatterns(h) * 40; color = mods[y][x]; run = 1 }
      }
      score += termCount(color, run, h) * 40
    }
    // Règle 1 (colonnes) + règle 3
    for (let x = 0; x < size; x++) {
      let color = false, run = 0; const h = RUN()
      for (let y = 0; y < size; y++) {
        if (mods[y][x] === color) { run++; if (run === 5) score += 3; else if (run > 5) score++ } else { addHist(run, h); if (!color) score += finderPatterns(h) * 40; color = mods[y][x]; run = 1 }
      }
      score += termCount(color, run, h) * 40
    }
    // Règle 2 (blocs 2×2)
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mods[y][x]; if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) score += 3 }
    // Règle 4 (proportion de noir)
    let dark = 0
    for (const row of mods) for (const c of row) if (c) dark++
    const total = size * size
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    score += k * 10
    return score
  }

  let best = -1, bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m)
    const s = penalty()
    if (s < bestScore) { bestScore = s; best = m }
    applyMask(m) // XOR retour (masque involutif)
  }
  applyMask(best); drawFormat(best)
  return mods
}

// ── API publique ────────────────────────────────────────────────────────────
export function qrMatrix (text) {
  const { codewords, version } = makeCodewords(text)
  return buildMatrix(version, codewords)
}

// Renvoie de quoi peindre le QR en JSX pur (pas d'injection HTML) :
// { d: chemin SVG de tous les modules noirs, dim: côté total (modules + quiet-zone) }.
// Un seul <path> → 1 nœud DOM. Le consommateur rend <svg viewBox="0 0 dim dim">…</svg>.
export function qrPath (text, { margin = 4 } = {}) {
  const m = qrMatrix(text)
  const n = m.length
  const dim = n + margin * 2
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`
  return { d, dim }
}

// Rend un <svg> autonome sous forme de CHAÎNE (encre sur fond clair, quiet-zone).
// Utile hors React (tests, pré-bake). En React, préférer qrPath + JSX.
export function qrSvg (text, { margin = 4, dark = '#0d1117', light = '#FFC72C', px = 8, ariaLabel = 'QR code' } = {}) {
  const { d, dim } = qrPath(text, { margin })
  const px2 = dim * px
  return `<svg viewBox="0 0 ${dim} ${dim}" width="${px2}" height="${px2}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="${ariaLabel}"><rect width="${dim}" height="${dim}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`
}
