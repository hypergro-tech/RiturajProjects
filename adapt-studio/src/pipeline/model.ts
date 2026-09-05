import { DEFAULT_MIN_PX, ELEMENT_TYPES, PRIORITY, TEXT_TYPES } from './constants';
import type { Direction, ElementType, ObjectModel, PixelSampler, RawObjectModel, TaggedElement } from './types';

const clamp01 = (v: unknown): number => Math.max(0, Math.min(1, Number(v) || 0));
const DIRECTIONS: readonly Direction[] = ['left', 'right', 'top', 'bottom'];

/** WCAG relative luminance of an sRGB colour. */
export function relativeLuminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Average of four 4×4 corner samples of the raster. Always used instead of the vision model's hex. */
export function sampleBgColor(sample: PixelSampler, rw: number, rh: number): string {
  let r = 0, g = 0, b = 0, n = 0;
  const spots: Array<[number, number]> = [[2, 2], [rw - 6, 2], [2, rh - 6], [rw - 6, rh - 6]];
  for (const [x, y] of spots) {
    const d = sample(Math.max(0, x), Math.max(0, y), 4, 4);
    for (let i = 0; i + 3 < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  }
  if (!n) return '#000000';
  const h = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function isTextType(type: string): boolean { return TEXT_TYPES.has(type); }

/**
 * Font size from scale-invariant geometry: (boxH / lines) × 0.78, clamped to [boxH × 0.12, boxH × 1.05].
 * The vision model's absolute px estimates drift with preview scale, so they are never used.
 */
export function deriveFontPx(boxHpx: number, lines: number | undefined): number {
  const n = Math.max(1, Math.min(12, Math.round(Number(lines) || 1)));
  const est = (boxHpx / n) * 0.78;
  return Math.max(boxHpx * 0.12, Math.min(boxHpx * 1.05, est));
}

/** Stage 1 calibration of the raw vision output into a trusted object model. */
export function normalizeModel(raw: RawObjectModel, masterRh: number, bgColor: string): ObjectModel {
  const elements: TaggedElement[] = (raw.elements ?? []).slice(0, 10).map((e) => {
    const t = String(e.type ?? 'decorative').toLowerCase();
    const type: ElementType = (ELEMENT_TYPES as readonly string[]).includes(t) ? (t as ElementType) : 'decorative';
    const box = {
      x: clamp01(e.box?.x), y: clamp01(e.box?.y),
      w: Math.max(0.01, clamp01(e.box?.w)), h: Math.max(0.01, clamp01(e.box?.h)),
    };
    const isText = isTextType(type);
    const forcedKeep = type === 'logo' || type === 'headline' || type === 'cta' || type === 'legal';
    return {
      type,
      desc: String(e.desc ?? type).slice(0, 90),
      box,
      priority: PRIORITY[type] ?? 6,
      mustKeep: forcedKeep ? true : !!e.mustKeep,
      droppable: type === 'decorative' ? true : !!e.droppable,
      minLegiblePx: isText ? Number(e.minLegiblePx) || DEFAULT_MIN_PX[type] || 14 : 0,
      fontPx: isText ? deriveFontPx(box.h * masterRh, e.lines) : 0,
      contrast: 0,
      visionText: isText ? String(e.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 600) : '',
      visionShortForm: type === 'headline' || type === 'cta' ? String(e.shortForm ?? '').trim().slice(0, 80) : '',
    };
  });
  const bg = raw.background ?? {};
  const complexity = bg.complexity === 'simple' || bg.complexity === 'moderate' || bg.complexity === 'complex' ? bg.complexity : 'moderate';
  return {
    elements,
    background: {
      desc: String(bg.desc ?? 'unknown').slice(0, 120),
      extendable: !!bg.extendable && complexity !== 'complex',
      extendDirections: Array.isArray(bg.extendDirections)
        ? bg.extendDirections.filter((d): d is Direction => (DIRECTIONS as readonly string[]).includes(d))
        : [],
      complexity,
      color: bgColor,
    },
    regulated: true, // client vertical = BFSI → the Stage 5 compliance layer always applies
    detectedRegulated: !!raw.regulated,
    notes: String(raw.notes ?? '').slice(0, 200),
  };
}

/**
 * Text contrast on the master raster, measured inside the element box padded 4% per side (the same
 * cut used for patches). The background is taken as the median luminance (it dominates the box) and
 * the text as whichever extreme (p03 / p97) sits on the other side of it, so a CTA's navy-on-orange
 * pill is measured against the pill, not against the page behind it.
 */
export function lumOfHex(h: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (!m) return 0;
  return relativeLuminance(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
}

/** WCAG contrast ratio between two hex colours. */
export function contrastOfHex(a: string, b: string): number {
  const la = lumOfHex(a) + 0.05, lb = lumOfHex(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}

export function measureContrast(model: ObjectModel, sample: PixelSampler, rw: number, rh: number): ObjectModel {
  const elements = model.elements.map((e) => {
    if (!e.fontPx) return { ...e, contrast: 0 };
    // Re-set text is drawn in known colours: judge those, not the master's anti-aliased edges.
    if (e.text) return { ...e, contrast: contrastOfHex(e.text.color, e.text.bgColor || model.background.color) };
    const padX = e.box.w * rw * 0.04, padY = e.box.h * rh * 0.04;
    const x = Math.max(0, Math.round(e.box.x * rw - padX));
    const y = Math.max(0, Math.round(e.box.y * rh - padY));
    const w = Math.max(4, Math.min(rw - x, Math.round(e.box.w * rw + 2 * padX)));
    const h = Math.max(4, Math.min(rh - y, Math.round(e.box.h * rh + 2 * padY)));
    try {
      const d = sample(x, y, w, h);
      const ls: number[] = [];
      for (let i = 0; i + 3 < d.length; i += 16) ls.push(relativeLuminance(d[i], d[i + 1], d[i + 2]));
      if (!ls.length) return { ...e, contrast: 0 };
      ls.sort((a, b) => a - b);
      const at = (q: number) => ls[Math.min(ls.length - 1, Math.floor(ls.length * q))];
      const lo = at(0.005), bg = at(0.5), hi = at(0.995);
      const contrast = Math.max((hi + 0.05) / (bg + 0.05), (bg + 0.05) / (lo + 0.05));
      return { ...e, contrast };
    } catch {
      return { ...e, contrast: 0 };
    }
  });
  return { ...model, elements };
}

export interface Union { x0: number; y0: number; x1: number; y1: number }

/** Union box of all mustKeep elements in master-raster px (the whole raster when there are none). */
export function keepUnion(model: ObjectModel, rw: number, rh: number): Union {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
  for (const e of model.elements) {
    if (!e.mustKeep) continue;
    any = true;
    x0 = Math.min(x0, e.box.x * rw); y0 = Math.min(y0, e.box.y * rh);
    x1 = Math.max(x1, (e.box.x + e.box.w) * rw); y1 = Math.max(y1, (e.box.y + e.box.h) * rh);
  }
  return any ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: rw, y1: rh };
}

/** First protected text element that would render below its legibility floor at `scale`. */
export function firstIllegible(model: ObjectModel, scale: number): TaggedElement | undefined {
  return model.elements.find((e) => e.mustKeep && e.fontPx > 0 && e.fontPx * scale < e.minLegiblePx - 0.25);
}

export function illegibleNote(stage: string, e: TaggedElement, scale: number): string {
  return `${stage}: ${e.type} renders at ${Math.round(e.fontPx * scale)}px, below its ${e.minLegiblePx}px floor`;
}
