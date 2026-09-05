import { zipSync } from 'fflate';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeAdapt } from '../pipeline/adapt';
import { CUSTOM_SIZE_LIMITS, DEFAULT_MIN_PX, DEFAULT_SIZES, PRIORITY, WORKING_EDGE } from '../pipeline/constants';
import { drawDemoMaster, loadDemoImages, type DemoImages } from '../pipeline/demo';
import { applyDemoText, demoModel } from '../pipeline/demoData';
import { ARTIFACT_MODE, viewerRuntime } from '../pipeline/env';
import { ensureFonts, fontAvailable } from '../pipeline/fonts';
import { artboardThumbs, canvasSampler, makePreviewUrl, openKeyVisual, renderArtboard } from '../pipeline/ingest';
import { analyzeLayout, describeLayout, mergeClassification } from '../pipeline/layout';
import { deriveFontPx, isTextType, measureContrast, normalizeModel, sampleBgColor } from '../pipeline/model';
import { route } from '../pipeline/router';
import { attachTextSpecs, type FontInfo } from '../pipeline/text';
import { classifyViaText, textSamplingAvailable, visionPass } from '../pipeline/vision';
import type { AdaptResult, Box, ElementType, MasterRaster, ObjectModel, RawObjectModel, TaggedElement, TargetSize, TextRun } from '../pipeline/types';
import { INITIAL_STATE, type AnalysisSource, type GenRow, type StudioState } from './types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const FORCED_KEEP = new Set<ElementType>(['logo', 'headline', 'cta', 'legal']);

/** Re-derive the flags that depend on an element's type after a manual correction. */
export function retagElement(e: TaggedElement, type: ElementType): TaggedElement {
  const isText = isTextType(type);
  return {
    ...e,
    type,
    priority: PRIORITY[type],
    mustKeep: FORCED_KEEP.has(type),
    droppable: type === 'decorative' || type === 'body' || type === 'subhead',
    minLegiblePx: isText ? DEFAULT_MIN_PX[type] ?? 14 : 0,
    fontPx: isText ? e.fontPx || deriveFontPx(e.box.h * 1000, 1) : 0,
    text: isText ? e.text : undefined,
  };
}

export const DEMO_FILE_NAME = 'FedOne_PersonalLoan_KV_1080.ai (demo)';
const VIEWER_PROVIDER = 'Claude in this viewer';

interface RasterInput {
  canvas: HTMLCanvasElement;
  dimsLabel: string;
  runs?: TextRun[];
  fonts?: Map<string, FontInfo>;
  demoBoxes?: Box[];
  isDemo: boolean;
}

interface ViewerDownloads { save(req: { filename: string; data: Blob }): Promise<unknown> }

/**
 * Single state machine: upload → analyzing → (artboards) → analysis → sizes → generating → results.
 * The master canvas and the open PDF live in refs (non-serialisable); everything the UI renders is in state.
 */
