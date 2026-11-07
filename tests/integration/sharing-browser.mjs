import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function verifyLiveSharing(env,session){
  const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:env.API_URL,VITE_SUPABASE_ANON_KEY:env.ANON_KEY??env.PUBLISHABLE_KEY}});let browser;
  try{
    for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:1420')).ok)break;}catch{}if(i>100)throw new Error('Vite did not start');await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(15000);
    await page.goto('http://127.0.0.1:1420/');await page.waitForFunction(()=>!!window.__app);await page.locator('#btn-start-sample').click();
    const xml=await readFile('public/choir/demo.musicxml','utf8');
    await page.evaluate(async({xml,session})=>{const{sharingAuth}=await import('/src/choir/share-client.ts');const result=await sharingAuth().auth.setSession(session);if(result.error)throw new Error('Session fixture unavailable');await window.__app.importBytes(new TextEncoder().encode(xml),'demo.musicxml');},{xml,session});
    await page.locator('#btn-choir').click();for(const r of ['S','A','T','B'])await page.locator(`.choir-role[data-role="${r}"] input[type=checkbox]`).first().check();
    await page.locator('[data-testid="choir-sharing"]').click();await page.locator('[data-testid="share-publish"]').click();
    const publisher=page.locator('[data-testid="share-publisher"]');await publisher.locator('input[readonly]').waitFor();const link=await publisher.locator('input[readonly]').inputValue();
    assert(link.includes('#/practice/'));assert.equal(await publisher.locator('canvas').count(),1);
    const viewer=await browser.newPage({viewport:{width:360,height:780}}),requests=[];viewer.on('request',r=>requests.push(r.url()));
    await viewer.goto(link);await viewer.locator('.practice-score svg').first().waitFor();assert.equal(await viewer.evaluate(()=>typeof window.__app),'undefined');
    const token=link.split('#/practice/')[1];assert(!requests.some(u=>u.includes(token)),'Capability appeared in a network URL');
    await viewer.locator('.practice-roles [data-role="B"]').click();await viewer.locator('.practice-settings summary').click();await viewer.locator('[data-testid="practice-microphone"]').uncheck();
    await viewer.locator('[data-testid="practice-to"]').selectOption('0');await viewer.locator('[data-testid="practice-speed"]').fill('3');await viewer.locator('[data-testid="practice-speed"]').press('Tab');
    await viewer.locator('[data-testid="practice-start"]').click();await viewer.waitForFunction(()=>document.querySelector('[data-testid="practice-state"]')?.dataset.state==='practicing');
    await viewer.locator('[data-testid="practice-pause"]').click();
    await publisher.locator('[data-share-id]').first().waitFor();
    await publisher.locator('[data-share-id]').first().getByRole('button',{name:/^(Revoke link|撤销链接)$/}).click();
    await publisher.locator('input[readonly]').waitFor({state:'detached'});
    await viewer.reload();await viewer.waitForFunction(()=>document.querySelector('.practice-landing [role=status]')?.textContent?.match(/Invalid|无效/));assert.equal(await viewer.locator('.practice-view').count(),0);
    console.log('PASS: live local publisher→QR/link→anonymous360px reader/practice→owner revocation→reload denied; no token in request URLs');
  }finally{await browser?.close();server.kill();}
}
