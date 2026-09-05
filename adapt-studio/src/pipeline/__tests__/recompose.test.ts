import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZES } from '../constants';
import { normalizeModel } from '../model';
import { planAdapt } from '../plan';
import { fitText, wrapBalanced, wrapText } from '../recompose';
import { approxMeasurer } from '../text';
import type { ObjectModel, TargetSize, TextSpec } from '../types';

const spec = (content: string, family: string, weight: number, italic: boolean, bgColor = '', shortForm = ''): TextSpec => ({
  content, shortForm, family, weight, italic, color: bgColor ? '#003a8f' : '#ffffff', bgColor, lineHeight: 1.2, letterSpacing: 0, align: 'left', source: 'pdf', fontSource: 'fallback', fontLabel: family,
});
const plain = spec('', 'Lato', 400, false);

describe('wrapBalanced()', () => {
  // approxMeasurer: 0.5 × px per character (Lato 400) → at 10px, 5px per character
  it('keeps the greedy line count but never strands a lone short word on the last line', () => {
    // greedy: "Dreams don't" / "wait." — balanced: "Dreams" / "don't wait."
    expect(wrapText(approxMeasurer, plain, 10, 'Dreams don’t wait.', 65)).toEqual(['Dreams don’t', 'wait.']);
    expect(wrapBalanced(approxMeasurer, plain, 10, 'Dreams don’t wait.', 65)).toEqual(['Dreams', 'don’t wait.']);
  });
  it('evens out the measure instead of breaking after a comma', () => {
    const text = 'Personal Loan up to 25 lakh, approved in 10 minutes.';
    expect(wrapText(approxMeasurer, plain, 10, text, 100)).toEqual(['Personal Loan up to', '25 lakh, approved in', '10 minutes.']);
    const lines = wrapBalanced(approxMeasurer, plain, 10, text, 100);
    expect(lines).toHaveLength(3);
    const widths = lines.map((l) => approxMeasurer(plain, 10, l));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(45);
    expect(lines[1].endsWith(',')).toBe(false);
  });
  it('honours explicit line breaks and single-line paragraphs unchanged', () => {
    expect(wrapBalanced(approxMeasurer, plain, 10, 'one\ntwo three', 100)).toEqual(['one', 'two three']);
    expect(wrapBalanced(approxMeasurer, plain, 10, 'supercalifragilisticexpialidocious x', 50)).toEqual(['supercalifragilisticexpialidocious', 'x']);
  });
  it('fitText treats the master’s own breaks as soft when they alone exceed the line budget', () => {
    const fit = fitText(approxMeasurer, plain, 'Dreams don’t wait.\nNeither should you.', 400, 40, { maxPx: 20, minPx: 10, maxLines: 1 });
    expect(fit?.lines).toEqual(['Dreams don’t wait. Neither should you.']);
  });
});

// A model shaped like the e2e test PDF after attachTextSpecs (600pt page → 2000px raster).
const S = 2000 / 600;
const base = normalizeModel({
  elements: [
    { type: 'logo', box: { x: 0.1, y: 1 - 536 / 600, w: 260 / 600, h: 40 / 600 } },
    { type: 'headline', box: { x: 0.1, y: 1 - 436 / 600, w: 0.7, h: 96 / 600 }, lines: 2, text: 'Dreams don’t wait.\nNeither should you.', shortForm: 'Dreams don’t wait.' },
    { type: 'body', box: { x: 0.1, y: 1 - 316 / 600, w: 0.78, h: 24 / 600 }, lines: 1, text: 'Personal Loan up to 25 lakh, approved in 10 minutes.' },
    { type: 'cta', box: { x: 0.1, y: 1 - 256 / 600, w: 200 / 600, h: 56 / 600 }, lines: 1, text: 'Apply now', shortForm: 'Apply' },
    { type: 'legal', box: { x: 0.1, y: 1 - 78 / 600, w: 0.7, h: 20 / 600 }, lines: 1, text: 'Credit at sole discretion of the Bank. T&C apply.' },
  ],
  background: { desc: 'flat', extendable: true, extendDirections: ['left', 'right', 'top', 'bottom'], complexity: 'simple', color: '#004bbe' },
}, 2000, '#004bbe');
const fontPx: Record<string, number> = { headline: 44 * S, body: 22 * S, cta: 24 * S, legal: 18 * S };
const pdfModel: ObjectModel = {
  ...base,
  elements: base.elements.map((e) => ({
    ...e,
    fontPx: fontPx[e.type] ?? 0,
    // attachTextSpecs keeps the PDF's own line structure; normalizeModel's visionText flattens it
    text: e.type === 'headline' ? spec('Dreams don’t wait.\nNeither should you.', 'Merriweather', 600, true, '', 'Dreams don’t wait.')
      : e.type === 'body' ? spec(e.visionText, 'Lato', 400, false)
        : e.type === 'cta' ? spec(e.visionText, 'Lato', 700, false, '#ff9c00', 'Apply')
          : e.type === 'legal' ? spec(e.visionText, 'Lato', 400, false) : undefined,
  })),
};
const size = (w: number, h: number) => DEFAULT_SIZES.find((s) => s.w === w && s.h === h) as TargetSize;
const plan = (t: TargetSize) => planAdapt({ rw: 2000, rh: 2000, ratio: 1 }, pdfModel, t, { measure: approxMeasurer });

