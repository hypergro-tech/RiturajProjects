import { firstIllegible, illegibleNote, keepUnion } from './model';
import { planRecompose } from './recompose';
import { route } from './router';
import { legalMin, safeMargins } from './safeZones';
import type { AdaptPlan, BlockedPlan, KeepRect, Mask, MasterInfo, ObjectModel, PlanOptions, PlanResult, Strategy, TargetSize } from './types';

/** Protected elements mapped through a uniform scale `s` and offset (ox, oy) into output px. */
const keepRectsAt = (model: ObjectModel, rw: number, rh: number, s: number, ox: number, oy: number): KeepRect[] =>
  model.elements
    .filter((e) => e.mustKeep)
    .map((e) => ({
      type: e.type, fontPx: e.fontPx * s, min: e.minLegiblePx,
      x: ox + e.box.x * rw * s, y: oy + e.box.y * rh * s, w: e.box.w * rw * s, h: e.box.h * rh * s,
    }));

/** The legal floor depends on the output format (Stage 4 table), so it overrides the element's static minLegiblePx. */
const withLegalFloor = (model: ObjectModel, W: number, social: boolean): ObjectModel => ({
  ...model,
  elements: model.elements.map((e) => (e.type === 'legal' ? { ...e, minLegiblePx: legalMin(W, social) } : e)),
});

/**
 * Stages 2–3 — route one target size and plan its adapt, escalating
 * SCALE → SMART_CROP → EXPAND → RECOMPOSE → BLOCK. Pure geometry: no canvas work happens here.
 */
