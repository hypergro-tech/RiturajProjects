// Turns the single-file build (dist-artifact/index.html) into the fragment the Artifact tool expects:
// no doctype / html / head / body wrappers — just <title>, the font links, the inlined <style>,
// the root element and the inlined module script.
//   VITE_ARTIFACT=1 vite build --config vite.artifact.config.ts && node scripts/build-artifact.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.join(root, 'dist-artifact/index.html');
const out = path.join(root, 'dist-artifact/adapt-studio.artifact.html');

const html = fs.readFileSync(src, 'utf8');
const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';

const pick = (re) => [...head.matchAll(re)].map((m) => m[0]);
const title = '<title>Adapt Studio</title>'; // the artifact gallery wants a product name, not a caption
const links = pick(/<link[^>]+(fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/gi);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/gi);
const headScripts = pick(/<script[^>]*>[\s\S]*?<\/script>/gi);

const fragment = [title, ...links, ...styles, body.trim(), ...headScripts].join('\n');
fs.writeFileSync(out, fragment);
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`[build-artifact] ${path.relative(root, out)} · ${mb} MB · ${styles.length} style block(s), ${headScripts.length} script block(s), ${links.length} font link(s)`);
if (fs.statSync(out).size > 15 * 1024 * 1024) { console.error('artifact exceeds 15 MB'); process.exit(1); }
