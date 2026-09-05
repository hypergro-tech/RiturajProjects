import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZES } from '../constants';
import { demoModel } from '../demoData';
import { runGates } from '../gates';
import { isResettable } from '../model';
import { planAdapt } from '../plan';
import { approxMeasurer } from '../text';
import type { MasterInfo, ObjectModel, TaggedElement, TargetSize } from '../types';

const master: MasterInfo = { rw: 2000, rh: 2000, ratio: 1 };
const model = demoModel(2000, '#004bbe');
/** The same model with no text attached: every text element falls back to a raster patch. */
const patchOnly: ObjectModel = { ...model, elements: model.elements.map((e) => ({ ...e, text: undefined })) };
/** A photo master: the demo plus a product visual on a moderate background — not re-settable, so ratio bands apply. */
const product: TaggedElement = {
  type: 'product', desc: 'Card visual', box: { x: 0.72, y: 0.3, w: 0.2, h: 0.3 }, priority: 5, mustKeep: false, droppable: false,
  minLegiblePx: 0, fontPx: 0, contrast: 0, visionText: '', visionShortForm: '',
};
const photo: ObjectModel = { ...model, elements: [...model.elements, product], background: { ...model.background, complexity: 'moderate' } };
const opts = { measure: approxMeasurer };
const size = (w: number, h: number) => DEFAULT_SIZES.find((s) => s.w === w && s.h === h) as TargetSize;
const gatesFor = (t: TargetSize, m: ObjectModel = model) => {
  const r = planAdapt(master, m, t, opts);
  return { r, gates: runGates(r.plan, m, t.w, t.h, r.margins, !!t.social) };
};
const allPass = (gates: { pass: boolean }[]) => gates.slice(0, 5).every((g) => g.pass);

