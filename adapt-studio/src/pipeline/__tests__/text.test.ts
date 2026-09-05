import { describe, expect, it } from 'vitest';
import { normalizeModel } from '../model';
import { fitText, wrapText } from '../recompose';
import { approxMeasurer, attachTextSpecs, groupRunsIntoElements, inferAlign, isFilledShape, joinRuns, parseFontName, resolveFont, sampleTextColors } from '../text';
import type { PixelSampler, TextRun, TextSpec } from '../types';

describe('parseFontName()', () => {
  it('reads family, weight and style from PostScript names, dropping subset prefixes', () => {
    expect(parseFontName('ABCDEF+Merriweather-SemiBoldItalic')).toMatchObject({ family: 'Merriweather', weight: 600, italic: true });
    expect(parseFontName('Lato-Bold')).toMatchObject({ family: 'Lato', weight: 700, italic: false });
    expect(parseFontName('Figtree-ExtraBoldItalic')).toMatchObject({ family: 'Figtree', weight: 800, italic: true });
    expect(parseFontName('Helvetica')).toMatchObject({ family: 'Helvetica', weight: 400, italic: false });
    expect(parseFontName('OpenSansBold')).toMatchObject({ family: 'Open Sans', weight: 700 });
    expect(parseFontName('ArialMT')).toMatchObject({ family: 'Arial', weight: 400 });
    expect(parseFontName('Lato-LightItalic').label).toBe('Lato Light Italic');
  });
});

describe('resolveFont()', () => {
  it('prefers the embedded face, then a shipped web font, then the brand face per element type', () => {
    const embedded = { name: 'ABCDEF+Lato-Bold', loadedName: 'g_d0_f1' };
    expect(resolveFont('body', embedded, (f) => f === 'g_d0_f1')).toMatchObject({ family: 'g_d0_f1', weight: 400, fontSource: 'embedded', fontLabel: 'Lato Bold (embedded)' });
    expect(resolveFont('body', embedded, (f) => f === 'Lato')).toMatchObject({ family: 'Lato', weight: 700, fontSource: 'web' });
    expect(resolveFont('headline', { name: 'Gotham-BlackItalic', loadedName: 'g_d0_f2' }, () => false)).toMatchObject({ family: 'Merriweather', weight: 600, italic: true, fontSource: 'fallback' });
    expect(resolveFont('legal', null, () => false)).toMatchObject({ family: 'Lato', weight: 400, italic: false, fontSource: 'fallback' });
    expect(resolveFont('cta', null, () => false).weight).toBe(700);
  });
});

const model = normalizeModel({
  elements: [
    { type: 'headline', box: { x: 0.1, y: 0.3, w: 0.6, h: 0.12 }, lines: 2, text: 'Dreams from vision', shortForm: 'Dreams' },
    { type: 'legal', box: { x: 0.1, y: 0.85, w: 0.6, h: 0.04 }, lines: 1 },
    { type: 'cta', box: { x: 0.1, y: 0.55, w: 0.18, h: 0.06 }, lines: 1, text: 'Apply now', shortForm: 'Apply' },
    { type: 'logo', box: { x: 0.1, y: 0.1, w: 0.28, h: 0.07 } },
  ],
  background: { desc: 'flat', extendable: true, extendDirections: ['left'], complexity: 'simple', color: '#004bbe' },
}, 1000, '#004bbe');

const run = (str: string, x: number, y: number, w: number, fontPx: number, fontName = 'g_d0_f1', hasEOL = false): TextRun => ({ str, x, y, w, h: fontPx * 1.2, fontPx, fontName, hasEOL });

