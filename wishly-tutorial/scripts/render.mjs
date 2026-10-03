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
await page.goto('file://' + path.join(root, 'index.html'));
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

// ---------- audio: voiceover + ducked music bed + two clips of the real Lena sample ----------
const A = f => path.join(root, 'audio', f);
const VO = { hook: 0.0, home: 3.4, s1: 9.8, s2: 15.6, s3: 22.6, s4: 27.0, review: 32.6, progress: 35.6, final: 38.0, end: 45.0 };
const inputs = ['-i', silent, '-i', A('bed.wav'), '-i', A('lena-sample.mp3'), '-i', A('lena-sample.mp3')];
const voKeys = Object.keys(VO);
voKeys.forEach(k => inputs.push('-i', A(`${k}.wav`)));
const dip = (s, e) => `(1-clip((t-${s})/0.3,0,1)*clip((${e}-t)/0.3,0,1))`;
let fc = `[1:a]volume=0.20,volume='${dip(6.6, 10.0)}*${dip(39.8, 49)}':eval=frame[bed];`;
fc += `[2:a]atrim=1.35:4.75,asetpts=PTS-STARTPTS,afade=t=in:d=0.2,afade=t=out:st=3.0:d=0.4,adelay=6700|6700,volume=0.9[sn1];`;
fc += `[3:a]atrim=19.8:28.8,asetpts=PTS-STARTPTS,afade=t=in:d=0.2,afade=t=out:st=7.2:d=1.8,adelay=40000|40000,volume=0.9[sn2];`;
voKeys.forEach((k, i) => { const ms = Math.round((VO[k] + 0.12) * 1000); fc += `[${4 + i}:a]adelay=${ms}|${ms}[v${i}];`; });
fc += voKeys.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${voKeys.length}:normalize=0,asplit=2[vo][vosc];`;
fc += `[bed][vosc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[bedd];`;
fc += `[bedd][vo][sn1][sn2]amix=inputs=4:normalize=0,atrim=0:${dur},loudnorm=I=-14:TP=-1:LRA=11[aout]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[aout]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', a]);
fs.unlinkSync(silent);
console.log('done', a);
