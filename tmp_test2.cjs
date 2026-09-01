const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage();
  const logs=[];
  p.on('console', m=> logs.push(m.text()));
  p.on('pageerror', e=> logs.push('PAGEERROR '+e.message));
  await p.goto('http://localhost:4173/',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(8000);
  const info=await p.evaluate(()=>{
    const mapLabels=document.querySelectorAll('.sg-maplabel').length;
    const svg=document.querySelector('svg');
    const hasWorld=!!document.querySelector('svg g');
    const htmlLen=document.documentElement.innerHTML.length;
    const beachListLen=(() => {
      try { return document.documentElement.innerHTML.includes('sg-maplabel') ? 'has' : 'no'; } catch { return 'err'; }
    })();
    return {mapLabels, hasWorld, htmlLen, url: window.location.href, userAgent: navigator.userAgent};
  });
  console.log(info);
  console.log('LOGS', logs.slice(0,20));
  const html=await p.content();
  require('fs').writeFileSync('tmp_smoke2.html', html.slice(0,5000));
  await b.close();
})()
