/**
 * Drives the built app through two flows in headless Chromium and screenshots every screen:
 *   1. the demo master (works with or without a vision provider — without one it uses the precomputed model);
 *   2. a real two-artboard PDF generated on the fly (artboard picker, pdf.js text extraction, and — when a
 *      provider is configured — the live vision pass all the way to exported adapts).
 *
 *   npm run build && npm run e2e
 * Set E2E_OFFLINE=1 to strip credentials and force the offline paths.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { makeTestPdf } from './make-test-pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(here, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });
const PORT = Number(process.env.E2E_PORT ?? 8790);
const base = `http://localhost:${PORT}`;
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name), fullPage: true });

async function waitForServer(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start at ${url}`);
}

const env = { ...process.env, NODE_ENV: 'production', PORT: String(PORT) };
if (process.env.E2E_OFFLINE) {
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS', 'VERTEX_PROJECT_ID', 'CLAUDE_PROVIDER']) delete env[k];
  env.DOTENV_CONFIG_PATH = '/dev/null';
}
const server = spawn(process.execPath, ['dist-server/index.js'], { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] });

/** Reads the result cards off the results screen. */
async function readResults(page) {
  const summary = await page.locator('.results-toolbar .subhead').innerText();
  const cards = await page.locator('.adapt-card').evaluateAll((cs) => cs.map((c) => ({
    name: c.querySelector('.adapt-name').textContent,
    dims: c.querySelector('.adapt-title-row .mono').textContent,
    badge: c.querySelector('.badge').textContent,
    status: c.querySelector('.status-pill').textContent,
    gates: [...c.querySelectorAll('.gate')].map((g) => (g.classList.contains('gate-pass') ? '✓' : '✕') + g.textContent.replace(/^[✓✕](passed|failed)/, '')),
    escalation: c.querySelector('.note-amber')?.textContent ?? '',
    summary: c.querySelector('.adapt-summary')?.textContent ?? '',
    download: c.querySelector('.btn-xs')?.textContent ?? '',
  })));
  console.log('summary:', summary);
  for (const c of cards) console.log(`  ${c.name} ${c.dims} [${c.badge}] ${c.status} | ${c.gates.join(' ')} | ${c.download}${c.escalation ? '\n     ' + c.escalation : ''}\n     ${c.summary}`);
  return { summary, cards };
}

/** From the analysis screen: choose sizes, generate, read results, exercise overlay + modal + download. */
async function runToResults(page, prefix) {
  await page.locator('.chip').first().hover();
  await shot(page, `${prefix}-analysis.png`);
  const chips = await page.locator('.chip').evaluateAll((cs) => cs.map((c) => `${c.querySelector('.chip-select').value}: ${c.querySelector('.chip-sub')?.textContent ?? '(no text)'}`));
  console.log('elements:\n  ' + chips.join('\n  '));
  const note = await page.locator('.master-card .note-amber').innerText().catch(() => '');
  if (note) console.log('analysis note:', note);

  await page.getByRole('button', { name: /Choose sizes/ }).click();
  await page.getByText('Target sizes').waitFor();
  const badges = await page.locator('.tile').evaluateAll((tiles) => tiles.map((t) => `${t.querySelector('.tile-name').textContent} ${t.querySelector('.badge').textContent} ${t.querySelector('.tile-delta').textContent}`));
  console.log('tiles:\n  ' + badges.join('\n  '));
  await shot(page, `${prefix}-sizes.png`);

  await page.getByRole('button', { name: /Generate adapts/ }).click();
  await page.getByText('Generating adapts').waitFor();
  await page.waitForTimeout(600);
  await shot(page, `${prefix}-generating.png`);
  await page.getByRole('button', { name: /Download all/ }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(300);
  await shot(page, `${prefix}-results.png`);
  const results = await readResults(page);

  await page.getByRole('switch').click();
  await page.waitForTimeout(200);
  await shot(page, `${prefix}-results-overlay.png`);
  await page.getByRole('switch').click();

  const zoomable = page.locator('.adapt-field.is-zoomable');
  if (await zoomable.count()) {
    await zoomable.first().click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(200);
    await shot(page, `${prefix}-zoom-modal.png`);
    await page.keyboard.press('Escape');
  }

  const dlBtn = page.locator('.adapt-card .btn-xs').first();
  if (await dlBtn.count()) {
    const [download] = await Promise.all([page.waitForEvent('download'), dlBtn.click()]);
    const dlPath = path.join(outDir, `${prefix}-${download.suggestedFilename()}`);
    await download.saveAs(dlPath);
    console.log('downloaded:', download.suggestedFilename(), fs.statSync(dlPath).size, 'bytes');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all/ }).click()]);
    const zipPath = path.join(outDir, `${prefix}-${zip.suggestedFilename()}`);
    await zip.saveAs(zipPath);
    console.log('zip:', zip.suggestedFilename(), fs.statSync(zipPath).size, 'bytes');
  } else {
    console.log('no downloadable adapt in this run');
  }

  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByText('One master. Every format.').waitFor();
  return { ...results, note, chips };
}

