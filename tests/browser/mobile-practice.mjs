import assert from 'node:assert/strict';
export async function verifyMobilePractice(browser){
  const page=await browser.newPage({viewport:{width:360,height:780}}),requests=[];
  page.on('request',r=>requests.push(r.url()));
  try{
    await page.goto('http://127.0.0.1:1420/#/practice/demo');
    await page.locator('.practice-score svg').first().waitFor();
    assert.equal(await page.evaluate(()=>typeof window.__app),'undefined');
    assert(await page.locator('[data-testid="practice-start"]').isVisible());
    const firstSystem=await page.locator('.practice-score .staff-system').first().boundingBox();
    assert(firstSystem&&firstSystem.height>40&&firstSystem.y>=0&&firstSystem.y+firstSystem.height<710,'Actual first music system must be readable in the initial phone viewport');
    await page.screenshot({path:'out/browser/mobile-practice-portrait.png',fullPage:true});
    await page.locator('.practice-settings summary').click();
    assert.equal(await page.locator('.practice-roles button').count(),4);
    assert(await page.locator('#app').isHidden());
    assert(!requests.some(u=>/\/src\/(?:omr|staffomr)\/|\/editor\/(?:app|dialogs|parts)\.ts|\.onnx(?:\?|$)|onnxruntime/.test(u)),`Editor/OMR leaked into practice: ${requests.filter(u=>/omr|editor/.test(u)).join(',')}`);
    const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));assert(width.scroll<=width.view+1,'360px practice overflows the viewport');
    const names=await page.locator('.practice-score svg text').filter({hasText:/^[SATB]$/}).allTextContents();assert(names.length>0&&names.every(n=>n==='S'));
    await page.locator('.practice-roles [data-role="B"]').click();
    await page.locator('[data-testid="practice-microphone"]').uncheck();
    await page.locator('[data-testid="practice-to"]').selectOption('0');
    await page.locator('[data-testid="practice-speed"]').fill('3');await page.locator('[data-testid="practice-speed"]').press('Tab');
    await page.locator('[data-testid="practice-start"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="practice-state"]')?.dataset.state==='practicing');
    await page.locator('[data-testid="practice-pause"]').click();assert.equal(await page.locator('[data-testid="practice-state"]').getAttribute('data-state'),'paused');
    await page.locator('[data-testid="practice-start"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="practice-state"]')?.dataset.state==='count-in');
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.locator('[data-testid="practice-state"]').getAttribute('data-state'),'paused');
    await page.locator('[data-testid="practice-full-score"]').check();
    await page.waitForFunction(()=>{const systems=[...document.querySelectorAll('.practice-score .staff-system')];return systems.length>0&&systems.every(g=>[...g.querySelectorAll('text')].filter(e=>/^[SATB]$/.test(e.textContent)).length===4);});
    await page.locator('[data-testid="practice-full-score"]').uncheck();
    await page.locator('[data-testid="practice-zoom"]').fill('150');await page.locator('[data-testid="practice-zoom"]').dispatchEvent('change');
    await page.setViewportSize({width:780,height:360});await page.waitForTimeout(200);
    assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=781);
    await page.reload();await page.locator('.practice-score svg').first().waitFor();
    await page.screenshot({path:'out/browser/mobile-practice.png',fullPage:true});
    console.log('PASS:360px standalone selection/start/pause/background recovery, full-score/zoom/landscape/reload, no editor or OMR requests');
  }finally{await page.close();}
}
