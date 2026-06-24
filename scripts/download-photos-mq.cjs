#!/usr/bin/env node
/**
 * download-photos-mq.cjs
 * Downloads real beach photos from Wikimedia Commons for all 30 MQ beaches.
 * Uses the Wikimedia API to find the original image URL, then downloads it.
 * Saves as public/beaches/photo-{beachId}.jpg
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "beaches");
const BEACHES_FILE = path.join(ROOT, "public", "data", "beaches-list.json");

const USER_AGENT =
  "SargassesBot/1.0 (https://sargasses-martinique.com; alerte@sargasses-martinique.com)";

// Known good Wikimedia filenames for beaches where search might fail
const KNOWN_FILES = {
  mq001: "Plage_des_Salines_Martinique.jpg",
  mq011: "Anse_Mitan_-_Les_Trois-Ilets.jpg",
  mq014: "Anses_d'Arlet_-_Martinique.jpg",
  mq016: "Le_Diamant_beach_Martinique.jpg",
  mq029: "Saint_Pierre_Martinique.jpg",
};

// Search terms tailored per beach for better Wikimedia results
const SEARCH_OVERRIDES = {
  mq001: "Plage Salines Martinique",
  mq002: "Anse Caritan Sainte-Anne Martinique",
  mq003: "Anse Meunier Martinique",
  mq004: "Sainte-Anne Martinique plage bourg",
  mq005: "Anse Trabaud Martinique",
  mq006: "Anse Macabou Martinique",
  mq007: "Anse Michel Martinique",
  mq008: "Le Marin Martinique plage",
  mq009: "Anse Figuier Martinique",
  mq010: "Anse à l'Âne Martinique",
  mq011: "Anse Mitan Trois-Ilets Martinique",
  mq012: "Anse Noire Martinique",
  mq013: "Anse Dufour Martinique",
  mq014: "Grande Anse Arlet Martinique",
  mq015: "Petite Anse Arlet Martinique",
  mq016: "Diamant plage Martinique",
  mq017: "Anse Cafard Martinique",
  mq018: "Diamant petite anse Martinique",
  mq019: "Anse Gros Raisins Sainte-Luce Martinique",
  mq020: "Sainte-Luce Martinique plage",
  mq021: "Anse Corps de Garde Martinique",
  mq022: "Pointe Borgnesse Martinique",
  mq023: "Fort-de-France plage Martinique",
  mq024: "Anse Madame Schoelcher Martinique",
  mq025: "Schoelcher plage Martinique",
  mq026: "Anse Collat Schoelcher Martinique",
  mq027: "Grande Anse Carbet Martinique",
  mq028: "Anse Turin Carbet Martinique",
  mq029: "Saint-Pierre Martinique plage",
  mq030: "Anse Belleville Prêcheur Martinique",
};

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod
      .get(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJSON(res.headers.location).then(resolve, reject);
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}\nBody: ${data.slice(0, 300)}`));
          }
        });
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod
      .get(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFile(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on("finish", () => {
          ws.close();
          resolve();
        });
        ws.on("error", reject);
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Wikimedia API helpers ───────────────────────────────────────────────────

/**
 * Get image URL from a known Wikimedia filename using the imageinfo API.
 * Uses iiurlwidth=800 for a server-resized version when available.
 */
