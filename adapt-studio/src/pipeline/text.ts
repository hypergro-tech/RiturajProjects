import { BRAND_FONTS, WEB_FONTS } from './constants';
import { relativeLuminance } from './model';
import type { Box, ElementType, ObjectModel, PixelSampler, TaggedElement, TextMeasurer, TextRun, TextSpec } from './types';

/** A font as reported by pdf.js: the PostScript name and the family it registered the embedded face under. */
export interface FontInfo { name: string; loadedName: string }

export interface ParsedFontName { family: string; weight: number; italic: boolean; label: string }

const WEIGHTS: Array<[RegExp, number]> = [
  [/extra ?light|ultra ?light/i, 200], [/thin|hairline/i, 100], [/light/i, 300],
  [/semi ?bold|demi ?bold/i, 600], [/extra ?bold|ultra ?bold|heavy/i, 800], [/black/i, 900],
  [/bold/i, 700], [/medium/i, 500],
];
const STYLE_WORDS = /(Thin|Hairline|ExtraLight|UltraLight|Light|Regular|Roman|Normal|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Heavy|Black|Italic|Oblique|It)+$/;

/** "ABCDEF+Merriweather-SemiBoldItalic" becomes { family: "Merriweather", weight: 600, italic: true }. */
export function parseFontName(raw: string): ParsedFontName {
  const name = raw.replace(/^[A-Z]{6}\+/, '').replace(/,/g, '-');
  const dash = name.indexOf('-');
  let base = dash >= 0 ? name.slice(0, dash) : name;
  let style = dash >= 0 ? name.slice(dash + 1) : '';
  if (!style) {
    const m = base.match(STYLE_WORDS);
    if (m && m[0] !== base) { style = m[0]; base = base.slice(0, -m[0].length); }
  }
  const family = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/MT$|PS$/, '').trim() || 'Unknown';
  let weight = 400;
  for (const [re, w] of WEIGHTS) if (re.test(style)) { weight = w; break; }
  const italic = /italic|oblique|\bit$/i.test(style);
  const styleLabel = style.replace(/([a-z])([A-Z])/g, '$1 $2') || 'Regular';
  return { family, weight, italic, label: `${family} ${styleLabel}` };
}

export interface ResolvedFont { family: string; weight: number; italic: boolean; fontSource: TextSpec['fontSource']; fontLabel: string }

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };

/**
 * Pick the face to re-set an element with: the PDF's own embedded face when pdf.js loaded it, else the
 * same family as a web font when we ship it, else the brand face for that element type.
 */
export function resolveFont(type: ElementType, pdfFont: FontInfo | null, fontAvailable: (family: string) => boolean): ResolvedFont {
  const parsed = pdfFont ? parseFontName(pdfFont.name) : null;
  if (pdfFont && parsed && fontAvailable(pdfFont.loadedName)) {
    return { family: pdfFont.loadedName, weight: 400, italic: false, fontSource: 'embedded', fontLabel: `${parsed.label} (embedded)` };
  }
  if (parsed && WEB_FONTS.has(parsed.family) && fontAvailable(parsed.family)) {
    return { family: parsed.family, weight: parsed.weight, italic: parsed.italic, fontSource: 'web', fontLabel: `${parsed.label} (web font)` };
  }
  const key: keyof typeof BRAND_FONTS = type === 'headline' || type === 'subhead' || type === 'cta' || type === 'legal' ? type : 'body';
  const b = BRAND_FONTS[key];
  const italic = parsed?.italic ?? false;
  return {
    family: b.family, weight: b.weight, italic, fontSource: 'fallback',
    fontLabel: `${b.family} ${WEIGHT_NAMES[b.weight]}${italic ? ' Italic' : ''} (brand fallback${parsed ? ` for ${parsed.label}` : ''})`,
  };
}

export interface GroupedText { text: string; fontName: string; fontPx: number; /** union of the runs, master px */ bounds: { x: number; y: number; w: number; h: number } }

