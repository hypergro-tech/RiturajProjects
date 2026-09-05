import { relativeLuminance } from './model';
import { isFilledShape, sampleTextColors } from './text';
import type { Box, Complexity, Direction, PixelSampler, RawElement, RawObjectModel, TextRun } from './types';

/**
 * Stage 1 without a vision model: everything that can be read deterministically from a PDF-compatible
 * master. Text blocks come from the PDF text layer (exact strings, sizes, fonts); non-text artwork
 * (logo, product, decoration) from the raster; the background from its edges. `heuristicModel()` turns
 * that into a RawObjectModel on its own; the viewer's text-only Claude can refine the classification.
 */

export interface TextBlock { x: number; y: number; w: number; h: number; lines: string[]; fontPx: number; fontName: string }
export interface Component { x: number; y: number; w: number; h: number; area: number }
export interface BackgroundInfo { desc: string; extendable: boolean; extendDirections: Direction[]; complexity: Complexity }
export interface LayoutAnalysis { blocks: TextBlock[]; components: Component[]; background: BackgroundInfo; model: RawObjectModel }

interface Line { x0: number; y0: number; x1: number; y1: number; fontPx: number; fontName: string; runs: TextRun[] }

/** Cluster runs into lines (same baseline band, similar size), splitting a line at wide horizontal gaps. */
function runsToLines(runs: TextRun[]): Line[] {
  const rs = runs.filter((r) => r.str.trim() && r.fontPx > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const r of rs) {
    const cy = r.y + r.h / 2;
    let target: Line | undefined;
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 6; i--) {
      const l = lines[i];
      const lcy = (l.y0 + l.y1) / 2;
      if (Math.abs(cy - lcy) < Math.max(r.h, l.y1 - l.y0) * 0.5 && Math.abs(r.fontPx - l.fontPx) < l.fontPx * 0.35) { target = l; break; }
    }
    if (target) {
      target.runs.push(r);
      target.x0 = Math.min(target.x0, r.x); target.x1 = Math.max(target.x1, r.x + r.w);
      target.y0 = Math.min(target.y0, r.y); target.y1 = Math.max(target.y1, r.y + r.h);
    } else {
      lines.push({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h, fontPx: r.fontPx, fontName: r.fontName, runs: [r] });
    }
  }
  // split lines at horizontal gaps wider than ~3 em (columns / side-by-side labels)
  const out: Line[] = [];
  for (const l of lines) {
    const sorted = l.runs.sort((a, b) => a.x - b.x);
    let cur: TextRun[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = cur[cur.length - 1];
      if (sorted[i].x - (prev.x + prev.w) > l.fontPx * 3) { out.push(mkLine(cur)); cur = [sorted[i]]; } else cur.push(sorted[i]);
    }
    out.push(mkLine(cur));
  }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

function mkLine(runs: TextRun[]): Line {
  const x0 = Math.min(...runs.map((r) => r.x)), x1 = Math.max(...runs.map((r) => r.x + r.w));
  const y0 = Math.min(...runs.map((r) => r.y)), y1 = Math.max(...runs.map((r) => r.y + r.h));
  const byFont = new Map<string, number>();
  for (const r of runs) byFont.set(r.fontName, (byFont.get(r.fontName) ?? 0) + r.str.length);
  const fontName = [...byFont.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sizes = runs.map((r) => r.fontPx).sort((a, b) => a - b);
  return { x0, y0, x1, y1, fontPx: sizes[Math.floor(sizes.length / 2)], fontName, runs };
}

const lineText = (l: Line) => l.runs.map((r) => r.str.trim()).join(' ').replace(/\s+/g, ' ').trim();

/** Group PDF text runs into paragraph-like blocks: consecutive lines of similar size, close together, overlapping horizontally. */
export function groupRunsIntoBlocks(runs: TextRun[]): TextBlock[] {
  const lines = runsToLines(runs);
  const blocks: TextBlock[] = [];
  let cur: Line[] = [];
  const flush = () => {
    if (!cur.length) return;
    const x = Math.min(...cur.map((l) => l.x0)), y = Math.min(...cur.map((l) => l.y0));
    const w = Math.max(...cur.map((l) => l.x1)) - x, h = Math.max(...cur.map((l) => l.y1)) - y;
    const sizes = cur.map((l) => l.fontPx).sort((a, b) => a - b);
    blocks.push({ x, y, w, h, lines: cur.map(lineText).filter(Boolean), fontPx: sizes[Math.floor(sizes.length / 2)], fontName: cur[0].fontName });
    cur = [];
  };
  for (const l of lines) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const gap = l.y0 - prev.y1;
      const sameSize = Math.abs(l.fontPx - prev.fontPx) < Math.max(l.fontPx, prev.fontPx) * 0.3;
      const overlapX = Math.min(l.x1, prev.x1) - Math.max(l.x0, prev.x0) > -prev.fontPx;
      if (gap < Math.max(prev.y1 - prev.y0, l.y1 - l.y0) * 0.9 && sameSize && overlapX) { cur.push(l); continue; }
      flush();
    }
    cur.push(l);
  }
  flush();
  return blocks;
}

