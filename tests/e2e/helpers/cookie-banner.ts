import type { Page } from "@playwright/test"

/**
 * Referme le bandeau cookies s'il est présent.
 *
 * Sans cela, le bandeau (non bloquant mais superposé) peut intercepter le
 * clic sur les boutons du bas de l'écran → Playwright attend que l'élément
 * soit « stable » et le clic expire en timeout. Correctif déjà appliqué dans
 * `tests/e2e/paywall-e2e.spec.ts`, désormais partagé.
 */
export async function dismissCookieBanner(page: Page) {
  const btn = page
    .locator(".sg-cookie-banner button")
    .filter({ hasText: /Refuser|Decline|Rechazar/ })
    .first()
  if (await btn.count()) await btn.click().catch(() => {})
}
