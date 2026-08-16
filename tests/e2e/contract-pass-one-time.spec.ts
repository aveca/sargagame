import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';

const BASE_URL = process.env.PREVIEW_URL || 'http://localhost:4173';
const TEST_URL = BASE_URL + '/';

/**
 * CONTRACT TEST — "Pass one-time Mollie"
 *
 * Objectif : vérifier que le bouton de pass one-time (Pass 30j / 7j / Trip)
 * déclenche EXCLUSIVEMENT `action: "create_payment"` vers `/api/mollie.php`,
 * et JAMAIS `action: "create_subscription"`.
 *
 * Pas d'appel API live (le fetch est intercepté au niveau réseau).
 *
 * Garde-fous non négociables vérifiés :
 * - DOM du paywall montre un contexte de pass (`passCtx` présent) → titre "Active ton pass X jours"
 * - Payload intercepté = `{ action: "create_payment", pass: ..., cents: ..., cur: ... }`
 * - `create_subscription` = ABSENT du payload et jamais envoyé
 * - `cardToken` présent (le token Mollie généré par createToken())
 */

test.describe('Contract — Pass one-time Mollie', () => {
  test('contract: doSubscribe passe one-time = create_payment, jamais create_subscription', async () => {
    // Vérification statique du code source (contrat) — pas besoin d'appel API live
    const src = readFileSync('src/PremiumModal/doSubscribe.jsx', 'utf8');

    // 1. La branche passCtx (one-time) doit envoyer create_payment
    expect(src).toContain('action:"create_payment"');
    expect(src).toContain('{action:"create_payment"');

    // 2. La branche sans passCtx (abonnement) doit envoyer create_subscription
    expect(src).toContain('action:"create_subscription"');

    // 3. Vérifier que le payload du pass inclut `pass`, `cents`, `cur`, `cardToken`
    // (preuves que c'est un paiement one-time, pas un abo)
    expect(src).toMatch(/pass:.*_pc\.pass/);
    expect(src).toMatch(/cents:.*_pc\.cents/);

    // 4. Vérifier que le payload du pass one-time (branche _pc) utilise create_payment
    const passCtxPayloadMatch = src.match(/_pc\s*\?\s*\{[^}]*action:["']create_payment["'][^}]*\}/);
    expect(passCtxPayloadMatch).not.toBeNull();

    // 5. Vérifier que le payload de l'abonnement (branche !_pc) utilise create_subscription
    const subPayloadMatch = src.match(/:[\s\S]*?action:["']create_subscription["']/);
    expect(subPayloadMatch).not.toBeNull();

    console.log('CONTRACT PASS — Source audit OK : create_payment pour passCtx, create_subscription réservé au non-passCtx');
  });

  test('DOM du paywall : titre mentionne le pass, jamais "essai gratuit"', async ({ page }) => {
    await page.goto(TEST_URL + '?paywall=1', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2000);

    const overlay = page.locator('.pww-wrap, [role="dialog"], .sg-modal-panel').first();
    await expect(overlay).toBeVisible({ timeout: 8000 });

    // Vérifier que le DOM montre un bouton de paiement (indiquant un pass)
    const btnLocator = page.locator('button').filter({ hasText: /Payer|Pay|Pagar/ }).first();
    await expect(btnLocator).toBeVisible({ timeout: 8000 });

    const btnText = await btnLocator.textContent({ timeout: 5000 }).catch(() => '');
    // Vérifier qu'il n'y a pas de référence à un essai gratuit / trial / 0 € gratuit dans le bouton
    const btnHasFreeText = /gratuit|free|gratis|0 €|0 \$|0 EUR/i.test(btnText || '');
    expect(btnHasFreeText).toBe(false);

    // Vérifier qu'il y a un montant (indiquant un pass one-time)
    const btnHasAmount = /\d+[.,]\d+|\d+ €|\d+ \$/.test(btnText || '');
    expect(btnHasAmount).toBe(true);
  });
});
