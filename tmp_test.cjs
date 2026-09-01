const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage();
  await p.goto('http://localhost:4173/',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(7000);
  const c=await p.evaluate(()=>document.documentElement.innerHTML.length);
  const l=await p.evaluate(()=>document.querySelectorAll('.sg-maplabel').length);
  const vis=await p.evaluate(()=>[...document.querySelectorAll('.sg-maplabel')].filter(e=>getComputedStyle(e).visibility!=='hidden').length);
  const html=await p.content();
  require('fs').writeFileSync('tmp_smoke.html',html);
  console.log('innerHTML',c,'labels',l,'visible',vis);
  console.log(html.slice(0,1000));
  await b.close();
})()
