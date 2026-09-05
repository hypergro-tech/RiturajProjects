import type { ElementType, TargetSize } from './types';

/** Stage 7 defaults: the display "core 5" + 1:1, 4:5, 9:16, 1.91:1 (all pre-selected). */
export const DEFAULT_SIZES: TargetSize[] = [
  { name: 'Medium rectangle', w: 300, h: 250 },
  { name: 'Leaderboard', w: 728, h: 90 },
  { name: 'Mobile banner', w: 320, h: 50 },
  { name: 'Skyscraper', w: 160, h: 600 },
  { name: 'Half page', w: 300, h: 600 },
  { name: 'Feed square', w: 1080, h: 1080, social: true },
  { name: 'Feed portrait', w: 1080, h: 1350, social: true },
  { name: 'Story / Reels', w: 1080, h: 1920, social: true },
  { name: 'Landscape link', w: 1200, h: 628, social: true },
];

/** Stage 1 priority hierarchy (fixed — drop from the bottom only). */
export const PRIORITY: Record<ElementType, number> = {
  logo: 1, headline: 2, cta: 3, legal: 4, product: 5, person: 5, subhead: 5, body: 5, decorative: 6,
};

export const DEFAULT_MIN_PX: Partial<Record<ElementType, number>> = { headline: 24, body: 14, subhead: 14, cta: 16, legal: 18 };
export const TEXT_TYPES: ReadonlySet<string> = new Set(['headline', 'subhead', 'body', 'legal', 'cta']);
export const ELEMENT_TYPES: readonly ElementType[] = ['logo', 'headline', 'subhead', 'body', 'cta', 'product', 'person', 'legal', 'decorative'];

/** Stage 2 router thresholds. Ship conservatively; tune against real edit-rate data. */
export const ROUTER = { scaleBelow: 0.14, cropBelow: 0.45, expandBelow: 0.9, skinnyRatio: 4, skinnyMaxH: 120, skinnyMaxW: 180 } as const;

/** Stage 6 file-weight limits (bytes). */
export const WEIGHT_LIMIT = { display: 150 * 1024, social: 5 * 1024 * 1024 } as const;

/** Brand book p.20: the wordmark must never render below 20px tall on digital. */
export const LOGO_MIN_HEIGHT_PX = 20;

export const BLOCK_MESSAGE = 'This size cannot carry the mandatory disclaimer legibly. Requires manual layout or size exclusion.';

export const CUSTOM_SIZE_LIMITS = { min: 50, max: 4000 } as const;

/** Working preview long edge (Stage 0). */
export const WORKING_EDGE = 2000;

/** Brand faces (brand book p.40–43) used when the master's own font cannot be reproduced. */
export const BRAND_FONTS = {
  headline: { family: 'Merriweather', weight: 600, italic: false },
  subhead: { family: 'Lato', weight: 700, italic: false },
  body: { family: 'Lato', weight: 400, italic: false },
  cta: { family: 'Lato', weight: 700, italic: false },
  legal: { family: 'Lato', weight: 400, italic: false },
} as const;

/** Web fonts loaded by index.html and therefore drawable on canvas. */
export const WEB_FONTS: ReadonlySet<string> = new Set(['Figtree', 'Merriweather', 'Lato']);