describe('planRecompose() on a PDF-derived master', () => {
  it('prefers the full message at a smaller size over a bigger headline that says less', () => {
    for (const [w, h] of [[1200, 628], [1080, 1350], [1080, 1920]] as const) {
      const r = plan(size(w, h));
      if (r.plan.kind !== 'RECOMPOSE') throw new Error(`${w}x${h}: expected a rebuild`);
      const s = r.plan.changes.join(' ');
      expect(s, `${w}x${h}`).toMatch(/headline re-set in 2 lines/);
      expect(s, `${w}x${h}`).not.toContain('short-form');
      expect(r.plan.dropped, `${w}x${h}`).toEqual([]);
    }
  });
  it('uses the short headline where the strip or the compact banner cannot carry the full one', () => {
    for (const [w, h] of [[728, 90], [300, 250]] as const) {
      const r = plan(size(w, h));
      if (r.plan.kind !== 'RECOMPOSE') throw new Error(`${w}x${h}: expected a rebuild`);
      expect(r.plan.changes.join(' '), `${w}x${h}`).toMatch(/headline short-form re-set in 1 line/);
    }
  });
  it('keeps every element inside the safe zone and above its floor on every default size that is not blocked', () => {
    for (const t of DEFAULT_SIZES) {
      const r = plan(t);
      if (r.plan.kind !== 'RECOMPOSE') continue;
      const m = r.margins;
      for (const k of r.plan.keepRects) {
        expect(k.x, `${t.w}x${t.h} ${k.type}`).toBeGreaterThanOrEqual(t.w * m.l - 2);
        expect(k.x + k.w, `${t.w}x${t.h} ${k.type}`).toBeLessThanOrEqual(t.w * (1 - m.r) + 2);
        expect(k.y, `${t.w}x${t.h} ${k.type}`).toBeGreaterThanOrEqual(t.h * m.t - 2);
        expect(k.y + k.h, `${t.w}x${t.h} ${k.type}`).toBeLessThanOrEqual(t.h * (1 - m.b) + 2);
        if (k.min) expect(k.fontPx, `${t.w}x${t.h} ${k.type}`).toBeGreaterThanOrEqual(k.min - 0.5);
      }
      expect(r.plan.overflows, `${t.w}x${t.h}`).toEqual([]);
    }
  });
  it('sizes the logo from the master’s logo-to-headline ratio, never below 20px', () => {
    const r = plan(size(1080, 1350));
    if (r.plan.kind !== 'RECOMPOSE') throw new Error('expected a rebuild');
    const logo = r.plan.keepRects.find((k) => k.type === 'logo')!, hl = r.plan.keepRects.find((k) => k.type === 'headline')!;
    // master: 40pt logo box vs 44pt headline (+4 % patch padding) → ≈ 0.98 em; width-capped at 60 % of the column
    expect(logo.h / hl.fontPx).toBeGreaterThan(0.5);
    expect(logo.h / hl.fontPx).toBeLessThan(1.1);
    expect(logo.h).toBeGreaterThanOrEqual(20);
  });
});
