import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZES } from '../constants';
import { demoModel } from '../demoData';
import { runGates } from '../gates';
import { planAdapt } from '../plan';
import type { MasterInfo, ObjectModel, TargetSize } from '../types';

const master: MasterInfo = { rw: 2000, rh: 2000, ratio: 1 };
const model = demoModel(2000, '#004bbe');
const size = (w: number, h: number) => DEFAULT_SIZES.find((s) => s.w === w && s.h === h) as TargetSize;
const gatesFor = (t: TargetSize) => {
  const r = planAdapt(master, model, t);
  return { r, gates: runGates(r.plan, model, t.w, t.h, r.margins, !!t.social) };
};

describe('planAdapt() on the demo master', () => {
  it('SCALE for the 1:1 feed square with no escalation', () => {
    const { r, gates } = gatesFor(size(1080, 1080));
    expect(r.plan.kind).toBe('SCALE');
    expect(r.escalations).toEqual([]);
    expect(gates.slice(0, 5).every((g) => g.pass)).toBe(true);
  });

  it('SMART_CROP for 4:5 keeps every protected element inside the safe zone', () => {
    const { r, gates } = gatesFor(size(1080, 1350));
    expect(r.plan.kind).toBe('SMART_CROP');
    expect(r.escalations).toEqual([]);
    expect(gates.slice(0, 5).every((g) => g.pass)).toBe(true);
    if (r.plan.kind === 'SMART_CROP') {
      expect(r.plan.winW).toBe(1600);
      expect(r.plan.winH).toBe(2000);
      expect(r.plan.wx).toBeGreaterThanOrEqual(0);
      expect(r.plan.wx + r.plan.winW).toBeLessThanOrEqual(2000);
    }
  });

  it('EXPAND for 9:16 keeps the master immutable inside the safe zone and masks every generated pixel', () => {
    const { r, gates } = gatesFor(size(1080, 1920));
    expect(r.plan.kind).toBe('EXPAND');
    expect(r.escalations).toEqual([]);
    expect(gates.slice(0, 5).every((g) => g.pass)).toBe(true);
    if (r.plan.kind === 'EXPAND') {
      const { mx, my, mw, mh, masks } = r.plan;
      expect(mx).toBeCloseTo(1080 * 0.06, 5); // master sits at the 9:16 side margin
      expect(my).toBeGreaterThanOrEqual(1920 * 0.14);
      expect(my + mh).toBeLessThanOrEqual(1920 * 0.65 + 0.001);
      expect(r.plan.summary).toContain('extended top & bottom & left & right');
      // every mask lies outside the immutable master pixels, and together they cover the whole border
      for (const mk of masks) {
        const outside = mk.y + mk.h <= my + 0.001 || mk.y >= my + mh - 0.001 || mk.x + mk.w <= mx + 0.001 || mk.x >= mx + mw - 0.001;
        expect(outside).toBe(true);
      }
      const maskArea = masks.reduce((a, mk) => a + mk.w * mk.h, 0);
      expect(maskArea).toBeCloseTo(1080 * 1920 - mw * mh, 0);
    }
  });

  it('escalates 1.91:1 from EXPAND to RECOMPOSE when text would drop below its floor, then passes its own geometry', () => {
    const { r, gates } = gatesFor(size(1200, 628));
    expect(r.routed.strategy).toBe('EXPAND');
    expect(r.escalations).toHaveLength(1);
    expect(r.escalations[0]).toMatch(/^Expand: (headline|cta|legal) renders at \d+px, below its \d+px floor$/);
    expect(r.plan.kind).toBe('RECOMPOSE');
    // Decision 6: a rebuild is laid out against exactly the insets the gates check.
    expect(gates.slice(0, 5).every((g) => g.pass)).toBe(true);
  });

  it('walks the full chain SMART_CROP → EXPAND → RECOMPOSE → BLOCK for 300×250', () => {
    const { r } = gatesFor(size(300, 250));
    expect(r.routed.strategy).toBe('SMART_CROP');
    expect(r.escalations[0]).toBe('Smart crop: protected elements exceed the target safe zone');
    expect(r.escalations[1]).toMatch(/^Expand: (headline|cta|legal) renders at \d+px, below its \d+px floor$/);
    expect(r.plan.kind).toBe('BLOCKED');
  });

  it('uses the format-dependent legal floor: 14px on display, 20px on a 1200-wide social size', () => {
    const social = planAdapt(master, model, size(1200, 628));
    expect(social.plan.kind === 'RECOMPOSE' && social.plan.keepRects.find((k) => k.type === 'legal')?.min).toBe(20);
    const display = planAdapt(master, model, size(728, 90));
    expect(display.plan.kind === 'RECOMPOSE' && display.plan.keepRects.find((k) => k.type === 'legal')?.min).toBe(14);
  });

  it('blocks the sizes that cannot carry the single-line disclaimer at 14px', () => {
    for (const [w, h] of [[320, 50], [160, 600], [300, 600]] as const) {
      expect(planAdapt(master, model, size(w, h)).plan.kind, `${w}x${h}`).toBe('BLOCKED');
    }
  });

  it('rebuilds the leaderboard but the QA gates withhold it: a 2-line headline at its 24px floor overflows a 90px strip', () => {
    const { r, gates } = gatesFor(size(728, 90));
    expect(r.routed.skinny).toBe(true);
    expect(r.plan.kind).toBe('RECOMPOSE');
    expect(gates[0]).toEqual({ label: 'Safe zone', pass: false });
  });
});

describe('planAdapt() escalation rules', () => {
  it('SCALE escalates to SMART_CROP when the cover-fit crop would cut a protected element', () => {
    const edgeLogo: ObjectModel = {
      ...model,
      elements: [{ ...model.elements[0], box: { x: 0.1, y: 0, w: 0.2, h: 0.05 } }],
    };
    const r = planAdapt({ rw: 1000, rh: 1000, ratio: 1 }, edgeLogo, { name: 't', w: 1000, h: 900 });
    expect(r.routed.strategy).toBe('SCALE');
    expect(r.escalations[0]).toBe('Scale: the cover-fit crop would cut a protected element');
    expect(r.plan.kind).not.toBe('SCALE');
  });

  it('SCALE escalates straight to RECOMPOSE on the min-font post-check', () => {
    const r = planAdapt(master, model, { name: 't', w: 200, h: 200 });
    expect(r.routed.strategy).toBe('SCALE');
    expect(r.escalations[0]).toMatch(/^Scale: (headline|cta|legal) renders at \d+px, below its \d+px floor$/);
    expect(['RECOMPOSE', 'BLOCKED']).toContain(r.plan.kind);
  });

  it('EXPAND escalates to RECOMPOSE when the background cannot extend in the needed direction', () => {
    const noExtend: ObjectModel = { ...model, background: { ...model.background, extendDirections: ['left', 'right'] } };
    const r = planAdapt(master, noExtend, size(1080, 1920));
    expect(r.escalations[0]).toBe('Expand: background not extendable top/bottom');
    expect(r.plan.kind).not.toBe('EXPAND');
  });

  it('never returns a plan for a skinny size other than a rebuild or a block', () => {
    for (const s of [size(728, 90), size(320, 50), size(160, 600)]) {
      expect(['RECOMPOSE', 'BLOCKED']).toContain(planAdapt(master, model, s).plan.kind);
    }
  });
});
