import { test, expect } from '@playwright/test';

test.describe('Carte-Sargasses Dead Click Investigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('investigate carte-sargasses direct route', async ({ page }) => {
    await page.addInitScript(() => {
      window.deadClickTargets = [];
      window.rageClickTargets = [];
      window.lastClickPosition = null;

      document.addEventListener('click', (e) => {
        window.lastClickPosition = { x: e.clientX, y: e.clientY };
      }, true);

      const originalSend = window.send;
      window.send = function(event, data) {
        if ((event === 'clarity_dead_click' || event === 'clarity_rage_click') && window.lastClickPosition) {
          const el = document.elementFromPoint(window.lastClickPosition.x, window.lastClickPosition.y);
          if (el) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const className = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
            data.target = {
              tag: el.tagName.toLowerCase(),
              id: el.id,
              class: className,
              role: el.getAttribute('role'),
              testid: el.getAttribute('data-testid'),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              pointerEvents: style.pointerEvents,
              cursor: style.cursor,
              zIndex: style.zIndex,
              position: style.position,
              opacity: style.opacity,
              visibility: style.visibility,
              display: style.display,
              backgroundColor: style.backgroundColor,
              color: style.color
            };
          }
        }
        if (event === 'clarity_dead_click') {
          window.deadClickTargets.push(data);
        } else if (event === 'clarity_rage_click') {
          window.rageClickTargets.push(data);
        }
        if (originalSend) originalSend(event, data);
      };
    });

    await page.goto('/carte-sargasses/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check for map labels
    const labels = await page.$$('.sg-maplabel');
    console.log(`Map labels found: ${labels.length}`);

    // Get all elements on the page
    const allElements = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.width < 1000 && rect.height < 1000) {
          const style = window.getComputedStyle(el);
          const className = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
          results.push({
            tag: el.tagName.toLowerCase(),
            id: el.id,
            class: className,
            role: el.getAttribute('role'),
            testid: el.getAttribute('data-testid'),
            hasDataClick: el.hasAttribute('data-click'),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            pointerEvents: style.pointerEvents,
            cursor: style.cursor,
            zIndex: style.zIndex,
            position: style.position,
            opacity: style.opacity,
            visibility: style.visibility,
            display: style.display,
            backgroundColor: style.backgroundColor,
            color: style.color
          });
        }
      });
      return results;
    });

    console.log(`Total elements: ${allElements.length}`);

    // Find elements that look clickable but aren't interactive
    const suspicious = allElements.filter(el => {
      const looksClickable = el.cursor === 'pointer' || 
                             el.tag === 'button' || 
                             el.tag === 'a' || 
                             el.role === 'button' ||
                             el.class?.includes('btn') ||
                             el.class?.includes('cta') ||
                             el.class?.includes('card') ||
                             el.class?.includes('pin') ||
                             el.class?.includes('beach') ||
                             el.class?.includes('label') ||
                             el.class?.includes('marker');
      const isInteractive = el.tag === 'a' || el.tag === 'button' || el.tag === 'input' || 
                            el.role === 'button' || el.class?.includes('gbtn') || 
                            el.class?.includes('sg-click') || el.hasDataClick;
      return looksClickable && !isInteractive && el.rect.width >= 44 && el.rect.height >= 44;
    });

    console.log('\n=== SUSPICIOUS ELEMENTS ===');
    suspicious.slice(0, 30).forEach((el, i) => {
      console.log(`${i}: ${el.tag}${el.id ? '#'+el.id : ''}${el.class ? '.'+el.class.split(' ').join('.') : ''} at (${el.rect.x.toFixed(0)},${el.rect.y.toFixed(0)}) ${el.rect.width.toFixed(0)}x${el.rect.height.toFixed(0)} pe=${el.pointerEvents} cursor=${el.cursor} z=${el.zIndex}`);
    });

    // Also check the SVG map elements
    const svgElements = allElements.filter(el => el.tag === 'svg' || el.class?.includes('svg') || el.class?.includes('map') || el.class?.includes('world'));
    console.log('\n=== SVG/MAP ELEMENTS ===');
    svgElements.slice(0, 20).forEach((el, i) => {
      console.log(`${i}: ${el.tag}${el.id ? '#'+el.id : ''}${el.class ? '.'+el.class.split(' ').join('.') : ''} at (${el.rect.x.toFixed(0)},${el.rect.y.toFixed(0)}) ${el.rect.width.toFixed(0)}x${el.rect.height.toFixed(0)} pe=${el.pointerEvents} cursor=${el.cursor} z=${el.zIndex}`);
    });

    // Simulate taps on various map areas
    const tapPositions = [
      { x: 195, y: 150, desc: 'Top map area' },
      { x: 195, y: 300, desc: 'Upper map' },
      { x: 195, y: 422, desc: 'Center map' },
      { x: 195, y: 550, desc: 'Lower map' },
      { x: 195, y: 700, desc: 'Bottom map area' },
      { x: 50, y: 422, desc: 'Left map' },
      { x: 340, y: 422, desc: 'Right map' },
    ];

    for (const pos of tapPositions) {
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(500);
    }

    // Check captured clicks
    const clicks = await page.evaluate(() => ({
      dead: window.deadClickTargets,
      rage: window.rageClickTargets
    }));
    
    console.log('\n=== DEAD CLICKS CAPTURED ===');
    clicks.dead.forEach(d => console.log('  ', JSON.stringify(d.target || d, null, 2)));
    console.log('\n=== RAGE CLICKS CAPTURED ===');
    clicks.rage.forEach(r => console.log('  ', JSON.stringify(r.target || r, null, 2)));

    await page.screenshot({ path: 'screenshots/carte-sargasses-direct.png', fullPage: true });
  });
});