/* Vérif navigateur du VRAI composant BeachDive (bras A/B pw_beach_dive),
   servi depuis dist/ sur 8790. Deep-link /plages/<slug>/?beachdive=1. */
const { chromium } = require('playwright');
const ORIGIN='http://127.0.0.1:8790';

(async () => {
  const browser = await chromium.launch();
  const fails=[];

  async function open(path, island){
    const page=await browser.newPage({viewport:{width:412,height:880}});
    await page.addInitScript((isl)=>{
      sessionStorage.setItem('sg_hero_seen','1');
      try{localStorage.setItem('sg_map_intro_v1','1'); if(isl)localStorage.setItem('sg_island',isl);}catch(_){}
    }, island||null);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{const t=m.text();if(m.type()==='error'&&!t.includes('Warning:')&&!t.includes('gtag')&&!t.includes('404')&&!t.includes('Failed to load resource'))errors.push(t)});
    await page.goto(ORIGIN+path,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForTimeout(3500);
    return {page,errors};
  }
  // lit le contenu du shadow root du dialog BeachDive
  async function dive(page){
    return await page.evaluate(()=>{
      const host=document.querySelector('div[role="dialog"]');
      const sr=host&&host.shadowRoot; if(!sr)return null;
      const cs=getComputedStyle(host);
      return {
        scene:!!sr.querySelector('#scene'),
        beats:sr.querySelectorAll('.beatcopy').length,
        factors:sr.querySelectorAll('#factors .fct').length,
        fcdays:sr.querySelectorAll('#fcStrip .fcday').length,
        planb:sr.querySelectorAll('#planbRow .pbcard').length,
        nearby:sr.querySelectorAll('#nearbyHalos .nh').length,
        verdict:(sr.querySelector('#verdictVerbal')||{}).textContent||'',
        crumb:(sr.querySelector('#breadcrumb')||{}).textContent||'',
        h2s:(sr.querySelector('#h2sLvl')||{}).textContent||'',
        gp:cs.getPropertyValue('--gp').trim()
      };
    });
  }

  // 1. MQ clean (anse-caritan) — dive
  {
    const {page,errors}=await open('/plages/anse-caritan/?beachdive=1');
    const d=await dive(page);
    await page.screenshot({path:'scripts/ss-dive-mq-clean.png'});
    const ok=d&&d.scene&&d.beats===6&&d.factors===7&&d.fcdays>=1&&/MARTINIQUE/i.test(d.crumb);
    console.log(`[mq-clean] scene=${d&&d.scene} beats=${d&&d.beats} factors=${d&&d.factors} fcdays=${d&&d.fcdays} planb=${d&&d.planb} crumb="${d&&d.crumb}" verdict="${d&&d.verdict.replace(/\s+/g,' ').trim()}" h2s="${d&&d.h2s}" errors=${errors.length?errors[0]:0}`);
    if(!ok)fails.push('mq-clean: dive not fully mounted '+JSON.stringify(d));
    if(errors.length)fails.push('mq-clean errors: '+errors.slice(0,2).join(' | '));
    await page.close();
  }
  // 2. 2e plage MQ — verdict (1 des 3 réels) + H2S câblés, scène monte
  //    (NB saison calme : la donnée live peut rendre toutes les plages "clean" ;
  //     on valide le CÂBLAGE copy, pas un statut "avoid" qui n'existe pas aujourd'hui.)
  {
    const {page,errors}=await open('/plages/anse-trabaud/?beachdive=1');
    const d=await dive(page);
    await page.screenshot({path:'scripts/ss-dive-mq2.png'});
    const ok=d&&d.scene&&/BAIGNADE|SWIM|BAÑO|SE TIENT|HOLDS|AGUANTA|ÉVITE|SKIP|EVITA/i.test(d.verdict)&&/H₂S/i.test(d.h2s);
    console.log(`[mq-2] scene=${d&&d.scene} verdict="${d&&d.verdict.replace(/\s+/g,' ').trim()}" h2s="${d&&d.h2s}" nearby=${d&&d.nearby} errors=${errors.length?errors[0]:0}`);
    if(!ok)fails.push('mq-2: verdict/h2s wiring mismatch '+JSON.stringify(d));
    if(errors.length)fails.push('mq-2 errors: '+errors.slice(0,2).join(' | '));
    await page.close();
  }
  // 3. MQ control (beachdive=0) → BeachSheet, pas de shadow scene
  {
    const {page,errors}=await open('/plages/anse-caritan/?beachdive=0');
    const d=await dive(page);
    const sheet=await page.evaluate(()=>document.body.innerText.length>200);
    console.log(`[mq-control] dive_shadow=${d?'PRESENT(bad)':'absent(ok)'} bodyHasContent=${sheet} errors=${errors.length?errors[0]:0}`);
    if(d)fails.push('mq-control: BeachDive shadow present while beachdive=0 (should be BeachSheet)');
    await page.close();
  }
  // 4. GP dive (plage-de-saint-francois, island=gp) → region-aware "Guadeloupe"
  {
    const {page,errors}=await open('/plages/plage-de-saint-francois/?beachdive=1','gp');
    const d=await dive(page);
    await page.screenshot({path:'scripts/ss-dive-gp.png'});
    const ok=d&&d.scene&&/GUADELOUPE/i.test(d.crumb)&&!/MARTINIQUE/i.test(d.crumb);
    console.log(`[gp-dive] scene=${d&&d.scene} crumb="${d&&d.crumb}" beats=${d&&d.beats} errors=${errors.length?errors[0]:0}`);
    if(!ok)fails.push('gp-dive: region not GP-aware '+JSON.stringify(d&&d.crumb));
    if(errors.length)fails.push('gp-dive errors: '+errors.slice(0,2).join(' | '));
    await page.close();
  }
  // 5. Scroll → les beats avancent (--gp augmente)
  {
    const {page,errors}=await open('/plages/anse-caritan/?beachdive=1');
    const before=await page.evaluate(()=>getComputedStyle(document.querySelector('div[role="dialog"]')).getPropertyValue('--gp').trim());
    await page.evaluate(()=>{const h=document.querySelector('div[role="dialog"]');h.scrollTop=Math.round(h.scrollHeight*0.55);});
    await page.waitForTimeout(900);
    const after=await page.evaluate(()=>getComputedStyle(document.querySelector('div[role="dialog"]')).getPropertyValue('--gp').trim());
    await page.screenshot({path:'scripts/ss-dive-scroll.png'});
    const advanced=parseFloat(after)>parseFloat(before)+0.05;
    console.log(`[scroll] gp ${before}→${after} advanced=${advanced} errors=${errors.length?errors[0]:0}`);
    if(!advanced)fails.push('scroll: --gp did not advance on host scroll (beats stuck)');
    await page.close();
  }

  await browser.close();
  if(fails.length){console.error('\nFAILURES:\n - '+fails.join('\n - '));process.exit(1);}
  console.log('\nALL BEACH-DIVE TESTS PASSED');
})().catch(e=>{console.error(e);process.exit(1)});
