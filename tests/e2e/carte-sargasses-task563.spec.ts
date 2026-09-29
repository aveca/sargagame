import { test, expect } from '@playwright/test';

test.describe('Carte-Sargasses Dead Click Investigation (Task #563)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ArchipelView wrapper has data-sg-live="1" and background taps do not trigger clarity_dead_click', async ({ page }) => {
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
              hasDataSgLive: el.hasAttribute('data-sg-live'),
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

    // Verify ArchipelView wrapper has data-sg-live="1"
    const archipelWrapper = page.locator('[data-sg-live="1"]');
    await expect(archipelWrapper).toHaveCount(1);
    console.log('✓ ArchipelView wrapper has data-sg-live="1"');

    // Check for map labels (pins)
    const labels = await page.$$('.sg-maplabel');
    console.log(`Map labels (pins) found: ${labels.length}`);

    // Simulate taps on various map background areas (water/land without pins)
    const tapPositions = [
      { x: 195, y: 150, desc: 'Top map area (water)' },
      { x: 195, y: 300, desc: 'Upper map (water)' },
      { x: 195, y: 422, desc: 'Center map (water)' },
      { x: 195, y: 550, desc: 'Lower map (water)' },
      { x: 195, y: 700, desc: 'Bottom map area (water)' },
      { x: 50, y: 422, desc: 'Left map (water)' },
      { x: 340, y: 422, desc: 'Right map (water)' },
    ];

    for (const pos of tapPositions) {
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(300);
    }

    // Check captured clicks - should be ZERO dead/rage clicks on background
    const clicks = await page.evaluate(() => ({
      dead: window.deadClickTargets,
      rage: window.rageClickTargets
    }));
    
    console.log('\n=== DEAD CLICKS CAPTURED ===');
    clicks.dead.forEach(d => console.log('  ', JSON.stringify(d.target || d, null, 2)));
    console.log('\n=== RAGE CLICKS CAPTURED ===');
    clicks.rage.forEach(r => console.log('  ', JSON.stringify(r.target || r, null, 2)));

    // Assert: NO dead clicks from background taps (they should be intercepted by data-sg-live)
    expect(clicks.dead).toHaveLength(0);
    expect(clicks.rage).toHaveLength(0);
    console.log('✓ Zero clarity_dead_click / clarity_rage_click on background taps');

    // Verify beach pins still work - tap on a visible label
    if (labels.length > 0) {
      const firstLabel = labels[0];
      const box = await firstLabel.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
        await page.waitForTimeout(1000);
        
        // Check if beach sheet opened
        const sheetOpened = await page.$('.bsc-sheet, .lc-detail, .sheet, [data-testid="bx-experience"]');
        console.log(`✓ Beach pin tap opens sheet: ${!!sheetOpened}`);
        
        if (sheetOpened) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      }
    }

    await page.screenshot({ path: 'screenshots/carte-sargasses-task563.png', fullPage: true });
  });
});