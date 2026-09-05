// Ops check: run one real vision pass against the configured provider and print the object model.
//   npm run build && node scripts/smoke-vision.mjs [image.png|jpg]
// Uses the same env as the server (.env, ANTHROPIC_API_KEY or Vertex credentials).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const { analyzeKeyVisual, describeProvider, isConfigured } = await import(path.join(root, 'dist-server/analyze.js'));

const file = process.argv[2] ?? path.join(root, 'public/assets/wordmark-on-blue.png');
const mediaType = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
const image = fs.readFileSync(file).toString('base64');
console.log(`provider: ${describeProvider()} · model: ${process.env.ANALYSIS_MODEL || 'claude-opus-5'} · configured: ${isConfigured()}`);
console.log(`image: ${path.basename(file)} (${Math.round(image.length / 1024)} KB base64)`);

const t0 = Date.now();
try {
  const model = await analyzeKeyVisual({ image, mediaType, width: 900, height: 219 });
  console.log(`ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(model, null, 2));
} catch (e) {
  console.error(`FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s: [${e.status ?? '?'}] ${e.message}`);
  process.exitCode = 1;
}