describe('groupRunsIntoElements()', () => {
  it('rebuilds lines in reading order inside each element box and ignores runs outside', () => {
    const runs = [
      run('Neither should', 100, 370, 300, 52, 'g_d0_f1'),
      run('you.', 410, 370, 80, 52, 'g_d0_f1', true),
      run('Dreams', 100, 300, 150, 52, 'g_d0_f1'),
      run("don't wait.", 260, 300, 230, 52, 'g_d0_f2'),
      run('Credit at sole discretion of the Bank.', 100, 852, 500, 28, 'g_d0_f3'),
      run('Stray footer text', 100, 960, 200, 20, 'g_d0_f4'),
    ];
    const g = groupRunsIntoElements(runs, model.elements, 1000, 1000);
    expect(g.get(0)).toMatchObject({ text: "Dreams don't wait.\nNeither should you.", fontName: 'g_d0_f1', fontPx: 52 });
    expect(g.get(1)).toMatchObject({ text: 'Credit at sole discretion of the Bank.', fontName: 'g_d0_f3' });
    expect(g.has(2)).toBe(false);
    expect(g.has(3)).toBe(false);
  });
});

const mixed = (weights: Array<[number, [number, number, number]]>): PixelSampler => (_x, _y, w, h) => {
  const d = new Uint8ClampedArray(w * h * 4);
  const total = weights.reduce((a, [n]) => a + n, 0);
  for (let p = 0; p < w * h; p++) {
    let r = (p >> 2) % total, c: [number, number, number] = weights[0][1];
    for (const [n, col] of weights) { if (r < n) { c = col; break; } r -= n; }
    d[p * 4] = c[0]; d[p * 4 + 1] = c[1]; d[p * 4 + 2] = c[2]; d[p * 4 + 3] = 255;
  }
  return d;
};

describe('sampleTextColors() / isFilledShape()', () => {
  it('finds navy text on an orange pill even with the blue page leaking into the box', () => {
    const s = mixed([[7, [255, 156, 0]], [1, [0, 58, 143]], [2, [0, 75, 190]]]);
    const c = sampleTextColors(s, { x: 0.1, y: 0.5, w: 0.2, h: 0.1 }, 1000, 1000);
    expect(c.bg).toBe('#ff9c00');
    expect(c.fg).toBe('#003a8f');
    expect(c.contrast).toBeGreaterThan(4.5);
    expect(isFilledShape(c.bg, '#004bbe')).toBe(true);
    expect(isFilledShape('#004cbe', '#004bbe')).toBe(false);
  });
  it('finds white text on the blue page', () => {
    const s = mixed([[8, [0, 75, 190]], [2, [255, 255, 255]]]);
    const c = sampleTextColors(s, { x: 0.1, y: 0.3, w: 0.6, h: 0.1 }, 1000, 1000);
    expect(c).toMatchObject({ fg: '#ffffff', bg: '#004bbe' });
  });
});

describe('joinRuns() / inferAlign()', () => {
  it('adds a space only at real word gaps and reads tracking from per-glyph runs', () => {
    // "S E A S O N" as pdf.js emits tracked text: one run per glyph, 0.3 em apart
    const glyphs = 'SEASON'.split('').map((ch, i) => ({ str: ch, x: 100 + i * 26, y: 0, w: 14, h: 24, fontPx: 20, fontName: 'f', hasEOL: false }));
    const words = [{ str: 'Apply', x: 0, y: 0, w: 50, h: 24, fontPx: 20, fontName: 'f', hasEOL: false }, { str: 'now', x: 58, y: 0, w: 30, h: 24, fontPx: 20, fontName: 'f', hasEOL: false }];
    expect(joinRuns(glyphs, 20)).toEqual({ text: 'SEASON', letterSpacing: 0.6 });
    expect(joinRuns(words, 20)).toEqual({ text: 'Apply now', letterSpacing: 0 });
    const tight = [{ str: 'Ap', x: 0, y: 0, w: 20, h: 24, fontPx: 20, fontName: 'f', hasEOL: false }, { str: 'ply', x: 21, y: 0, w: 30, h: 24, fontPx: 20, fontName: 'f', hasEOL: false }];
    expect(joinRuns(tight, 20).text).toBe('Apply');
  });
  it('tells left, centred and right-aligned blocks apart', () => {
    expect(inferAlign([{ x0: 100, x1: 500 }, { x0: 100, x1: 380 }], 100, 800)).toBe('left');
    expect(inferAlign([{ x0: 300, x1: 500 }, { x0: 350, x1: 450 }], 0, 800)).toBe('center');
    expect(inferAlign([{ x0: 400, x1: 700 }, { x0: 550, x1: 700 }], 0, 700)).toBe('right');
  });
});

