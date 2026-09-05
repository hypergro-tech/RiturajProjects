import { VISION_RULES, VISION_SYSTEM, visionPrompt } from '../../server/visionPrompt';
import { ARTIFACT_MODE, viewerRuntime } from './env';
import type { Classified } from './layout';
import type { RawObjectModel } from './types';

export const VISION_EDGE = 1024;

/** Downscale the working preview to the ≤1024px frame the vision pass sees. */
function previewFrame(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const vs = Math.min(VISION_EDGE / Math.max(canvas.width, canvas.height), 1);
  const vc = document.createElement('canvas');
  vc.width = Math.round(canvas.width * vs); vc.height = Math.round(canvas.height * vs);
  vc.getContext('2d')?.drawImage(canvas, 0, 0, vc.width, vc.height);
  return vc;
}

/** Stage 1 — one preview frame to the vision pass: the server in the app build, the viewer's Claude in the artifact build. */
export async function visionPass(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<RawObjectModel> {
  const vc = previewFrame(canvas);
  if (ARTIFACT_MODE) return visionViaViewer(vc, canvas.width, canvas.height, signal);
  const image = vc.toDataURL('image/jpeg', 0.85).split(',')[1];
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image, mediaType: 'image/jpeg', width: canvas.width, height: canvas.height }),
    signal,
  });
  const body = (await res.json().catch(() => null)) as { model?: RawObjectModel; error?: string } | null;
  if (!res.ok) throw new Error(body?.error || `vision service returned HTTP ${res.status}`);
  if (!body?.model) throw new Error('vision service returned no object model');
  return body.model;
}

// ---------- claude.ai artifact runtime: `sample` capability ----------

interface SampleFn {
  json<T>(input: string, opts?: { images?: Blob; modelTier?: 'default' | 'complex' | 'quick'; signal?: AbortSignal }): Promise<T>;
  limits(): Promise<{ images?: { maxCount: number } }>;
}

/** Viewer-facing copy for the runtime's error codes; anything else is shown with its code. */
const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: 'you did not allow this page to use Claude',
  sampling_disabled: 'Claude is not available on this account',
  rate_limited: 'Claude usage limit reached; try again in a minute',
  images_unavailable: 'this viewer cannot send images to Claude',
  image_rejected: 'the preview frame was rejected by the viewer',
  refused: 'Claude declined to analyze this image',
  invalid_json: 'Claude did not return a usable object model; try again',
  empty_completion: 'Claude returned nothing; try again',
  session_expired: 'your Claude session expired; sign in again',
  cancelled: 'analysis was cancelled',
  upstream_error: 'Claude was briefly unavailable; try again',
};

export const VIEWER_ONLY_MESSAGE = 'analysis runs on Claude inside the claude.ai viewer; open this page there';

/** True when this view can ask Claude in text (with or without images). */
export async function textSamplingAvailable(): Promise<boolean> {
  const rt = viewerRuntime();
  if (!rt) return false;
  return !!(await rt.use('sample'));
}

/**
 * Text-only classification for views that cannot send images: Claude reads a description of the text
 * blocks and artwork (ids, positions, sizes, text) and returns the object model using those ids, so the
 * measured boxes are kept and only the semantics come from the model.
 */
export async function classifyViaText(description: string, ids: { text: string[]; art: string[] }, signal?: AbortSignal): Promise<Classified> {
  const rt = viewerRuntime();
  if (!rt) throw new Error(VIEWER_ONLY_MESSAGE);
  const sample = (await rt.use('sample')) as SampleFn | null;
  if (!sample) throw new Error('Claude is not available in this view');
  const prompt = [
    VISION_SYSTEM,
    'You cannot see the image. Below is a measured description of one advertisement key visual: its text blocks (T0, T1, …) with exact text, and its non-text artwork (A0, A1, …).',
    'Classify every id. Types: logo, headline, subhead, body, cta, product, person, legal, decorative. Rules:',
    ...VISION_RULES.slice(1),
    'Reply with only one JSON object, no prose, shaped exactly like this (one key per id, keep every id):',
    '{"T0":{"type":"headline","desc":"short description","mustKeep":true,"droppable":false,"minLegiblePx":24,"shortForm":"2-4 word variant or empty"},"A0":{"type":"logo","desc":"...","mustKeep":true,"droppable":false},"regulated":true,"notes":"single most important thing to protect"}',
    '',
    description,
    `Ids to classify: ${[...ids.text, ...ids.art].join(', ')}.`,
  ].join('\n');
  try {
    const raw = await sample.json<Classified>(prompt, { modelTier: 'default', signal });
    if (!raw || typeof raw !== 'object') throw new Error('Claude returned no classification');
    return raw;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err && typeof err === 'object' && typeof err.code === 'string') {
      throw new Error(SAMPLE_ERRORS[err.code] ?? `Claude error ${err.code}: ${err.message ?? ''}`);
    }
    throw e;
  }
}

export const IMAGES_UNAVAILABLE_MESSAGE = 'this viewer cannot send images to Claude';

async function visionViaViewer(vc: HTMLCanvasElement, width: number, height: number, signal?: AbortSignal): Promise<RawObjectModel> {
  const rt = viewerRuntime();
  if (!rt) throw new Error(VIEWER_ONLY_MESSAGE);
  const sample = (await rt.use('sample')) as SampleFn | null;
  if (!sample) throw new Error('Claude is not available in this view');
  const limits = await sample.limits().catch(() => null);
  if (!limits?.images) throw new Error(IMAGES_UNAVAILABLE_MESSAGE);
  const blob = await new Promise<Blob>((resolve, reject) =>
    vc.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode the preview frame'))), 'image/jpeg', 0.85),
  );
  try {
    const raw = await sample.json<RawObjectModel>(visionPrompt(width, height, { jsonOnly: true }), { images: blob, modelTier: 'default', signal });
    if (!raw || typeof raw !== 'object') throw new Error('Claude returned no object model');
    return raw;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err && typeof err === 'object' && typeof err.code === 'string') {
      throw new Error(SAMPLE_ERRORS[err.code] ?? `Claude error ${err.code}: ${err.message ?? ''}`);
    }
    throw e;
  }
}
