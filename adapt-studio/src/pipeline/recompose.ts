import { BLOCK_MESSAGE } from './constants';
import { legalMin } from './safeZones';
import type { BlockedPlan, DrawOp, ElementType, KeepRect, Margins, MasterInfo, ObjectModel, RecomposePlan, TaggedElement } from './types';

export interface SrcRect { sx: number; sy: number; sw: number; sh: number }

/** Pad the glyph-tight vision box 4% per side so patches don't slice letterforms. */
export function srcRect(e: TaggedElement, rw: number, rh: number): SrcRect {
  const pw = e.box.w * rw * 0.04, ph = e.box.h * rh * 0.04;
  const sx = Math.max(0, e.box.x * rw - pw), sy = Math.max(0, e.box.y * rh - ph);
  return { sx, sy, sw: Math.min(rw - sx, e.box.w * rw + 2 * pw), sh: Math.min(rh - sy, e.box.h * rh + 2 * ph) };
}

/**
 * Stage 3 — RECOMPOSE. Discards the flat layout and rebuilds from the object model using raster
 * patches on the sampled background colour. Layout insets are exactly the margins the safe-zone
 * gate checks (or the aesthetic pad if larger), so a rebuilt output cannot fail its own geometry.
 * All fit maths use the padded patch size so what is measured is what gets drawn.
 */
