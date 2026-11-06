import assert from 'node:assert/strict';

export async function verifyComparisonUI(browser,xml) {
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  try{
    await page.goto('http://127.0.0.1:1420/');await page.waitForFunction(()=>!!window.__app);await page.locator('#btn-start-sample').click();
    await page.evaluate(async text=>{
      const ctx=new AudioContext();await ctx.resume();const oscillator=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=0;oscillator.connect(gain);oscillator.start();
      const destinations=[];
      navigator.mediaDevices.getUserMedia=async()=>{const destination=ctx.createMediaStreamDestination();gain.connect(destination);destinations.push(destination);return destination.stream;};
      window.__choirSignal={ctx,oscillator,gain,destinations};
      await window.__app.importBytes(new TextEncoder().encode(text),'comparison.musicxml');
    },xml);
    await page.locator('#btn-choir').click();for(const role of ['S','A','T','B'])await page.locator(`.choir-role[data-role="${role}"] input[type=checkbox]`).first().check();
    await page.locator('[data-testid="choir-practice"]').click();await page.locator('.practice-score svg').first().waitFor();
  await page.locator('.practice-settings summary').click();
    await page.locator('[data-testid="practice-speed"]').fill('3');await page.locator('[data-testid="practice-speed"]').press('Tab');
    const state=()=>page.waitForFunction(()=>document.querySelector('[data-testid="practice-state"]')?.dataset.state==='practicing');
    async function attempt(frequency,sparse=false){
      await page.evaluate(f=>{const s=window.__choirSignal;s.gain.gain.value=0;s.oscillator.frequency.value=f;},frequency);
      await page.locator('[data-testid="practice-start"]').click();await state();
      if(sparse)await page.waitForTimeout(650);
      await page.evaluate(()=>window.__choirSignal.gain.gain.value=.15);
      if(!sparse)await page.waitForFunction(()=>['correct','octave-high'].includes(document.querySelector('[data-testid="practice-feedback"]')?.dataset.state));
      const live=await page.locator('[data-testid="practice-feedback"]').getAttribute('data-state');
      await page.waitForFunction(()=>document.querySelector('[data-testid="practice-state"]')?.dataset.state==='completed');
      await page.evaluate(()=>window.__choirSignal.gain.gain.value=0);
      return {live,text:await page.locator('[data-testid="practice-summary"]').innerText()};
    }
    const high=await attempt(1046.502261);assert.equal(high.live,'octave-high');assert.match(high.text,/0%/);
    const correct=await attempt(523.2511306);assert.equal(correct.live,'correct');assert.match(correct.text,/100%/);
    const sparse=await attempt(523.2511306,true);assert.match(sparse.text,/below50%|不足 50%/);
    // Source edits close the snapshot and terminate its microphone/player resources.
    await page.evaluate(()=>window.__app.replaceText(window.__app.getText().replace('<octave>5</octave>','<octave>6</octave>')));
    await page.waitForFunction(()=>!document.querySelector('.practice-view'));
    console.log('PASS: actual synthetic mic→pitch→comparison UI, octave error/correct/sparse coverage and source invalidation',JSON.stringify({high,correct,sparse}));
  }finally{
    await page.evaluate(async()=>{const s=window.__choirSignal;if(s){s.oscillator.stop();s.gain.disconnect();for(const d of s.destinations)for(const t of d.stream.getTracks())t.stop();await s.ctx.close();}}).catch(()=>{});
    await page.close();
  }
}
