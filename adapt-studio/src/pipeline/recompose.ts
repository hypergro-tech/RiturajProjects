import { BLOCK_MESSAGE, LOGO_MIN_HEIGHT_PX } from './constants';
import { deriveLayoutSystem } from './layout';
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

const SENTENCE_END = /[.!?]["'”’)]?$/;
const CLAUSE_END = /[:;,—–]["'”’)]?$/;

/**
 * Balanced word wrap: the same line count as the greedy wrap (the minimum), but breaks chosen the way a
 * typesetter would — lines of similar measure, a sentence end preferred at a line end, and never a lone
 * short word on the last line when another break avoids it. Explicit line breaks are honoured.
 */
export function wrapBalanced(measure: TextMeasurer, spec: TextSpec, px: number, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const greedy = wrapText(measure, spec, px, para, maxW);
    const n = greedy.length, m = words.length;
    if (n <= 1 || m <= n) { out.push(...greedy); continue; }
    const widthCache = new Map<number, number>();
    const width = (i: number, j: number) => {
      const key = i * 1000 + j;
      let w = widthCache.get(key);
      if (w === undefined) { w = measure(spec, px, words.slice(i, j).join(' ')); widthCache.set(key, w); }
      return w;
    };
    const lineCost = (i: number, j: number, last: boolean) => {
      const w = width(i, j);
      if (w > maxW + 0.5) return Infinity;
      const slack = maxW - w;
      let c = slack * slack * (last ? 0.5 : 1);
      if (!last) c *= SENTENCE_END.test(words[j - 1]) ? 0.6 : CLAUSE_END.test(words[j - 1]) ? 0.85 : 1;
      if (last && j - i === 1 && w < maxW * 0.5) c += maxW * maxW * 0.25; // a lone short word on the last line
      return c;
    };
    // best[k][i]: min cost to set words[i..m) in exactly k lines; next[k][i]: where the first of those lines ends
    const best: number[][] = [], next: number[][] = [];
    for (let k = 0; k <= n; k++) { best.push(new Array<number>(m + 1).fill(Infinity)); next.push(new Array<number>(m + 1).fill(-1)); }
    best[0][m] = 0;
    for (let k = 1; k <= n; k++) {
      for (let i = m - 1; i >= 0; i--) {
        for (let j = i + 1; j <= m - (k - 1); j++) {
          const c = lineCost(i, j, k === 1);
          if (c === Infinity) break;
          const total = c + best[k - 1][j];
          if (total < best[k][i]) { best[k][i] = total; next[k][i] = j; }
        }
      }
    }
    if (best[n][0] === Infinity) { out.push(...greedy); continue; }
    let i = 0;
    for (let k = n; k >= 1; k--) { const j = next[k][i]; out.push(words.slice(i, j).join(' ')); i = j; }
  }
  return out;
}

export interface Fit { px: number; lines: string[]; w: number; h: number }
export interface FitOptions { maxPx: number; minPx: number; maxLines: number }

/** Wrap at `px`, treating the master's explicit line breaks as soft when they alone exceed the line budget. */
function setLines(measure: TextMeasurer, spec: TextSpec, px: number, text: string, maxW: number, maxLines: number): string[] {
  const paras = text.split('\n').filter((p) => p.trim());
  const t = paras.length > maxLines ? paras.join(' ') : text;
  return wrapBalanced(measure, spec, px, t, maxW);
}

/** Largest size in [minPx, maxPx] at which `text` sets in ≤ maxLines lines inside maxW × maxH. */
export function fitText(measure: TextMeasurer, spec: TextSpec, text: string, maxW: number, maxH: number, o: FitOptions): Fit | null {
  const sizes: number[] = [];
  for (let px = Math.floor(o.maxPx); px > o.minPx; px = Math.floor(Math.min(px - 1, px * 0.94))) sizes.push(px);
  sizes.push(o.minPx);
  for (const px of sizes) {
    const lines = setLines(measure, spec, px, text, maxW, o.maxLines);
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
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Area { x: number; y: number; w: number; h: number }
type Align = 'left' | 'center' | 'right';
/** x of a block of width `w` placed in area `a` with alignment. */
const alignX = (a: Area, w: number, align: Align) => (align === 'center' ? a.x + (a.w - w) / 2 : align === 'right' ? a.x + a.w - w : a.x);

type Variant = 'full' | 'short';

/** One element set at a candidate size, not yet placed. */
interface TextBlock { kind: 'text'; e: TaggedElement; spec: TextSpec; px: number; lines: string[]; w: number; h: number; used: Variant }
interface PatchBlock { kind: 'patch'; e: TaggedElement; k: number; w: number; h: number; px: number }
interface PillBlock { kind: 'pill'; e: TaggedElement; spec: TextSpec; px: number; text: string; textW: number; w: number; h: number; pill: boolean; used: Variant }
type Block = TextBlock | PatchBlock | PillBlock;

/** Sizes derived from one headline size through the master's ratios. */
interface TypeScale { h: number; bodyPx: number; ctaPx: number; legalPx: number; logoH: number }

/**
 * Stage 3 — RECOMPOSE. Discards the flat layout and rebuilds on the master's own layout system: one headline
 * size is solved so the whole stack fills the canvas, every other size follows the master's ratios, the master's
 * gaps compress or expand to fit, text is re-set with balanced line breaks, and the legal line anchors to the
 * bottom. Text elements that carry a TextSpec are re-set (short-form under pressure); logo and visuals are
 * raster patches. Layout insets are exactly the margins the safe-zone gate checks (or the master's own inset if
 * larger), so a rebuilt output cannot fail its own geometry.
 */
export function planRecompose(master: MasterInfo, model: ObjectModel, W: number, H: number, social: boolean, m: Margins, opts: PlanOptions): RecomposePlan | BlockedPlan {
  const { rw, rh } = master;
  const { measure } = opts;
  const find = (t: ElementType) => model.elements.find((e) => e.type === t);
  const logo = find('logo'), headline = find('headline'), cta = find('cta'), legal = find('legal');
  const body = find('subhead') ?? find('body');
  const visual = find('product') ?? find('person') ?? find('decorative');
  const sys = deriveLayoutSystem(model, rw, rh);
  const lMin = legalMin(W, social);
  const src = (e: TaggedElement) => srcRect(e, rw, rh);

  // Insets: the master's own inset on the short edge (never under 12px), or the safe margin when that is larger.
  const padX = Math.max(12, Math.round(Math.min(W, H) * clamp(sys.inset.x, 0.06, 0.12)));
  const padY = Math.max(12, Math.round(Math.min(W, H) * clamp(sys.inset.y, 0.06, 0.12)));
  const px = Math.max(padX, Math.ceil(W * Math.max(m.l, m.r)));
  const padT = Math.max(padY, Math.ceil(H * m.t)), padB = Math.max(padY, Math.ceil(H * m.b));
  const contentW = W - 2 * px, availH = H - padT - padB;

  const floorOf = (e: TaggedElement | undefined, def: number) => e?.minLegiblePx || def;
  const hlFloor = floorOf(headline, 24), bodyFloor = floorOf(body, 14), ctaFloor = floorOf(cta, 16);
  // Headline cap: the master's headline as a share of its canvas, applied to the target's mean edge (+15% air),
  // never below a floor-and-a-third so small banners still get a headline that reads as one.
  const hFrac = headline && headline.fontPx > 0 ? headline.fontPx / Math.sqrt(rw * rh) : 0.05;
  const propCap = Math.round(hFrac * Math.sqrt(W * H) * 1.15);
  // Small display sizes are far below the master's proportion: there the headline may grow to fill the canvas.
  const hCap = propCap >= hlFloor * 1.5 ? propCap : Math.max(Math.round(hlFloor * 1.35), Math.round(0.12 * Math.min(W, H)));

  const ops: LayoutOp[] = [];
  const keepRects: KeepRect[] = [];
  const changes: string[] = [];
  const overflows: string[] = [];
  const dropped: ElementType[] = [];
  const BLOCK: BlockedPlan = { kind: 'BLOCKED', blockMsg: BLOCK_MESSAGE };
  const al: Align = sys.align;
  const isStrip = W / H >= 3;
  const narrow = W < 220, compact = H <= 300, tall = H / W >= 1.5;
  const hlMaxLines = narrow || tall ? 4 : compact ? 2 : 3;
  const bodyMaxLines = narrow ? 4 : compact ? 2 : 3;
  const legalMaxLines = isStrip ? (availH >= 100 ? 2 : 1) : narrow ? 4 : compact ? 2 : 3;

  const typeAt = (h: number): TypeScale => {
    const bodyRatio = body?.type === 'subhead' ? sys.scale.subhead : sys.scale.body;
    const bodyPx = body ? clamp(Math.round(h * bodyRatio), bodyFloor, Math.max(bodyFloor, Math.round(h * 0.7))) : 0;
    const ctaPx = cta ? clamp(Math.round(h * sys.scale.cta), ctaFloor, Math.max(ctaFloor, Math.round(h * 0.6))) : 0;
    const legalCap = Math.max(lMin, Math.round(bodyPx ? bodyPx * 0.8 : h * 0.4));
    const legalPx = legal ? clamp(Math.round(h * sys.scale.legal), lMin, legalCap) : 0;
    const logoH = logo ? Math.max(LOGO_MIN_HEIGHT_PX, Math.round(h * sys.scale.logo)) : 0;
    return { h, bodyPx, ctaPx, legalPx, logoH };
  };

  // ---------- setting elements at a size (measure only) ----------
  const setText = (e: TaggedElement, pxSize: number, maxW: number, maxLines: number, variant: Variant, floor: number): Block | null => {
    const spec = e.text;
    if (!spec) {
      // No text to re-set: scale the raster patch so its type lands at the system size, width permitting.
      const { sw, sh } = src(e);
      let k = e.fontPx > 0 ? pxSize / e.fontPx : Math.min(maxW / sw, 1.6);
      if (sw * k > maxW) k = maxW / sw;
      return { kind: 'patch', e, k, w: sw * k, h: sh * k, px: (e.fontPx || 0) * k };
    }
    const text = variant === 'short' && spec.shortForm ? spec.shortForm : spec.content;
    if (variant === 'short' && !spec.shortForm) return null;
    if (pxSize < floor - 0.5) return null;
    const lines = setLines(measure, spec, pxSize, text, maxW, maxLines);
    if (lines.length > maxLines) return null;
    const w = Math.max(...lines.map((l) => measure(spec, pxSize, l)));
    if (w > maxW + 0.5) return null;
    return { kind: 'text', e, spec, px: pxSize, lines, w, h: pxSize * spec.lineHeight * lines.length, used: variant };
  };

  const setLogo = (logoH: number, maxW: number): PatchBlock | null => {
    if (!logo) return null;
    const { sw, sh } = src(logo);
    let k = logoH / sh;
    if (sw * k > maxW) k = maxW / sw;
    return { kind: 'patch', e: logo, k, w: sw * k, h: sh * k, px: 0 };
  };

  const setCta = (ctaPx: number, maxW: number): Block | null => {
    if (!cta) return null;
    const spec = cta.text;
    if (!spec) return setText(cta, ctaPx, maxW, 1, 'full', ctaFloor);
    const pill = !!spec.bgColor;
    const padX = pill ? ctaPx * sys.pill.padEm : 0;
    const h = pill ? ctaPx * sys.pill.ratio : ctaPx * spec.lineHeight;
    const tryText = (t: string, used: Variant): PillBlock | null => {
      const textW = measure(spec, ctaPx, t);
      if (textW + 2 * padX > maxW + 0.5) return null;
      return { kind: 'pill', e: cta, spec, px: ctaPx, text: t, textW, w: textW + 2 * padX, h, pill, used };
    };
    return tryText(spec.content, 'full') ?? (spec.shortForm ? tryText(spec.shortForm, 'short') : null);
  };

  /** Legal at the system size, else at its floor; null when it cannot fit at the floor → compliance block. */
  const setLegal = (legalPx: number, maxW: number, maxLines: number): Block | null => {
    if (!legal) return null;
    const spec = legal.text;
    if (!spec) {
      const kMin = legal.fontPx > 0 ? lMin / legal.fontPx : Infinity;
      const { sw, sh } = src(legal);
      if (!Number.isFinite(kMin) || sw * kMin > maxW + 0.5) return null;
      return { kind: 'patch', e: legal, k: kMin, w: sw * kMin, h: sh * kMin, px: legal.fontPx * kMin };
    }
    for (let p = legalPx; p >= lMin; p--) {
      const b = setText(legal, p, maxW, maxLines, 'full', lMin);
      if (b) return b;
    }
    return null;
  };

  // ---------- placing blocks (emit ops + keep rects) ----------
  const place = (b: Block, area: Area, y: number, align: Align, keep = true) => {
    const x = alignX(area, b.w, align);
    if (b.kind === 'patch') {
      const { sx, sy, sw, sh } = src(b.e);
      ops.push({ kind: 'patch', sx, sy, sw, sh, dx: x, dy: y, dw: b.w, dh: b.h });
      if (keep) keepRects.push({ type: b.e.type, fontPx: b.px, min: b.e.minLegiblePx || 0, x, y, w: b.w, h: b.h });
    } else if (b.kind === 'text') {
      ops.push({ kind: 'text', spec: b.spec, lines: b.lines, x: area.x, y, px: b.px, align, w: area.w });
      if (keep) keepRects.push({ type: b.e.type, fontPx: b.px, min: b.e.minLegiblePx || 0, x, y, w: b.w, h: b.h });
    } else {
      if (b.pill) ops.push({ kind: 'pill', x, y, w: b.w, h: b.h, fill: b.spec.bgColor });
      const padX = (b.w - b.textW) / 2;
      const ty = b.pill ? y + (b.h - b.px * b.spec.lineHeight) / 2 : y;
      ops.push({ kind: 'text', spec: b.spec, lines: [b.text], x: x + padX, y: ty, px: b.px, align: 'center', w: b.textW });
      if (keep) keepRects.push({ type: 'cta', fontPx: b.px, min: b.e.minLegiblePx || 0, x, y, w: b.w, h: b.h });
    }
    return { x, y, w: b.w, h: b.h };
  };
  const describe = (label: string, b: Block) => {
    if (b.kind === 'patch') {
      if (b.e.type === 'logo') changes.push(`logo ${Math.round(b.h)}px tall`);
      else changes.push(`${label} scaled as a patch (no text available)`);
      if (b.e.minLegiblePx && b.px < b.e.minLegiblePx - 0.5) overflows.push(`${label} patch renders at ${Math.round(b.px)}px, below its ${b.e.minLegiblePx}px floor`);
    } else if (b.kind === 'text') {
      changes.push(`${label} ${b.used === 'short' ? 'short-form ' : ''}re-set in ${plural(b.lines.length, 'line')} at ${b.px}px`);
    } else {
      changes.push(`CTA ${b.used === 'short' ? 'short-form ' : ''}re-set at ${b.px}px${b.pill ? ' in a pill' : ''}`);
    }
  };
  /**
   * Ranking of a candidate layout: the headline size, discounted when the copy is cut (short-form ×0.7, body
   * dropped ×0.6) or the headline needs more lines than the master gave it (×0.88 per extra line). The full
   * message at a slightly smaller size beats a bigger headline that says less.
   */
  const masterLines = headline?.text ? headline.text.content.split('\n').filter((l) => l.trim()).length : 1;
  // narrow canvases fill naturally with more lines; anywhere the measure is generous, the master's own breaks win
  const linePenalty = W < 400 && tall ? 0.97 : 0.88;
  const shortPenalty = isStrip ? 0.85 : 0.7; // a strip is a short-copy format by nature
  const scoreOf = (h: number, hl: Block | null, variant: Variant, withBody: boolean) => {
    const lines = hl?.kind === 'text' ? hl.lines.length : 1;
    const extra = Math.max(0, lines - (variant === 'full' ? masterLines : 1));
    return h * (withBody || !body ? 1 : 0.6) * (variant === 'full' ? 1 : shortPenalty) * Math.pow(linePenalty, extra);
  };
  const dropIf = (e: TaggedElement | undefined, why: string) => { if (e) { dropped.push(e.type); changes.push(`${e.type} dropped (${why})`); } };
  const logoAlign = (stacked: boolean): Align => (stacked && al === 'center' ? 'center' : sys.logoCorner.endsWith('r') ? 'right' : 'left');

  // =====================================================================================================
  if (isStrip) return planStrip();
  return planStack();

  // ---------- Horizontal strip: one row — logo | headline | CTA — on a shared centre line, legal below ----------
  function planStrip(): RecomposePlan | BlockedPlan {
    const legalB = setLegal(lMin, contentW, legalMaxLines);
    if (!legalB) return BLOCK;
    const rowGap = clamp(Math.round(H * 0.05), 3, 10), hGap = clamp(Math.round(W * 0.025), 10, 32);
    const rowH = availH - legalB.h - rowGap;
    if (rowH < LOGO_MIN_HEIGHT_PX) return BLOCK;
    const twoLines = rowH >= 2 * hlFloor * 1.15;
    const hMax = Math.min(hCap, Math.floor(rowH / (twoLines ? 2.3 : (headline?.text?.lineHeight ?? 1.15))));

    let pick: { t: TypeScale; hl: Block; lg: PatchBlock | null; ct: Block | null; used: Variant; score: number } | null = null;
    for (const variant of ['full', 'short'] as const) {
      for (let h = hMax; h >= hlFloor; h--) {
        if (pick && h <= pick.score) break;
        const t = typeAt(h);
        const lg = setLogo(Math.min(t.logoH, rowH), contentW * 0.3);
        const ct = cta ? setCta(Math.min(t.ctaPx, Math.floor(rowH / sys.pill.ratio)), contentW * 0.3) : null;
        if (cta && !ct) continue;
        if (ct && ct.h > rowH + 0.5) continue;
        const hlW = contentW - (lg ? lg.w + hGap : 0) - (ct ? ct.w + hGap : 0);
        const hl = headline ? setText(headline, h, hlW, twoLines ? 2 : 1, variant, hlFloor) : null;
        if (headline && !hl) continue;
        if (hl && hl.h > rowH + 0.5) continue;
        const score = scoreOf(h, hl, variant, false) / (body ? 0.6 : 1);
        if (!pick || score > pick.score) pick = { t, hl: hl as Block, lg, ct, used: variant, score };
      }
    }
    if (!pick) {
      // Nothing fits: set everything at the floor so the gates report exactly what overflows.
      const t = typeAt(hlFloor);
      const lg = setLogo(Math.max(LOGO_MIN_HEIGHT_PX, Math.min(t.logoH, rowH)), contentW * 0.3);
      const ct = setCta(t.ctaPx, contentW * 0.4);
      const hlW = Math.max(40, contentW - (lg ? lg.w + hGap : 0) - (ct ? ct.w + hGap : 0));
      const hl = headline ? setText(headline, hlFloor, hlW, 2, headline.text?.shortForm ? 'short' : 'full', 0) ?? setText(headline, hlFloor, contentW, 4, 'full', 0) : null;
      pick = { t, hl: hl as Block, lg, ct, used: 'short', score: 0 };
      if (hl) overflows.push(`headline does not fit the strip at its ${hlFloor}px floor`);
    }
    const { hl, lg, ct } = pick;
    const cy = padT + rowH / 2;
    let x = px;
    if (lg) { place(lg, { x, y: 0, w: lg.w, h: rowH }, cy - lg.h / 2, 'left'); describe('logo', lg); x += lg.w + hGap; }
    if (ct) place(ct, { x: W - px - ct.w, y: 0, w: ct.w, h: rowH }, cy - ct.h / 2, 'left');
    if (hl) { place(hl, { x, y: 0, w: W - px - (ct ? ct.w + hGap : 0) - x, h: rowH }, cy - hl.h / 2, 'left'); describe('headline', hl); }
    if (ct) describe('CTA', ct);
    place(legalB, { x: px, y: 0, w: contentW, h: legalB.h }, H - padB - legalB.h, 'left');
    describe('legal', legalB);
    dropIf(body, 'no room in a strip');
    dropIf(visual, 'no room in a strip');
    return finish('Rebuilt on the layout system as a single row');
  }

  // ---------- Everything else: the master's stack, sized to fill the canvas ----------
  interface Stack { t: TypeScale; blocks: (Block | null)[]; gaps: number[]; slack: number; score: number; withBody: boolean; variant: Variant }

  function planStack(): RecomposePlan | BlockedPlan {
    const landscape = W / H >= 1.3;
    const hGap = clamp(Math.round(W * 0.03), 12, 48);
    const sideVisual = !!visual && landscape && W >= 400;
    const visualW = sideVisual ? Math.round(contentW * 0.4) : 0;
    const textW = sideVisual ? contentW - visualW - hGap : Math.round(contentW * (landscape ? clamp(sys.textFrac, 0.5, 1) : 1));
    const textX = sideVisual && sys.visualPos === 'left' ? px + visualW + hGap : px;
    const textArea: Area = { x: textX, y: padT, w: textW, h: availH };

    // legal first: at the floor it decides whether this size can exist at all
    if (legal && !setLegal(lMin, textW, legalMaxLines)) return BLOCK;
    const logoAtTop = sys.logoCorner.startsWith('t');
    const logoMaxW = narrow ? textW : textW * 0.6;

    const build = (h: number, variant: Variant, withBody: boolean): Stack | null => {
      const t = typeAt(h);
      const lg = setLogo(t.logoH, logoMaxW);
      if (logo && lg && lg.h < LOGO_MIN_HEIGHT_PX - 0.5) return null;
      const hl = headline ? setText(headline, h, textW, hlMaxLines, variant, hlFloor) : null;
      if (headline && !hl) return null;
      const bd = withBody && body ? setText(body, t.bodyPx, textW, bodyMaxLines, 'full', bodyFloor) : null;
      if (withBody && body && !bd) return null;
      const ct = setCta(t.ctaPx, textW);
      if (cta && !ct) return null;
      const lgl = setLegal(t.legalPx, textW, legalMaxLines);
      if (legal && !lgl) return null;
      // stack order: [logo] headline body cta [logo at bottom] legal
      const blocks = logoAtTop ? [lg, hl, bd, ct, null, lgl] : [null, hl, bd, ct, lg, lgl];
      const gapEms = [sys.gaps.logo, sys.gaps.headline, sys.gaps.body, sys.gaps.cta, sys.gaps.logo];
      const present = blocks.map((b) => !!b);
      const pref: number[] = [];
      for (let i = 0; i < 5; i++) {
        // the gap after block i, only when it exists and something follows it
        const follows = present.slice(i + 1).some(Boolean);
        pref.push(present[i] && follows ? gapEms[i] * h : 0);
      }
      const heights = blocks.reduce((a, b) => a + (b ? b.h : 0), 0);
      const minGap = Math.max(6, Math.round(h * 0.35));
      const prefSum = pref.reduce((a, g) => a + g, 0);
      let gaps: number[], slack = availH - heights - prefSum;
      if (slack >= 0) gaps = pref;
      else {
        const f = (availH - heights) / Math.max(1, prefSum);
        gaps = pref.map((g) => (g > 0 ? Math.max(minGap, g * f) : 0));
        if (heights + gaps.reduce((a, g) => a + g, 0) > availH + 0.5) return null;
        slack = 0;
      }
      return { t, blocks, gaps, slack, score: scoreOf(h, hl, variant, withBody), withBody, variant };
    };

    // Every headline size is scored, not just the largest that fits: a smaller size that keeps the master's line
    // breaks can beat a bigger one that needs an extra line. Sizes that cannot beat the best score are skipped.
    let best: Stack | null = null;
    const variants: [Variant, boolean][] = body ? [['full', true], ['short', true], ['full', false], ['short', false]] : [['full', false], ['short', false]];
    for (const [variant, withBody] of variants) {
      for (let h = hCap; h >= hlFloor; h--) {
        if (best && h <= best.score) break;
        const s = build(h, variant, withBody);
        if (s && (!best || s.score > best.score)) best = s;
      }
    }
    if (!best) {
      // Nothing fits above the floors: set everything at the floor with minimum gaps and let the gates report it.
      const t = typeAt(hlFloor);
      const lg = setLogo(t.logoH, logoMaxW);
      const hl = headline ? setText(headline, hlFloor, textW, 6, headline.text?.shortForm ? 'short' : 'full', 0) : null;
      const ct = setCta(t.ctaPx, textW) ?? (cta ? setText(cta, ctaFloor, textW, 1, 'full', 0) : null);
      const lgl = setLegal(lMin, textW, 6);
      const blocks = logoAtTop ? [lg, hl, null, ct, null, lgl] : [null, hl, null, ct, lg, lgl];
      const minGap = Math.max(6, Math.round(hlFloor * 0.35));
      best = { t, blocks, gaps: [minGap, minGap, 0, minGap, minGap], slack: 0, score: 0, withBody: false, variant: 'short' };
      overflows.push(`the stack does not fit ${W}×${H} even at the type floors`);
    }

    // ---------- distribute the slack the way the master does, then place top-down ----------
    const { t, blocks, gaps, slack } = best;
    const [lgTop, hl, bd, ct, lgBot, lgl] = blocks;
    // the message block floats in the free space at the master's position; the gap under the logo never
    // grows past 2.5 em so a tall canvas reads as one composition, not a header and a footer
    const p = clamp(sys.blockPos, 0, 1);
    let above = slack * p, below = slack - above;
    if (lgTop) { const cap = Math.max(0, t.h * 2.5 - gaps[0]); if (above > cap) { below += above - cap; above = cap; } }
    if (visual && !sideVisual && below >= Math.max(60, availH * 0.2)) {
      // a stacked visual takes the space under the message block instead of leaving it empty
      above = Math.min(above, slack * 0.15); below = slack - above;
    }

    let y = padT;
    if (lgTop) { place(lgTop, textArea, y, logoAlign(true)); describe('logo', lgTop); y += lgTop.h + gaps[0]; }
    y += above;
    if (hl) { place(hl, textArea, y, al); describe('headline', hl); y += hl.h + gaps[1]; }
    if (bd) { place(bd, textArea, y, al); describe('body', bd); y += bd.h + gaps[2]; }
    else if (body) dropIf(body, best.withBody ? 'no room' : 'no room at a legible size');
    if (ct) { place(ct, textArea, y, al); describe('CTA', ct); y += ct.h + gaps[3]; }
    const tailTop = y; // free space starts here
    let legalY = H - padB - (lgl ? lgl.h : 0);
    if (lgl) { place(lgl, textArea, legalY, al); describe('legal', lgl); }
    if (lgBot) {
      const ly = (lgl ? legalY - gaps[4] : H - padB) - lgBot.h;
      place(lgBot, textArea, ly, logoAlign(false)); describe('logo', lgBot);
      legalY = ly;
    }

    if (visual) {
      if (sideVisual) {
        const vx = sys.visualPos === 'left' ? px : px + textW + hGap;
        placeVisual({ x: vx, y: padT, w: visualW, h: availH });
      } else {
        const room = legalY - (lgl ? gaps[3] : 0) - tailTop;
        if (room >= Math.max(60, availH * 0.2)) placeVisual({ x: textX, y: tailTop, w: textW, h: room });
        else dropIf(visual, 'no room');
      }
    }
    return finish('Rebuilt on the layout system');
  }

  function placeVisual(a: Area) {
    if (!visual) return;
    const { sw, sh } = src(visual);
    const k = Math.min(a.w / sw, a.h / sh, 1.6);
    const w = sw * k, h = sh * k;
    place({ kind: 'patch', e: visual, k, w, h, px: 0 }, a, a.y + (a.h - h) / 2, 'center', false);
    changes.push(`${visual.type} kept beside the text`);
  }

  function finish(template: string): RecomposePlan {
    return { kind: 'RECOMPOSE', ops, keepRects, masks: [], dropped, changes, overflows, summary: `${template}: ${changes.join(', ')}.` };
  }
}

