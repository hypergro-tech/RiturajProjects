/** Shared pipeline types. The pipeline is pure functions over (master, model, target). */

export type ElementType = 'logo' | 'headline' | 'subhead' | 'body' | 'cta' | 'product' | 'person' | 'legal' | 'decorative';
export type Direction = 'left' | 'right' | 'top' | 'bottom';
export type Complexity = 'simple' | 'moderate' | 'complex';
export type Strategy = 'SCALE' | 'SMART_CROP' | 'EXPAND' | 'RECOMPOSE';

/** Box as fractions of the canvas (0..1). */
export interface Box { x: number; y: number; w: number; h: number }

/** Everything needed to re-set a text element at any size instead of scaling its pixels. */
export interface TextSpec {
  /** Full text; explicit line breaks are honoured. */
  content: string;
  /** ≤ 4-word variant for headline / CTA under space pressure ('' when none). */
  shortForm: string;
  /** CSS font-family to draw with (an embedded pdf.js face, a web font, or a brand fallback). */
  family: string;
  weight: number;
  italic: boolean;
  /** Text colour, sampled from the master raster (#rrggbb). */
  color: string;
  /** Fill behind the text when it sits on its own shape (a CTA pill); '' when it sits on the page. */
  bgColor: string;
  lineHeight: number;
  /** Tracking in em (0 = normal), read from the master's glyph spacing. */
  letterSpacing: number;
  /** How the master sets this block. */
  align: 'left' | 'center' | 'right';
  /** Where the text content came from. */
  source: 'pdf' | 'vision' | 'demo';
  /** Where the font came from: the PDF's embedded face, a loaded web font, or the brand fallback. */
  fontSource: 'embedded' | 'web' | 'fallback';
  /** Human label for the change summary, e.g. "Lato Bold (embedded)". */
  fontLabel: string;
}

export interface TaggedElement {
  type: ElementType;
  desc: string;
  box: Box;
  priority: number;
  mustKeep: boolean;
  droppable: boolean;
  /** Minimum legible font size at output resolution (0 for non-text). */
  minLegiblePx: number;
  /** Estimated font size in master-raster pixels (0 for non-text). */
  fontPx: number;
  /** Measured contrast ratio on the master raster (0 = not measured / non-text). */
  contrast: number;
  /** Verbatim text read by the vision model ('' for non-text or unreadable). */
  visionText: string;
  /** ≤ 4-word variant proposed by the vision model for headline / CTA. */
  visionShortForm: string;
  /** Present once text has been attached; recompose re-sets it instead of scaling pixels. */
  text?: TextSpec;
}

export interface Background {
  desc: string;
  extendable: boolean;
  extendDirections: Direction[];
  complexity: Complexity;
  /** Corner-sampled background colour of the master raster (#rrggbb). */
  color: string;
}

export interface ObjectModel {
  elements: TaggedElement[];
  background: Background;
  /** Always true for this client (BFSI vertical → Stage 5 compliance layer). */
  regulated: boolean;
  /** Whether the vision pass itself detected legal / disclaimer text. */
  detectedRegulated: boolean;
  notes: string;
}

/** Shape returned by the vision model before calibration. Everything is optional because it is untrusted. */
export interface RawObjectModel {
  elements?: RawElement[];
  background?: Partial<RawBackground>;
  regulated?: boolean;
  notes?: string;
}
export interface RawElement {
  type?: string; desc?: string; box?: Partial<Box>;
  mustKeep?: boolean; droppable?: boolean; minLegiblePx?: number; lines?: number;
  text?: string; shortForm?: string;
}
export interface RawBackground { desc: string; extendable: boolean; extendDirections: string[]; complexity: string; color: string }

/** Master raster geometry (working preview, ≤2000px long edge). */
export interface MasterInfo { rw: number; rh: number; ratio: number }
export interface MasterRaster extends MasterInfo { canvas: HTMLCanvasElement }

export interface TargetSize { name: string; w: number; h: number; social?: boolean }
/** Safe-zone margins as fractions of the target canvas. */
export interface Margins { t: number; b: number; l: number; r: number }

/** A protected element's placement in output pixels, checked by the QA gates. */
export interface KeepRect { type: ElementType; fontPx: number; min: number; x: number; y: number; w: number; h: number }
/** Region of generated / extended pixels in output px (review mask). */
export interface Mask { x: number; y: number; w: number; h: number }
/** drawImage(source rect in master px → dest rect in output px). */
export interface DrawOp { kind: 'patch'; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }
/** Re-set text: wrapped lines drawn top-down from (x, y) at `px` with the spec's font. */
export interface TextOp { kind: 'text'; spec: TextSpec; lines: string[]; x: number; y: number; px: number; align: 'left' | 'center' | 'right'; w: number }
/** Filled rounded rectangle (a CTA pill). */
export interface ShapeOp { kind: 'pill'; x: number; y: number; w: number; h: number; fill: string }
export type LayoutOp = DrawOp | TextOp | ShapeOp;