/**
 * Assign PDF text runs to the vision elements whose (slightly padded) box contains the run centre, then
 * rebuild reading order: lines by baseline, words left to right.
 */
export function groupRunsIntoElements(runs: TextRun[], elements: TaggedElement[], rw: number, rh: number): Map<number, GroupedText> {
  const out = new Map<number, GroupedText>();
  // Each run goes to the text element it overlaps most (estimated boxes drift by a few percent); a run
  // with no overlap still counts when its centre sits within 6% of a box.
  const buckets = new Map<number, TextRun[]>();
  for (const r of runs) {
    if (!r.str.trim()) continue;
    let best = -1, bestScore = 0;
    elements.forEach((e, i) => {
      if (!e.fontPx) return;
      const bx = e.box.x * rw, by = e.box.y * rh, bw = e.box.w * rw, bh = e.box.h * rh;
      const ix = Math.max(0, Math.min(r.x + r.w, bx + bw) - Math.max(r.x, bx));
      const iy = Math.max(0, Math.min(r.y + r.h, by + bh) - Math.max(r.y, by));
      let score = (ix * iy) / Math.max(1, r.w * r.h);
      if (score === 0) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const padX = bw * 0.06, padY = bh * 0.06;
        if (cx >= bx - padX && cx <= bx + bw + padX && cy >= by - padY && cy <= by + bh + padY) score = 0.01;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) { const b = buckets.get(best) ?? []; b.push(r); buckets.set(best, b); }
  }
  elements.forEach((_e, i) => {
    const mine = buckets.get(i);
    if (!mine?.length) return;
    mine.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.5 ? a.y - b.y : a.x - b.x));
    const lines: string[] = [];
    let cur: string[] = [], lineY = mine[0].y, lineH = mine[0].h, prev: TextRun | null = null;
    for (const r of mine) {
      const newLine = prev !== null && (Math.abs(r.y - lineY) > lineH * 0.5 || prev.hasEOL);
      if (newLine) { lines.push(cur.join(' ')); cur = []; lineY = r.y; lineH = r.h; }
      cur.push(r.str.trim());
      prev = r;
    }
    if (cur.length) lines.push(cur.join(' '));
    const text = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    if (!text) return;
    const byFont = new Map<string, number>();
    for (const r of mine) byFont.set(r.fontName, (byFont.get(r.fontName) ?? 0) + r.str.length);
    const fontName = [...byFont.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const sizes = mine.map((r) => r.fontPx).sort((a, b) => a - b);
    const bx = Math.min(...mine.map((r) => r.x)), by = Math.min(...mine.map((r) => r.y));
    const bounds = { x: bx, y: by, w: Math.max(...mine.map((r) => r.x + r.w)) - bx, h: Math.max(...mine.map((r) => r.y + r.h)) - by };
    out.set(i, { text, fontName, fontPx: sizes[Math.floor(sizes.length / 2)], bounds });
  });
  return out;
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Representative text and background colours inside an element box: the background is the median-luminance
 * pixel, the text is whichever luminance extreme (p02 / p98) contrasts more with it.
 */
export function sampleTextColors(sample: PixelSampler, box: Box, rw: number, rh: number): { fg: string; bg: string; contrast: number } {
  const padX = box.w * rw * 0.04, padY = box.h * rh * 0.04;
  const x = Math.max(0, Math.round(box.x * rw - padX)), y = Math.max(0, Math.round(box.y * rh - padY));
  const w = Math.max(4, Math.min(rw - x, Math.round(box.w * rw + 2 * padX)));
  const h = Math.max(4, Math.min(rh - y, Math.round(box.h * rh + 2 * padY)));
  const d = sample(x, y, w, h);
  const px: Array<[number, number, number, number]> = [];
  for (let i = 0; i + 3 < d.length; i += 16) px.push([relativeLuminance(d[i], d[i + 1], d[i + 2]), d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return { fg: '#000000', bg: '#ffffff', contrast: 21 };
  px.sort((a, b) => a[0] - b[0]);
  const at = (q: number) => px[Math.min(px.length - 1, Math.floor(px.length * q))];
  const lo = at(0.02), bg = at(0.5), hi = at(0.98);
  const up = (hi[0] + 0.05) / (bg[0] + 0.05), down = (bg[0] + 0.05) / (lo[0] + 0.05);
  const fg = up >= down ? hi : lo;
  return { fg: hex(fg[1], fg[2], fg[3]), bg: hex(bg[1], bg[2], bg[3]), contrast: Math.max(up, down) };
}

function lumOfHex(h: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (!m) return 0;
  return relativeLuminance(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
}

/** True when a text element sits on its own filled shape (a button) rather than on the page background. */
export function isFilledShape(shapeBg: string, pageBg: string): boolean {
  const a = lumOfHex(shapeBg) + 0.05, b = lumOfHex(pageBg) + 0.05;
  return Math.max(a / b, b / a) > 1.3;
}

export interface AttachInput {
  runs?: TextRun[];
  fonts?: Map<string, FontInfo>;
  sample: PixelSampler;
  rw: number;
  rh: number;
  fontAvailable: (family: string) => boolean;
}

/**
 * Give every text element a TextSpec: content from the PDF runs when present (exact), else the vision
 * model's transcription; colours sampled from the raster; font resolved embedded, then web, then brand fallback.
 * Elements with no readable text keep no spec and fall back to raster patches in recompose.
 */
export function attachTextSpecs(model: ObjectModel, input: AttachInput): ObjectModel {
  const grouped = input.runs?.length ? groupRunsIntoElements(input.runs, model.elements, input.rw, input.rh) : new Map<number, GroupedText>();
  const elements = model.elements.map((e, i) => {
    if (!e.fontPx) return e;
    const g = grouped.get(i);
    const content = (g?.text || e.visionText).trim();
    if (!content) return e;
    const pdfFont = g ? input.fonts?.get(g.fontName) ?? { name: g.fontName, loadedName: g.fontName } : null;
    const font = resolveFont(e.type, pdfFont, input.fontAvailable);
    // The text layer knows exactly where the glyphs are: tighten the model's estimated box to the runs
    // (2% breathing room) so patches, contrast sampling and keep-rects use real geometry.
    const box = g ? tightenBox(g.bounds, input.rw, input.rh) : e.box;
    const { fg, bg } = sampleTextColors(input.sample, box, input.rw, input.rh);
    const bgColor = e.type === 'cta' && isFilledShape(bg, model.background.color) ? bg : '';
    const text: TextSpec = {
      content, shortForm: e.visionShortForm,
      family: font.family, weight: font.weight, italic: font.italic,
      color: fg, bgColor,
      lineHeight: e.type === 'headline' ? 1.12 : 1.25,
      source: g ? 'pdf' : 'vision',
      fontSource: font.fontSource, fontLabel: font.fontLabel,
    };
    return { ...e, text, box, fontPx: g ? g.fontPx : e.fontPx };
  });
  return { ...model, elements };
}

function tightenBox(b: { x: number; y: number; w: number; h: number }, rw: number, rh: number): Box {
  const px = Math.max(1, b.w * 0.02), py = Math.max(1, b.h * 0.02);
  const x0 = Math.max(0, b.x - px), y0 = Math.max(0, b.y - py);
  const x1 = Math.min(rw, b.x + b.w + px), y1 = Math.min(rh, b.y + b.h + py);
  return { x: x0 / rw, y: y0 / rh, w: Math.max(0.01, (x1 - x0) / rw), h: Math.max(0.01, (y1 - y0) / rh) };
}

/** Rough width estimate used in tests and as a fallback when no canvas is available. */
export const approxMeasurer: TextMeasurer = (spec, px, text) =>
  text.length * px * (0.5 + (spec.weight >= 700 ? 0.05 : 0) + (spec.weight >= 800 ? 0.02 : 0));
