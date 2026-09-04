import { ROUTER } from './constants';
import type { RouteResult } from './types';

/**
 * Stage 2 — strategy router for one target size.
 * delta = |ln(Rt / Rm)|; the SKINNY override wins regardless of delta.
 */
export function route(masterRatio: number, w: number, h: number): RouteResult {
  const r = w / h;
  const delta = Math.abs(Math.log(r / masterRatio));
  if (r > ROUTER.skinnyRatio || 1 / r > ROUTER.skinnyRatio || h <= ROUTER.skinnyMaxH || w <= ROUTER.skinnyMaxW) {
    return { strategy: 'RECOMPOSE', delta, skinny: true };
  }
  if (delta < ROUTER.scaleBelow) return { strategy: 'SCALE', delta, skinny: false };
  if (delta < ROUTER.cropBelow) return { strategy: 'SMART_CROP', delta, skinny: false };
  if (delta < ROUTER.expandBelow) return { strategy: 'EXPAND', delta, skinny: false };
  return { strategy: 'RECOMPOSE', delta, skinny: false };
}
