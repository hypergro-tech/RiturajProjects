import { WEIGHT_LIMIT } from './constants';
import type { Margins } from './types';

/** Display banners: content must sit ≥ 8px from every edge (spec: "logo ≥8px from any edge"). */
export const DISPLAY_EDGE_PX = 8;

/** Stage 4 — safe-zone margins as fractions of the target canvas. */
export function safeMargins(w: number, h: number, social: boolean): Margins {
  const r = w / h;
  if (social) {
    if (r < 0.6) return { t: 0.14, b: 0.35, l: 0.06, r: 0.06 }; // 9:16 universal (Reels / TikTok / Shorts)
    if (r < 0.9) return { t: 0.1, b: 0.1, l: 0.09, r: 0.09 }; // 4:5
    if (r < 1.2) return { t: 0.1, b: 0.1, l: 0.1, r: 0.1 }; // 1:1
    return { t: 0.095, b: 0.095, l: 0.1, r: 0.1 }; // 1.91:1
  }
  return { t: DISPLAY_EDGE_PX / h, b: DISPLAY_EDGE_PX / h, l: DISPLAY_EDGE_PX / w, r: DISPLAY_EDGE_PX / w };
}

/** Minimum legal font size at output: 14px on display, 18px-equivalent at 1080-wide on social. */
export function legalMin(w: number, social: boolean): number {
  return social ? Math.max(18, Math.round((18 * w) / 1080)) : 14;
}

export function weightLimit(social: boolean): number {
  return social ? WEIGHT_LIMIT.social : WEIGHT_LIMIT.display;
}

export function formatBytes(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${kb}KB`;
}
