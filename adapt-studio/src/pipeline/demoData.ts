import { PRIORITY } from './constants';
import type { Box, ElementType, ObjectModel, TaggedElement } from './types';

/** Demo master definition (FedOne Personal Loan, 1080×1080). Drawn to canvas, then run through the real pipeline. */
export interface DemoElement {
  type: ElementType; desc: string;
  /** x, y, w, h as fractions of the 1080 artboard. */
  b: [number, number, number, number];
  img?: 'wmBlue' | 'waveOrange';
  fs?: number; fw?: number; it?: boolean; color?: string; text?: string;
}

export const DEMO_ELEMENTS: DemoElement[] = [
  { type: 'logo', desc: 'Federal Bank wordmark (reversed)', b: [0.10, 0.105, 0.28, 0.068], img: 'wmBlue' },
  { type: 'headline', desc: 'Campaign headline', b: [0.10, 0.29, 0.62, 0.12], fs: 56, fw: 800, it: true, color: '#fff', text: 'Dreams don’t wait.\nNeither should you.' },
  { type: 'body', desc: 'Offer subhead', b: [0.10, 0.45, 0.58, 0.062], fs: 30, fw: 500, color: 'rgba(255,255,255,0.92)', text: 'Personal Loan up to ₹25 lakh, approved in 10 minutes.' },
  { type: 'cta', desc: 'Primary action', b: [0.10, 0.555, 0.185, 0.062], fs: 27, text: 'Apply now' },
  { type: 'legal', desc: 'RBI lending disclaimer', b: [0.10, 0.85, 0.58, 0.042], fs: 30, color: 'rgba(255,255,255,0.85)', text: 'Credit at sole discretion of the Bank. T&C apply.' },
  { type: 'decorative', desc: 'Fortuna wave motif', b: [0.66, 0.34, 0.26, 0.225], img: 'waveOrange' },
];

const MIN: Partial<Record<ElementType, number>> = { headline: 24, body: 14, cta: 16, legal: 18 };

/**
 * Precomputed object model for the demo master, used when the vision pass is unavailable.
 * `measuredBoxes` (from drawDemoMaster) replaces the hand-set boxes with ones measured from the rendered text.
 */
export function demoModel(masterRh: number, bgColor: string, measuredBoxes?: Box[]): ObjectModel {
  const elements: TaggedElement[] = DEMO_ELEMENTS.map((d, i) => ({
    type: d.type,
    desc: d.desc,
    box: measuredBoxes?.[i] ?? { x: d.b[0], y: d.b[1], w: d.b[2], h: d.b[3] },
    priority: PRIORITY[d.type],
    mustKeep: ['logo', 'headline', 'cta', 'legal'].includes(d.type),
    droppable: ['decorative', 'body'].includes(d.type),
    minLegiblePx: MIN[d.type] ?? 0,
    fontPx: d.fs ? d.fs * (masterRh / 1080) : 0,
    contrast: 0,
  }));
  return {
    elements,
    background: { desc: 'Flat brand-blue field', extendable: true, extendDirections: ['left', 'right', 'top', 'bottom'], complexity: 'simple', color: bgColor },
    regulated: true,
    detectedRegulated: true,
    notes: 'Protect the legal line; CTA orange is exclusive.',
  };
}
