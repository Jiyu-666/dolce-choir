import assert from 'node:assert/strict';
export async function verifyTempoChoice(browser,xml){
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  try{
    await page.goto('http://127.0.0.1:1420/');await page.waitForFunction(()=>!!window.__app);await page.locator('#btn-start-sample').click();
    await page.evaluate(async text=>{
      await window.__app.importBytes(new TextEncoder().encode(text),'conflict.musicxml');
      window.__app.editScoreDoc(doc=>{doc.songs[0].parts[0].measures[0].directions=[{type:'sound',sound:{tempo:60}}];doc.songs[0].parts[1].measures[0].directions=[{type:'sound',sound:{tempo:120}}];});
    },xml);
    await page.locator('#btn-choir').click();for(const r of ['S','A','T','B'])await page.locator(`.choir-role[data-role="${r}"] input[type=checkbox]`).first().check();
    const issue=page.locator('[data-testid="choir-tempo-conflict"]');assert.equal(await issue.count(),1);
    assert(await page.locator('[data-testid="choir-package"]').isDisabled());assert(await issue.locator('button').isDisabled());
    const original=await page.evaluate(()=>window.__app.getText());
    await issue.locator('select').selectOption('0');await issue.locator('button').click();await issue.waitFor({state:'detached'});
    await page.waitForFunction(()=>!document.querySelector('.choir-role[data-role="A"] input[type=checkbox]')?.checked);
    assert(await page.locator('.choir-role[data-role="S"] input[type=checkbox]').first().isChecked());
    await page.locator('.choir-role[data-role="A"] input[type=checkbox]').first().check();assert(await page.locator('[data-testid="choir-package"]').isEnabled());
    await page.locator('.choir-box .modal-footer button').click();await page.locator('#score-pane').focus();await page.keyboard.press('ControlOrMeta+z');
    await page.waitForFunction(text=>window.__app.getText()===text,original);await page.locator('#btn-choir').click();await page.locator('[data-testid="choir-tempo-conflict"]').waitFor();assert.equal(await page.locator('[data-testid="choir-tempo-conflict"]').count(),1);
    console.log('PASS: explicit conflicting-tempo choice, source correction, affected-role invalidation and source undo');
  }finally{await page.close();}
}