const hexToRgb = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
};
const dist = (r: number, g: number, b: number, c: [number, number, number]) => Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);

/**
 * Non-text artwork on the raster: cells whose colour departs from the page background, minus the text
 * blocks, flood-filled into components (px boxes, largest first).
 */
export function findComponents(sample: PixelSampler, rw: number, rh: number, bgHex: string, exclude: TextBlock[], cols = 160): Component[] {
  const cell = Math.max(3, Math.round(rw / cols));
  const gw = Math.ceil(rw / cell), gh = Math.ceil(rh / cell);
  const bg = hexToRgb(bgHex);
  const on = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const y = gy * cell, h = Math.min(cell, rh - y);
    if (h <= 0) break;
    const d = sample(0, y, rw, h);
    const stride = Math.max(1, Math.floor(rw / (gw * 4))); // ~4 samples per cell per row
    const acc = new Float32Array(gw * 2); // [distance sum, count] per cell
    for (let row = 0; row < h; row += Math.max(1, Math.floor(h / 2))) {
      for (let x = 0; x < rw; x += stride) {
        const i = (row * rw + x) * 4;
        if (i + 2 >= d.length) break;
        const gx = Math.min(gw - 1, Math.floor(x / cell));
        acc[gx * 2] += dist(d[i], d[i + 1], d[i + 2], bg);
        acc[gx * 2 + 1] += 1;
      }
    }
    for (let gx = 0; gx < gw; gx++) if (acc[gx * 2 + 1] && acc[gx * 2] / acc[gx * 2 + 1] > 48) on[gy * gw + gx] = 1;
  }
  // clear text cells (padded 12%)
  for (const b of exclude) {
    const px = b.w * 0.12, py = b.h * 0.12;
    const x0 = Math.max(0, Math.floor((b.x - px) / cell)), x1 = Math.min(gw - 1, Math.ceil((b.x + b.w + px) / cell));
    const y0 = Math.max(0, Math.floor((b.y - py) / cell)), y1 = Math.min(gh - 1, Math.ceil((b.y + b.h + py) / cell));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) on[gy * gw + gx] = 0;
  }
  // flood fill
  const seen = new Uint8Array(gw * gh);
  const comps: Component[] = [];
  const stack: number[] = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!on[s] || seen[s]) continue;
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1, n = 0;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      const gx = i % gw, gy = (i - gx) / gw;
      n++;
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
      const nb = [gx > 0 ? i - 1 : -1, gx < gw - 1 ? i + 1 : -1, gy > 0 ? i - gw : -1, gy < gh - 1 ? i + gw : -1];
      for (const j of nb) if (j >= 0 && on[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (n < 4) continue;
    comps.push({ x: x0 * cell, y: y0 * cell, w: (x1 - x0 + 1) * cell, h: (y1 - y0 + 1) * cell, area: n * cell * cell });
  }
  return comps.filter((c) => c.area >= rw * rh * 0.002).sort((a, b) => b.area - a.area);
}

