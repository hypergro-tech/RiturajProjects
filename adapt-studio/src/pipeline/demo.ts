import wordmarkOnBlue from '../assets/wordmark-on-blue.png';
import { DEMO_ELEMENTS } from './demoData';
import type { Box } from './types';

const BLUE = '#004BBE', ORANGE = '#FF9C00', NAVY = '#003A8F';

export const DEMO_ASSETS = {
  wmBlue: { src: wordmarkOnBlue, ratio: 219 / 900 },
} as const;

export type DemoImages = Record<keyof typeof DEMO_ASSETS, HTMLImageElement>;

export function loadDemoImages(): Promise<DemoImages> {
  const entries = Object.entries(DEMO_ASSETS).map(
    ([key, a]) =>
      new Promise<[string, HTMLImageElement]>((resolve) => {
        const im = new Image();
        im.onload = () => resolve([key, im]);
        im.onerror = () => resolve([key, im]);
        im.src = a.src;
      }),
  );
  return Promise.all(entries).then((kv) => Object.fromEntries(kv) as DemoImages);
}

export interface DemoMaster { canvas: HTMLCanvasElement; boxes: Box[] }

/**
 * Draw the demo key visual at `size` px square. Text boxes are measured from the rendered glyphs (fonts differ
 * between machines), so the object model's patches stay tight to the text and never drag in the wave motif.
 */
export async function drawDemoMaster(size: number, imgs: DemoImages): Promise<DemoMaster> {
  try {
    await Promise.all([
      document.fonts.load("italic 800 40px 'Figtree'"),
      document.fonts.load("700 40px 'Figtree'"),
      document.fonts.load("500 40px 'Figtree'"),
    ]);
  } catch { /* fall back to the system font */ }
  const s = size / 1080;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, size, size);
  const boxes: Box[] = [];
  for (const d of DEMO_ELEMENTS) {
    const x = d.b[0] * 1080 * s, y = d.b[1] * 1080 * s, w = d.b[2] * 1080 * s;
    boxes.push({ x: d.b[0], y: d.b[1], w: d.b[2], h: d.b[3] });
    if (d.img) {
      const a = DEMO_ASSETS[d.img];
      const im = imgs[d.img];
      if (im && im.naturalWidth) ctx.drawImage(im, x, y, w, w * a.ratio);
    } else if (d.type === 'cta') {
      const h = d.b[3] * 1080 * s, fs = (d.fs ?? 27) * s;
      ctx.fillStyle = ORANGE;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
      ctx.fillStyle = NAVY; ctx.font = `700 ${fs}px 'Figtree', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.text ?? '', x + w / 2, y + h / 2 + fs * 0.05);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else {
      const fs = (d.fs ?? 30) * s;
      ctx.fillStyle = d.color ?? '#fff';
      ctx.font = `${d.it ? 'italic ' : ''}${d.fw ?? 500} ${fs}px 'Figtree', sans-serif`;
      ctx.textBaseline = 'top';
      let ly = y, maxW = 0;
      const lines = (d.text ?? '').split('\n');
      for (const line of lines) { ctx.fillText(line, x, ly); maxW = Math.max(maxW, ctx.measureText(line).width); ly += fs * 1.14; }
      ctx.textBaseline = 'alphabetic';
      boxes[boxes.length - 1] = { x: d.b[0], y: d.b[1], w: Math.min(1 - d.b[0], maxW / size), h: (fs * (1.14 * lines.length - 0.1)) / size };
    }
  }
  return { canvas: c, boxes };
}
