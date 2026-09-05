import { LOGO_MIN_HEIGHT_PX } from './constants';
import { formatBytes, legalMin, weightLimit } from './safeZones';
import type { AdaptPlan, BlockedPlan, Gate, Margins, ObjectModel } from './types';

export { LOGO_MIN_HEIGHT_PX };

export const mkGate = (label: string, pass: boolean): Gate => ({ label, pass });

export function weightGate(bytes: number, social: boolean): Gate {
  return mkGate(`${formatBytes(bytes)} ≤ ${social ? '5MB' : '150KB'}`, bytes <= weightLimit(social));
}

/**
 * Stage 6 — automated QA gates. Any failure withholds export.
 * Gate 6 (weight) is a placeholder until the file is encoded — replace it with weightGate().
 */
export function runGates(plan: AdaptPlan | BlockedPlan, model: ObjectModel, W: number, H: number, m: Margins, social: boolean): Gate[] {
  if (plan.kind === 'BLOCKED') {
    return [
      mkGate('Safe zone', true), mkGate('Min font', false), mkGate('Contrast', true),
      mkGate('Logo', true), mkGate('Legal legible', false), mkGate('Weight', true),
    ];
  }
  const eps = 2;
  const kr = plan.keepRects;
  // SCALE is a uniform resize of the master as-is: the safe-zone table governs crops, expands
  // and rebuilds, while a pure scale inherits the master's own composition.
  const inSafe = plan.kind === 'SCALE'
    ? true
    : kr.every((r) => r.x >= W * m.l - eps && r.y >= H * m.t - eps && r.x + r.w <= W * (1 - m.r) + eps && r.y + r.h <= H * (1 - m.b) + eps);
  const minOk = kr.filter((r) => r.fontPx && r.min).every((r) => r.fontPx >= r.min - 0.5);
  const legalR = kr.find((r) => r.type === 'legal');
  const legalOk = !legalR || legalR.fontPx >= legalMin(W, social) - 0.5;
  const logoR = kr.find((r) => r.type === 'logo');
  const logoOk = !!logoR
    && logoR.x >= -eps && logoR.x + logoR.w <= W + eps && logoR.y >= -eps && logoR.y + logoR.h <= H + eps
    && logoR.h >= LOGO_MIN_HEIGHT_PX - 0.5;
  const texts = model.elements.filter((e) => e.mustKeep && e.contrast > 0);
  const contrastOk = texts.every((e) => e.contrast >= 4.5);
  const cLabel = texts.length ? `Contrast ${Math.min(...texts.map((e) => e.contrast)).toFixed(1)}:1` : 'Contrast n/a';
  return [
    mkGate('Safe zone', inSafe), mkGate('Min font', minOk), mkGate(cLabel, contrastOk),
    mkGate('Logo', logoOk), mkGate('Legal legible', legalOk), mkGate('Weight', true),
  ];
}
