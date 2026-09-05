import { describe, expect, it } from 'vitest';
import { deriveFontPx, firstIllegible, isResettable, keepUnion, measureContrast, normalizeModel, sampleBgColor } from '../model';
import type { ObjectModel, PixelSampler, RawObjectModel } from '../types';

const solid = (r: number, g: number, b: number): PixelSampler => (_x, _y, w, h) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  return d;
};

describe('deriveFontPx()', () => {
  it('is (boxH / lines) × 0.78', () => {
    expect(deriveFontPx(200, 2)).toBeCloseTo(78);
    expect(deriveFontPx(100, 1)).toBeCloseTo(78);
  });
  it('clamps to [boxH × 0.12, boxH × 1.05] and ignores nonsense line counts', () => {
    expect(deriveFontPx(100, 12)).toBeCloseTo(12); // 6.5 → floor 12
    expect(deriveFontPx(100, 0)).toBeCloseTo(78); // 0 → 1 line
    expect(deriveFontPx(100, undefined)).toBeCloseTo(78);
    expect(deriveFontPx(100, 99)).toBeCloseTo(12); // capped at 12 lines then floored
  });
});

describe('normalizeModel()', () => {
  const raw: RawObjectModel = {
    elements: [
      { type: 'logo', desc: 'wordmark', box: { x: 0.1, y: 0.1, w: 0.3, h: 0.07 }, mustKeep: false, droppable: true, lines: 0 },
      { type: 'headline', desc: 'hl', box: { x: 0.1, y: 0.3, w: 0.6, h: 0.12 }, lines: 2 },
      { type: 'legal', desc: 'tc', box: { x: 0.1, y: 0.85, w: 0.6, h: 0.04 }, lines: 1, minLegiblePx: 0 },
      { type: 'BANANA', desc: 'unknown', box: { x: 1.4, y: -0.2, w: 0, h: 0 } },
      { type: 'product', desc: 'card', box: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, mustKeep: true },
    ],
    background: { desc: 'gradient', extendable: true, extendDirections: ['left', 'diagonal', 'right'], complexity: 'complex', color: '#123456' },
    regulated: false,
    notes: 'protect legal',
  };
  const m = normalizeModel(raw, 2000, '#004bbe');

  it('forces mustKeep on logo/headline/cta/legal regardless of the model output', () => {
    expect(m.elements.find((e) => e.type === 'logo')?.mustKeep).toBe(true);
    expect(m.elements.find((e) => e.type === 'legal')?.mustKeep).toBe(true);
    expect(m.elements.find((e) => e.type === 'product')?.mustKeep).toBe(true); // honoured when the model says so
  });
  it('derives fontPx from box height ÷ lines and fills default minLegiblePx', () => {
    const hl = m.elements.find((e) => e.type === 'headline')!;
    expect(hl.fontPx).toBeCloseTo((0.12 * 2000 / 2) * 0.78);
    expect(hl.minLegiblePx).toBe(24);
    const legal = m.elements.find((e) => e.type === 'legal')!;
    expect(legal.minLegiblePx).toBe(18); // 0 from the model → default
    expect(m.elements.find((e) => e.type === 'logo')?.fontPx).toBe(0);
  });
  it('sanitises unknown types and out-of-range boxes', () => {
    const odd = m.elements[3];
    expect(odd.type).toBe('decorative');
    expect(odd.droppable).toBe(true);
    expect(odd.box).toEqual({ x: 1, y: 0, w: 0.01, h: 0.01 });
  });
  it('treats the client as regulated even when the model says otherwise, but remembers what was detected', () => {
    expect(m.regulated).toBe(true);
    expect(m.detectedRegulated).toBe(false);
  });
  it('never trusts the model for background colour and disables expand on complex backgrounds', () => {
    expect(m.background.color).toBe('#004bbe');
    expect(m.background.extendable).toBe(false);
    expect(m.background.extendDirections).toEqual(['left', 'right']);
  });
  it('caps the element list at 10', () => {
    const many = normalizeModel({ elements: Array.from({ length: 14 }, () => ({ type: 'body', box: { x: 0, y: 0, w: 0.1, h: 0.1 } })) }, 1000, '#fff');
    expect(many.elements).toHaveLength(10);
  });
});

describe('sampleBgColor()', () => {
  it('averages the four corner samples into a hex colour', () => {
    expect(sampleBgColor(solid(0, 75, 190), 2000, 2000)).toBe('#004bbe');
    expect(sampleBgColor(solid(255, 255, 255), 100, 100)).toBe('#ffffff');
  });
});

