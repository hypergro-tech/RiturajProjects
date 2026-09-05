import { fontString, setTracking } from './fonts';
import type { AdaptPlan, MasterRaster } from './types';

/** Draw a plan onto a fresh W×H canvas. The only place in the pipeline that touches output pixels. */
export function renderPlan(master: MasterRaster, plan: AdaptPlan, W: number, H: number, bgColor: string): HTMLCanvasElement {
  const { canvas: MC, rw, rh } = master;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  switch (plan.kind) {
    case 'SCALE':
      ctx.drawImage(MC, plan.ox, plan.oy, rw * plan.s, rh * plan.s);
      break;
    case 'SMART_CROP':
      ctx.drawImage(MC, plan.wx, plan.wy, plan.winW, plan.winH, 0, 0, W, H);
      break;
    case 'EXPAND': {
      // Edge-sampled extension: valid for flat / gradient backgrounds only. Production replaces this
      // with generative outpainting (≤1024px per pass) — the masks and review routing stay the same.
      const { mx, my, mw, mh } = plan;
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(MC, mx, my, mw, mh);
      if (mx > 0.5) ctx.drawImage(MC, 0, 0, 2, rh, 0, my, mx, mh);
      if (mx + mw < W - 0.5) ctx.drawImage(MC, rw - 2, 0, 2, rh, mx + mw, my, W - mx - mw, mh);
      if (my > 0.5) ctx.drawImage(c, 0, Math.ceil(my), W, 2, 0, 0, W, Math.ceil(my));
      if (my + mh < H - 0.5) {
        const yb = Math.floor(my + mh);
        ctx.drawImage(c, 0, yb - 2, W, 2, 0, yb, W, H - yb);
      }
      break;
    }
    case 'RECOMPOSE':
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      for (const o of plan.ops) {
        if (o.kind === 'patch') {
          ctx.drawImage(MC, o.sx, o.sy, o.sw, o.sh, o.dx, o.dy, o.dw, o.dh);
        } else if (o.kind === 'pill') {
          ctx.fillStyle = o.fill;
          ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, o.h, Math.min(o.w, o.h) / 2); ctx.fill();
        } else {
          ctx.font = fontString(o.spec, o.px);
          setTracking(ctx, o.spec.letterSpacing * o.px);
          ctx.fillStyle = o.spec.color;
          ctx.textBaseline = 'top';
          ctx.textAlign = o.align;
          const lh = o.px * o.spec.lineHeight;
          const x = o.align === 'center' ? o.x + o.w / 2 : o.align === 'right' ? o.x + o.w : o.x;
          o.lines.forEach((line, i) => ctx.fillText(line, x, o.y + i * lh + (lh - o.px) / 2));
          setTracking(ctx, 0);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
      }
      break;
  }
  return c;
}
