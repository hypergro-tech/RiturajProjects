/**
 * Drives the built app through the demo flow in headless Chromium and screenshots every screen.
 * Runs against the production server with NO API key, so the demo master takes the precomputed-model
 * fallback — this proves the whole pipeline (ingest → route → execute → gates → export) works offline.
 *
 *   npm run build && npm run e2e
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
delete env.ANTHROPIC_API_KEY;
delete env.ANTHROPIC_AUTH_TOKEN;
const server = spawn(process.execPath, ['dist-server/index.js'], { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] });

let browser;
try {
  await waitForServer(`${base}/api/health`);
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

  await page.getByRole('button', { name: /Use demo master/ }).click();
  await page.getByText('TAGGED OBJECT MODEL').waitFor({ timeout: 60_000 });
  await page.locator('.chip').first().hover();
  await shot(page, '02-analysis.png');
  const note = await page.locator('.master-card .note-amber').innerText().catch(() => '');
  console.log('analysis note:', note);

  await page.getByRole('button', { name: /Choose sizes/ }).click();
  await page.getByText('Target sizes').waitFor();
  const badges = await page.locator('.tile').evaluateAll((tiles) => tiles.map((t) => `${t.querySelector('.tile-name').textContent} ${t.querySelector('.badge').textContent} ${t.querySelector('.tile-delta').textContent}`));
  console.log('tiles:\n  ' + badges.join('\n  '));
  await shot(page, '03-sizes.png');

  await page.getByRole('button', { name: /Generate adapts/ }).click();
  await page.getByText('Generating adapts').waitFor();
  await page.waitForTimeout(600);
  await shot(page, '04-generating.png');
  await page.getByRole('button', { name: 'Download all' }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(300);
  await shot(page, '05-results.png');

  const summary = await page.locator('.results-toolbar .subhead').innerText();
  console.log('summary:', summary);
  const cards = await page.locator('.adapt-card').evaluateAll((cs) => cs.map((c) => ({
    name: c.querySelector('.adapt-name').textContent,
    dims: c.querySelector('.adapt-title-row .mono').textContent,
    badge: c.querySelector('.badge').textContent,
    status: c.querySelector('.status-pill').textContent,
    gates: [...c.querySelectorAll('.gate')].map((g) => (g.classList.contains('gate-pass') ? '✓' : '✕') + g.textContent.replace(/^[✓✕](passed|failed)/, '')),
    escalation: c.querySelector('.note-amber')?.textContent ?? '',
    download: c.querySelector('.btn-xs')?.textContent ?? '',
  })));
  for (const c of cards) console.log(`  ${c.name} ${c.dims} [${c.badge}] ${c.status} | ${c.gates.join(' ')} | ${c.download}${c.escalation ? '\n     ' + c.escalation : ''}`);

  await page.getByRole('switch').click();
  await page.waitForTimeout(200);
  await shot(page, '06-results-overlay.png');

  await page.locator('.adapt-field.is-zoomable').first().click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(200);
  await shot(page, '07-zoom-modal.png');
  await page.keyboard.press('Escape');

  // Download button hands back a real file.
  const dlBtn = page.locator('.adapt-card .btn-xs').first();
  if (await dlBtn.count()) {
    const [download] = await Promise.all([page.waitForEvent('download'), dlBtn.click()]);
    const dlPath = path.join(outDir, download.suggestedFilename());
    await download.saveAs(dlPath);
    console.log('downloaded:', download.suggestedFilename(), fs.statSync(dlPath).size, 'bytes');
  } else {
    console.log('no downloadable adapt in this run');
  }

  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByText('One master. Every format.').waitFor();

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ summary, cards, note }, null, 2));
  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('e2e OK — screenshots in', outDir);
} finally {
  await browser?.close();
  server.kill();
}