/** Which edges are flat enough to extend, and how busy the field is overall. */
export function analyzeBackground(sample: PixelSampler, rw: number, rh: number, bgHex: string): BackgroundInfo {
  const bg = hexToRgb(bgHex);
  const t = Math.max(4, Math.round(Math.min(rw, rh) * 0.03));
  const uniform = (x: number, y: number, w: number, h: number) => {
    const d = sample(x, y, w, h);
    let close = 0, n = 0;
    for (let i = 0; i + 2 < d.length; i += 32) { n++; if (dist(d[i], d[i + 1], d[i + 2], bg) < 30) close++; }
    return n ? close / n : 0;
  };
  const edges: Array<[Direction, number]> = [
    ['top', uniform(0, 0, rw, t)], ['bottom', uniform(0, rh - t, rw, t)],
    ['left', uniform(0, 0, t, rh)], ['right', uniform(rw - t, 0, t, rh)],
  ];
  const extendDirections = edges.filter(([, f]) => f >= 0.9).map(([d]) => d);
  const lum = relativeLuminance(bg[0], bg[1], bg[2]);
  const complexity: Complexity = extendDirections.length === 4 ? 'simple' : extendDirections.length >= 2 ? 'moderate' : 'complex';
  const desc = extendDirections.length === 4
    ? `Flat ${lum < 0.2 ? 'dark' : lum > 0.7 ? 'light' : 'mid-tone'} field (${bgHex})`
    : extendDirections.length ? `Field with artwork reaching the ${edges.filter(([, f]) => f < 0.9).map(([d]) => d).join(' and ')} edge` : 'Busy field: artwork reaches every edge';
  return { desc, extendable: extendDirections.length > 0, extendDirections, complexity };
}

const LEGAL_RE = /T&C|\bterms\b|\bconditions?\b|discretion|subject to|disclaimer|\*|\bpolicy\b|\bRBI\b|\bSEBI\b|\bIRDAI\b|insurance|\brisk|read all|\bscheme\b|offer valid|\bapplicable\b/i;
const CTA_RE = /^\s*(apply|get|start|open|learn|know|call|download|sign|buy|explore|book|join|claim|invest|save|shop|visit|try|request|register|discover|see|find)\b/i;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Short form for a headline: the first clause if it is ≤ 4 words, else the first three words. */
export function shortFormOf(text: string, maxWords = 4): string {
  const first = text.split(/\n/)[0];
  const clause = first.split(/[.!?,;:—–]/)[0].trim();
  if (clause && words(clause) <= maxWords && clause !== first.trim()) return clause;
  const ws = first.trim().split(/\s+/);
  return ws.length > maxWords ? ws.slice(0, 3).join(' ') : '';
}

/**
 * Classify text blocks and raster components without a model. Deterministic and explainable:
 * largest type = headline; small text with disclaimer vocabulary or at the foot = legal; a short line on its
 * own filled shape = CTA; a wide, corner-hugging non-text component = logo; the biggest other artwork = product.
 */
