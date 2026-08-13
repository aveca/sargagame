const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const iphone = devices['iPhone 12'];
  const ctx = await browser.newContext({ ...iphone });
  const page = await ctx.newPage();
  const errors = [];
  const logs = [];
  page.on('console', m => {
    logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', e => errors.push('PAGE_ERROR: ' + e.message.slice(0, 200)));

  // Intercept fetch /api/mollie.php pour voir ce qui part
  page.on('request', req => {
    if (req.url().includes('/api/mollie.php')) console.log('>> FETCH mollie.php:', req.method(), req.postData()?.slice(0, 200));
  });
  page.on('response', async res => {
    if (res.url().includes('/api/mollie.php')) {
      console.log('<< RESP mollie.php:', res.status());
      try { console.log('   body:', (await res.text()).slice(0, 300)); } catch (_) {}
    }
  });

  await page.goto('http://localhost:4173/?paywall=1', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);

  // 1. Clic bouton "Commencer maintenant" (ouvre overlay)
  const buyBtn = page.locator('button.sg-passcard-hero').first();
  await buyBtn.click({ timeout: 5000 }).catch(e => console.log('Click buy err:', e.message));
  await page.waitForTimeout(2500);

  // 2. Saisie email dans overlay
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.fill('test+onsite@example.com', { timeout: 5000 }).catch(e => console.log('Fill email err:', e.message));
  await page.waitForTimeout(500);

  // 3. Saisie carte dans les iframes Mollie (4 champs)
  // Mollie Components sont des iframes — on doit accéder aux frames via .frameLocator()
  console.log('--- Saisie carte ---');
  const frames = page.frames();
  console.log('Frames count:', frames.length);
  for (const f of frames) {
    console.log('  Frame URL:', f.url().slice(0, 100));
  }

  // Cardholder name (input text)
  try {
    const holderFrame = page.frameLocator('iframe[name*="cardHolder"], iframe[title*="cardHolder"], iframe').first();
    // Mollie utilise un title attr sur l'iframe
  } catch (_) {}

  // Méthode plus robuste : remplir via les iframes par title
  // Vas-y direct : remplir le 1er iframe input avec un dummy (va sûrement échouer card validation)
  // Mais surtout : juste REGARDER si doSubscribe est appelé quand on clique Payer

  // Print payReadyRef/état du bouton avant clic Payer
  console.log('--- État avant clic Payer ---');
  const payBtnState = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /^Payer|^Pay /.test(b.textContent));
    if (!btns.length) return { found: false };
    const b = btns[0];
    return {
      found: true,
      text: b.textContent.slice(0, 100),
      disabled: b.disabled,
      onClick: typeof b.onclick,
      rect: b.getBoundingClientRect()
    };
  });
  console.log('Bouton Payer:', JSON.stringify(payBtnState, null, 2));

  // 4. Clic "Payer" et observe
  console.log('--- Clic Payer ---');
  const payBtn = page.locator('button').filter({ hasText: /^Payer|^Pay\s/ }).first();
  const payBtnVisible = await payBtn.isVisible().catch(() => false);
  console.log('Pay button visible:', payBtnVisible);
  if (payBtnVisible) {
    await payBtn.click({ timeout: 5000 }).catch(e => console.log('Click pay err:', e.message));
    await page.waitForTimeout(3000);
    console.log('Après clic:');
    console.log('  payError visible:', await page.locator('[role="alert"]').count());
    console.log('  isPayBusy:', await page.locator('button').filter({ hasText: /Activation|Activating|Activando/i }).count());
  }

  console.log('--- Errors ---');
  console.log('All errors:', errors.slice(0, 15));
  console.log('All logs:', logs.slice(0, 25));

  await browser.close();
})();
