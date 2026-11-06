import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'ignore' });
let browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch('http://127.0.0.1:1420')).ok) break; } catch {}
    if (n > 100) throw new Error('Dev server did not become ready');
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:1420');
  await page.waitForFunction(() => !!window.__app);
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
  console.log('PASS: original staff and single-part mixed browser baseline');
} finally {
  await browser?.close(); server.kill();
}
