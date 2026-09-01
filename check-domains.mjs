import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  for (const domain of ['sargasses-martinique.com', 'sargazotulum.com']) {
    const page = await browser.newPage();
    await page.goto('https://' + domain, { waitUntil: 'networkidle' });
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    const bodyLen = bodyText.length;
    console.log(domain + ': title=' + title + ' bodyLen=' + bodyLen);
    await page.screenshot({ path: 'check-' + domain + '.png' });
    await page.close();
  }
  await browser.close();
})();