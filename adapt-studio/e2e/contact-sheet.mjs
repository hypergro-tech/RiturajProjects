import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
/**
 * Contact sheet of every PNG in a folder (e.g. an unzipped "Download all" ZIP), largest last, for design review.
 *   node e2e/contact-sheet.mjs <folder> <out.png> "<title>"
 */
const [,, dir, out, title = "Adapts"] = process.argv;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort((a, b) => {
  const d = (f) => { const m = /_(\d+)x(\d+)\.png$/.exec(f); return m ? [+m[1], +m[2]] : [0, 0]; };
  const [aw, ah] = d(a), [bw, bh] = d(b); return aw * ah - bw * bh;
});
const tiles = files.map((f) => {
  const m = /_(\d+)x(\d+)\.png$/.exec(f); const w = +m[1], h = +m[2];
  const sc = Math.min(420 / w, 420 / h, 1);
  const data = fs.readFileSync(path.join(dir, f)).toString('base64');
  return `<figure><div class="fr" style="width:${Math.round(w * sc)}px;height:${Math.round(h * sc)}px"><img src="data:image/png;base64,${data}" style="width:${Math.round(w * sc)}px;height:${Math.round(h * sc)}px"></div><figcaption>${w}×${h}${sc < 1 ? ` · shown at ${Math.round(sc * 100)}%` : ''}</figcaption></figure>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#EEF2F9;font:13px/1.4 Figtree,system-ui,sans-serif;color:#10233F;padding:24px}h1{font-size:18px;margin:0 0 16px}.grid{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-end}figure{margin:0}.fr{box-shadow:0 6px 18px rgba(6,18,44,.18);background:#fff}figcaption{margin-top:6px;font-family:ui-monospace,monospace;font-size:12px;color:#5A6B85}</style><h1>${title}</h1><div class="grid">${tiles}</div>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('wrote', out);