describe('attachTextSpecs()', () => {
  const white = mixed([[8, [0, 75, 190]], [2, [255, 255, 255]]]);
  it('uses PDF runs when present, the vision transcription otherwise, and no spec when neither exists', () => {
    const runs = [run("Dreams don't wait.", 100, 300, 500, 52, 'g_d0_f1', true), run('Neither should you.', 100, 370, 500, 52, 'g_d0_f1')];
    const fonts = new Map([['g_d0_f1', { name: 'ABCDEF+Figtree-ExtraBoldItalic', loadedName: 'g_d0_f1' }]]);
    const out = attachTextSpecs(model, { runs, fonts, sample: white, rw: 1000, rh: 1000, fontAvailable: (f) => f === 'g_d0_f1' });
    const hl = out.elements[0].text as TextSpec;
    expect(hl.content).toBe("Dreams don't wait.\nNeither should you.");
    expect(hl.source).toBe('pdf');
    expect(hl.fontSource).toBe('embedded');
    expect(hl.shortForm).toBe('Dreams');
    expect(hl.color).toBe('#ffffff');
    expect(out.elements[0].fontPx).toBe(52); // exact size from the PDF replaces the estimate
    // the model's estimated box is replaced by the runs' real bounds (+2% breathing room)
    const b = out.elements[0].box;
    expect(b.x).toBeCloseTo((100 - 10) / 1000, 3);
    expect(b.y).toBeCloseTo((300 - 2.496) / 1000, 3);
    expect(b.w).toBeCloseTo((500 + 20) / 1000, 3);
    expect(out.elements[2].box).toEqual(model.elements[2].box); // no runs: box untouched
    expect(out.elements[1].text).toBeUndefined(); // legal: no runs, no transcription
    expect(out.elements[2].text).toMatchObject({ content: 'Apply now', source: 'vision', fontSource: 'fallback', family: 'Lato' });
    expect(out.elements[3].text).toBeUndefined(); // logo is not text
  });
  it('marks a CTA as a pill when its box is a different colour from the page', () => {
    const pill = mixed([[7, [255, 156, 0]], [1, [0, 58, 143]], [2, [0, 75, 190]]]);
    const out = attachTextSpecs(model, { sample: pill, rw: 1000, rh: 1000, fontAvailable: () => false });
    expect(out.elements[2].text).toMatchObject({ bgColor: '#ff9c00', color: '#003a8f' });
  });
});

describe('wrapText() / fitText()', () => {
  const spec: TextSpec = { content: '', shortForm: '', family: 'Lato', weight: 400, italic: false, color: '#fff', bgColor: '', lineHeight: 1.25, letterSpacing: 0, align: 'left', source: 'demo', fontSource: 'web', fontLabel: '' };
  it('wraps greedily at maxW and honours explicit breaks', () => {
    // approxMeasurer: 0.5 × px per character → at 10px, 20 chars per 100px
    expect(wrapText(approxMeasurer, spec, 10, 'aaaa bbbb cccc dddd eeee', 100)).toEqual(['aaaa bbbb cccc dddd', 'eeee']);
    expect(wrapText(approxMeasurer, spec, 10, 'one\ntwo three', 100)).toEqual(['one', 'two three']);
    expect(wrapText(approxMeasurer, spec, 10, 'supercalifragilisticexpialidocious x', 50)).toEqual(['supercalifragilisticexpialidocious', 'x']);
  });
  it('picks the largest size whose wrap fits the box and line cap', () => {
    const fit = fitText(approxMeasurer, spec, 'Credit at sole discretion of the Bank. T&C apply.', 260, 100, { maxPx: 30, minPx: 14, maxLines: 2 });
    expect(fit).not.toBeNull();
    expect(fit!.lines).toHaveLength(2);
    expect(fit!.px).toBeGreaterThan(14);
    expect(fit!.w).toBeLessThanOrEqual(260);
    expect(fitText(approxMeasurer, spec, 'Credit at sole discretion of the Bank. T&C apply.', 100, 20, { maxPx: 14, minPx: 14, maxLines: 1 })).toBeNull();
  });
});