describe('planAdapt() on the demo master (flat, fully re-settable)', () => {
  it('is re-settable: text with specs, a logo, a flat field', () => {
    expect(isResettable(model)).toBe(true);
    expect(isResettable(patchOnly)).toBe(false);
    expect(isResettable(photo)).toBe(false);
  });

  it('SCALE for the 1:1 feed square with no escalation', () => {
    const { r, gates } = gatesFor(size(1080, 1080));
    expect(r.plan.kind).toBe('SCALE');
    expect(r.escalations).toEqual([]);
    expect(allPass(gates)).toBe(true);
  });

  it('rebuilds every other size on the layout system instead of cropping or extending a text-only master', () => {
    for (const [w, h] of [[1080, 1350], [1080, 1920], [1200, 628], [300, 250], [300, 600]] as const) {
      const { r, gates } = gatesFor(size(w, h));
      expect(r.routed.reason, `${w}x${h}`).toBe('layout-system');
      expect(r.plan.kind, `${w}x${h}`).toBe('RECOMPOSE');
      expect(r.escalations, `${w}x${h}`).toEqual([]);
      expect(allPass(gates), `${w}x${h} ${JSON.stringify(gates)}`).toBe(true);
      if (r.plan.kind === 'RECOMPOSE') expect(r.plan.overflows, `${w}x${h}`).toEqual([]);
    }
  });

  it('keeps the full headline and the body on the large social sizes', () => {
    for (const [w, h] of [[1080, 1350], [1080, 1920], [1200, 628]] as const) {
      const r = planAdapt(master, model, size(w, h), opts);
      if (r.plan.kind !== 'RECOMPOSE') throw new Error('expected a rebuild');
      const s = r.plan.changes.join(' ');
      expect(s, `${w}x${h}`).toMatch(/headline re-set in 2 lines at \d+px/);
      expect(s, `${w}x${h}`).toMatch(/body re-set in \d lines? at \d+px/);
      expect(s, `${w}x${h}`).toMatch(/legal re-set in 1 line at \d+px/);
      expect(r.plan.dropped, `${w}x${h}`).toEqual([]);
      expect(r.plan.ops.some((o) => o.kind === 'pill')).toBe(true);
    }
  });

  it('follows the master type scale: body, CTA and legal sizes are ratios of the headline size', () => {
    const r = planAdapt(master, model, size(1080, 1350), opts);
    if (r.plan.kind !== 'RECOMPOSE') throw new Error('expected a rebuild');
    const rects = r.plan.keepRects;
    const px = (t: string) => rects.find((k) => k.type === t)?.fontPx ?? 0;
    // demo master: headline 56, body 30, cta 27, legal 30 → body ≈ 0.54 h, cta ≈ 0.48 h, legal capped at 0.8 × body
    expect(px('headline')).toBeGreaterThanOrEqual(60);
    expect(px('cta') / px('headline')).toBeCloseTo(27 / 56, 1);
    expect(px('legal')).toBeLessThanOrEqual(px('headline') * 0.54 * 0.8 + 1);
    expect(px('legal')).toBeGreaterThanOrEqual(18);
  });

  it('anchors the legal line to the bottom inset and the logo to the top inset', () => {
    const r = planAdapt(master, model, size(1080, 1920), opts);
    if (r.plan.kind !== 'RECOMPOSE') throw new Error('expected a rebuild');
    const legal = r.plan.keepRects.find((k) => k.type === 'legal');
    const logo = r.plan.keepRects.find((k) => k.type === 'logo');
    // 9:16 social: 14 % top, 35 % bottom safe zone
    expect(logo && logo.y).toBeCloseTo(1920 * 0.14, 0);
    expect(legal && legal.y + legal.h).toBeCloseTo(1920 * 0.65, 0);
  });

  it('rebuilds 300×250 with the short headline and the disclaimer on two lines', () => {
    const { r, gates } = gatesFor(size(300, 250));
    expect(r.plan.kind).toBe('RECOMPOSE');
    expect(allPass(gates)).toBe(true);
    if (r.plan.kind === 'RECOMPOSE') {
      expect(r.plan.changes.join(' ')).toMatch(/headline short-form re-set in 1 line at \d+px/);
      expect(r.plan.changes.join(' ')).toContain('legal re-set in 2 lines at 14px');
      expect(r.plan.overflows).toEqual([]);
    }
  });

  it('rebuilds the narrow display sizes with wrapped text and passes the gates', () => {
    for (const [w, h] of [[160, 600], [300, 600]] as const) {
      const { r, gates } = gatesFor(size(w, h));
      expect(r.plan.kind, `${w}x${h}`).toBe('RECOMPOSE');
      expect(allPass(gates), `${w}x${h} gates ${JSON.stringify(gates)}`).toBe(true);
      if (r.plan.kind === 'RECOMPOSE') expect(r.plan.overflows, `${w}x${h}`).toEqual([]);
    }
  });

  it('sets the leaderboard as one row: logo, headline and CTA share a centre line, legal below', () => {
    const { r, gates } = gatesFor(size(728, 90));
    expect(r.routed.skinny).toBe(true);
    expect(r.plan.kind).toBe('RECOMPOSE');
    expect(allPass(gates)).toBe(true);
    if (r.plan.kind === 'RECOMPOSE') {
      expect(r.plan.changes.join(' ')).toMatch(/headline short-form re-set in 1 line at \d+px/);
      const rects = r.plan.keepRects;
      const kr = (t: string) => rects.find((k) => k.type === t)!;
      const cy = (k: { y: number; h: number }) => k.y + k.h / 2;
      expect(Math.abs(cy(kr('logo')) - cy(kr('headline')))).toBeLessThan(1);
      expect(Math.abs(cy(kr('cta')) - cy(kr('headline')))).toBeLessThan(1);
      expect(kr('cta').x + kr('cta').w).toBeCloseTo(728 - 12, 0);
      expect(kr('legal').y).toBeGreaterThan(kr('logo').y + kr('logo').h);
    }
  });

  it('blocks 320×50: the disclaimer cannot sit on one 14px line in 296px', () => {
    expect(planAdapt(master, model, size(320, 50), opts).plan.kind).toBe('BLOCKED');
  });

  it('uses the format-dependent legal floor: 14px on display, ≥ 20px on a 1200-wide social size', () => {
    const social = planAdapt(master, model, size(1200, 628), opts);
    expect(social.plan.kind === 'RECOMPOSE' && social.plan.keepRects.find((k) => k.type === 'legal')?.min).toBe(20);
    const display = planAdapt(master, model, size(728, 90), opts);
    expect(display.plan.kind === 'RECOMPOSE' && display.plan.keepRects.find((k) => k.type === 'legal')?.min).toBe(14);
  });
});

