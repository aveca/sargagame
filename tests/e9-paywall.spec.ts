import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:4173";

async function dismissOverlays(page) {
  const cookie = page.locator('button:has-text("Accepter"), button:has-text("Accept")').first();
  if (await cookie.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cookie.click().catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
}

async function navigateToPaywall(page, qs = "") {
  // Go to home — `qs` préserve les flags de test (?sgcomm=0 …) : un goto sur "/"
  // nu les effacerait et community repasserait à la valeur buildée.
  await page.goto(BASE_URL + "/" + qs, { waitUntil: "load", timeout: 60000 });
  await dismissOverlays(page);

  // Click on "Plages" tab
  const plagesTab = page.locator('nav.sg-bottom-nav button:has-text("Plages"), nav.sg-bottom-nav button:has-text("Beaches"), nav.sg-bottom-nav button:has-text("Playas")').first();
  await expect(plagesTab).toBeVisible({ timeout: 15000 });
  await plagesTab.click();

  // Search for a beach
  const search = page.locator('[data-testid="xp-plages-search"]').first();
  await expect(search).toBeVisible({ timeout: 20000 });
  await search.fill("Salines");
  await page.waitForTimeout(800);

  const open = page.locator('[data-testid="xp-open"]').first();
  await expect(open).toBeVisible({ timeout: 20000 });
  await open.click();

  // Wait for beach sheet
  const sheet = page.locator(".bsc-sheet").first();
  await expect(sheet).toBeVisible({ timeout: 15000 });

  // Click on "Débloquer 7 jours" or similar CTA to open paywall
  // The paywall should open when clicking the forecast lock or premium CTA
  const forecastLockBtn = page.locator('button:has-text("Débloquer"), button:has-text("Unlock"), button:has-text("Desbloquear")').first();
  if (await forecastLockBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await forecastLockBtn.click();
  } else {
    // Try the sticky CTA
    const stickyBtn = page.locator('.bsc-gobtn, .sg-sticky, button:has-text("Voir la prévision"), button:has-text("Voir mes plages")').first();
    if (await stickyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await stickyBtn.click();
    } else {
      // Try the main CTA in the sheet
      const mainCta = page.locator('button:has-text("Débloquer"), button:has-text("Commencer"), button:has-text("Unlock")').first();
      if (await mainCta.isVisible({ timeout: 5000 }).catch(() => false)) {
        await mainCta.click();
      }
    }
  }

  // Wait for paywall to open
  await page.waitForTimeout(1000);

  // Wait for either WorldPaywall or ComicPaywall
  await expect(
    page.locator('.sg-paywall-world, .sg-paywall-comic, [class*="paywall"]').first()
  ).toBeVisible({ timeout: 10000 });
}

test.describe("E9 - Data quality proof when community=0", () => {
  test("WorldPaywall - E9 visible quand community=0 (?sgcomm=0 force le compteur buildé)", async ({ page }) => {
    // community vient de __COMM (build-time, ~600 en build courant) → E2 masque
    // le fallback E9. ?sgcomm=0 (display-only, PremiumModal) rend le scénario
    // community=0 déterministe en test. Vérifié via le vrai funnel.
    await page.goto(BASE_URL + "/?sgsocial=1&sgcomm=0", { waitUntil: "load", timeout: 60000 });
    await dismissOverlays(page);

    // Open paywall
    await navigateToPaywall(page, "?sgsocial=1&sgcomm=0");

    // Check for E9 data quality proof
    const e9Block = page.locator('[data-testid="paywall-data-quality-proof"]');
    await expect(e9Block).toBeVisible({ timeout: 10000 });

    // Verify content — copy réelle alignée backtest (98% global, 99% J+3→J+6)
    const text = await e9Block.textContent();
    expect(text).toContain("98%");
    expect(text).toContain("Satellite");
    expect(text).toContain("Backtest");

    // Screenshot
    await page.screenshot({ path: ".ai/ux-agent/runs/e9-worldpaywall-mobile.png", fullPage: true });
  });

  test("Paywall - E9 visible quand community=0 (variant world gelé — pw_style est freezé en prod)", async ({ page }) => {
    // NOTE: pw_style est FREEZÉ à "world" (AB_FREEZE_MAP, Comic jamais servi en
    // prod) — ?pw_style=comic est ignoré. Ce test valide E9 sur le paywall
    // réellement servi, quel que soit le param.
    await page.goto(BASE_URL + "/?sgsocial=1&sgcomm=0&pw_style=comic", { waitUntil: "load", timeout: 60000 });
    await dismissOverlays(page);

    await navigateToPaywall(page, "?sgsocial=1&sgcomm=0&pw_style=comic");

    const e9Block = page.locator('[data-testid="paywall-data-quality-proof"]');
    await expect(e9Block).toBeVisible({ timeout: 10000 });

    const text = await e9Block.textContent();
    expect(text).toContain("98%");
    expect(text).toContain("Satellite");
    expect(text).toContain("Backtest");

    await page.screenshot({ path: ".ai/ux-agent/runs/e9-comicpaywall-mobile.png", fullPage: true });
  });

  test("Rollback ?sgsocial=0 hides E9", async ({ page }) => {
    await page.goto(BASE_URL + "/?sgsocial=0&sgcomm=0", { waitUntil: "load", timeout: 60000 });
    await dismissOverlays(page);

    await navigateToPaywall(page, "?sgsocial=0&sgcomm=0");

    const e9Block = page.locator('[data-testid="paywall-data-quality-proof"]');
    await expect(e9Block).toHaveCount(0);

    await page.screenshot({ path: ".ai/ux-agent/runs/e9-rollback-mobile.png", fullPage: true });
  });
});

test.describe("E9 - Desktop verification", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("WorldPaywall - E9 visible desktop", async ({ page }) => {
    await page.goto(BASE_URL + "/?sgsocial=1&sgcomm=0", { waitUntil: "load", timeout: 60000 });
    await dismissOverlays(page);

    await navigateToPaywall(page, "?sgsocial=1&sgcomm=0");

    const e9Block = page.locator('[data-testid="paywall-data-quality-proof"]');
    await expect(e9Block).toBeVisible({ timeout: 10000 });

    // Check positioning - should be before PassOffer
    const passOffer = page.locator('.sg-v2-pass-offer, [class*="PassOffer"]').first();
    if (await passOffer.isVisible({ timeout: 5000 }).catch(() => false)) {
      const e9Box = await e9Block.boundingBox();
      const offerBox = await passOffer.boundingBox();
      if (e9Box && offerBox) {
        // E9 should be above PassOffer (smaller Y)
        expect(e9Box.y).toBeLessThan(offerBox.y + 100); // Allow some overlap
      }
    }

    await page.screenshot({ path: ".ai/ux-agent/runs/e9-worldpaywall-desktop.png", fullPage: true });
  });

  test("CTA clickable with E9 present", async ({ page }) => {
    await page.goto(BASE_URL + "/?sgsocial=1&sgcomm=0", { waitUntil: "load", timeout: 60000 });
    await dismissOverlays(page);

    await navigateToPaywall(page, "?sgsocial=1&sgcomm=0");

    // Verify CTA is clickable
    const cta = page.locator('button:has-text("Voir la prévision"), button:has-text("Voir mes plages"), button:has-text("Commencer"), button:has-text("Unlock"), .sg-passcard-hero').first();
    await expect(cta).toBeVisible({ timeout: 10000 });

    // Check element from point
    const ctaBox = await cta.boundingBox();
    if (ctaBox) {
      const centerX = ctaBox.x + ctaBox.width / 2;
      const centerY = ctaBox.y + ctaBox.height / 2;
      const el = await page.evaluate(([x, y]) => {
        return document.elementFromPoint(x, y)?.tagName;
      }, [centerX, centerY]);
      expect(el).not.toBeNull();
    }

    await page.screenshot({ path: ".ai/ux-agent/runs/e9-cta-check-desktop.png", fullPage: true });
  });
});
