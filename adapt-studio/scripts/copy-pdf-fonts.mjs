// pdf.js renders PDFs that reference the 14 standard fonts without embedding them only if it can fetch
// those fonts. Copy them from the package into public/ so the built app serves them at /pdf-standard-fonts/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../node_modules/pdfjs-dist/standard_fonts');
const dst = path.resolve(here, '../public/pdf-standard-fonts');
fs.mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(src)) { fs.copyFileSync(path.join(src, f), path.join(dst, f)); n++; }
console.log(`[copy-pdf-fonts] ${n} files → public/pdf-standard-fonts`);