describe('planAdapt() on a photo master (ratio bands apply)', () => {
  it('SMART_CROP for 4:5 keeps every protected element — and the body copy — inside the safe zone', () => {
    const { r, gates } = gatesFor(size(1080, 1350), photo);
    expect(r.plan.kind).toBe('SMART_CROP');
    expect(r.escalations).toEqual([]);
    expect(allPass(gates)).toBe(true);
    if (r.plan.kind === 'SMART_CROP') {
      expect(r.plan.winW).toBe(1600);
      expect(r.plan.winH).toBe(2000);
      const body = photo.elements.find((e) => e.type === 'body')!;
      const right = (body.box.x + body.box.w) * 2000 * r.plan.sc - r.plan.wx * r.plan.sc;
      expect(right).toBeLessThanOrEqual(1080 * (1 - 0.09) + 2);
    }
  });

  it('EXPAND for 9:16 keeps the master immutable inside the safe zone and masks every generated pixel', () => {
    const { r, gates } = gatesFor(size(1080, 1920), photo);
    expect(r.plan.kind).toBe('EXPAND');
    expect(r.escalations).toEqual([]);
    expect(allPass(gates)).toBe(true);
    if (r.plan.kind === 'EXPAND') {
      const { mx, my, mw, mh, masks } = r.plan;
      expect(mx).toBeCloseTo(1080 * 0.06, 5);
      expect(my).toBeGreaterThanOrEqual(1920 * 0.14);
      expect(my + mh).toBeLessThanOrEqual(1920 * 0.65 + 0.001);
      for (const mk of masks) {
        const outside = mk.y + mk.h <= my + 0.001 || mk.y >= my + mh - 0.001 || mk.x + mk.w <= mx + 0.001 || mk.x >= mx + mw - 0.001;
        expect(outside).toBe(true);
      }
      expect(masks.reduce((a, mk) => a + mk.w * mk.h, 0)).toBeCloseTo(1080 * 1920 - mw * mh, 0);
    }
  });

  it('escalates 1.91:1 from EXPAND to a rebuild that keeps the visual beside the text', () => {
    const { r, gates } = gatesFor(size(1200, 628), photo);
    expect(r.routed.strategy).toBe('EXPAND');
    expect(r.escalations[0]).toMatch(/^Expand: (headline|cta|legal) renders at \d+px, below its \d+px floor$/);
    expect(r.plan.kind).toBe('RECOMPOSE');
    expect(allPass(gates)).toBe(true);
    if (r.plan.kind === 'RECOMPOSE') {
      expect(r.plan.changes.join(' ')).toContain('product kept beside the text');
      expect(r.plan.overflows).toEqual([]);
    }
  });

  it('walks SMART_CROP → EXPAND → RECOMPOSE for 300×250', () => {
    const { r, gates } = gatesFor(size(300, 250), photo);
    expect(r.routed.strategy).toBe('SMART_CROP');
    expect(r.escalations[0]).toBe('Smart crop: protected elements exceed the target safe zone');
    expect(r.escalations[1]).toMatch(/^Expand: (headline|cta|legal) renders at \d+px, below its \d+px floor$/);
    expect(r.plan.kind).toBe('RECOMPOSE');
    expect(allPass(gates)).toBe(true);
  });
});

describe('planAdapt() without text (raster-patch fallback)', () => {
  it('still blocks sizes whose patch-scaled disclaimer cannot fit, exactly like the prototype', () => {
    for (const [w, h] of [[300, 250], [320, 50], [160, 600], [300, 600]] as const) {
      expect(planAdapt(master, patchOnly, size(w, h), opts).plan.kind, `${w}x${h}`).toBe('BLOCKED');
    }
  });
  it('rebuilds the leaderboard from patches but the gates withhold it (2-line headline patch overflows the row)', () => {
    const { r, gates } = gatesFor(size(728, 90), patchOnly);
    expect(r.plan.kind).toBe('RECOMPOSE');
    expect(gates.slice(0, 5).some((g) => !g.pass)).toBe(true);
    if (r.plan.kind === 'RECOMPOSE') expect(r.plan.overflows.length).toBeGreaterThan(0);
  });
});

describe('planAdapt() escalation rules', () => {
  it('SCALE escalates to SMART_CROP when the cover-fit crop would cut a protected element', () => {
    const edgeLogo: ObjectModel = { ...photo, elements: [{ ...model.elements[0], box: { x: 0.1, y: 0, w: 0.2, h: 0.05 } }, product] };
    const r = planAdapt({ rw: 1000, rh: 1000, ratio: 1 }, edgeLogo, { name: 't', w: 1000, h: 900 }, opts);
    expect(r.routed.strategy).toBe('SCALE');
    expect(r.escalations[0]).toBe('Scale: the cover-fit crop would cut a protected element');
    expect(r.plan.kind).not.toBe('SCALE');
  });

  it('SCALE escalates straight to RECOMPOSE on the min-font post-check', () => {
    const r = planAdapt(master, model, { name: 't', w: 200, h: 200 }, opts);
    expect(r.routed.strategy).toBe('SCALE');
    expect(r.escalations[0]).toMatch(/^Scale: (headline|cta|legal) renders at \d+px, below its \d+px floor$/);
    expect(['RECOMPOSE', 'BLOCKED']).toContain(r.plan.kind);
  });

  it('EXPAND escalates to RECOMPOSE when the background cannot extend in the needed direction', () => {
    const noExtend: ObjectModel = { ...photo, background: { ...photo.background, extendDirections: ['left', 'right'] } };
    const r = planAdapt(master, noExtend, size(1080, 1920), opts);
    expect(r.escalations[0]).toBe('Expand: background not extendable top/bottom');
    expect(r.plan.kind).not.toBe('EXPAND');
  });

  it('never returns a plan for a skinny size other than a rebuild or a block', () => {
    for (const s of [size(728, 90), size(320, 50), size(160, 600)]) {
      expect(['RECOMPOSE', 'BLOCKED']).toContain(planAdapt(master, model, s, opts).plan.kind);
    }
  });
});