let browser;
const report = {};
try {
  await waitForServer(`${base}/api/health`);
  const health = await (await fetch(`${base}/api/health`)).json();
  console.log('health:', JSON.stringify(health));
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Uncaught exceptions fail the run; failed network resources (fonts blocked, /api/analyze 503 without a key) are expected.
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text()); });

  await page.goto(base, { waitUntil: 'networkidle' });
  await shot(page, '01-upload.png');

  // Rejection path: wrong file type shows the inline red reason.
  await page.setInputFiles('input[type=file]', { name: 'poster.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('nope') });
  await page.getByRole('alert').waitFor();
  console.log('reject:', await page.getByRole('alert').innerText());

  // ---- Flow 1: demo master ----
  console.log('\n=== demo master ===');
  await page.getByRole('button', { name: /Use demo master/ }).click();
  await page.getByText('TAGGED OBJECT MODEL').waitFor({ timeout: 180_000 });
  report.demo = await runToResults(page, '02-demo');

  // ---- Flow 2: a real two-artboard PDF ----
  console.log('\n=== real PDF (2 artboards) ===');
  const pdf = makeTestPdf();
  fs.writeFileSync(path.join(outDir, 'test-master.pdf'), pdf);
  await page.setInputFiles('input[type=file]', { name: 'FedOne_test_master.ai', mimeType: 'application/pdf', buffer: pdf });
  await page.getByText('Choose an artboard').waitFor({ timeout: 60_000 });
  const boards = await page.locator('.artboard-tile').evaluateAll((ts) => ts.map((t) => `${t.querySelector('.tile-name').textContent} ${t.querySelector('.mono').textContent}`));
  console.log('artboards:\n  ' + boards.join('\n  '));
  await shot(page, '03-pdf-artboards.png');
  await page.locator('.artboard-tile').first().click();
  const outcome = await Promise.race([
    page.getByText('TAGGED OBJECT MODEL').waitFor({ timeout: 180_000 }).then(() => 'analysis'),
    page.getByRole('alert').waitFor({ timeout: 180_000 }).then(() => 'error'),
  ]);
  if (outcome === 'analysis') {
    report.pdf = await runToResults(page, '03-pdf');
  } else {
    const err = await page.getByRole('alert').innerText();
    console.log('real-file outcome (no vision provider):', err);
    await shot(page, '03-pdf-error.png');
    report.pdf = { error: err };
    if (!/vision service is not configured|Vision pass failed/.test(err)) errors.push('unexpected real-file error: ' + err);
  }

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ health, ...report }, null, 2));
  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('\ne2e OK — screenshots in', outDir);
} finally {
  await browser?.close();
  server.kill();
}