export function planAdapt(master: MasterInfo, input: ObjectModel, target: TargetSize, opts: PlanOptions): PlanResult {
  const { w: W, h: H } = target;
  const social = !!target.social;
  const model = withLegalFloor(input, W, social);
  const { rw, rh, ratio: Rm } = master;
  const routed = route(Rm, W, H);
  const m = safeMargins(W, H, social);
  const escalations: string[] = [];
  let strat: Strategy = routed.strategy;
  let plan: AdaptPlan | BlockedPlan | null = null;
  let guard = 0;

  while (!plan && guard++ < 6) {
    if (strat === 'SCALE') {
      // Uniform resize (centre cover for the small ratio mismatch the router allows).
      // Spec: no safe-zone feasibility test here — only the min-font post-check.
      const s = Math.max(W / rw, H / rh);
      const ox = (W - rw * s) / 2, oy = (H - rh * s) / 2;
      const U = keepUnion(model, rw, rh);
      if (U.x0 * s + ox < -1 || U.x1 * s + ox > W + 1 || U.y0 * s + oy < -1 || U.y1 * s + oy > H + 1) {
        escalations.push('Scale: the cover-fit crop would cut a protected element');
        strat = 'SMART_CROP';
        continue;
      }
      const bad = firstIllegible(model, s);
      if (bad) { escalations.push(illegibleNote('Scale', bad, s)); strat = 'RECOMPOSE'; continue; }
      plan = {
        kind: 'SCALE', s, ox, oy, masks: [],
        keepRects: keepRectsAt(model, rw, rh, s, ox, oy),
        summary: 'Uniform resize — no crop, no synthesis, no element changes.',
      };
    } else if (strat === 'SMART_CROP') {
      // Crop window of ratio Rt that contains the protected union inside the safe zone,
      // centred on the union so retained salient area is maximised.
      const Rt = W / H;
      const winW = Rt >= Rm ? rw : Math.round(rh * Rt);
      const winH = Rt >= Rm ? Math.round(rw / Rt) : rh;
      const sc = W / winW;
      const U = keepUnion(model, rw, rh);
      const lM = m.l * winW, rM = m.r * winW, tM = m.t * winH, bM = m.b * winH;
      const fits = U.x1 - U.x0 <= winW - lM - rM && U.y1 - U.y0 <= winH - tM - bM;
      const loX = Math.max(U.x1 - (winW - rM), 0), hiX = Math.min(U.x0 - lM, rw - winW);
      const loY = Math.max(U.y1 - (winH - bM), 0), hiY = Math.min(U.y0 - tM, rh - winH);
      if (!fits || loX > hiX + 0.5 || loY > hiY + 0.5) {
        escalations.push('Smart crop: protected elements exceed the target safe zone');
        strat = 'EXPAND';
        continue;
      }
      const bad = firstIllegible(model, sc);
      if (bad) { escalations.push(illegibleNote('Smart crop', bad, sc)); strat = 'RECOMPOSE'; continue; }
      const wx = Math.min(Math.max((U.x0 + U.x1) / 2 - winW / 2, loX), hiX);
      const wy = Math.min(Math.max((U.y0 + U.y1) / 2 - winH / 2, loY), hiY);
      const sides: string[] = [];
      if (wx > 2) sides.push('left');
      if (wx + winW < rw - 2) sides.push('right');
      if (wy > 2) sides.push('top');
      if (wy + winH < rh - 2) sides.push('bottom');
      plan = {
        kind: 'SMART_CROP', wx, wy, winW, winH, sc, masks: [],
        keepRects: keepRectsAt(model, rw, rh, sc, -wx * sc, -wy * sc),
        summary: `Cropped ${sides.join(' & ') || 'background'} — pure background only; all protected elements inside the safe zone.`,
      };
    } else if (strat === 'EXPAND') {
      // Master pixels stay immutable inside the safe zone; the canvas grows in extendDirections only.
      const Rt = W / H;
      const needDirs = Rt > Rm ? (['left', 'right'] as const) : (['top', 'bottom'] as const);
      const bg = model.background;
      const okDirs = bg.extendable && needDirs.some((d) => bg.extendDirections.includes(d));
      if (!okDirs) { escalations.push(`Expand: background not extendable ${needDirs.join('/')}`); strat = 'RECOMPOSE'; continue; }
      const safeW = W * (1 - m.l - m.r), safeH = H * (1 - m.t - m.b);
      const s = Math.min(safeW / rw, safeH / rh);
      const bad = firstIllegible(model, s);
      if (bad) { escalations.push(illegibleNote('Expand', bad, s)); strat = 'RECOMPOSE'; continue; }
      const mw = rw * s, mh = rh * s;
      const canL = bg.extendDirections.includes('left'), canR = bg.extendDirections.includes('right');
      const canT = bg.extendDirections.includes('top'), canB = bg.extendDirections.includes('bottom');
      const slackX = safeW - mw, slackY = safeH - mh;
      const mx = W * m.l + (canL && canR ? slackX / 2 : canL ? slackX : 0);
      const my = H * m.t + (canT && canB ? slackY / 2 : canT ? slackY : 0);
      const masks: Mask[] = [];
      if (my > 1) masks.push({ x: 0, y: 0, w: W, h: my });
      if (my + mh < H - 1) masks.push({ x: 0, y: my + mh, w: W, h: H - my - mh });
      if (mx > 1) masks.push({ x: 0, y: my, w: mx, h: mh });
      if (mx + mw < W - 1) masks.push({ x: mx + mw, y: my, w: W - mx - mw, h: mh });
      const dirs: string[] = [];
      if (my > 1) dirs.push('top');
      if (my + mh < H - 1) dirs.push('bottom');
      if (mx > 1) dirs.push('left');
      if (mx + mw < W - 1) dirs.push('right');
      plan = {
        kind: 'EXPAND', s, mx, my, mw, mh, masks,
        keepRects: keepRectsAt(model, rw, rh, s, mx, my),
        summary: `Canvas extended ${dirs.join(' & ')} by sampling the ${bg.complexity} background edges; master pixels immutable. Extended regions masked for review.`,
      };
    } else {
      plan = planRecompose(master, model, W, H, social, m, opts);
    }
  }
  return { plan: plan ?? planRecompose(master, model, W, H, social, m, opts), escalations, routed, margins: m };
}
