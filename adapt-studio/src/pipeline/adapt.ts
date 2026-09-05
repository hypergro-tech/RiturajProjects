import { ARTIFACT_MODE } from './env';
import { canvasMeasurer } from './fonts';
import { runGates, weightGate } from './gates';
import { planAdapt } from './plan';
import { renderPlan } from './render';
import { weightLimit } from './safeZones';
import type { AdaptResult, MasterRaster, ObjectModel, StatusKind, Strategy, TargetSize } from './types';

const PHASE: Record<Strategy, string> = {
  SCALE: 'Scaling', SMART_CROP: 'Computing crop window', EXPAND: 'Extending background', RECOMPOSE: 'Rebuilding from object model',
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality));

/**
 * Run the full pipeline for one target size on real pixels: plan → render → encode → QA gates → status.
 * `trackUrl` receives the object URL so the caller can revoke it later.
 */
export async function computeAdapt(
  master: MasterRaster, model: ObjectModel, target: TargetSize,
  onPhase?: (phase: string) => void, trackUrl?: (url: string) => void,
): Promise<AdaptResult> {
  const { w: W, h: H, name } = target;
  const social = !!target.social;
  const { plan, escalations, margins: m } = planAdapt(master, model, target, { measure: canvasMeasurer() });
  let gates = runGates(plan, model, W, H, m, social);
  let url = '', kb = 0, fmt: 'PNG' | 'JPG' = 'PNG';
  let blob: Blob | null = null;
  const blocked = plan.kind === 'BLOCKED';

  if (plan.kind !== 'BLOCKED') {
    onPhase?.(PHASE[plan.kind]);
    const canvas = renderPlan(master, plan, W, H, model.background.color);
    onPhase?.('QA gates');
    blob = await toBlob(canvas, 'image/png');
    if (blob.size > weightLimit(social)) {
      const jb = await toBlob(canvas, 'image/jpeg', 0.85);
      if (jb.size < blob.size) { blob = jb; fmt = 'JPG'; }
    }
    kb = Math.round(blob.size / 1024);
    gates = [...gates.slice(0, 5), weightGate(blob.size, social)];
    if (ARTIFACT_MODE) {
      // The artifact sandbox may not render blob: URLs; previews travel as data URLs, the blob stays for saving.
      url = canvas.toDataURL(fmt === 'JPG' ? 'image/jpeg' : 'image/png', 0.85);
    } else {
      url = URL.createObjectURL(blob);
      trackUrl?.(url);
    }
  } else {
    onPhase?.('QA gates');
  }

  // Stage 6 enforced literally: any failed automated gate withholds the download.
  const qaFail = !blocked && gates.some((g) => !g.pass);
  const strategy: Strategy = plan.kind === 'BLOCKED' ? 'RECOMPOSE' : plan.kind;
  let status: StatusKind, statusLabel: string;
  if (blocked) { status = 'blocked-fit'; statusLabel = 'Export blocked — cannot fit'; }
  else if (qaFail) { status = 'blocked-qa'; statusLabel = 'Export blocked — failed QA gates'; }
  else if (strategy === 'EXPAND') { status = 'review'; statusLabel = 'Review required — extended pixels'; }
  else if (strategy === 'RECOMPOSE') { status = 'review'; statusLabel = 'Rebuilt — review required'; }
  else { status = 'clean'; statusLabel = 'QA passed · compliance review (BFSI)'; }

  const overflowNote = plan.kind === 'RECOMPOSE' && plan.overflows.length ? ` ${plan.overflows.join('; ')}.` : '';
  const summary = blocked
    ? 'The logo, headline and CTA cannot all render legibly within this canvas. Not exported.'
    : qaFail ? `${plan.summary}${overflowNote} Export withheld until the failed gate is resolved.` : plan.summary;

  return {
    W, H, name, dims: `${W}×${H}`, social, url, fmt, kb, blob, strategy,
    blocked, blockMsg: plan.kind === 'BLOCKED' ? plan.blockMsg : '',
    status, statusLabel, escalations,
    masks: plan.kind === 'BLOCKED' ? [] : plan.masks,
    gates, summary, canDownload: !blocked && !qaFail,
    safe: { t: Math.round(H * m.t), b: Math.round(H * m.b), l: Math.round(W * m.l), r: Math.round(W * m.r) },
  };
}
