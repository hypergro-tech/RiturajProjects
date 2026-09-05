import { ROUTER } from './constants';
import type { RouteResult } from './types';

/**
 * Stage 2 — strategy router for one target size.
 * delta = |ln(Rt / Rm)|; the SKINNY override wins regardless of delta; a fully re-settable master rebuilds
 * whenever a uniform scale is not enough.
 */
export function route(masterRatio: number, w: number, h: number, resettable = false): RouteResult {
  const r = w / h;
  const delta = Math.abs(Math.log(r / masterRatio));
  if (r > ROUTER.skinnyRatio || 1 / r > ROUTER.skinnyRatio || h <= ROUTER.skinnyMaxH || w <= ROUTER.skinnyMaxW) {
    return { strategy: 'RECOMPOSE', delta, skinny: true };
  }
  if (delta < ROUTER.scaleBelow) return { strategy: 'SCALE', delta, skinny: false };
  // A master made only of text and a logo on a flat field loses nothing when it is rebuilt on its own layout
  // system, and gains a composition that fills the new canvas. Cropping or extending it would only leave voids
  // or cut copy, so the layout system takes over from the ratio bands (a photo master still crops / expands).
  if (resettable) return { strategy: 'RECOMPOSE', delta, skinny: false, reason: 'layout-system' };
  if (delta < ROUTER.cropBelow) return { strategy: 'SMART_CROP', delta, skinny: false };
  if (delta < ROUTER.expandBelow) return { strategy: 'EXPAND', delta, skinny: false };
  return { strategy: 'RECOMPOSE', delta, skinny: false };
}
