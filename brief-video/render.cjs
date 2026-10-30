#!/usr/bin/env node
// Renders src/index.html frame by frame with Playwright (Chromium) and encodes a silent H.264 MP4 with ffmpeg.
//   node render.cjs                       → out/BRIEF-explainer-90s.mp4
//   node render.cjs --still 12,33.5,60    → out/stills/*.png
//   node render.cjs --fps 60 --workers 4
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : def;
};
const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'out');
const FPS = +arg('fps', 30);
const WORKERS = +arg('workers', 4);
const OUTFILE = path.resolve(arg('out', path.join(OUT, 'BRIEF-explainer-90s.mp4')));
const STILLS = arg('still', null);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = path.join(SRC, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(SRC) || !fs.existsSync(file)) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(port) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?render`);
  await page.evaluate(() => window.BRIEF.ready);
  const cdp = await page.context().newCDPSession(page);
  const shot = async (t) => {
    await page.evaluate((tt) => window.BRIEF.renderAt(tt), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  };
  return { browser, shot };
}

function encoder(file) {
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-profile:v', 'high',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-g', String(FPS * 2), '-an', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
  return { write, end: () => (ff.stdin.end(), done) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const port = srv.address().port;

  if (STILLS) {
    fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true });
    const { browser, shot } = await openPage(port);
    for (const t of STILLS.split(',').map(Number)) {
      const f = path.join(OUT, 'stills', `t${t.toFixed(2).padStart(6, '0')}.png`);
      fs.writeFileSync(f, await shot(t));
      console.log(f);
    }
    await browser.close();
    return srv.close();
  }

  const total = Math.round(90 * FPS);
  const per = Math.ceil(total / WORKERS);
  const tmp = fs.mkdtempSync(path.join(OUT, '.seg-'));
  const t0 = Date.now();
  let doneFrames = 0;
  const segs = await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const a = w * per, b = Math.min(total, a + per);
    const file = path.join(tmp, `seg${w}.mp4`);
    const { browser, shot } = await openPage(port);
    const enc = encoder(file);
    for (let i = a; i < b; i++) {
      await enc.write(await shot(i / FPS));
      if (++doneFrames % 150 === 0) console.log(`${doneFrames}/${total} frames · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await enc.end();
    await browser.close();
    return file;
  }));
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map((f) => `file '${f}'`).join('\n'));
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', '-an', OUTFILE], { stdio: 'inherit' })
    .on('close', (c) => (c ? rej(new Error('concat ' + c)) : res())));
  fs.rmSync(tmp, { recursive: true, force: true });
  srv.close();
  console.log(`wrote ${OUTFILE} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
