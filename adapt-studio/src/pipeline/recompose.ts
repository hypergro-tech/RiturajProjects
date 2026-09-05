import { BLOCK_MESSAGE, LOGO_MIN_HEIGHT_PX } from './constants';
import { legalMin } from './safeZones';
import type {
  BlockedPlan, ElementType, KeepRect, LayoutOp, Margins, MasterInfo, ObjectModel, PlanOptions,
  RecomposePlan, TaggedElement, TextMeasurer, TextSpec,
} from './types';

export interface SrcRect { sx: number; sy: number; sw: number; sh: number }

/** Pad the glyph-tight vision box 4% per side so patches don't slice letterforms. */
export function srcRect(e: TaggedElement, rw: number, rh: number): SrcRect {
  const pw = e.box.w * rw * 0.04, ph = e.box.h * rh * 0.04;
  const sx = Math.max(0, e.box.x * rw - pw), sy = Math.max(0, e.box.y * rh - ph);
  return { sx, sy, sw: Math.min(rw - sx, e.box.w * rw + 2 * pw), sh: Math.min(rh - sy, e.box.h * rh + 2 * ph) };
}

/** Greedy word wrap honouring explicit line breaks. A word wider than maxW still gets its own line. */
export function wrapText(measure: TextMeasurer, spec: TextSpec, px: number, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const cand = line ? `${line} ${word}` : word;
      if (!line || measure(spec, px, cand) <= maxW) line = cand;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

export interface Fit { px: number; lines: string[]; w: number; h: number }
export interface FitOptions { maxPx: number; minPx: number; maxLines: number }

/** Largest size in [minPx, maxPx] at which `text` wraps into ≤ maxLines lines inside maxW × maxH. */
export function fitText(measure: TextMeasurer, spec: TextSpec, text: string, maxW: number, maxH: number, o: FitOptions): Fit | null {
  const sizes: number[] = [];
  for (let px = Math.floor(o.maxPx); px > o.minPx; px = Math.floor(Math.min(px - 1, px * 0.94))) sizes.push(px);
  sizes.push(o.minPx);
  for (const px of sizes) {
    const lines = wrapText(measure, spec, px, text, maxW);
    if (lines.length > o.maxLines) continue;
    const h = px * spec.lineHeight * lines.length;
    if (h > maxH + 0.5) continue;
    const w = Math.max(...lines.map((l) => measure(spec, px, l)));
    if (w > maxW + 0.5) continue;
    return { px, lines, w, h };
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Area { x: number; y: number; w: number; h: number }
type Align = 'left' | 'center';

/**
 * Stage 3 — RECOMPOSE. Discards the flat layout and rebuilds from the object model. Text elements that carry a
 * TextSpec are re-set (wrapped, sized to fit, short-form under pressure); logo and visuals are raster patches.
 * Layout insets are exactly the margins the safe-zone gate checks (or the aesthetic pad if larger), so a
 * rebuilt output cannot fail its own geometry.
 */
export function planRecompose(master: MasterInfo, model: ObjectModel, W: number, H: number, social: boolean, m: Margins, opts: PlanOptions): RecomposePlan | BlockedPlan {
  const { rw, rh } = master;
  const { measure } = opts;
  const find = (t: ElementType) => model.elements.find((e) => e.type === t);
  const logo = find('logo'), headline = find('headline'), cta = find('cta'), legal = find('legal');
  const body = find('subhead') ?? find('body');
  const visual = find('product') ?? find('person') ?? find('decorative');
  const lMin = legalMin(W, social);
  const pad = Math.max(12, Math.round(Math.min(W, H) * 0.08));
  const px = Math.max(pad, Math.ceil(W * Math.max(m.l, m.r)));
  const padT = Math.max(pad, Math.ceil(H * m.t));
  const padB = Math.max(pad, Math.ceil(H * m.b));
  const src = (e: TaggedElement) => srcRect(e, rw, rh);

  const ops: LayoutOp[] = [];
  const keepRects: KeepRect[] = [];
  const changes: string[] = [];
  const overflows: string[] = [];
  const dropped: ElementType[] = [];

  // ---------- primitives ----------
  const patch = (e: TaggedElement, x: number, y: number, k: number, keep: boolean) => {
    const { sx, sy, sw, sh } = src(e);
    const dw = sw * k, dh = sh * k;
    ops.push({ kind: 'patch', sx, sy, sw, sh, dx: x, dy: y, dw, dh });
    if (keep) keepRects.push({ type: e.type, fontPx: (e.fontPx || 0) * k, min: e.minLegiblePx || 0, x, y, w: dw, h: dh });
    return { w: dw, h: dh };
  };
  const patchScale = (e: TaggedElement, maxW: number, maxH: number) => {
    const { sw, sh } = src(e);
    let k = Math.min(maxW / sw, maxH / sh, 1.6);
    if (e.fontPx && e.minLegiblePx) k = Math.max(k, e.minLegiblePx / e.fontPx);
    return k;
  };
  const textBlock = (e: TaggedElement, spec: TextSpec, fit: Fit, x: number, y: number, align: Align, w: number) => {
    ops.push({ kind: 'text', spec, lines: fit.lines, x, y, px: fit.px, align, w });
    const kx = align === 'center' ? x + (w - fit.w) / 2 : x;
    keepRects.push({ type: e.type, fontPx: fit.px, min: e.minLegiblePx, x: kx, y, w: fit.w, h: fit.h });
  };

  /** Place the logo patch (never below the 20px brand minimum). */
  const setLogo = (a: Area, align: Align) => {
    if (!logo) return { w: 0, h: 0 };
    const { sw, sh } = src(logo);
    let k = Math.min(a.w / sw, a.h / sh, 1.6);
    if (sh * k < LOGO_MIN_HEIGHT_PX) { k = LOGO_MIN_HEIGHT_PX / sh; if (sw * k > a.w + 0.5) overflows.push(`logo needs ${Math.round(sw * k)}px width at its 20px minimum`); }
    const w = sw * k, h = sh * k;
    const x = align === 'center' ? a.x + (a.w - w) / 2 : a.x;
    patch(logo, x, a.y, k, true);
    changes.push(`logo ${Math.round(h)}px tall`);
    return { w, h };
  };

  /** Re-set a text element into an area; short-form under pressure; overflow at the floor as a last resort. */
  const setText = (e: TaggedElement | undefined, a: Area, o: FitOptions, align: Align, label: string) => {
    if (!e) return { w: 0, h: 0, px: 0 };
    const spec = e.text;
    if (!spec) {
      const k = patchScale(e, a.w, a.h);
      const d = patch(e, align === 'center' ? a.x + (a.w - src(e).sw * k) / 2 : a.x, a.y, k, true);
      changes.push(`${label} scaled as a patch (no text available)`);
      return { ...d, px: (e.fontPx || 0) * k };
    }
    let fit = fitText(measure, spec, spec.content, a.w, a.h, o);
    let used = 'full';
    if (!fit && spec.shortForm) { fit = fitText(measure, spec, spec.shortForm, a.w, a.h, o); used = 'short-form'; }
    if (!fit) {
      const lines = wrapText(measure, spec, o.minPx, spec.shortForm || spec.content, a.w);
      fit = { px: o.minPx, lines, w: Math.max(...lines.map((l) => measure(spec, o.minPx, l))), h: o.minPx * spec.lineHeight * lines.length };
      used = 'overflow';
      overflows.push(`${label} needs ${lines.length} line${lines.length === 1 ? '' : 's'} at its ${o.minPx}px floor (${Math.round(fit.h)}px) but only ${Math.round(a.h)}px is available`);
    }
    textBlock(e, spec, fit, a.x, a.y, align, a.w);
    changes.push(`${label} ${used === 'short-form' ? 'short-form ' : ''}re-set in ${fit.lines.length} line${fit.lines.length === 1 ? '' : 's'} at ${fit.px}px${used === 'overflow' ? ' (overflows)' : ''}`);
    return { w: fit.w, h: fit.h, px: fit.px };
  };

  /** CTA: a pill with centred text when the master's CTA is a filled button, else text alone. */
  const setCta = (a: Area, o: FitOptions, align: Align) => {
    if (!cta) return { w: 0, h: 0 };
    const spec = cta.text;
    if (!spec) {
      const k = patchScale(cta, a.w, a.h);
      const d = patch(cta, align === 'center' ? a.x + (a.w - src(cta).sw * k) / 2 : a.x, a.y, k, true);
      changes.push('CTA scaled as a patch (no text available)');
      return d;
    }
    const pill = !!spec.bgColor;
    const padX = (p: number) => (pill ? p * 1.1 : 0), padY = (p: number) => (pill ? p * 0.55 : 0);
    const maxPx = Math.min(o.maxPx, pill ? Math.floor(a.h / 2.1) : Math.floor(a.h / spec.lineHeight));
    const fitIn = (t: string) => fitText(measure, spec, t, a.w - 2 * padX(Math.max(o.minPx, maxPx)), a.h, { ...o, maxPx: Math.max(o.minPx, maxPx), maxLines: 1 });
    let fit = fitIn(spec.content), used = '';
    if (!fit && spec.shortForm) { fit = fitIn(spec.shortForm); used = 'short-form '; }
    if (!fit) {
      const t = spec.shortForm || spec.content;
      fit = { px: o.minPx, lines: [t], w: measure(spec, o.minPx, t), h: o.minPx * spec.lineHeight };
      overflows.push(`CTA does not fit at its ${o.minPx}px floor`);
    }
    const w = fit.w + 2 * padX(fit.px), h = fit.px * spec.lineHeight + 2 * padY(fit.px);
    const x = align === 'center' ? a.x + (a.w - w) / 2 : a.x;
    if (pill) ops.push({ kind: 'pill', x, y: a.y, w, h, fill: spec.bgColor });
    ops.push({ kind: 'text', spec, lines: fit.lines, x: x + padX(fit.px), y: a.y + padY(fit.px), px: fit.px, align: 'center', w: fit.w });
    keepRects.push({ type: 'cta', fontPx: fit.px, min: cta.minLegiblePx, x, y: a.y, w, h });
    changes.push(`CTA ${used}re-set at ${fit.px}px${pill ? ' in a pill' : ''}`);
    return { w, h };
  };

  /** Legal at exactly its floor; null when it cannot fit → compliance block. */
  const legalFit = (maxW: number, maxH: number, maxLines: number): { h: number; place: (x: number, y: number, align: Align, w: number) => void } | null => {
    if (!legal) return { h: 0, place: () => undefined };
    const spec = legal.text;
    if (!spec) {
      const kMin = legal.fontPx > 0 ? lMin / legal.fontPx : Infinity;
      const { sw, sh } = src(legal);
      if (sw * kMin > maxW + 0.5 || sh * kMin > maxH + 0.5) return null;
      return { h: sh * kMin, place: (x, y, align, w) => { patch(legal, align === 'center' ? x + (w - sw * kMin) / 2 : x, y, kMin, true); changes.push('legal scaled as a patch (no text available)'); } };
    }
    const fit = fitText(measure, spec, spec.content, maxW, maxH, { maxPx: lMin, minPx: lMin, maxLines });
    if (!fit) return null;
    return { h: fit.h, place: (x, y, align, w) => { textBlock(legal, spec, fit, x, y, align, w); changes.push(`legal re-set in ${fit.lines.length} line${fit.lines.length === 1 ? '' : 's'} at ${fit.px}px`); } };
  };

  const setVisual = (a: Area) => {
    if (!visual) return false;
    const { sw, sh } = src(visual);
    const k = Math.min(a.w / sw, a.h / sh, 1.6);
    const w = sw * k, h = sh * k;
    patch(visual, a.x + (a.w - w) / 2, a.y + (a.h - h) / 2, k, false);
    changes.push(`${visual.type} kept in leftover space`);
    return true;
  };

  const dropIf = (e: TaggedElement | undefined, why: string) => { if (e) { dropped.push(e.type); changes.push(`${e.type} dropped (${why})`); } };
  const BLOCK: BlockedPlan = { kind: 'BLOCKED', blockMsg: BLOCK_MESSAGE };
  const contentW = W - 2 * px;
  let template: string;

  if (W / H >= 3) {
    // ---------- Horizontal strip: logo → headline → CTA left to right, legal on its own line below ----------
    template = 'Rebuilt left→right';
    const gap = clamp(Math.round(H * 0.06), 4, 12), hGap = clamp(Math.round(W * 0.02), 8, 24);
    const lf = legalFit(contentW, H * 0.35, H >= 120 ? 2 : 1);
    if (!lf) return BLOCK;
    const legalY = H - padB - lf.h;
    const top = padT, contentH = Math.max(1, legalY - gap - top);
    const lg = setLogo({ x: px, y: top, w: W * 0.22, h: contentH }, 'left');
    if (lg.h) {
      // vertically centre the logo patch in the strip
      const dy = top + (contentH - lg.h) / 2;
      keepRects[keepRects.length - 1].y = dy;
      const o = ops[ops.length - 1];
      if (o.kind === 'patch') o.dy = dy;
    }
    const ctaPx = clamp(Math.round(contentH * 0.42), 16, 30);
    const ctaArea: Area = { x: 0, y: top, w: W * 0.22, h: contentH };
    const ctaW = (() => { // measure first so the headline knows its width; then place at the right edge
      const before = ops.length;
      const d = setCta({ ...ctaArea, x: W - px - ctaArea.w }, { maxPx: ctaPx, minPx: cta?.minLegiblePx || 16, maxLines: 1 }, 'left');
      const dx = W - px - d.w, dy = top + (contentH - d.h) / 2;
      for (let i = before; i < ops.length; i++) { const o = ops[i]; if (o.kind === 'pill') { o.x = dx; o.y = dy; } else if (o.kind === 'text') { o.x = dx + (o.x - (W - px - ctaArea.w)); o.y = dy + (o.y - top); } }
      const kr = keepRects[keepRects.length - 1]; if (kr && kr.type === 'cta') { kr.x = dx; kr.y = dy; }
      return d.w;
    })();
    const hlX = px + lg.w + (lg.w ? hGap : 0);
    const hlW = Math.max(40, W - hlX - ctaW - (ctaW ? hGap : 0) - px);
    const maxLines = contentH >= 2 * 24 * 1.12 ? 2 : 1;
    const before = ops.length;
    const hl = setText(headline, { x: hlX, y: top, w: hlW, h: contentH }, { maxPx: clamp(Math.round(contentH * 0.55), 24, 60), minPx: headline?.minLegiblePx || 24, maxLines }, 'left', 'headline');
    if (hl.h) {
      // vertically centre whatever setText produced (a text block or a patch) in the strip
      const dy = top + (contentH - hl.h) / 2;
      for (let i = before; i < ops.length; i++) {
        const o = ops[i];
        if (o.kind === 'patch') o.dy = dy;
        else if (o.kind === 'text') o.y = dy;
      }
      const kr = keepRects[keepRects.length - 1];
      if (kr && kr.type === 'headline') kr.y = dy;
    }
    lf.place(px, legalY, 'left', contentW);
    dropIf(body, 'no room in a strip');
    dropIf(visual, 'no room in a strip');
  } else if (H / W >= 1.8) {
    // ---------- Vertical strip: logo, headline, (visual), CTA, legal top → bottom ----------
    template = 'Rebuilt top→bottom';
    const gap = clamp(Math.round(H * 0.03), 8, 24);
    let y = padT;
    const lg = setLogo({ x: px, y, w: contentW, h: clamp(H * 0.06, 20, 80) }, 'center');
    if (lg.h) y += lg.h + gap;
    const lf = legalFit(contentW, H * 0.25, H >= 500 ? 4 : 3);
    if (!lf) return BLOCK;
    const legalY = H - padB - lf.h;
    const ctaPx = clamp(Math.round(W * 0.09), 16, 36);
    const ctaBefore = ops.length;
    const ctaD = setCta({ x: px, y: 0, w: contentW, h: H * 0.12 }, { maxPx: ctaPx, minPx: cta?.minLegiblePx || 16, maxLines: 1 }, 'center');
    const ctaY = legalY - (ctaD.h ? gap + ctaD.h : 0);
    for (let i = ctaBefore; i < ops.length; i++) { const o = ops[i]; if (o.kind === 'pill') o.y = ctaY; else if (o.kind === 'text') o.y += ctaY; }
    if (ctaD.h) { const kr = keepRects[keepRects.length - 1]; if (kr.type === 'cta') kr.y = ctaY; }
    const hl = setText(headline, { x: px, y, w: contentW, h: Math.max(24, Math.min(H * 0.35, ctaY - gap - y)) }, { maxPx: clamp(Math.round(W * 0.16), 24, 90), minPx: headline?.minLegiblePx || 24, maxLines: 4 }, 'center', 'headline');
    if (hl.h) y += hl.h + gap;
    if (body?.text) {
      const room = ctaY - gap - y;
      if (room >= 2 * 14 * 1.25) { const b = setText(body, { x: px, y, w: contentW, h: Math.min(room, H * 0.2) }, { maxPx: clamp(Math.round(hl.px * 0.5), 14, 36), minPx: body.minLegiblePx || 14, maxLines: 3 }, 'center', 'body'); y += b.h + gap; }
      else dropIf(body, 'no room');
    } else dropIf(body, 'no room');
    const leftover = ctaY - gap - y;
    if (visual && leftover >= Math.max(60, H * 0.15)) setVisual({ x: px, y, w: contentW, h: leftover });
    else dropIf(visual, 'no room');
    lf.place(px, legalY, 'center', contentW);
  } else {
    // ---------- Compact / wide: stacked hierarchy, visual on the right when there is room ----------
    template = 'Rebuilt as stacked hierarchy';
    const gap = clamp(Math.round(H * 0.03), 8, 24), hGap = clamp(Math.round(W * 0.02), 8, 24);
    const hasVisual = !!visual && W > 480;
    const visualW = hasVisual ? Math.round(W * 0.3) : 0;
    const textW = contentW - (hasVisual ? visualW + hGap : 0);
    const lf = legalFit(contentW, H * 0.3, H >= 400 ? 3 : 2);
    if (!lf) return BLOCK;
    const legalY = H - padB - lf.h;
    const ctaPx = clamp(Math.round(H * 0.07), 16, 40);
    const ctaBefore = ops.length;
    const ctaD = setCta({ x: px, y: 0, w: textW, h: H * 0.2 }, { maxPx: ctaPx, minPx: cta?.minLegiblePx || 16, maxLines: 1 }, 'left');
    const ctaY = legalY - (ctaD.h ? gap + ctaD.h : 0);
    for (let i = ctaBefore; i < ops.length; i++) { const o = ops[i]; if (o.kind === 'pill') o.y = ctaY; else if (o.kind === 'text') o.y += ctaY; }
    if (ctaD.h) { const kr = keepRects[keepRects.length - 1]; if (kr.type === 'cta') kr.y = ctaY; }
    let y = padT;
    const lg = setLogo({ x: px, y, w: textW * 0.5, h: clamp(H * 0.12, 20, 80) }, 'left');
    if (lg.h) y += lg.h + gap;
    const hl = setText(headline, { x: px, y, w: textW, h: Math.max(24, ctaY - gap - y) }, { maxPx: clamp(Math.round(H * 0.13), 24, 120), minPx: headline?.minLegiblePx || 24, maxLines: 3 }, 'left', 'headline');
    if (hl.h) y += hl.h + gap;
    if (body?.text) {
      const room = ctaY - gap - y;
      if (room >= 2 * 14 * 1.25) { const b = setText(body, { x: px, y, w: textW, h: room }, { maxPx: clamp(Math.round(hl.px * 0.5), 14, 36), minPx: body.minLegiblePx || 14, maxLines: 3 }, 'left', 'body'); y += b.h + gap; }
      else dropIf(body, 'no room');
    } else dropIf(body, 'no room');
    if (hasVisual) setVisual({ x: px + textW + hGap, y: padT, w: visualW, h: Math.max(20, legalY - gap - padT) });
    else dropIf(visual, W > 480 ? 'no room' : 'compact size');
    lf.place(px, legalY, 'left', contentW);
  }

  const summary = `${template}: ${changes.join(', ')}.`;
  return { kind: 'RECOMPOSE', ops, keepRects, masks: [], dropped, changes, overflows, summary };
}
