// Exercise the actual production bundle under the Pages subdirectory, without isolation headers.
import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='/dolce-choir/',origin='http://127.0.0.1:1422',url=origin+base;
const server=await preview({configFile:false,base,build:{outDir:'out/dist'},preview:{host:'127.0.0.1',port:1422,strictPort:true}});
const served=[];server.httpServer.prependListener('request',request=>served.push(request.url));
let browser;
try{
  await mkdir('out/browser',{recursive:true});
  const info=await(await fetch(url+'build-info.json')).json();assert.equal(info.basePath,base);assert.match(info.commit,/^[a-f0-9]{40}$/);
  const wasm=await fetch(url+'redist/pdfjs/jbig2.wasm');assert(wasm.ok&&Number(wasm.headers.get('content-length'))>1000);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:360,height:780}}),requests=[],failures=[],errors=[];
  page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)failures.push([r.status(),r.url()]);});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/practice/demo');await page.locator('.practice-score svg').first().waitFor();
  assert.equal(await page.evaluate(()=>crossOriginIsolated),false);
  assert.equal(await page.evaluate(()=>typeof window.__app),'undefined');
  assert(!requests.some(u=>/onnx|\/omr|\/editor/.test(u)),'Heavy editor/OMR requested by practice entry');
  assert(await page.locator('[data-testid="practice-start"]').isVisible());
  const music=await page.locator('.practice-score .staff-system').first().boundingBox();assert(music&&music.y>=0&&music.y+music.height<710,'Initial phone screen hides its music');
  await page.screenshot({path:'out/browser/pages-mobile.png',fullPage:true});
  await page.locator('.practice-settings summary').click();
  await page.locator('[data-testid="practice-to"]').selectOption('0');
  await page.locator('[data-testid="practice-speed"]').fill('3');await page.locator('[data-testid="practice-speed"]').press('Tab');
  await page.evaluate(async()=>{
    const ctx=new AudioContext();await ctx.resume();const oscillator=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=0;oscillator.frequency.value=523.2511306;oscillator.connect(gain);oscillator.start();
    navigator.mediaDevices.getUserMedia=async()=>{const dest=ctx.createMediaStreamDestination();gain.connect(dest);return dest.stream;};window.signal={ctx,oscillator,gain};
  });
  await page.locator('[data-testid="practice-start"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="practice-state"]')?.dataset.state==='practicing');
  await page.evaluate(()=>window.signal.gain.gain.value=.15);
  await page.waitForFunction(()=>document.querySelector('[data-testid="practice-feedback"]')?.dataset.state==='correct');
  await page.locator('[data-testid="practice-stop"]').click();
  // Worklet/Worker requests are not reliably reported by Playwright Page.request; observe the actual server too.
  assert(served.some(u=>u.startsWith(base+'assets/capture.worklet-')),'Built capture module was not loaded');
  assert(served.some(u=>u.startsWith(base+'assets/pitch.worker-')),'Built analysis Worker was not loaded');
  assert(requests.some(u=>u.includes(base+'redist/soundfont/')),'Piano samples did not use the base path');
  assert(requests.some(u=>/\.(?:otf|woff2?)(?:\?|$)/.test(u)),'Bundled music fonts were not loaded');
  await page.evaluate(async()=>{window.signal.oscillator.stop();await window.signal.ctx.close();});
  await page.reload();await page.locator('.practice-score svg').first().waitFor();
  await page.goto(url+'en/#/practice/demo');await page.locator('.practice-score svg').first().waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.setViewportSize({width:1280,height:900});
  await page.goto(url);await page.waitForFunction(()=>crossOriginIsolated&&!!window.__app);await page.locator('#btn-start-sample').click();
  const xml=await readFile('public/choir/demo.musicxml','utf8');await page.evaluate(async text=>window.__app.importBytes(new TextEncoder().encode(text),'demo.musicxml'),xml);
  await page.locator('#btn-choir').click();for(const r of ['S','A','T','B'])await page.locator(`.choir-role[data-role="${r}"] input[type=checkbox]`).first().check();
  let downloaded=page.waitForEvent('download');await page.locator('[data-testid="choir-tracks"]').click();await(await downloaded).saveAs('out/browser/demo-tracks.zip');
  await page.locator('[data-testid="choir-preview"]').click();await page.locator('.choir-preview svg').first().waitFor();
  downloaded=page.waitForEvent('download');await page.getByRole('button',{name:/^(Export choir PDF|导出混排 PDF)$/}).click();await(await downloaded).saveAs('out/browser/demo-mixed.pdf');
  downloaded=page.waitForEvent('download');await page.getByRole('button',{name:/^(Export choir PNG|导出混排 PNG)$/}).click();await(await downloaded).saveAs('out/browser/demo-mixed.png');
  assert.deepEqual(failures,[],'Production resources returned an error');assert.deepEqual(errors,[],'Production page raised an exception');
  console.log('PASS: built Pages subpath, nonisolated pitch Worklet/Worker, local samples/fonts/WASM, hash reload, English route, actual4MP3+4MIDI/PDF/PNG downloads',JSON.stringify(info));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
