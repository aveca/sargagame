/**
 * AHA Experience Production Visual QA
 * Captures screenshots across all 6 regions for manual verification
 * Usage: node scripts/qa/aha-prod-qa.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const REGIONS = [
  { id: 'mq', name: 'Martinique', url: 'https://sargasses-martinique.com', lang: 'fr', primary: true },
  { id: 'gp', name: 'Guadeloupe', url: 'https://sargasses-guadeloupe.com', lang: 'fr', primary: true },
  { id: 'florida', name: 'Florida', url: 'https://sargassummiami.com', lang: 'en', primary: true },
  { id: 'rivieramaya', name: 'Riviera Maya', url: 'https://sargassumcancun.com', lang: 'es', primary: true },
  { id: 'puntacana', name: 'Punta Cana', url: 'https://sargassumpuntacana.com', lang: 'en', primary: true },
  { id: 'tulum', name: 'Tulum', url: 'https://sargazotulum.com', lang: 'es', primary: true },
];

const OUT_DIR = '.ai/ui-audit/shots-aha-prod';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  const results = {
    timestamp: new Date().toISOString(),
    regions: [],
    defects: [],
  };

  for (const region of REGIONS) {
    console.log(`\n=== ${region.name} (${region.lang}) ===`);
    const page = await context.newPage();
    const regionResults = {
      region: region.id,
      name: region.name,
      url: region.url,
      lang: region.lang,
      screenshots: {},
      checks: {},
      errors: [],
    };

    try {
      // 1. Home page
      console.log(`  Loading home...`);
      await page.goto(region.url + '/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      const homeShot = path.join(OUT_DIR, `${region.id}-home-${TIMESTAMP}.png`);
      await page.screenshot({ path: homeShot, fullPage: true });
      regionResults.screenshots.home = homeShot;
      console.log(`  ✓ Home captured`);

      // 2. Open experience
      console.log(`  Opening experience...`);
      const openBtn = await page.locator('[data-testid="xp-best-open"]').first();
      if (await openBtn.count() === 0) {
        // Try alternative selectors
        const altBtn = await page.locator('button:has-text("J\'y vais"), button:has-text("Go"), button:has-text("Vamos")').first();
        if (await altBtn.count() > 0) {
          await altBtn.click();
        } else {
          throw new Error('Experience open button not found');
        }
      } else {
        await openBtn.click();
      }
      await page.waitForTimeout(2500);

      // Wait for experience to mount
      await page.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 });
      await page.waitForTimeout(1500);

      // 3. Experience full
      const expShot = path.join(OUT_DIR, `${region.id}-exp-${TIMESTAMP}.png`);
      await page.screenshot({ path: expShot, fullPage: true });
      regionResults.screenshots.experience = expShot;
      console.log(`  ✓ Experience captured`);

      // 4. Verify key elements
      const exp = page.locator('[data-testid="bx-experience"]');

      // Hero: beach name
      const beachName = await exp.locator('.bx-name').first().innerText().catch(() => '');
      regionResults.checks.beachName = beachName.trim();
      console.log(`  Beach: ${beachName.trim() || 'NOT FOUND'}`);

      // Hero: verdict
      const verdict = await exp.locator('.bx-verdict').first().innerText().catch(() => '');
      regionResults.checks.verdict = verdict.trim();
      console.log(`  Verdict: ${verdict.trim() || 'NOT FOUND'}`);

      // Hero: score
      const score = await exp.locator('.bx-score').first().innerText().catch(() => '');
      regionResults.checks.score = score.trim();
      console.log(`  Score: ${score.trim() || 'NOT FOUND'}`);

      // Media: photo/video presence
      const photoCount = await exp.locator('.bx-media-img').count();
      const videoCount = await exp.locator('video.bx-media').count();
      const scrimCount = await exp.locator('.bx-media-scrim').count();
      const glowCount = await exp.locator('.bx-media-glow').count();
      regionResults.checks.media = { photo: photoCount, video: videoCount, scrim: scrimCount, glow: glowCount };
      console.log(`  Media: photo=${photoCount}, video=${videoCount}, scrim=${scrimCount}, glow=${glowCount}`);

      // 5. WHY reveal
      console.log(`  Opening WHY...`);
      await exp.locator('#bx-why button').first().click();
      await page.waitForTimeout(800);
      const whyShot = path.join(OUT_DIR, `${region.id}-why-${TIMESTAMP}.png`);
      await page.screenshot({ path: whyShot, fullPage: true });
      regionResults.screenshots.why = whyShot;

      const proofs = await exp.locator('.bx-proof').count();
      regionResults.checks.whyProofs = proofs;
      console.log(`  WHY proofs: ${proofs}`);

      // 6. TOMORROW reveal
      console.log(`  Opening TOMORROW...`);
      await exp.locator('#bx-tomorrow button').first().click();
      await page.waitForTimeout(800);
      const tmrShot = path.join(OUT_DIR, `${region.id}-tomorrow-${TIMESTAMP}.png`);
      await page.screenshot({ path: tmrShot, fullPage: true });
      regionResults.screenshots.tomorrow = tmrShot;

      const timelineDays = await exp.locator('.bx-timeline-day').count();
      regionResults.checks.tomorrowDays = timelineDays;
      console.log(`  TOMORROW days: ${timelineDays}`);

      // 7. BACKUP reveal
      console.log(`  Opening BACKUP...`);
      await exp.locator('#bx-backup button').first().click();
      await page.waitForTimeout(800);
      const bakShot = path.join(OUT_DIR, `${region.id}-backup-${TIMESTAMP}.png`);
      await page.screenshot({ path: bakShot, fullPage: true });
      regionResults.screenshots.backup = bakShot;

      const backupCard = await exp.locator('.bx-backup-card, .bx-backup-empty').count();
      regionResults.checks.backupPresent = backupCard > 0;
      console.log(`  BACKUP present: ${backupCard > 0}`);

      // 8. PREMIUM section
      const premiumSection = await exp.locator('.bx-premium-section').count();
      const premiumPreview = await exp.locator('.bx-premium-preview').count();
      regionResults.checks.premiumPreview = premiumPreview > 0;
      console.log(`  PREMIUM preview: ${premiumPreview > 0}`);

      // 9. Sticky CTA
      const sticky = await page.locator('.bx-sticky').count();
      const stickyPreview = await page.locator('.bx-sticky-preview').count();
      regionResults.checks.sticky = sticky > 0;
      regionResults.checks.stickyPreview = stickyPreview > 0;
      console.log(`  Sticky CTA: ${sticky > 0}, preview: ${stickyPreview > 0}`);

      // 10. Language check
      const pageLang = await page.evaluate(() => document.documentElement.lang || 'unknown');
      regionResults.checks.htmlLang = pageLang;
      console.log(`  HTML lang: ${pageLang}`);

      // Check for language-specific text
      const bodyText = await page.locator('body').innerText();
      const hasFR = /aujourd'hui|pourquoi|demain|plan b|séjour|gratuit|premium/i.test(bodyText);
      const hasEN = /today|why|tomorrow|backup|stay|free|premium/i.test(bodyText);
      const hasES = /hoy|por qué|mañana|plan b|estancia|gratis|premium/i.test(bodyText);
      regionResults.checks.languageDetected = { fr: hasFR, en: hasEN, es: hasES };
      console.log(`  Language detected: FR=${hasFR}, EN=${hasEN}, ES=${hasES}`);

      // 11. Currency check (look for price in sticky)
      const currencyMatch = bodyText.match(/[€$]\s*\d+[,.]?\d*/);
      regionResults.checks.currencyFound = currencyMatch ? currencyMatch[0] : 'NOT FOUND';
      console.log(`  Currency: ${regionResults.checks.currencyFound}`);

      // 12. Media loading check
      const mediaErrors = await page.evaluate(() => {
        const errors = [];
        document.querySelectorAll('img, video').forEach(el => {
          if (el.error || (el.tagName === 'VIDEO' && el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) {
            errors.push(el.src);
          }
        });
        return errors;
      });
      regionResults.checks.mediaErrors = mediaErrors;
      if (mediaErrors.length > 0) {
        console.log(`  ⚠️ Media errors: ${mediaErrors.join(', ')}`);
      }

      // 13. Console errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      regionResults.checks.consoleErrors = consoleErrors;
      if (consoleErrors.length > 0) {
        console.log(`  ⚠️ Console errors: ${consoleErrors.length}`);
      }

    } catch (e) {
      console.log(`  ❌ ERROR: ${e.message}`);
      regionResults.errors.push(e.message);
      results.defects.push({ region: region.id, error: e.message });
    }

    await page.close();
    results.regions.push(regionResults);
  }

  await browser.close();

  // Save report
  const reportPath = path.join(OUT_DIR, `aha-prod-qa-${TIMESTAMP}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n=== REPORT SAVED: ${reportPath} ===`);

  // Summary
  console.log('\n=== SUMMARY ===');
  for (const r of results.regions) {
    const status = r.errors.length === 0 ? '✅' : '❌';
    console.log(`${status} ${r.name} (${r.lang}): beach="${r.checks.beachName}", verdict="${r.checks.verdict}", media=${r.checks.media?.photo}P/${r.checks.media?.video}V, why=${r.checks.whyProofs}, tmr=${r.checks.tomorrowDays}, bak=${r.checks.backupPresent}, prem=${r.checks.premiumPreview}, sticky=${r.checks.sticky}`);
  }

  if (results.defects.length > 0) {
    console.log('\n⚠️ DEFECTS FOUND:');
    for (const d of results.defects) {
      console.log(`  - ${d.region}: ${d.error}`);
    }
  } else {
    console.log('\n✅ NO DEFECTS DETECTED');
  }

  return results;
}

run().catch(console.error);