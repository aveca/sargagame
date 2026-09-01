import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const domains = [
    '4d20cf24.sargagame.pages.dev',
    '0d9613d2.sargagame-gp.pages.dev',
    '12a36b09.sargagame-florida.pages.dev',
    '95e0b13c.sargagame-puntacana.pages.dev',
    '3c6d3ab9.sargagame-rivieramaya.pages.dev',
    'e119c181.sargagame-tulum.pages.dev'
  ];
  for (const domain of domains) {
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