export function heuristicModel(blocks: TextBlock[], components: Component[], background: BackgroundInfo, sample: PixelSampler, rw: number, rh: number, bgHex: string): RawObjectModel {
  const frac = (x: number, y: number, w: number, h: number): Box => ({ x: x / rw, y: y / rh, w: w / rw, h: h / rh });
  const elements: RawElement[] = [];
  const sorted = [...blocks].sort((a, b) => b.fontPx - a.fontPx || a.y - b.y);
  const headline = sorted[0];
  let logoTaken = false;
  const filledBlocks = new Set<TextBlock>();

  for (const b of blocks) {
    const text = b.lines.join('\n');
    const box = frac(b.x, b.y, b.w, b.h);
    const n = words(text);
    const colors = sampleTextColors(sample, box, rw, rh);
    const filled = isFilledShape(colors.bg, bgHex);
    if (filled) filledBlocks.add(b);
    const short = n <= 4 && b.fontPx < headline.fontPx;
    let type: string;
    if (b === headline) type = 'headline';
    else if (short && filled) type = 'cta'; // a short line on its own filled shape is a button, whatever it says
    else if ((LEGAL_RE.test(text) && b.fontPx <= headline.fontPx * 0.6) || (b.fontPx <= headline.fontPx * 0.45 && b.y + b.h > rh * 0.82)) type = 'legal';
    else if (short && CTA_RE.test(text)) type = 'cta';
    else if (!logoTaken && n <= 3 && b.y < rh * 0.14 && b.fontPx <= headline.fontPx * 0.85 && !components.some(isLogoCandidate(rw, rh))) { type = 'logo'; logoTaken = true; }
    else type = b.fontPx >= headline.fontPx * 0.55 ? 'subhead' : 'body';
    elements.push({
      type, desc: `${type} · ${b.lines[0].slice(0, 40)}${b.lines[0].length > 40 ? '…' : ''}`, box,
      mustKeep: ['logo', 'headline', 'cta', 'legal'].includes(type), droppable: type === 'body' || type === 'subhead',
      minLegiblePx: type === 'headline' ? 24 : type === 'cta' ? 16 : type === 'legal' ? 18 : 14,
      lines: type === 'logo' ? 0 : b.lines.length,
      text: type === 'logo' ? '' : text,
      shortForm: type === 'headline' ? shortFormOf(text) : type === 'cta' ? (n > 2 ? text.split(/\s+/).slice(0, 2).join(' ') : '') : '',
    });
  }

  // Artwork that is really a text block's own shape (a CTA pill, a label tab) is not a separate element.
  const isOwnShape = (c: Component) => c.area < rw * rh * 0.08 && [...filledBlocks].some((b) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h;
  });
  const candidates = components.filter((c) => !isOwnShape(c) && !blocks.some((b) => overlap(c, b) > 0.6 * c.w * c.h));
  if (!logoTaken) {
    const logos = candidates.filter(isLogoCandidate(rw, rh)).sort((a, b) => cornerDistance(a, rw, rh) - cornerDistance(b, rw, rh));
    if (logos.length) {
      const l = logos[0];
      elements.push({ type: 'logo', desc: 'Logo (artwork near a corner)', box: frac(l.x, l.y, l.w, l.h), mustKeep: true, droppable: false, minLegiblePx: 0, lines: 0, text: '', shortForm: '' });
      candidates.splice(candidates.indexOf(l), 1);
      logoTaken = true;
    }
  }
  let productTaken = false;
  for (const c of candidates.slice(0, 4)) {
    const big = c.area >= rw * rh * 0.03;
    const type = big && !productTaken ? 'product' : 'decorative';
    if (type === 'product') productTaken = true;
    elements.push({ type, desc: type === 'product' ? 'Main visual (largest artwork)' : 'Decorative artwork', box: frac(c.x, c.y, c.w, c.h), mustKeep: false, droppable: type === 'decorative', minLegiblePx: 0, lines: 0, text: '', shortForm: '' });
  }

  const regulated = elements.some((e) => e.type === 'legal');
  return {
    elements: elements.slice(0, 10),
    background: { ...background, color: bgHex },
    regulated,
    notes: regulated ? 'Keep the legal line legible and the logo uncropped.' : 'Keep the logo uncropped and the headline readable.',
  };
}

const isLogoCandidate = (rw: number, rh: number) => (c: Component) => {
  const aspect = c.w / c.h;
  const inBand = c.y < rh * 0.3 || c.y + c.h > rh * 0.72;
  return aspect >= 1.5 && aspect <= 9 && c.h <= rh * 0.14 && c.w <= rw * 0.5 && inBand;
};
const cornerDistance = (c: Component, rw: number, rh: number) => {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  return Math.min(Math.hypot(cx, cy), Math.hypot(rw - cx, cy), Math.hypot(cx, rh - cy), Math.hypot(rw - cx, rh - cy));
};
const overlap = (c: Component, b: TextBlock) => Math.max(0, Math.min(c.x + c.w, b.x + b.w) - Math.max(c.x, b.x)) * Math.max(0, Math.min(c.y + c.h, b.y + b.h) - Math.max(c.y, b.y));

export interface LayoutInput { runs: TextRun[]; sample: PixelSampler; rw: number; rh: number; bgHex: string }

/** The whole no-model analysis in one call. */
export function analyzeLayout({ runs, sample, rw, rh, bgHex }: LayoutInput): LayoutAnalysis {
  const blocks = groupRunsIntoBlocks(runs);
  const components = findComponents(sample, rw, rh, bgHex, blocks);
  const background = analyzeBackground(sample, rw, rh, bgHex);
  return { blocks, components, background, model: heuristicModel(blocks, components, background, sample, rw, rh, bgHex) };
}

