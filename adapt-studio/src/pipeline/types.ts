/** Shared pipeline types. The pipeline is pure functions over (master, model, target). */

export type ElementType = 'logo' | 'headline' | 'subhead' | 'body' | 'cta' | 'product' | 'person' | 'legal' | 'decorative';
export type Direction = 'left' | 'right' | 'top' | 'bottom';
export type Complexity = 'simple' | 'moderate' | 'complex';
export type Strategy = 'SCALE' | 'SMART_CROP' | 'EXPAND' | 'RECOMPOSE';

/** Box as fractions of the canvas (0..1). */
export interface Box { x: number; y: number; w: number; h: number }

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
export interface DrawOp { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

export interface RouteResult { strategy: Strategy; delta: number; skinny: boolean }

interface PlanBase { keepRects: KeepRect[]; masks: Mask[]; summary: string }
export interface ScalePlan extends PlanBase { kind: 'SCALE'; s: number; ox: number; oy: number }
export interface CropPlan extends PlanBase { kind: 'SMART_CROP'; wx: number; wy: number; winW: number; winH: number; sc: number }
export interface ExpandPlan extends PlanBase { kind: 'EXPAND'; s: number; mx: number; my: number; mw: number; mh: number }
export interface RecomposePlan extends PlanBase { kind: 'RECOMPOSE'; ops: DrawOp[]; dropped: ElementType[] }
export interface BlockedPlan { kind: 'BLOCKED'; blockMsg: string }
export type AdaptPlan = ScalePlan | CropPlan | ExpandPlan | RecomposePlan;

export interface PlanResult { plan: AdaptPlan | BlockedPlan; escalations: string[]; routed: RouteResult; margins: Margins }

export interface Gate { label: string; pass: boolean }

/** Reads an RGBA block from the master raster. Abstracted so the pipeline stays testable without a DOM canvas. */
export type PixelSampler = (x: number, y: number, w: number, h: number) => Uint8ClampedArray;

export type StatusKind = 'clean' | 'review' | 'blocked-compliance' | 'blocked-qa';

export interface AdaptResult {
  W: number; H: number; name: string; dims: string; social: boolean;
  url: string; fmt: 'PNG' | 'JPG'; kb: number;
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
