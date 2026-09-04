import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { WORKING_EDGE } from './constants';
import type { PixelSampler } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const PARSE_ERROR = 'Could not parse this file. If it is .ai, re-save it with "Create PDF Compatible File" checked, then upload again.';

/** Stage 0 — parse the first artboard of a PDF-compatible .ai / .pdf and rasterize a working preview. */
export async function rasterizeKeyVisual(file: File): Promise<{ canvas: HTMLCanvasElement; dimsLabel: string }> {
  const data = await file.arrayBuffer();
  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await pdfjsLib.getDocument({ data }).promise;
  } catch {
    throw new Error(PARSE_ERROR);
  }
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const dimsLabel = `${Math.round(vp1.width)}×${Math.round(vp1.height)} pt`;
    const scale = Math.min(WORKING_EDGE / Math.max(vp1.width, vp1.height), 4);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { canvas, dimsLabel };
  } finally {
    void doc.destroy();
  }
}

/** JPEG data URL of the master at ≤ `max` px long edge for on-screen preview. */
export function makePreviewUrl(canvas: HTMLCanvasElement, max = 860): string {
  const s = Math.min(max / canvas.width, max / canvas.height, 1);
  const disp = document.createElement('canvas');
  disp.width = Math.round(canvas.width * s); disp.height = Math.round(canvas.height * s);
  disp.getContext('2d')?.drawImage(canvas, 0, 0, disp.width, disp.height);
  return disp.toDataURL('image/jpeg', 0.88);
}

export function canvasSampler(canvas: HTMLCanvasElement): PixelSampler {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  return (x, y, w, h) => ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data;
}
