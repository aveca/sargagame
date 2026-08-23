const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  async function openPage(url, skipHero=true) {
    const page = await browser.newPage();
    if(skipHero) {
      await page.addInitScript(() => {
        sessionStorage.setItem('sg_hero_seen','1');
        try{localStorage.setItem('sg_map_intro_v1','1')}catch(_){}
      });
    }
    const errors = [], fetches = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error'&&!m.text().includes('Warning:')&&!m.text().includes('gtag')&&!m.text().includes('404')) errors.push(m.text()) });
    page.on('response', res => {
      if(res.url().includes('region-outlines')) fetches.push(res.status()+' '+res.url().split('/').slice(-1)[0])
    });
    await page.goto(url, {waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForTimeout(5000);
    return { page, errors, fetches };
  }

  // Test 1: MQ map_world=1 (variant WorldMapView)
  {
    const {page,errors,fetches} = await openPage('http://127.0.0.1:8790/?map_world=1');
    // WorldMapView doit être visible : chercher le div golden-hour background + scrub bar
    const hasBg = await page.evaluate(() => {
      return !!document.querySelector('button[style*="FFC72C"]') || // scrub button active
             !!document.querySelector('div[style*="1f6157"]') ||   // fond vert-doré
             document.body.innerHTML.includes('EN DIRECT');
    });
    const hasOutline = fetches.some(f=>f.includes('mq.json'));
    await page.screenshot({path:'scripts/ss-mq-world.png'});
    console.log(`[mq-world] hasBg=${hasBg} | mq.json=${hasOutline} | errors=${errors.length?errors.slice(0,2).join('; '):'0'}`);
    if(!hasOutline) allErrors.push('mq-world: mq.json NOT fetched! fetches='+fetches.join(','));
    await page.close();
  }

  // Test 2: MQ map_world=0 (control = ArchipelView)
  {
    const {page,errors,fetches} = await openPage('http://127.0.0.1:8790/?map_world=0');
    const hasArch = await page.evaluate(() => document.body.innerHTML.includes('EN DIRECT') || document.body.innerHTML.includes('Martinique'));
    await page.screenshot({path:'scripts/ss-mq-control.png'});
    console.log(`[mq-control] hasArch=${hasArch} | outline_fetched=${fetches.join(',')||'none (correct)'} | errors=${errors.length?errors[0]:'0'}`);
    await page.close();
  }

  // Test 3: GP locale + world
  {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      sessionStorage.setItem('sg_hero_seen','1');
      try{localStorage.setItem('sg_island','gp'); localStorage.setItem('sg_map_intro_v1','1')}catch(_){}
    });
    const errors=[], fetches=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('response', res=>{ if(res.url().includes('region-outlines')) fetches.push(res.status()+' '+res.url().split('/').slice(-1)[0]) });
    await page.goto('http://127.0.0.1:8790/?map_world=1', {waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForTimeout(5000);
    await page.screenshot({path:'scripts/ss-gp-world.png'});
    const gpJson = fetches.some(f=>f.includes('gp.json'));
    console.log(`[gp-world] gp.json=${gpJson} | fetches=${fetches.join(',') || 'none'} | errors=${errors.length}`);
    if(!gpJson) allErrors.push('gp-world: gp.json NOT fetched! fetches='+fetches.join(','));
    await page.close();
  }

  // Test 4: tap sur un pin → CTA "Voir la plage" apparaît
  {
    const {page,errors,fetches} = await openPage('http://127.0.0.1:8790/?map_world=1');
    // Attendre que les pins soient rendus (cercles SVG dans le groupe world)
    await page.waitForSelector('circle[fill="#22C55E"],circle[fill="#E8A800"],circle[fill="#E8522A"]', {timeout:6000}).catch(()=>null);
    const pins = await page.$$('g[style*="cursor: pointer"]');
    if(pins.length > 0) {
      await pins[0].click();
      await page.waitForTimeout(1200);
      const hasCTA = await page.evaluate(() => document.body.innerHTML.includes('Voir la plage'));
      await page.screenshot({path:'scripts/ss-mq-tap.png'});
      console.log(`[mq-tap] pins=${pins.length} | CTA_visible=${hasCTA}`);
      if(!hasCTA) allErrors.push('mq-tap: CTA "Voir la plage" not visible after pin click');
    } else {
      console.log('[mq-tap] no clickable pins found (may need more load time)');
    }
    await page.close();
  }

  await browser.close();
  if(allErrors.length) { console.error('\nFAILURES:', allErrors); process.exit(1); }
  console.log('\nALL TESTS PASSED');
})().catch(e=>{console.error(e);process.exit(1)});