describe('measureContrast()', () => {
  const model = normalizeModel({ elements: [
    { type: 'headline', box: { x: 0.1, y: 0.1, w: 0.4, h: 0.1 }, lines: 1 },
    { type: 'logo', box: { x: 0.1, y: 0.5, w: 0.2, h: 0.1 } },
  ] }, 1000, '#000');

  it('reports 21:1 for black text on white and leaves non-text at 0', () => {
    const half: PixelSampler = (_x, _y, w, h) => {
      const d = new Uint8ClampedArray(w * h * 4);
      // alternate per 4-px sampling stride so the sampled pixels are half black, half white
      for (let p = 0; p < w * h; p++) { const v = (p >> 2) & 1 ? 255 : 0; d[p * 4] = v; d[p * 4 + 1] = v; d[p * 4 + 2] = v; d[p * 4 + 3] = 255; }
      return d;
    };
    const out = measureContrast(model, half, 1000, 1000);
    expect(out.elements[0].contrast).toBeCloseTo(21, 1);
    expect(out.elements[1].contrast).toBe(0);
  });
  it('measures a CTA against its own pill, not the page behind it', () => {
    // 70% orange pill (lum .45), 10% navy glyphs (lum .05), 20% blue page (lum .087) leaking into the box
    const pill: PixelSampler = (_x, _y, w, h) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let p = 0; p < w * h; p++) {
        const r = (p >> 2) % 10;
        const [cr, cg, cb] = r < 7 ? [255, 156, 0] : r < 8 ? [0, 58, 143] : [0, 75, 190];
        d[p * 4] = cr; d[p * 4 + 1] = cg; d[p * 4 + 2] = cb; d[p * 4 + 3] = 255;
      }
      return d;
    };
    const c = measureContrast(model, pill, 1000, 1000).elements[0].contrast;
    expect(c).toBeGreaterThan(4.5); // navy on orange ≈ 5.0:1, not orange on blue ≈ 3.6:1
    expect(c).toBeLessThan(5.5);
  });
  it('judges re-set text by the colours it will be drawn in, not by the master pixels', () => {
    const spec = { content: 'x', shortForm: '', family: 'Lato', weight: 400, italic: false, color: '#ffffff', bgColor: '', lineHeight: 1.2, letterSpacing: 0, align: 'left' as const, source: 'pdf' as const, fontSource: 'web' as const, fontLabel: '' };
    const withText = { ...model, background: { ...model.background, color: '#8b1a1a' }, elements: [{ ...model.elements[0], text: spec }, model.elements[1]] };
    // thin white letters on maroon: the raster sample would read a blend, the colours say ≈ 9:1
    const out = measureContrast(withText, solid(150, 60, 60), 1000, 1000);
    expect(out.elements[0].contrast).toBeGreaterThan(8.5);
    const pill = { ...withText, elements: [{ ...withText.elements[0], text: { ...spec, color: '#003a8f', bgColor: '#ff9c00' } }] };
    expect(measureContrast(pill, solid(150, 60, 60), 1000, 1000).elements[0].contrast).toBeCloseTo(5.0, 0);
  });
  it('reports 1:1 for text on an identical background', () => {
    expect(measureContrast(model, solid(128, 128, 128), 1000, 1000).elements[0].contrast).toBeCloseTo(1, 5);
  });
});

describe('keepUnion() / firstIllegible()', () => {
  const model: ObjectModel = normalizeModel({ elements: [
    { type: 'logo', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
    { type: 'legal', box: { x: 0.5, y: 0.8, w: 0.4, h: 0.05 }, lines: 1 },
    { type: 'decorative', box: { x: 0, y: 0, w: 1, h: 1 } },
  ] }, 1000, '#000');

  it('unions only mustKeep boxes', () => {
    const u = keepUnion(model, 1000, 1000);
    expect(u.x0).toBeCloseTo(100); expect(u.y0).toBeCloseTo(100); expect(u.x1).toBeCloseTo(900); expect(u.y1).toBeCloseTo(850);
  });
  it('falls back to the whole raster when nothing is protected', () => {
    expect(keepUnion({ ...model, elements: [] }, 640, 480)).toEqual({ x0: 0, y0: 0, x1: 640, y1: 480 });
  });
  it('flags the first protected text element below its floor at a given scale', () => {
    // legal fontPx = 50 × 0.78 = 39; floor 18 → illegible below scale ≈ 0.46
    expect(firstIllegible(model, 0.5)).toBeUndefined();
    expect(firstIllegible(model, 0.4)?.type).toBe('legal');
  });
});

describe('isResettable()', () => {
  const text = { content: 'x', shortForm: '', family: 'Lato', weight: 400, italic: false, color: '#fff', bgColor: '', lineHeight: 1.2, letterSpacing: 0, align: 'left' as const, source: 'pdf' as const, fontSource: 'web' as const, fontLabel: '' };
  const flat = normalizeModel({ elements: [
    { type: 'logo', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
    { type: 'headline', box: { x: 0.1, y: 0.3, w: 0.6, h: 0.1 }, lines: 1, text: 'x' },
    { type: 'legal', box: { x: 0.1, y: 0.8, w: 0.6, h: 0.04 }, lines: 1, text: 'x' },
  ], background: { complexity: 'simple' } }, 1000, '#000');
  const withText = (m: ObjectModel): ObjectModel => ({ ...m, elements: m.elements.map((e) => (e.fontPx > 0 ? { ...e, text } : e)) });
  it('needs every text element to carry a spec, only a logo besides text, and a flat background', () => {
    expect(isResettable(withText(flat))).toBe(true);
    expect(isResettable(flat)).toBe(false); // no text specs
    expect(isResettable({ ...withText(flat), background: { ...flat.background, complexity: 'complex' } })).toBe(false);
    const photo = withText(flat);
    expect(isResettable({ ...photo, elements: [...photo.elements, { ...photo.elements[0], type: 'person' }] })).toBe(false);
  });
});
