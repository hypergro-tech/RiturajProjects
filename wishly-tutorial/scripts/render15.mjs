// Usage: node render.mjs stills <t1,t2,...> <outdir>   |   node render.mjs video <out.mp4> [fps]
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, a, b] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(root, 'index15.html'));
await page.evaluate(() => document.fonts.ready);
const frame = async t => {
  await page.evaluate(t => render(t), t);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
};

if (mode === 'stills') {
  for (const t of a.split(',').map(Number)) {
    await frame(t);
    await page.screenshot({ path: path.join(b, `t${t.toFixed(2)}.png`) });
  }
  await browser.close();
  process.exit(0);
}

const fps = Number(b || 30);
const dur = await page.evaluate(() => DURATION);
const silent = a + '.silent.mp4';
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const n = Math.round(dur * fps);
for (let i = 0; i < n; i++) {
  await frame(i / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 300 === 0) console.log(`frame ${i}/${n}`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();

// ---------- audio: punchy voice lines + bed + the Lena chorus payoff ----------
const A = f => path.join(root, 'audio', f);
const VO = { hook: 0.1, s1: 1.6, s2: 4.8, s3: 8.4, s4: 10.6 };
const voKeys = Object.keys(VO);
const inputs = ['-i', silent, '-i', A('bed15.wav'), '-i', A('lena-sample.mp3')];
voKeys.forEach(k => inputs.push('-i', A(`q_${k}.wav`)));
let fc = `[1:a]volume=0.22,volume='1-clip((t-12.1)/0.3,0,1)':eval=frame[bed];`;
fc += `[2:a]atrim=19.8:22.9,asetpts=PTS-STARTPTS,afade=t=in:d=0.2,afade=t=out:st=2.4:d=0.7,adelay=12300|12300,volume=0.95[sn];`;
voKeys.forEach((k, i) => { const ms = Math.round(VO[k] * 1000); fc += `[${3 + i}:a]adelay=${ms}|${ms}[v${i}];`; });
fc += voKeys.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${voKeys.length}:normalize=0,asplit=2[vo][vosc];`;
fc += `[bed][vosc]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=250[bedd];`;
fc += `[bedd][vo][sn]amix=inputs=3:normalize=0,atrim=0:${dur},loudnorm=I=-14:TP=-1:LRA=11[aout]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[aout]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', a]);
fs.unlinkSync(silent);
console.log('done', a);
