import { unzipSync } from 'fflate';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { verifyAudioExport } from './audio-export.mjs';
import { verifyChoirLayout } from './choir-layout.mjs';
import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: ['ignore','pipe','pipe'] });
server.stderr.on("data", data => console.error("VITE", String(data).slice(0,2000)));
let browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch('http://127.0.0.1:1420')).ok) break; } catch {}
    if (n > 100) throw new Error('Dev server did not become ready');
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => console.error(error));
  page.on("console", msg => { if (msg.type() === "error") console.error(msg.text()); });
  await page.goto('http://127.0.0.1:1420');
  await page.waitForFunction(() => !!window.__app);
  await page.locator("#btn-start-sample").click();
  const xml = await readFile(new URL('../choir/fixtures/satb.musicxml', import.meta.url), 'utf8');
  await page.evaluate(async text => {
    const app = window.__app;
    await app.importBytes(new TextEncoder().encode(text), 'satb.musicxml');
    await app.setViewMode('staff');
  }, xml);
  await page.locator('#score-pane svg').first().waitFor();
  const staff = await page.locator('#score-pane svg').count();
  assert(staff > 0, 'Staff view did not render');
  await page.evaluate(async () => { await window.__app.setViewMode('mixed'); });
  await page.locator('#score-pane svg').first().waitFor();
  assert(await page.locator('#score-pane svg text').count() > 0, 'Mixed view has no text');
  await page.locator('#btn-choir').click();
  await page.locator('.choir-role').first().waitFor();
  assert.equal(await page.locator('.choir-role').count(), 4);
  for (const role of ['S','A','T','B']) await page.locator(`.choir-role[data-role="${role}"] input[type=checkbox]`).first().check();
  assert.equal(await page.locator('[data-testid="choir-issues"]').count(),0);
  const tracksEvent = page.waitForEvent('download', {timeout:60000}); tracksEvent.catch(() => {});
  await page.locator('[data-testid="choir-tracks"]').click();
  const tracks = await tracksEvent; await mkdir('out/browser',{recursive:true}); await tracks.saveAs('out/browser/satb-tracks.zip');
  const files = unzipSync(new Uint8Array(await readFile(await tracks.path())));
  assert.equal(Object.keys(files).filter(n=>n.endsWith('.mp3')).length,4);
  assert.equal(Object.keys(files).filter(n=>n.endsWith('.mid')).length,4);
  for (const [i,role] of ['S','A','T','B'].entries()) {
    const mid = files[Object.keys(files).find(n=>n.includes(`－${role}`)&&n.endsWith('.mid'))];
    assert.equal((mid[10]<<8)|mid[11],2);
    const pitches = [...mid].flatMap((v,k)=>v===0x90 ? [mid[k+1]] : []);
    assert.deepEqual(pitches,[[72],[69],[64],[48]][i]);
  }
  await page.locator('[data-testid="choir-preview"]').click();
  await page.locator('.choir-preview svg').first().waitFor();
  assert.equal(await page.locator('.choir-preview svg text').filter({hasText:/^[SATB]$/}).count(), 4);
  await page.locator('input[data-layout="jianpuPt"]').fill('18');
  await page.locator('input[data-layout="jianpuPt"]').press('Tab');
  assert.equal(await page.locator('.choir-preview svg').count(), 0, 'Old preview survived layout edit');
  await page.locator('[data-testid="choir-preview"]').click(); await page.locator('.choir-preview svg').first().waitFor();
  await mkdir("out/browser", {recursive:true}); await page.locator(".choir-preview").screenshot({path:"out/browser/choir-four-parts.png"});
  const pdfEvent = page.waitForEvent('download', {timeout:60000}); pdfEvent.catch(() => {});
  await page.locator('.choir-panel button').filter({hasText:/^(导出混排 PDF|Export choir PDF)$/}).click();
  const pdf = await pdfEvent;
  assert((await readFile(await pdf.path())).subarray(0,5).equals(Buffer.from('%PDF-')));
  const pngEvent = page.waitForEvent('download');
  await page.locator('.choir-panel button').filter({hasText:/^(导出混排 PNG|Export choir PNG)$/}).click();
  const png = await pngEvent; await png.saveAs('out/browser/choir-page.png');
  assert((await readFile(await png.path())).subarray(1,4).equals(Buffer.from('PNG')));
  const name = page.locator('.choir-role[data-role="S"] input:not([type=checkbox])');
  await name.fill('Soprano test'); await name.press('Tab');
  const undo = page.locator('.choir-actions button').nth(0), redo = page.locator('.choir-actions button').nth(1);
  await undo.click(); assert.equal(await name.inputValue(), 'S');
  await redo.click(); assert.equal(await name.inputValue(), 'Soprano test');
  const downloadPromise = page.waitForEvent('download'); await page.locator('.choir-actions button').nth(3).click();
  const download = await downloadPromise; assert(download.suggestedFilename().endsWith('.dolcechoir'));
  await download.saveAs("out/browser/satb.dolcechoir");
  const projectPath = await download.path();
  await name.fill("Changed after save"); await name.press("Tab");
  await page.locator('.choir-actions input[type=file]').setInputFiles(projectPath);
  await page.waitForFunction(() => document.querySelector('.choir-role[data-role="S"] input:not([type=checkbox])')?.value === 'Soprano test');
  await page.waitForFunction(() => document.querySelector('.choir-panel [role=status]')?.textContent?.includes('saved') || document.querySelector('.choir-panel [role=status]')?.textContent?.includes('保存在本机'));
  await page.reload(); await page.waitForFunction(() => !!window.__app);
  await page.locator('#btn-start-sample').click(); await page.locator('#btn-choir').click();
  await page.locator('[data-testid="choir-restore-draft"]').click();
  await page.waitForFunction(() => document.querySelector('.choir-role[data-role="S"] input:not([type=checkbox])')?.value === 'Soprano test');
  await page.evaluate(() => window.__app.replaceText(window.__app.getText().replace('<octave>5</octave>','<octave>6</octave>')));
  await page.waitForFunction(() => { const box=document.querySelector('.choir-role[data-role="S"] input[type=checkbox]'); return box && !box.checked; });
  for (const role of ['A','T','B']) assert(await page.locator(`.choir-role[data-role="${role}"] input[type=checkbox]`).first().isChecked());
  await verifyChoirLayout(page);
  await verifyAudioExport(page);
  await mkdir('out/browser', {recursive:true}); await page.screenshot({path:'out/browser/choir-setup.png',fullPage:true});
  console.log('PASS: staff/mixed baseline + SATB setup/confirmation/undo/redo/project roundtrip/draft recovery/source invalidation');
} finally {
  await browser?.close(); server.kill();
}