/** Text measurer injected into the planner: width in px of `text` set in `spec` at `px`. */
export type TextMeasurer = (spec: Pick<TextSpec, 'family' | 'weight' | 'italic'> & { letterSpacing?: number }, px: number, text: string) => number;

/**
 * The master's own layout system, read from its elements: rebuilt sizes follow it instead of sizing
 * each element in isolation. Ratios are relative to the headline size.
 */
export interface LayoutSystem {
  align: 'left' | 'center' | 'right';
  /** Font-size ratios vs the headline (headline = 1); `logo` is the logo's height in headline ems. */
  scale: { subhead: number; body: number; cta: number; legal: number; logo: number };
  /** Vertical rhythm between the headline and the block below it, in em of the headline size. */
  gapEm: number;
  /** Gap after each block in the master's stack, in headline ems (logo → headline, headline → next, body → next, CTA → next). */
  gaps: { logo: number; headline: number; body: number; cta: number };
  /** Where the logo sits in the master. */
  logoCorner: 'tl' | 'tr' | 'bl' | 'br';
  /** Content inset from the master's edges as a fraction of its width / height. */
  inset: { x: number; y: number };
  /** Where the message block sits in the free space between logo and legal (0 = hugging the logo, 1 = hugging the legal). */
  blockPos: number;
  /** Width of the text column as a share of the content width (headline / body measure). */
  textFrac: number;
  /** CTA pill geometry when the master's CTA is a filled button: height and horizontal padding in CTA ems. */
  pill: { ratio: number; padEm: number };
  /** Where the main visual sits relative to the text, when the master has one. */
  visualPos: 'left' | 'right' | 'above' | 'below' | 'none';
}

/** A text run extracted from the PDF (viewport px), before grouping into elements. */
export interface TextRun { str: string; x: number; y: number; w: number; h: number; fontPx: number; fontName: string; hasEOL: boolean }

export interface RouteResult {
  strategy: Strategy; delta: number; skinny: boolean;
  /** Set when the strategy was overridden by a layout decision rather than ratio math ('layout-system'). */
  reason?: 'layout-system';
}

interface PlanBase { keepRects: KeepRect[]; masks: Mask[]; summary: string }
export interface ScalePlan extends PlanBase { kind: 'SCALE'; s: number; ox: number; oy: number }
export interface CropPlan extends PlanBase { kind: 'SMART_CROP'; wx: number; wy: number; winW: number; winH: number; sc: number }
export interface ExpandPlan extends PlanBase { kind: 'EXPAND'; s: number; mx: number; my: number; mw: number; mh: number }
export interface RecomposePlan extends PlanBase {
  kind: 'RECOMPOSE';
  ops: LayoutOp[];
  dropped: ElementType[];
  /** What changed versus the master, for the result card ("headline re-set in 2 lines at 26px", …). */
  changes: string[];
  /** Fit problems the gates will surface (element placed at its floor but overflowing). */
  overflows: string[];
}
export interface BlockedPlan { kind: 'BLOCKED'; blockMsg: string }
export type AdaptPlan = ScalePlan | CropPlan | ExpandPlan | RecomposePlan;

export interface PlanResult { plan: AdaptPlan | BlockedPlan; escalations: string[]; routed: RouteResult; margins: Margins }

export interface PlanOptions { measure: TextMeasurer }

export interface Gate { label: string; pass: boolean }

/** Reads an RGBA block from the master raster. Abstracted so the pipeline stays testable without a DOM canvas. */
export type PixelSampler = (x: number, y: number, w: number, h: number) => Uint8ClampedArray;

export type StatusKind = 'clean' | 'review' | 'blocked-fit' | 'blocked-qa';

export interface AdaptResult {
  W: number; H: number; name: string; dims: string; social: boolean;
  url: string; fmt: 'PNG' | 'JPG'; kb: number;
  /** The encoded file, kept for "Download all" zipping (null when blocked). */
  blob: Blob | null;
  strategy: Strategy;
  blocked: boolean; blockMsg: string;
  status: StatusKind; statusLabel: string;
  escalations: string[];
  masks: Mask[];
  gates: Gate[];
  summary: string;
  canDownload: boolean;
  /** Safe-zone margins in output px for the overlay. */
  safe: { t: number; b: number; l: number; r: number };
}
