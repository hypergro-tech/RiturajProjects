import { describe, expect, it } from 'vitest';
import { analyzeBackground, analyzeLayout, describeLayout, findComponents, groupRunsIntoBlocks, mergeClassification, shortFormOf } from '../layout';
import type { PixelSampler, TextRun } from '../types';

const RW = 1000, RH = 1000;
const BLUE: [number, number, number] = [0, 75, 190];
const ORANGE: [number, number, number] = [255, 156, 0];
const WHITE: [number, number, number] = [255, 255, 255];

/** A synthetic master: blue page, orange CTA pill, white logo bar top-right, big white product block, dark text glyph pixels. */
const sampler: PixelSampler = (x, y, w, h) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = x + i, py = y + j;
      let c = BLUE;
      if (px >= 100 && px < 300 && py >= 700 && py < 760) c = ORANGE; // CTA pill
      if (px >= 700 && px < 940 && py >= 40 && py < 100) c = WHITE; // logo bar
      if (px >= 620 && px < 940 && py >= 300 && py < 640) c = WHITE; // product
      if (px >= 100 && px < 700 && py >= 200 && py < 330 && (px + py) % 7 === 0) c = WHITE; // headline glyph speckle
      if (px >= 120 && px < 280 && py >= 715 && py < 745 && (px + py) % 5 === 0) c = [0, 58, 143]; // navy CTA glyphs
      const o = (j * w + i) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  return d;
};

const run = (str: string, x: number, y: number, fontPx: number, fontName = 'g_d0_f1', hasEOL = false): TextRun =>
  ({ str, x, y, w: str.length * fontPx * 0.5, h: fontPx * 1.2, fontPx, fontName, hasEOL });

const RUNS: TextRun[] = [
  run('Dreams don’t wait.', 100, 200, 60, 'g_d0_f1', true),
  run('Neither should you.', 100, 270, 60, 'g_d0_f1'),
  run('Personal Loan up to 25 lakh, approved in 10 minutes.', 100, 400, 28, 'g_d0_f2'),
  run('Apply now', 120, 715, 24, 'g_d0_f1'),
  run('Credit at sole discretion of the Bank. T&C apply.', 100, 900, 16, 'g_d0_f2'),
];

describe('groupRunsIntoBlocks()', () => {
  it('merges consecutive same-size lines into one block and keeps the rest apart', () => {
    const blocks = groupRunsIntoBlocks(RUNS);
    expect(blocks.map((b) => b.lines)).toEqual([
      ['Dreams don’t wait.', 'Neither should you.'],
      ['Personal Loan up to 25 lakh, approved in 10 minutes.'],
      ['Apply now'],
      ['Credit at sole discretion of the Bank. T&C apply.'],
    ]);
    expect(blocks[0].fontPx).toBe(60);
    expect(blocks[0].h).toBeCloseTo(270 + 72 - 200);
  });
  it('splits side-by-side runs on the same baseline into separate blocks', () => {
    const blocks = groupRunsIntoBlocks([run('Left label', 50, 100, 20), run('Right label', 700, 100, 20)]);
    expect(blocks).toHaveLength(2);
  });
});

