// Usage: node render.mjs stills <t1,t2,...> <outdir>   |   node render.mjs video <out.mp4> [fps]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, a, b] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
if (mode === 'stills') {
  for (const t of a.split(',').map(Number)) {
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: path.join(b, `t${t.toFixed(2)}.png`) });
  }
} else {
  const fps = Number(b || 30);
  const dur = await page.evaluate(() => DURATION);
  const n = Math.round(dur * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a + '.silent.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => render(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
await browser.close();
if (mode !== 'stills') {
  // mux the real sample song, fading out at the end
  const { execFileSync } = await import('child_process');
  const dur = 31.0;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', a + '.silent.mp4', '-i', path.join(root, 'audio/lena-sample.mp3'),
    '-filter_complex', `[1:a]apad,atrim=0:${dur},afade=t=out:st=${dur - 1.6}:d=1.6,loudnorm=I=-14:TP=-1:LRA=11[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', a]);
  (await import('fs')).unlinkSync(a + '.silent.mp4');
}
