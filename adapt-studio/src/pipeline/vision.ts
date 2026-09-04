import type { RawObjectModel } from './types';

export const VISION_EDGE = 1024;

/** Stage 1 — send one ≤1024px preview frame to the server-side vision pass. */
export async function visionPass(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<RawObjectModel> {
  const vs = Math.min(VISION_EDGE / Math.max(canvas.width, canvas.height), 1);
  const vc = document.createElement('canvas');
  vc.width = Math.round(canvas.width * vs); vc.height = Math.round(canvas.height * vs);
  vc.getContext('2d')?.drawImage(canvas, 0, 0, vc.width, vc.height);
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
