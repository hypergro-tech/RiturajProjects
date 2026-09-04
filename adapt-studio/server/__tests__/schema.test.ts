import { describe, expect, it } from 'vitest';
import { ObjectModelSchema, buildPrompt } from '../schema.js';

describe('ObjectModelSchema', () => {
  it('accepts a well-formed vision result', () => {
    const ok = ObjectModelSchema.safeParse({
      elements: [{ type: 'logo', desc: 'wm', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 }, mustKeep: true, droppable: false, minLegiblePx: 0, lines: 0 }],
      background: { desc: 'flat', extendable: true, extendDirections: ['left'], complexity: 'simple', color: '#004bbe' },
      regulated: true,
      notes: 'legal',
    });
    expect(ok.success).toBe(true);
  });
  it('rejects unknown element types', () => {
    const bad = ObjectModelSchema.safeParse({ elements: [{ type: 'banana', desc: '', box: { x: 0, y: 0, w: 1, h: 1 }, mustKeep: true, droppable: false, minLegiblePx: 0, lines: 0 }], background: { desc: '', extendable: false, extendDirections: [], complexity: 'simple', color: '#fff' }, regulated: false, notes: '' });
    expect(bad.success).toBe(false);
  });
  it('tells the model the working resolution', () => {
    expect(buildPrompt(2000, 1125)).toContain('2000×1125px');
  });
});