export function planRecompose(master: MasterInfo, model: ObjectModel, W: number, H: number, social: boolean, m: Margins): RecomposePlan | BlockedPlan {
  const { rw, rh } = master;
  const find = (t: ElementType) => model.elements.find((e) => e.type === t);
  const logo = find('logo'), headline = find('headline'), cta = find('cta'), legal = find('legal');
  const product = find('product') ?? find('person');
  const lMin = legalMin(W, social); // same floor planAdapt() stamps on the legal element
  const pad = Math.max(12, Math.round(Math.min(W, H) * 0.08));
  const px = Math.max(pad, Math.ceil(W * Math.max(m.l, m.r)));
  const padT = Math.max(pad, Math.ceil(H * m.t));
  const padB = Math.max(pad, Math.ceil(H * m.b));
  const src = (e: TaggedElement) => srcRect(e, rw, rh);

  // Stage 5: the legal line must render ≥ its floor inside the canvas, or the size is blocked.
  const kLegal = legal ? (legal.fontPx > 0 ? lMin / legal.fontPx : Infinity) : 0;
  if (legal) {
    const { sw, sh } = src(legal);
    if (sw * kLegal > W - 2 * px || sh * kLegal > H * 0.42) return { kind: 'BLOCKED', blockMsg: BLOCK_MESSAGE };
  }

  const ops: DrawOp[] = [];
  const keepRects: KeepRect[] = [];
  const draw = (e: TaggedElement, x: number, y: number, k: number) => {
    const { sx, sy, sw, sh } = src(e);
    const dw = sw * k, dh = sh * k;
    ops.push({ sx, sy, sw, sh, dx: x, dy: y, dw, dh });
    return { w: dw, h: dh };
  };
  const place = (e: TaggedElement | undefined, x: number, y: number, k: number) => {
    if (!e) return { w: 0, h: 0 };
    const d = draw(e, x, y, k);
    keepRects.push({ type: e.type, fontPx: (e.fontPx || 0) * k, min: e.minLegiblePx || 0, x, y, w: d.w, h: d.h });
    return d;
  };
  /** Scale that fits the padded patch into targetW × targetH (≤ 1.6×), never below the legibility floor. */
  const kFor = (e: TaggedElement | undefined, targetW: number, targetH: number) => {
    if (!e) return 0;
    const { sw, sh } = src(e);
    let k = Math.min(targetW / sw, targetH / sh, 1.6);
    if (e.fontPx && e.minLegiblePx) k = Math.max(k, e.minLegiblePx / e.fontPx);
    return k;
  };
  const dropped = model.elements.filter((e) => !e.mustKeep && e.type !== 'product' && e.type !== 'person').map((e) => e.type);
  const droppedLabel = dropped.join(', ') || 'none';
  let summary: string;

  if (W / H >= 3) {
    // Horizontal strip: logo → headline → CTA left to right, legal on its own line below.
    const legalH2 = legal ? src(legal).sh * kLegal : 0;
    const legalY = H - legalH2 - padB;
    const top = padT, contentH = legalY - 6 - top;
    const kLogo = kFor(logo, W * 0.22, contentH * 0.7);
    let logoW2 = 0;
    if (logo) { const { sw, sh } = src(logo); logoW2 = sw * kLogo; place(logo, px, top + (contentH - sh * kLogo) / 2, kLogo); }
    const kCta = kFor(cta, W * 0.18, contentH * 0.7);
    let ctaW2 = 0;
    if (cta) { const { sw, sh } = src(cta); ctaW2 = sw * kCta; place(cta, W - px - ctaW2, top + (contentH - sh * kCta) / 2, kCta); }
    const hlX = px + logoW2 + 20, hlAvail = W - hlX - ctaW2 - px - 16;
    const kHl = kFor(headline, hlAvail, contentH * 0.8);
    if (headline) { const { sh } = src(headline); place(headline, hlX, top + (contentH - sh * kHl) / 2, kHl); }
    if (legal) place(legal, px, legalY, kLegal);
    summary = `Rebuilt left→right from element patches: logo, headline, CTA, single-line legal. Dropped: ${droppedLabel}.`;
  } else if (H / W >= 1.8) {
    // Vertical strip: headline top, visual middle, CTA bottom, legal last.
    let y = padT;
    const kLogo = kFor(logo, W - 2 * px, H * 0.12);
    if (logo) { const { sw } = src(logo); const d = place(logo, (W - sw * kLogo) / 2, y, kLogo); y += d.h + Math.max(12, H * 0.025); }
    const kHl = kFor(headline, W - 2 * px, H * 0.22);
    if (headline) { const { sw } = src(headline); const d = place(headline, (W - sw * kHl) / 2, y, kHl); y += d.h + 10; }
    const legalSr = legal ? src(legal) : null;
    const legalH2 = legalSr ? legalSr.sh * kLegal : 0;
    const legalY = H - padB - legalH2;
    const kCta = kFor(cta, W - 2 * px, 46);
    const ctaSr = cta ? src(cta) : null;
    const ctaH = ctaSr ? ctaSr.sh * kCta : 0;
    const ctaY = legalY - 14 - ctaH;
    if (product) {
      const kP = kFor(product, W - 2 * px, Math.max(20, ctaY - y - 16));
      const { sw, sh } = src(product);
      draw(product, (W - sw * kP) / 2, y + (ctaY - y - sh * kP) / 2, kP);
    }
    if (cta && ctaSr) place(cta, (W - ctaSr.sw * kCta) / 2, ctaY, kCta);
    if (legal && legalSr) place(legal, (W - legalSr.sw * kLegal) / 2, legalY, kLegal);
    summary = `Rebuilt top→bottom from element patches: logo, headline${product ? ', visual' : ''}, CTA, legal. Dropped: ${droppedLabel}.`;
  } else {
    // Compact / wide: stacked hierarchy with generous margins.
    let y = padT;
    const kLogo = kFor(logo, W * 0.42, H * 0.16);
    if (logo) { const d = place(logo, px, y, kLogo); y += d.h + Math.max(12, H * 0.05); }
    const kHl = kFor(headline, W - 2 * px, H * 0.3);
    if (headline) { const d = place(headline, px, y, kHl); y += d.h + Math.max(10, H * 0.04); }
    const legalH2 = legal ? src(legal).sh * kLegal : 0;
    if (cta) { const kCta = kFor(cta, W * 0.5, H * 0.16); place(cta, px, y, kCta); }
    if (product && W > 480) {
      const kP = kFor(product, W * 0.3, H * 0.5);
      const { sw, sh } = src(product);
      draw(product, W - px - sw * kP, (H - sh * kP) / 2, kP);
    }
    if (legal) place(legal, px, H - padB - legalH2, kLegal);
    summary = `Rebuilt as stacked hierarchy from element patches on a flat background. Dropped: ${droppedLabel}.`;
  }
  return { kind: 'RECOMPOSE', ops, keepRects, masks: [], dropped, summary };
}