export function useStudio() {
  const [state, setState] = useState<StudioState>(INITIAL_STATE);
  const masterRef = useRef<MasterRaster | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const urlsRef = useRef<string[]>([]);
  const imagesRef = useRef<Promise<DemoImages> | null>(null);

  const patch = useCallback((p: Partial<StudioState>) => setState((s) => ({ ...s, ...p })), []);

  useEffect(() => {
    imagesRef.current = loadDemoImages();
    if (ARTIFACT_MODE) {
      // The vision pass runs on the viewer's Claude; `use()` resolves null (after ≤10 s) when this view cannot.
      const rt = viewerRuntime();
      if (!rt) { patch({ visionConfigured: false, visionProvider: VIEWER_PROVIDER }); return; }
      void rt.use('sample').then((s) => patch({ visionConfigured: !!s, visionProvider: VIEWER_PROVIDER }));
      return;
    }
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: { configured?: boolean; provider?: string }) => patch({ visionConfigured: !!j.configured, visionProvider: j.provider ?? '' }))
      .catch(() => patch({ visionConfigured: null }));
  }, [patch]);

  const allSizes = useMemo<TargetSize[]>(() => DEFAULT_SIZES.concat(state.customSizes), [state.customSizes]);
  const isSelected = useCallback((i: number) => (state.selected ? !!state.selected[i] : true), [state.selected]);
  const selectedCount = allSizes.filter((_, i) => isSelected(i)).length;

  const closeDoc = () => { void docRef.current?.destroy(); docRef.current = null; };

  // ---------- Stage 0 (rasterize) + Stage 1 (analysis) on one artboard ----------
  const analyze = useCallback(async (input: RasterInput) => {
    const { canvas, dimsLabel, isDemo } = input;
    patch({ anStep: 1 });
    const rw = canvas.width, rh = canvas.height, ratio = rw / rh;
    const url = makePreviewUrl(canvas);
    masterRef.current = { canvas, rw, rh, ratio };
    patch({ anStep: 2, master: { dimsLabel, ratio, url } });

    const sampler = canvasSampler(canvas);
    const bg = sampleBgColor(sampler, rw, rh);
    // Deterministic layout analysis from the PDF text layer + raster: the fallback when no image can reach a model.
    const layout = input.runs?.length ? analyzeLayout({ runs: input.runs, sample: sampler, rw, rh, bgHex: bg }) : null;
    let raw: RawObjectModel | null = null;
    let model: ObjectModel | null = null;
    let note = '';
    let source: AnalysisSource = 'vision';
    try {
      raw = await visionPass(canvas);
    } catch (e) {
      const msg = errMsg(e);
      if (layout && layout.blocks.length) {
        if (ARTIFACT_MODE && (await textSamplingAvailable())) {
          try {
            const cls = await classifyViaText(describeLayout(layout, rw, rh), {
              text: layout.blocks.map((_, i) => `T${i}`),
              art: layout.components.slice(0, 6).map((_, i) => `A${i}`),
            });
            raw = mergeClassification(layout, cls, rw, rh);
            source = 'text-model';
            note = `No image could be sent to Claude (${msg}), so the elements were read from the file's text layer and artwork and Claude classified that description. Check the types before generating.`;
          } catch (e2) {
            raw = layout.model;
            source = 'heuristic';
            note = `No model was available (${msg}; ${errMsg(e2)}). Elements were detected from the file's text layer and artwork by rule. Check the types before generating.`;
          }
        } else {
          raw = layout.model;
          source = 'heuristic';
          note = `Vision pass unavailable (${msg}). Elements were detected from the file's text layer and artwork by rule. Check the types before generating.`;
        }
      } else if (isDemo) {
        model = demoModel(rh, bg, input.demoBoxes);
        source = 'demo';
        note = `Vision pass unavailable (${msg}) — using the precomputed object model for the demo master.`;
      } else {
        throw new Error(`Vision pass failed: ${msg}. This file has no text layer to fall back on (outlined artwork), so it needs the vision model.`);
      }
    }
    if (raw) {
      model = normalizeModel(raw, rh, bg);
      model = attachTextSpecs(model, { runs: input.runs, fonts: input.fonts, sample: sampler, rw, rh, fontAvailable });
      if (isDemo) model = applyDemoText(model);
    }
    if (!model) throw new Error('analysis produced no object model');
    model = measureContrast(model, sampler, rw, rh);
    patch({ anStep: 4, analysisNote: note, analysisSource: source, model });
    await delay(500);
    patch({ stage: 'analysis', hover: -1 });
  }, [patch]);

  const fail = useCallback((e: unknown) => {
    masterRef.current = null;
    closeDoc();
    patch({ stage: 'upload', uploadError: errMsg(e), master: null, model: null, artboards: [] });
  }, [patch]);

  const ingest = useCallback(async (source: File | 'demo') => {
    const isDemo = source === 'demo';
    const fileName = isDemo ? DEMO_FILE_NAME : source.name;
    closeDoc();
    patch({ stage: 'analyzing', fileName, anStep: 0, uploadError: '', analysisNote: '', master: null, model: null, artboards: [] });
    try {
      if (isDemo) {
        const imgs = await (imagesRef.current ?? loadDemoImages());
        const { canvas, boxes } = await drawDemoMaster(WORKING_EDGE, imgs);
        await analyze({ canvas, dimsLabel: '1080×1080 pt', demoBoxes: boxes, isDemo: true });
        return;
      }
      const { doc, numPages } = await openKeyVisual(source);
      docRef.current = doc;
      if (numPages > 1) {
        const artboards = await artboardThumbs(doc);
        patch({ stage: 'artboards', artboards });
        return;
      }
      const page = await renderArtboard(doc, 1);
      await analyze({ ...page, isDemo: false });
    } catch (e) {
      fail(e);
    }
  }, [analyze, fail, patch]);

  const pickArtboard = useCallback(async (index: number) => {
    const doc = docRef.current;
    if (!doc) return;
    patch({ stage: 'analyzing', anStep: 0, artboards: [] });
    try {
      const page = await renderArtboard(doc, index);
      await analyze({ ...page, isDemo: false });
    } catch (e) {
      fail(e);
    }
  }, [analyze, fail, patch]);

  const handleFiles = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!/\.(ai|pdf)$/i.test(f.name)) {
      patch({ uploadError: `Only .ai or .pdf key visuals are accepted. "${f.name}" was rejected.` });
      return;
    }
    void ingest(f);
  }, [ingest, patch]);

  const loadDemo = useCallback(() => { void ingest('demo'); }, [ingest]);

  /** Let a person correct a mis-tagged element: type drives priority, keep rules, legibility floor and whether text is re-set. */
  const setElementType = useCallback((index: number, type: ElementType) => {
    setState((s) => {
      if (!s.model) return s;
      const elements = s.model.elements.map((e, i) => (i === index ? retagElement(e, type) : e));
      return { ...s, model: { ...s.model, elements } };
    });
  }, []);

  // ---------- Stage 2: sizes ----------
  const toggleSize = useCallback((i: number) => {
    setState((s) => {
      const base = s.selected ?? Object.fromEntries(DEFAULT_SIZES.concat(s.customSizes).map((_, j) => [j, true]));
      return { ...s, selected: { ...base, [i]: !base[i] } };
    });
  }, []);

  const addCustomSize = useCallback((w: number, h: number): string | null => {
    const { min, max } = CUSTOM_SIZE_LIMITS;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < min || h < min || w > max || h > max) {
      return `Custom sizes must be between ${min} and ${max}px on each side.`;
    }
    setState((s) => {
      const customSizes = s.customSizes.concat([{ name: 'Custom', w: Math.round(w), h: Math.round(h), social: false }]);
      const idx = DEFAULT_SIZES.length + customSizes.length - 1;
      const base = s.selected ?? Object.fromEntries(DEFAULT_SIZES.concat(s.customSizes).map((_, j) => [j, true]));
      return { ...s, customSizes, selected: { ...base, [idx]: true } };
    });
    return null;
  }, []);

  // ---------- Stage 3–6: generation ----------
  const generate = useCallback(async () => {
    const master = masterRef.current;
    const model = state.model;
    if (!master || !model) return;
    const chosen = allSizes.filter((_, i) => isSelected(i));
    if (!chosen.length) return;
    const rows: GenRow[] = chosen.map((d) => ({ name: d.name, dims: `${d.w}×${d.h}`, pct: 4, phase: 'Queued', tone: 'muted', failed: false }));
    patch({ stage: 'generating', genRows: rows, results: [] });
    await ensureFonts(model);
    const results: AdaptResult[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const upd = (p: Partial<GenRow>) => setState((s) => ({ ...s, genRows: s.genRows.map((g, j) => (j === i ? { ...g, ...p } : g)) }));
      const rt = route(master.ratio, chosen[i].w, chosen[i].h);
      upd({ pct: 20, phase: `Routing — Δ ${rt.delta.toFixed(2)}`, tone: 'secondary' });
      await delay(120);
      let res: AdaptResult;
      try {
        res = await computeAdapt(master, model, chosen[i], (t) => upd({ pct: 60, phase: t, tone: 'secondary' }), (u) => urlsRef.current.push(u));
      } catch (e) {
        upd({ pct: 100, phase: `Failed — ${errMsg(e)}`, tone: 'bad', failed: true });
        continue;
      }
      results.push(res);
      const tone = res.blocked || res.status === 'blocked-qa' ? 'bad' : res.status === 'clean' ? 'ok' : 'warn';
      upd({ pct: 100, phase: res.blocked ? 'Blocked — compliance' : res.statusLabel, tone, failed: res.blocked || res.status === 'blocked-qa' });
      await delay(80);
    }
    await delay(500);
    patch({ stage: 'results', results });
  }, [allSizes, isSelected, patch, state.model]);

  // ---------- Stage 7: output ----------
  /** Hand a file to the viewer: the claude.ai downloads capability inside the viewer, a plain download elsewhere. */
  const saveFile = useCallback(async (filename: string, data: Blob) => {
    const rt = ARTIFACT_MODE ? viewerRuntime() : null;
    if (rt) {
      const dl = (await rt.use('downloads')) as ViewerDownloads | null;
      if (dl) {
        try {
          await dl.save({ filename, data });
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== 'declined') console.warn('[adapt-studio] save failed', e);
        }
        return;
      }
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, []);

  /** File names carry the master's name: "FedOne_PersonalLoan_KV" → FedOne_PersonalLoan_KV_300x250.png. */
  const filePrefix = useMemo(() => {
    const base = state.fileName.replace(/\s*\(demo\)\s*$/i, '').replace(/\.(ai|pdf)$/i, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return (base || 'adapt').slice(0, 48);
  }, [state.fileName]);

  const download = useCallback((r: AdaptResult) => {
    if (!r.canDownload || !r.blob) return;
    void saveFile(`${filePrefix}_${r.W}x${r.H}.${r.fmt.toLowerCase()}`, r.blob);
  }, [filePrefix, saveFile]);

  /** One ZIP with every exportable adapt (blocked sizes are excluded by construction). */
  const downloadAll = useCallback(async () => {
    const files: Record<string, Uint8Array> = {};
    for (const r of state.results) {
      if (!r.canDownload || !r.blob) continue;
      files[`${filePrefix}_${r.W}x${r.H}.${r.fmt.toLowerCase()}`] = new Uint8Array(await r.blob.arrayBuffer());
    }
    if (!Object.keys(files).length) return;
    const zipped = zipSync(files, { level: 0 });
    await saveFile(`${filePrefix}_adapts.zip`, new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }));
  }, [filePrefix, saveFile, state.results]);

  const restart = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    masterRef.current = null;
    closeDoc();
    setState((s) => ({ ...INITIAL_STATE, overlay: s.overlay, visionConfigured: s.visionConfigured, visionProvider: s.visionProvider }));
  }, []);

  return {
    state,
    allSizes,
    isSelected,
    selectedCount,
    actions: {
      handleFiles, loadDemo, pickArtboard, setElementType,
      setHover: (i: number) => patch({ hover: i }),
      toSizes: () => patch({ stage: 'sizes' }),
      toggleSize, addCustomSize, generate,
      toggleOverlay: () => setState((s) => ({ ...s, overlay: !s.overlay })),
      openModal: (i: number) => patch({ modalIdx: i }),
      closeModal: () => patch({ modalIdx: -1 }),
      download, downloadAll, restart,
    },
  };
}
