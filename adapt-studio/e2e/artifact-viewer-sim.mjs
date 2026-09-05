/**
 * Runs the artifact bundle under a SIMULATED claude.ai viewer runtime so the paths that only exist inside
 * the viewer get exercised: `claude.use("sample")` (text-only, like a viewer that cannot send images — or
 * with images when SIM_IMAGES=1), consent latency, `sample.json` answers, and `claude.use("downloads")`.
 * The fake Claude answers from simple rules over the prompt; the point is the page's plumbing, not the model.
 *
 *   npm run build:artifact && node e2e/artifact-viewer-sim.mjs        # text-only viewer
 *   SIM_IMAGES=1 node e2e/artifact-viewer-sim.mjs                      # viewer that can send images
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
const PORT = Number(process.env.SIM_PORT ?? 8796);
const WITH_IMAGES = process.env.SIM_IMAGES === '1';

const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(PORT, r));

// Injected before any page script: the shape the artifact contract promises (window.claude.use only).
const runtime = `
(() => {
  const calls = { sample: [], saves: [] };
  window.__sim = calls;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const WITH_IMAGES = ${WITH_IMAGES};

  // Rules standing in for Claude: classify by the text each block carries.
  function classify(prompt) {
    const out = {};
    const re = /^(T\\d+): at x (\\d+)% y (\\d+)% size (\\d+)%×(\\d+)%, (\\d+)px, (\\d+) line\\(s\\): (".*")$/gm;
    let m; const blocks = [];
    while ((m = re.exec(prompt))) blocks.push({ id: m[1], px: +m[6], text: JSON.parse(m[8]) });
    const maxPx = Math.max(...blocks.map((b) => b.px));
    for (const b of blocks) {
      const t = b.text;
      const type = /T&C|discretion/i.test(t) ? 'legal' : /^apply/i.test(t) ? 'cta' : /federal bank/i.test(t) ? 'logo' : b.px === maxPx ? 'headline' : 'body';
      out[b.id] = { type, desc: type + ' (simulated)', mustKeep: type !== 'body', droppable: type === 'body', shortForm: type === 'headline' ? t.split(/[.\\/]/)[0].trim() : '' };
    }
    const art = [...prompt.matchAll(/^(A\\d+): /gm)].map((x) => x[1]);
    art.forEach((id, i) => { out[id] = { type: i === 0 ? 'product' : 'decorative', desc: 'artwork (simulated)', mustKeep: false, droppable: i !== 0 }; });
    out.regulated = true; out.notes = 'simulated: protect the legal line';
    return out;
  }
  function visionModel() {
    return { elements: [
      { type: 'logo', desc: 'wordmark (simulated vision)', box: { x: 0.1, y: 0.1, w: 0.28, h: 0.07 }, mustKeep: true, droppable: false, minLegiblePx: 0, lines: 0, text: '', shortForm: '' },
      { type: 'headline', desc: 'headline (simulated vision)', box: { x: 0.1, y: 0.29, w: 0.6, h: 0.12 }, mustKeep: true, droppable: false, minLegiblePx: 24, lines: 2, text: 'Dreams don’t wait.\\nNeither should you.', shortForm: 'Dreams don’t wait.' },
      { type: 'cta', desc: 'button (simulated vision)', box: { x: 0.1, y: 0.555, w: 0.185, h: 0.062 }, mustKeep: true, droppable: false, minLegiblePx: 16, lines: 1, text: 'Apply now', shortForm: 'Apply' },
      { type: 'legal', desc: 'disclaimer (simulated vision)', box: { x: 0.1, y: 0.85, w: 0.58, h: 0.042 }, mustKeep: true, droppable: false, minLegiblePx: 18, lines: 1, text: 'Credit at sole discretion of the Bank. T&C apply.', shortForm: '' },
    ], background: { desc: 'flat blue (simulated)', extendable: true, extendDirections: ['left','right','top','bottom'], complexity: 'simple', color: '#004bbe' }, regulated: true, notes: 'simulated vision' };
  }

  const sample = async (input, opts) => { calls.sample.push({ input, hasImages: !!(opts && opts.images) }); await delay(300); return { text: 'ok', truncated: false, modelTierApplied: 'default' }; };
  sample.json = async (input, opts) => {
    calls.sample.push({ input, hasImages: !!(opts && opts.images), json: true });
    if (opts && opts.images && !WITH_IMAGES) throw { code: 'images_unavailable', message: 'sim: no images' };
    await delay(1200); // consent dialog + thinking
    return opts && opts.images ? visionModel() : classify(String(input));
  };
  sample.limits = async () => (WITH_IMAGES ? { maxPromptBytes: 65536, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ['image/jpeg','image/png'] } } : { maxPromptBytes: 65536 });

  const downloads = { save: async ({ filename, data }) => { calls.saves.push({ filename, size: data && (data.size ?? data.byteLength ?? String(data).length) }); return { status: 'saved' }; } };
  const memo = {};
  window.claude = { use: (name) => (memo[name] ??= (async () => { await delay(150); return name === 'sample' ? sample : name === 'downloads' ? downloads : null; })()) };
})();`;

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript(runtime);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.getByText('One master. Every format.').waitFor();
  await page.waitForTimeout(500);
  const banner = await page.getByRole('status').count();
  console.log(`viewer: ${WITH_IMAGES ? 'images allowed' : 'text only'} · banner shown: ${banner > 0}`);

  console.log('\n=== real PDF under the simulated viewer ===');
  await page.setInputFiles('input[type=file]', { name: 'FedOne_test_master.ai', mimeType: 'application/pdf', buffer: makeTestPdf() });
  await page.getByText('Choose an artboard').waitFor({ timeout: 60_000 });
  await page.locator('.artboard-tile').first().click();
  const outcome = await Promise.race([
    page.getByText('TAGGED OBJECT MODEL').waitFor({ timeout: 90_000 }).then(() => 'analysis'),
    page.getByRole('alert').waitFor({ timeout: 90_000 }).then(() => 'error'),
  ]);
  if (outcome === 'error') { console.log('ERROR on upload screen:', await page.getByRole('alert').innerText()); errors.push('analysis failed'); }
  else {
    console.log('source label:', await page.locator('.card-label').nth(1).innerText());
    console.log('note:', await page.locator('.master-card .note-amber').innerText().catch(() => '(none)'));
    const chips = await page.locator('.chip').evaluateAll((cs) => cs.map((c) => `${c.querySelector('.chip-select').value}: ${c.querySelector('.chip-desc').firstChild.textContent.trim()}`));
    console.log('elements:\n  ' + chips.join('\n  '));
    await page.screenshot({ path: path.join(outDir, `sim-${WITH_IMAGES ? 'images' : 'text'}-analysis.png`), fullPage: true });
    // correct one element type through the dropdown, then generate
    await page.locator('.chip-select').first().selectOption('logo');
    await page.getByRole('button', { name: /Choose sizes/ }).click();
    await page.getByRole('button', { name: /Generate adapts/ }).click();
    await page.getByRole('button', { name: /Download all/ }).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(300);
    console.log('summary:', await page.locator('.results-toolbar .subhead').innerText());
    const cards = await page.locator('.adapt-card').evaluateAll((cs) => cs.map((c) => `${c.querySelector('.adapt-name').textContent} [${c.querySelector('.badge').textContent}] ${c.querySelector('.status-pill').textContent} | ${[...c.querySelectorAll('.gate')].map((g) => (g.classList.contains('gate-pass') ? '✓' : '✕') + g.textContent.replace(/^[✓✕](passed|failed)/, '')).join(' ')} | ${c.querySelector('.adapt-summary')?.textContent ?? ''}`));
    for (const c of cards) console.log('  ' + c);
    await page.screenshot({ path: path.join(outDir, `sim-${WITH_IMAGES ? 'images' : 'text'}-results.png`), fullPage: true });
    const dl = page.locator('.adapt-card .btn-xs').first();
    if (await dl.count()) { await dl.click(); await page.waitForTimeout(500); }
    await page.getByRole('button', { name: /Download all/ }).click();
    await page.waitForTimeout(800);
  }
  const sim = await page.evaluate(() => window.__sim);
  console.log(`sample calls: ${sim.sample.length} (${sim.sample.map((c) => (c.hasImages ? 'image' : 'text') + (c.json ? '/json' : '')).join(', ')})`);
  console.log(`saves via downloads capability: ${sim.saves.map((s) => `${s.filename} ${s.size}B`).join(', ') || 'none'}`);
  if (!sim.saves.length && outcome === 'analysis') errors.push('no save went through the downloads capability');

  if (errors.length) { console.error('\nSIM ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('\nviewer simulation OK');
} finally {
  await browser?.close();
  server.close();
}
