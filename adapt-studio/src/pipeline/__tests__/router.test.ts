import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZES } from '../constants';
import { route } from '../router';

describe('route()', () => {
  it('routes the default size set for a 1:1 master exactly as the Stage 2 math dictates', () => {
    const got = Object.fromEntries(DEFAULT_SIZES.map((s) => [`${s.w}x${s.h}`, route(1, s.w, s.h).strategy]));
    expect(got).toEqual({
      '300x250': 'SMART_CROP', // Δ 0.18
      '728x90': 'RECOMPOSE', // skinny (ratio > 4, h ≤ 120)
      '320x50': 'RECOMPOSE', // skinny
      '160x600': 'RECOMPOSE', // skinny (w ≤ 180)
      '300x600': 'EXPAND', // Δ 0.69
      '1080x1080': 'SCALE', // Δ 0
      '1080x1350': 'SMART_CROP', // Δ 0.22
      '1080x1920': 'EXPAND', // Δ 0.58
      '1200x628': 'EXPAND', // Δ 0.65
    });
  });

  it('uses strict < thresholds at 0.14 / 0.45 / 0.90', () => {
    const at = (d: number) => route(1, 1000 * Math.exp(d), 1000).strategy;
    expect(at(0.1399)).toBe('SCALE');
    expect(at(0.1401)).toBe('SMART_CROP');
    expect(at(0.4499)).toBe('SMART_CROP');
    expect(at(0.4501)).toBe('EXPAND');
    expect(at(0.8999)).toBe('EXPAND');
    expect(at(0.9001)).toBe('RECOMPOSE');
  });

  it('is symmetric: widening and narrowing by the same factor give the same delta', () => {
    expect(route(1, 1000, 1500).delta).toBeCloseTo(route(1, 1500, 1000).delta, 12);
    expect(route(1, 1080, 1350).delta).toBeCloseTo(Math.abs(Math.log(0.8)), 12);
  });

  it('applies the skinny override regardless of delta', () => {
    expect(route(8, 800, 100)).toMatchObject({ strategy: 'RECOMPOSE', skinny: true, delta: 0 });
    expect(route(1, 400, 120)).toMatchObject({ strategy: 'RECOMPOSE', skinny: true }); // h ≤ 120
    expect(route(1, 180, 200)).toMatchObject({ strategy: 'RECOMPOSE', skinny: true }); // w ≤ 180
    expect(route(1, 181, 200)).toMatchObject({ strategy: 'SCALE', skinny: false });
  });
});
