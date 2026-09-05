/**
 * Boots the single-file artifact build (dist-artifact/index.html) in headless Chromium with NO viewer
 * runtime (no window.claude), so the vision pass reports "viewer only" and the demo master falls back to
 * its built-in model. Proves: the inlined bundle boots, previews render from data URLs, pdf.js parses a
 * real PDF in-process with inlined standard fonts (artboard picker), and the no-runtime error path reads right.
 *
 *   npm run build:artifact && node e2e/artifact-smoke.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { makeTestPdf } from './make-test-pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(here, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });
const html = fs.readFileSync(path.join(root, 'dist-artifact/index.html'));
const PORT = Number(process.env.SMOKE_PORT ?? 8795);

const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(PORT, r));

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(`http://localhost:${PORT}`) && !/fonts\.g(oogleapis|static)\.com/.test(r.url())) errors.push('unexpected network request: ' + r.url()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.getByText('One master. Every format.').waitFor();
  await page.getByRole('status').waitFor({ timeout: 15_000 });
  console.log('banner:', await page.getByRole('status').innerText());
  await page.screenshot({ path: path.join(outDir, 'artifact-01-upload.png'), fullPage: true });

  console.log('\n=== demo master (artifact build, no viewer runtime) ===');
  await page.getByRole('button', { name: /Use demo master/ }).click();
  await page.getByText('TAGGED OBJECT MODEL').waitFor({ timeout: 60_000 });
  console.log('note:', await page.locator('.master-card .note-amber').innerText().catch(() => '(none)'));
  await page.getByRole('button', { name: /Choose sizes/ }).click();
  await page.getByRole('button', { name: /Generate adapts/ }).click();
  await page.getByRole('button', { name: /Download all/ }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(300);
  console.log('summary:', await page.locator('.results-toolbar .subhead').innerText());
  const previews = await page.locator('.pv-inner img').evaluateAll((imgs) => imgs.map((i) => `${i.naturalWidth}x${i.naturalHeight} ${i.src.slice(0, 15)}`));
  console.log('previews:', previews.join(' | '));
  if (previews.some((p) => p.startsWith('0x0'))) errors.push('a preview image did not decode');
  await page.screenshot({ path: path.join(outDir, 'artifact-02-results.png'), fullPage: true });
  await page.getByRole('button', { name: 'Start over' }).click();

  console.log('\n=== real PDF: in-process pdf.js + inlined standard fonts ===');
  await page.setInputFiles('input[type=file]', { name: 'FedOne_test_master.ai', mimeType: 'application/pdf', buffer: makeTestPdf() });
  await page.getByText('Choose an artboard').waitFor({ timeout: 60_000 });
  const boards = await page.locator('.artboard-tile').evaluateAll((ts) => ts.map((t) => `${t.querySelector('.tile-name').textContent} ${t.querySelector('.mono').textContent}`));
  console.log('artboards:', boards.join(' | '));
  await page.screenshot({ path: path.join(outDir, 'artifact-03-artboards.png'), fullPage: true });
  await page.locator('.artboard-tile').first().click();
  await page.getByRole('alert').waitFor({ timeout: 60_000 });
  const err = await page.getByRole('alert').innerText();
  console.log('real-file outcome:', err);
  if (!/claude\.ai viewer/.test(err)) errors.push('unexpected real-file error: ' + err);

  if (errors.length) { console.error('\nARTIFACT SMOKE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('\nartifact smoke OK');
} finally {
  await browser?.close();
  server.close();
}