describe('findComponents() / analyzeBackground()', () => {
  const blocks = groupRunsIntoBlocks(RUNS);
  it('finds the non-text artwork and ignores text', () => {
    const comps = findComponents(sampler, RW, RH, '#004bbe', blocks);
    expect(comps.length).toBeGreaterThanOrEqual(2);
    const product = comps[0];
    expect(product.x).toBeLessThanOrEqual(620); expect(product.x + product.w).toBeGreaterThanOrEqual(940);
    expect(product.y).toBeLessThanOrEqual(300); expect(product.y + product.h).toBeGreaterThanOrEqual(640);
    const logo = comps.find((c) => c.y < 120 && c.x > 600);
    expect(logo).toBeDefined();
    // the headline speckle sits inside a text block and must not become a component
    expect(comps.some((c) => c.x < 400 && c.y > 150 && c.y < 350)).toBe(false);
  });
  it('reads a flat blue field as fully extendable and simple', () => {
    const bg = analyzeBackground(sampler, RW, RH, '#004bbe');
    expect(bg.extendDirections).toEqual(['top', 'bottom', 'left', 'right']);
    expect(bg.complexity).toBe('simple');
    expect(bg.extendable).toBe(true);
  });
  it('marks an edge covered by artwork as not extendable', () => {
    const busyRight: PixelSampler = (x, y, w, h) => {
      const d = sampler(x, y, w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (x + i > 960) { const o = (j * w + i) * 4; d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; }
      return d;
    };
    expect(analyzeBackground(busyRight, RW, RH, '#004bbe').extendDirections).toEqual(['top', 'bottom', 'left']);
  });
});

describe('heuristicModel() via analyzeLayout()', () => {
  const a = analyzeLayout({ runs: RUNS, sample: sampler, rw: RW, rh: RH, bgHex: '#004bbe' });
  const byType = Object.fromEntries(a.model.elements!.map((e) => [e.type, e]));

  it('classifies headline, body, CTA (on its pill) and legal from size, vocabulary and position', () => {
    expect(byType.headline?.text).toBe('Dreams don’t wait.\nNeither should you.');
    expect(byType.headline?.lines).toBe(2);
    expect(byType.headline?.shortForm).toBe('Dreams don’t wait');
    expect(byType.body?.text).toContain('Personal Loan');
    expect(byType.cta?.text).toBe('Apply now');
    expect(byType.legal?.text).toContain('T&C apply');
    expect(byType.legal?.mustKeep).toBe(true);
    expect(a.model.regulated).toBe(true);
  });
  it('takes the corner-hugging wide artwork as the logo and the largest artwork as the product', () => {
    expect(byType.logo?.box?.y).toBeLessThan(0.12);
    expect(byType.logo?.box?.x).toBeGreaterThan(0.6);
    expect(byType.product?.box?.w).toBeGreaterThan(0.25);
  });
  it('describes the layout for a text-only model with stable ids', () => {
    const d = describeLayout(a, RW, RH);
    expect(d).toContain('T0: at x 10% y 20%');
    expect(d).toContain('"Dreams don’t wait. / Neither should you."');
    expect(d).toMatch(/A0: at x \d+% y \d+%/);
  });
  it('merges a text-only classification without losing the measured boxes or text', () => {
    const merged = mergeClassification(a, {
      T0: { type: 'headline', desc: 'Campaign line', shortForm: 'Dreams first' },
      T1: { type: 'subhead', mustKeep: true },
      T2: { type: 'cta' },
      T3: { type: 'legal' },
      A0: { type: 'product', desc: 'Card visual' },
      A1: { type: 'logo', desc: 'Federal Bank wordmark' },
      regulated: true,
      notes: 'Protect the disclaimer',
    }, RW, RH);
    const t = Object.fromEntries(merged.elements!.map((e) => [e.type, e]));
    expect(t.headline?.shortForm).toBe('Dreams first');
    expect(t.headline?.text).toBe('Dreams don’t wait.\nNeither should you.');
    expect(t.subhead?.mustKeep).toBe(true);
    expect(t.logo?.desc).toBe('Federal Bank wordmark');
    expect(t.logo?.box).toEqual(byType.logo?.box);
    expect(merged.notes).toBe('Protect the disclaimer');
  });
  it('ignores nonsense from the model and keeps the heuristic answer', () => {
    const merged = mergeClassification(a, { T0: { type: 'banana' as never, mustKeep: 'yes' as never } }, RW, RH);
    expect(merged.elements![0].type).toBe('headline');
    expect(merged.elements![0].mustKeep).toBe(true);
  });
});

describe('shortFormOf()', () => {
  it('uses the first short clause, else the first three words, else nothing', () => {
    expect(shortFormOf('Dreams don’t wait. Neither should you.')).toBe('Dreams don’t wait');
    expect(shortFormOf('Personal loans approved in ten minutes flat')).toBe('Personal loans approved');
    expect(shortFormOf('Apply now')).toBe('');
  });
});
