// Drives the real Wishly prototype on a phone-sized viewport and saves full-page screenshots
// of every state (each typed word, each tap) plus the page-coordinate boxes of tap targets.
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE; // path to the website index.html
const out = path.join(root, 'screens'); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'America/New_York' });
const HIDE = `.review-bar{display:none!important}`;
const states = []; let n = 0;
async function snap(id, targets = {}) {
  await p.addStyleTag({ content: HIDE }).catch(() => {});
  await p.waitForTimeout(120);
  const boxes = {};
  for (const [k, loc] of Object.entries(targets)) {
    const bb = await loc.boundingBox(); const sy = await p.evaluate(() => scrollY);
    if (bb) boxes[k] = [bb.x, bb.y + sy, bb.width, bb.height];
  }
  const file = `${String(n++).padStart(3, '0')}-${id}.png`;
  await p.screenshot({ path: path.join(out, file), fullPage: true });
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  states.push({ id, file, h, boxes });
}
async function type(loc, text, id, by = 'char', extra = {}) {
  await loc.click(); let cur = '';
  const parts = by === 'word' ? text.split(/(?<= )/) : [...text];
  for (const part of parts) { cur += part; await loc.fill(cur); await snap(id, { field: loc, ...extra }); }
}
await p.goto('file://' + SITE + '#/'); await p.waitForTimeout(700);
await p.getByRole('button', { name: 'Reject optional' }).click().catch(() => {});
await p.evaluate(() => scrollTo(0, 0));
const play = p.locator('[data-play-sample]').first(), cta = p.getByRole('link', { name: /Create their song/ }).first();
await snap('home', { play, cta });
await play.click().catch(() => {}); await p.waitForTimeout(300); await snap('home-playing', { play, cta });
await p.evaluate(() => document.querySelectorAll('audio').forEach(a => a.pause()));

await p.goto('file://' + SITE + '#/create'); await p.waitForTimeout(500); await p.evaluate(() => scrollTo(0, 0));
const name = p.locator('input[name=preferredName]'), pron = p.locator('input[name=pronunciation]'), sender = p.locator('input[name=sender]');
const c1 = p.getByRole('button', { name: 'Continue to your story' });
const t1 = { name, pron, sender, cont: c1 };
await snap('s1', t1);
await type(name, 'Lena', 's1-name', 'char', t1);
await type(pron, 'LEH-nah', 's1-pron', 'char', t1);
await type(sender, 'Priya', 's1-sender', 'char', t1);
await c1.click(); await p.waitForTimeout(400); await p.evaluate(() => scrollTo(0, 0));

const mem = p.locator('main textarea').first(), chip = p.getByRole('button', { name: 'Something they always do' }), perm = p.locator('main input[type=checkbox]').first();
const c2 = p.getByRole('button', { name: 'Continue to the sound' });
const t2 = { mem, chip, perm, cont: c2 };
await snap('s2', t2);
await type(mem, 'Always 5 minutes late, but always with emergency snacks. Kitchen dancing at 2am.', 's2-mem', 'word', t2);
await perm.check(); await snap('s2-perm', t2);
await c2.click(); await p.waitForTimeout(400); await p.evaluate(() => scrollTo(0, 0));

const mood = p.locator('label:has(input[value="Joyful pop"]), label:has-text("Joyful pop")').first();
const lang = p.locator('select[name=language]'), c3 = p.getByRole('button', { name: 'Continue to your package' });
const t3 = { mood, lang, cont: c3 };
await snap('s3', t3);
await mood.click(); await snap('s3-mood', t3);
await c3.click(); await p.waitForTimeout(400); await p.evaluate(() => scrollTo(0, 0));

const song = p.locator('label:has(input[value=personal_song])').first(), keep = p.locator('label:has(input[value=wish_card])').first();
const c4 = p.getByRole('button', { name: 'Review their song' });
const t4 = { song, keep, cont: c4 };
await snap('s4', t4);
await c4.click(); await p.waitForTimeout(500); await p.evaluate(() => scrollTo(0, 0));

const co = p.getByRole('button', { name: /Continue to checkout/ }).or(p.getByRole('link', { name: /Continue to checkout/ })).first();
await snap('review', { cont: co });

await p.goto('file://' + SITE + '#/production-progress'); await p.waitForTimeout(500);
await p.addStyleTag({ content: `main p:has-text("Example journey only"){}` }).catch(() => {});
// Strip the prototype-only "example" labels so the screen reads like the live order view.
await p.evaluate(() => {
  for (const el of document.querySelectorAll('main p, main small, main .eyebrow')) if (/Example journey only|PRODUCTION EXAMPLE/i.test(el.textContent)) el.style.visibility = 'hidden';
  const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
  while (w.nextNode()) w.currentNode.nodeValue = w.currentNode.nodeValue.replace(/\s*·\s*example current stage/i, '');
});
await snap('progress');
fs.writeFileSync(path.join(root, 'screens/states.json'), JSON.stringify(states, null, 1));
console.log(states.length, 'states'); await b.close();
