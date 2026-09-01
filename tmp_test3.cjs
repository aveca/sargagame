const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage();
  const reqs=[];
  p.on('request', r=> reqs.push('REQ '+r.url()));
  p.on('response', async r=> {
    try { const s=r.status(); if(r.url().includes('sargassum')||r.url().includes('beaches-list')||r.url().includes('region-outlines')) reqs.push('RES '+r.url()+' '+s); } catch {}
  });
  p.on('console', m=> console.log('CONSOLE', m.text()));
  p.on('pageerror', e=> console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:4173/',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(8000);
  const info=await p.evaluate(()=>{
    return {
      labels: document.querySelectorAll('.sg-maplabel').length,
      visible: [...document.querySelectorAll('.sg-maplabel')].filter(e=>getComputedStyle(e).visibility!=='hidden').length,
      hasSvg: !!document.querySelector('svg'),
      htmlLen: document.documentElement.innerHTML.length,
      bodyText: document.body.innerText.slice(0,500)
    };
  });
  console.log(info);
  console.log(reqs.slice(0,20).join('\n'));
  await b.close();
})()
