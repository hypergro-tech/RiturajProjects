import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { WORKING_EDGE } from './constants';
import type { FontInfo } from './text';
import type { PixelSampler, TextRun } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** pdf.js needs the 14 standard fonts for PDFs that reference them without embedding; copied to public/ at build. */
const STANDARD_FONT_DATA_URL = '/pdf-standard-fonts/';

export const PARSE_ERROR = 'Could not parse this file. If it is .ai, re-save it with "Create PDF Compatible File" checked, then upload again.';
export const MAX_ARTBOARDS = 24;

export interface OpenedKeyVisual { doc: pdfjsLib.PDFDocumentProxy; numPages: number }
export interface Artboard { index: number; url: string; w: number; h: number; dimsLabel: string }
export interface RenderedArtboard { canvas: HTMLCanvasElement; dimsLabel: string; runs: TextRun[]; fonts: Map<string, FontInfo> }

/** Stage 0 — open a PDF-compatible .ai / .pdf. Keep the document alive: pdf.js registers its embedded fonts for re-setting text. */
export async function openKeyVisual(file: File): Promise<OpenedKeyVisual> {
  const data = await file.arrayBuffer();
  try {
    const doc = await pdfjsLib.getDocument({ data, standardFontDataUrl: STANDARD_FONT_DATA_URL }).promise;
    return { doc, numPages: doc.numPages };
  } catch {
    throw new Error(PARSE_ERROR);
  }
}

/** Small previews of every artboard so the user can pick one. */
export async function artboardThumbs(doc: pdfjsLib.PDFDocumentProxy, maxEdge = 220): Promise<Artboard[]> {
  const out: Artboard[] = [];
  const n = Math.min(doc.numPages, MAX_ARTBOARDS);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: maxEdge / Math.max(vp1.width, vp1.height) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ index: i, url: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height, dimsLabel: `${Math.round(vp1.width)}×${Math.round(vp1.height)} pt` });
  }
  return out;
}

/** Rasterize one artboard to the working preview and pull its text runs (viewport px) and fonts. */
export async function renderArtboard(doc: pdfjsLib.PDFDocumentProxy, pageIndex: number, maxEdge = WORKING_EDGE): Promise<RenderedArtboard> {
  const page = await doc.getPage(pageIndex);
  const vp1 = page.getViewport({ scale: 1 });
  const dimsLabel = `${Math.round(vp1.width)}×${Math.round(vp1.height)} pt`;
  const scale = Math.min(maxEdge / Math.max(vp1.width, vp1.height), 4);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  const runs: TextRun[] = [];
  const fonts = new Map<string, FontInfo>();
  try {
    const tc = await page.getTextContent();
    for (const item of tc.items) {
      if (!('str' in item) || !item.str) continue;
      const t = pdfjsLib.Util.transform(vp.transform, item.transform) as number[];
      const fontPx = Math.hypot(t[2], t[3]);
      if (!(fontPx > 0)) continue;
      const style = tc.styles[item.fontName];
      const ascent = style?.ascent || 0.8, descent = style?.descent || -0.2;
      runs.push({
        str: item.str,
        x: t[4], y: t[5] - ascent * fontPx,
        w: item.width * scale, h: (ascent - descent) * fontPx,
        fontPx, fontName: item.fontName, hasEOL: item.hasEOL,
      });
      if (!fonts.has(item.fontName)) {
        let info: FontInfo = { name: item.fontName, loadedName: item.fontName };
        try {
          const f = page.commonObjs.get(item.fontName) as { name?: string; loadedName?: string } | null;
          if (f) info = { name: f.name || item.fontName, loadedName: f.loadedName || item.fontName };
        } catch { /* font object not resolved: keep the pdf.js id */ }
        fonts.set(item.fontName, info);
      }
    }
  } catch { /* outlined artwork: no text layer, the vision transcription is used instead */ }
  return { canvas, dimsLabel, runs, fonts };
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