const TYPES = new Set(['logo', 'headline', 'subhead', 'body', 'cta', 'product', 'person', 'legal', 'decorative']);
export interface Classified {
  regulated?: boolean;
  notes?: string;
  [id: `T${number}` | `A${number}`]: Partial<RawElement> | undefined;
}

/**
 * Merge a text-only model's classification (keyed T0…/A0…) onto the measured layout: boxes, text and
 * line counts stay as measured; type, description, keep flags and short forms come from the model,
 * falling back to the heuristic classification for anything the model skipped or got wrong.
 */
export function mergeClassification(a: LayoutAnalysis, cls: Classified, rw: number, rh: number): RawObjectModel {
  const heur = a.model.elements ?? [];
  const pick = (over: Partial<RawElement> | undefined, base: RawElement): RawElement => {
    if (!over || typeof over !== 'object') return base;
    const type = typeof over.type === 'string' && TYPES.has(over.type.toLowerCase()) ? over.type.toLowerCase() : base.type;
    return {
      ...base, type,
      desc: typeof over.desc === 'string' && over.desc.trim() ? over.desc : base.desc,
      mustKeep: typeof over.mustKeep === 'boolean' ? over.mustKeep : base.mustKeep,
      droppable: typeof over.droppable === 'boolean' ? over.droppable : base.droppable,
      minLegiblePx: typeof over.minLegiblePx === 'number' ? over.minLegiblePx : base.minLegiblePx,
      shortForm: typeof over.shortForm === 'string' ? over.shortForm : base.shortForm,
      text: type === 'logo' ? '' : base.text,
    };
  };
  const elements: RawElement[] = a.blocks.map((_, i) => pick(cls[`T${i}`], heur[i]));
  const artBase = heur.slice(a.blocks.length); // heuristic logo / product / decorative in component order
  a.components.slice(0, 6).forEach((c, j) => {
    const base: RawElement = artBase.find((e) => e.box && Math.abs((e.box.x ?? 0) * rw - c.x) < 1 && Math.abs((e.box.y ?? 0) * rh - c.y) < 1)
      ?? { type: 'decorative', desc: 'Artwork', box: { x: c.x / rw, y: c.y / rh, w: c.w / rw, h: c.h / rh }, mustKeep: false, droppable: true, minLegiblePx: 0, lines: 0, text: '', shortForm: '' };
    const over = cls[`A${j}`];
    if (over || artBase.includes(base)) elements.push(pick(over, base));
  });
  const regulated = typeof cls.regulated === 'boolean' ? cls.regulated : elements.some((e) => e.type === 'legal');
  return {
    elements: elements.slice(0, 10),
    background: a.model.background,
    regulated,
    notes: typeof cls.notes === 'string' && cls.notes.trim() ? cls.notes : a.model.notes,
  };
}

/** Plain-text description of the layout for a text-only model to classify. */
export function describeLayout(a: LayoutAnalysis, rw: number, rh: number): string {
  const pct = (v: number, base: number) => `${Math.round((v / base) * 100)}%`;
  const lines = [
    `Canvas ${rw}×${rh}px. Background: ${a.background.desc}; complexity ${a.background.complexity}; extendable edges: ${a.background.extendDirections.join(', ') || 'none'}.`,
    'Text blocks (id, position as % of width/height, font size, text):',
    ...a.blocks.map((b, i) => `T${i}: at x ${pct(b.x, rw)} y ${pct(b.y, rh)} size ${pct(b.w, rw)}×${pct(b.h, rh)}, ${Math.round(b.fontPx)}px, ${b.lines.length} line(s): ${JSON.stringify(b.lines.join(' / '))}`),
    'Non-text artwork (id, position, size):',
    ...a.components.slice(0, 6).map((c, i) => `A${i}: at x ${pct(c.x, rw)} y ${pct(c.y, rh)} size ${pct(c.w, rw)}×${pct(c.h, rh)}`),
  ];
  return lines.join('\n');
}
