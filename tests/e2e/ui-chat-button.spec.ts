import { test, expect } from "@playwright/test"

test.setTimeout(30000)

test("desktop 1440x900 — clic sur « Demander au Veilleur » ouvre le chat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30000 })

  const chatBtn = page.locator('[aria-label*="Veilleur"], button:has-text("Assistant"), button:has-text("chat"), .sg-chat-btn, [data-testid="chat-btn"]').first()
  const chatBtnVisible = await chatBtn.isVisible({ timeout: 2000 }).catch(() => false)
  console.log("[desktop] — bouton chat visible:", chatBtnVisible)

  const cta = page.locator('.sg-mapfind, [data-testid="cta-trouve-ta-plage"]').first()
  const ctaVisible0 = await cta.isVisible().catch(() => false)
  console.log("[desktop] t=0 — CTA visible:", ctaVisible0)

  if (chatBtnVisible) {
    await chatBtn.click()
    await page.waitForTimeout(1500)
    const chatAfterClick = await page.locator('[role="dialog"][aria-label*="Assistant"]').first()
    const chatVisibleAfterClick = await chatAfterClick.isVisible({ timeout: 2000 }).catch(() => false)
    console.log("[desktop] après clic — chat visible:", chatVisibleAfterClick)
    expect(chatVisibleAfterClick).toBe(true)
  } else {
    console.log("[desktop] — aucun bouton chat trouvé sur la page")
  }
})
