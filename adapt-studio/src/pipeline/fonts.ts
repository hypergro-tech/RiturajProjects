import type { ObjectModel, TextMeasurer, TextSpec } from './types';

/** CSS font shorthand for a spec at `px`. */
export function fontString(spec: Pick<TextSpec, 'family' | 'weight' | 'italic'>, px: number): string {
  return `${spec.italic ? 'italic ' : ''}${spec.weight} ${px}px "${spec.family}", sans-serif`;
}

/** Text measurer backed by an offscreen 2D context (the same engine that renders, so plan == output). */
export function canvasMeasurer(): TextMeasurer {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const cache = new Map<string, number>();
  return (spec, px, text) => {
    const font = fontString(spec, px);
    const tracking = (spec.letterSpacing ?? 0) * px;
    const key = `${font}|${tracking}|${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      setTracking(ctx, tracking);
      w = ctx.measureText(text).width;
      if (!supportsTracking(ctx)) w += tracking * text.length; // older engines: approximate
      cache.set(key, w);
    }
    return w;
  };
}

const supportsTracking = (ctx: CanvasRenderingContext2D) => 'letterSpacing' in ctx;

/** Apply tracking on engines that support the canvas letterSpacing property (Chrome, Safari 17.4+, Firefox). */
export function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  if (supportsTracking(ctx)) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** A family counts as available only when a loaded face with that name exists; `document.fonts.check` says yes for unknown families. */
export function fontAvailable(family: string): boolean {
  for (const face of document.fonts) {
    if (face.family.replace(/["']/g, '') === family && face.status === 'loaded') return true;
  }
  return false;
}

/** Load (or attempt to load) every web font the model's text specs need before measuring or drawing. */
export async function ensureFonts(model: ObjectModel): Promise<void> {
  const wanted = new Set<string>();
  for (const e of model.elements) {
    if (e.text && e.text.fontSource !== 'embedded') wanted.add(fontString(e.text, 32));
  }
  await Promise.all([...wanted].map((f) => document.fonts.load(f).catch(() => [])));
}
