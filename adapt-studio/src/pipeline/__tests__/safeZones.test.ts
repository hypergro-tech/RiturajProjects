import { describe, expect, it } from 'vitest';
import { formatBytes, legalMin, safeMargins, weightLimit } from '../safeZones';

describe('safeMargins()', () => {
  it('matches the Stage 4 table for social formats', () => {
    expect(safeMargins(1080, 1920, true)).toEqual({ t: 0.14, b: 0.35, l: 0.06, r: 0.06 });
    expect(safeMargins(1080, 1350, true)).toEqual({ t: 0.1, b: 0.1, l: 0.09, r: 0.09 });
    expect(safeMargins(1080, 1080, true)).toEqual({ t: 0.1, b: 0.1, l: 0.1, r: 0.1 });
    expect(safeMargins(1200, 628, true)).toEqual({ t: 0.095, b: 0.095, l: 0.1, r: 0.1 });
  });
  it('uses an 8px edge inset for display banners', () => {
    expect(safeMargins(300, 250, false)).toEqual({ t: 8 / 250, b: 8 / 250, l: 8 / 300, r: 8 / 300 });
    expect(safeMargins(728, 90, false).t * 90).toBeCloseTo(8);
  });
});

describe('legalMin()', () => {
  it('is 14px on display and an 18px-equivalent at 1080-wide on social', () => {
    expect(legalMin(300, false)).toBe(14);
    expect(legalMin(728, false)).toBe(14);
    expect(legalMin(1080, true)).toBe(18);
    expect(legalMin(2160, true)).toBe(36);
    expect(legalMin(540, true)).toBe(18); // never below 18 on social
  });
});

describe('weightLimit() / formatBytes()', () => {
  it('is 150KB for static display and 5MB for social images', () => {
    expect(weightLimit(false)).toBe(150 * 1024);
    expect(weightLimit(true)).toBe(5 * 1024 * 1024);
  });
  it('formats KB and MB', () => {
    expect(formatBytes(34 * 1024)).toBe('34KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB');
  });
});
