import { describe, expect, it } from 'vitest';
import { LOGO_MIN_HEIGHT_PX, runGates, weightGate } from '../gates';
import { safeMargins } from '../safeZones';
import type { AdaptPlan, KeepRect, ObjectModel, TaggedElement } from '../types';

const el = (type: TaggedElement['type'], contrast: number): TaggedElement => ({
  type, desc: '', box: { x: 0, y: 0, w: 0.1, h: 0.1 }, priority: 2, mustKeep: true, droppable: false,
  minLegiblePx: 24, fontPx: 40, contrast,
});
const model = (contrasts: number[] = []): ObjectModel => ({
  elements: contrasts.map((c) => el('headline', c)),
  background: { desc: '', extendable: true, extendDirections: [], complexity: 'simple', color: '#000' },
  regulated: true, detectedRegulated: true, notes: '',
});
const rect = (type: KeepRect['type'], x: number, y: number, w: number, h: number, fontPx = 0, min = 0): KeepRect => ({ type, x, y, w, h, fontPx, min });
const rebuilt = (keepRects: KeepRect[]): AdaptPlan => ({ kind: 'RECOMPOSE', ops: [], dropped: [], masks: [], keepRects, summary: '' });
const byLabel = (gates: { label: string; pass: boolean }[]) => Object.fromEntries(gates.map((g) => [g.label.split(' ')[0], g.pass]));

const W = 300, H = 250, m = safeMargins(W, H, false);

describe('runGates()', () => {
  const good = [rect('logo', 20, 20, 100, 30), rect('headline', 20, 60, 200, 40, 30, 24), rect('legal', 20, 220, 200, 16, 14, 14)];

  it('passes a well-formed rebuild', () => {
    expect(runGates(rebuilt(good), model([7.6]), W, H, m, false).every((g) => g.pass)).toBe(true);
  });
  it('fails the safe-zone gate when a protected element touches the 8px edge', () => {
    const g = byLabel(runGates(rebuilt([...good, rect('cta', 2, 100, 50, 20)]), model(), W, H, m, false));
    expect(g.Safe).toBe(false);
  });
  it('fails min-font when any protected text is below its floor', () => {
    const g = byLabel(runGates(rebuilt([...good, rect('cta', 20, 120, 50, 20, 12, 16)]), model(), W, H, m, false));
    expect(g.Min).toBe(false);
  });
  it('fails legal legibility against the output-size floor (14px display)', () => {
    const g = byLabel(runGates(rebuilt([good[0], good[1], rect('legal', 20, 220, 200, 12, 13, 14)]), model(), W, H, m, false));
    expect(g.Legal).toBe(false);
  });
  it('fails the logo gate when the logo is missing, cropped, or below the 20px brand minimum', () => {
    expect(byLabel(runGates(rebuilt([good[1], good[2]]), model(), W, H, m, false)).Logo).toBe(false);
    expect(byLabel(runGates(rebuilt([rect('logo', -10, 20, 100, 30), good[1]]), model(), W, H, m, false)).Logo).toBe(false);
    expect(byLabel(runGates(rebuilt([rect('logo', 20, 20, 100, LOGO_MIN_HEIGHT_PX - 2), good[1]]), model(), W, H, m, false)).Logo).toBe(false);
    expect(byLabel(runGates(rebuilt([rect('logo', 20, 20, 100, LOGO_MIN_HEIGHT_PX), good[1]]), model(), W, H, m, false)).Logo).toBe(true);
  });
  it('reports the weakest measured contrast and fails below 4.5:1', () => {
    const gates = runGates(rebuilt(good), model([7.6, 3.9]), W, H, m, false);
    expect(gates[2]).toEqual({ label: 'Contrast 3.9:1', pass: false });
    expect(runGates(rebuilt(good), model([]), W, H, m, false)[2]).toEqual({ label: 'Contrast n/a', pass: true });
  });
  it('skips the safe-zone gate for SCALE (a uniform resize inherits the master composition)', () => {
    const plan: AdaptPlan = { kind: 'SCALE', s: 1, ox: 0, oy: 0, masks: [], keepRects: [rect('logo', 0, 0, 100, 30)], summary: '' };
    expect(byLabel(runGates(plan, model(), W, H, m, false)).Safe).toBe(true);
  });
  it('returns the fixed blocked pattern for a compliance block', () => {
    const gates = runGates({ kind: 'BLOCKED', blockMsg: 'x' }, model(), W, H, m, false);
    expect(gates.map((g) => g.pass)).toEqual([true, false, true, true, false, true]);
  });
});

describe('weightGate()', () => {
  it('labels size against the right limit', () => {
    expect(weightGate(34 * 1024, false)).toEqual({ label: '34KB ≤ 150KB', pass: true });
    expect(weightGate(151 * 1024, false).pass).toBe(false);
    expect(weightGate(4.2 * 1024 * 1024, true)).toEqual({ label: '4.2MB ≤ 5MB', pass: true });
  });
});