async function getImageURLByFilename(filename) {
  const title = `File:${filename}`;
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query` +
    `&titles=${encodeURIComponent(title)}` +
    `&prop=imageinfo&iiprop=url|size|mime` +
    `&iiurlwidth=800&format=json`;

  const json = await fetchJSON(url);
  const pages = json?.query?.pages;
  if (!pages) return null;

  for (const pid of Object.keys(pages)) {
    if (pid === "-1") continue;
    const info = pages[pid]?.imageinfo?.[0];
    if (!info) continue;
    // Prefer the thumburl (resized) if available, else original
    const imgUrl = info.thumburl || info.url;
    if (imgUrl) return imgUrl;
  }
  return null;
}

/**
 * Search Wikimedia Commons for beach images.
 * Returns the best image URL found, or null.
 */
async function searchWikimediaImage(searchTerm) {
  // Step 1: Search for files matching the term
  const searchUrl =
    `https://commons.wikimedia.org/w/api.php?action=query` +
    `&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(searchTerm)}` +
    `&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime` +
    `&iiurlwidth=800&format=json`;

  const json = await fetchJSON(searchUrl);
  const pages = json?.query?.pages;
  if (!pages) return null;

  // Find the best image: prefer JPEG, decent size, with thumburl
  let bestUrl = null;
  let bestScore = -1;

  for (const pid of Object.keys(pages)) {
    const page = pages[pid];
    const info = page?.imageinfo?.[0];
    if (!info) continue;

    // Skip non-image types
    const mime = info.mime || "";
    if (!mime.startsWith("image/")) continue;

    // Score: prefer JPEG, larger images, images with beach-related titles
    let score = 0;
    if (mime === "image/jpeg") score += 10;
    if (info.width >= 800) score += 5;
    if (info.width >= 400) score += 3;
    const title = (page.title || "").toLowerCase();
    if (title.includes("plage") || title.includes("beach") || title.includes("anse"))
      score += 8;
    if (title.includes("martinique")) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestUrl = info.thumburl || info.url;
    }
  }

  return bestUrl;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // Load beaches
  const allBeaches = JSON.parse(fs.readFileSync(BEACHES_FILE, "utf-8"));
  const mqBeaches = allBeaches.filter((b) => b.island === "mq");

  console.log(`Found ${mqBeaches.length} MQ beaches to process.\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (const beach of mqBeaches) {
    const outFile = path.join(OUT_DIR, `photo-${beach.id}.jpg`);

    // Skip if already downloaded
    if (fs.existsSync(outFile)) {
      const stat = fs.statSync(outFile);
      if (stat.size > 5000) {
        console.log(`[SKIP] ${beach.id} - ${beach.name} (already exists, ${(stat.size / 1024).toFixed(0)}KB)`);
        results.skipped.push(beach.id);
        continue;
      }
    }

    console.log(`[${beach.id}] ${beach.name}...`);

    let imageUrl = null;

    try {
      // Strategy 1: Use known filename if available
      if (KNOWN_FILES[beach.id]) {
        console.log(`  -> Known file: ${KNOWN_FILES[beach.id]}`);
        imageUrl = await getImageURLByFilename(KNOWN_FILES[beach.id]);
        if (imageUrl) console.log(`  -> Found via known filename`);
      }

      // Strategy 2: Search with override term or beach name
      if (!imageUrl) {
        const searchTerm = SEARCH_OVERRIDES[beach.id] || `${beach.name} Martinique`;
        console.log(`  -> Searching: "${searchTerm}"`);
        imageUrl = await searchWikimediaImage(searchTerm);
        if (imageUrl) console.log(`  -> Found via search`);
      }

      // Strategy 3: Broader search with just commune name
      if (!imageUrl) {
        const fallbackTerm = `${beach.commune} Martinique plage`;
        console.log(`  -> Fallback search: "${fallbackTerm}"`);
        imageUrl = await searchWikimediaImage(fallbackTerm);
        if (imageUrl) console.log(`  -> Found via fallback`);
      }

      if (!imageUrl) {
        console.log(`  [FAIL] No image found`);
        results.failed.push({ id: beach.id, name: beach.name, reason: "no image found" });
        continue;
      }

      // Download
      console.log(`  -> Downloading: ${imageUrl.slice(0, 100)}...`);
      await downloadFile(imageUrl, outFile);

      const stat = fs.statSync(outFile);
      if (stat.size < 1000) {
        fs.unlinkSync(outFile);
        console.log(`  [FAIL] File too small (${stat.size} bytes), deleted`);
        results.failed.push({ id: beach.id, name: beach.name, reason: "file too small" });
      } else {
        console.log(`  [OK] ${(stat.size / 1024).toFixed(0)}KB`);
        results.success.push(beach.id);
      }
    } catch (err) {
      console.log(`  [FAIL] ${err.message}`);
      results.failed.push({ id: beach.id, name: beach.name, reason: err.message });
      // Clean up partial file
      if (fs.existsSync(outFile)) {
        try { fs.unlinkSync(outFile); } catch {}
      }
    }

    // Rate limit: 1 second between requests to be polite
    await sleep(1000);
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS:`);
  console.log(`  Success:  ${results.success.length}`);
  console.log(`  Skipped:  ${results.skipped.length}`);
  console.log(`  Failed:   ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log(`\nFailed beaches:`);
    for (const f of results.failed) {
      console.log(`  - ${f.id} (${f.name}): ${f.reason}`);
    }
  }
  console.log(`${"=".repeat(60)}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
