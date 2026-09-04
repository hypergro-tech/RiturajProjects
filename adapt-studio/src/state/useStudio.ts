import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CUSTOM_SIZE_LIMITS, DEFAULT_SIZES, WORKING_EDGE } from '../pipeline/constants';
import { computeAdapt } from '../pipeline/adapt';
import { drawDemoMaster, loadDemoImages, type DemoImages } from '../pipeline/demo';
import { demoModel } from '../pipeline/demoData';
import { canvasSampler, makePreviewUrl, rasterizeKeyVisual } from '../pipeline/ingest';
import { measureContrast, normalizeModel, sampleBgColor } from '../pipeline/model';
import { route } from '../pipeline/router';
import { visionPass } from '../pipeline/vision';
import type { AdaptResult, Box, MasterRaster, ObjectModel, TargetSize } from '../pipeline/types';
import { INITIAL_STATE, type GenRow, type StudioState } from './types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const DEMO_FILE_NAME = 'FedOne_PersonalLoan_KV_1080.ai (demo)';

/**
 * Single state machine: upload → analyzing → analysis → sizes → generating → results.
 * The master canvas lives in a ref (non-serialisable); everything the UI renders is in state.
 */
export function useStudio() {
  const [state, setState] = useState<StudioState>(INITIAL_STATE);
  const masterRef = useRef<MasterRaster | null>(null);
  const urlsRef = useRef<string[]>([]);
  const imagesRef = useRef<Promise<DemoImages> | null>(null);

  useEffect(() => {
    imagesRef.current = loadDemoImages();
  }, []);

  const patch = useCallback((p: Partial<StudioState>) => setState((s) => ({ ...s, ...p })), []);

  const allSizes = useMemo<TargetSize[]>(() => DEFAULT_SIZES.concat(state.customSizes), [state.customSizes]);
  const isSelected = useCallback((i: number) => (state.selected ? !!state.selected[i] : true), [state.selected]);
  const selectedCount = allSizes.filter((_, i) => isSelected(i)).length;

  // ---------- Stage 0 + 1: ingest & analysis ----------
  const ingest = useCallback(async (source: File | 'demo') => {
    const isDemo = source === 'demo';
    const fileName = isDemo ? DEMO_FILE_NAME : source.name;
    patch({ stage: 'analyzing', fileName, anStep: 0, uploadError: '', analysisNote: '', master: null, model: null });
    try {
      let canvas: HTMLCanvasElement, dimsLabel: string, demoBoxes: Box[] | undefined;
      if (isDemo) {
        const imgs = await (imagesRef.current ?? loadDemoImages());
        ({ canvas, boxes: demoBoxes } = await drawDemoMaster(WORKING_EDGE, imgs));
        dimsLabel = '1080×1080 pt';
      } else {
        ({ canvas, dimsLabel } = await rasterizeKeyVisual(source));
      }
      patch({ anStep: 1 });
      const rw = canvas.width, rh = canvas.height, ratio = rw / rh;
      const url = makePreviewUrl(canvas);
      masterRef.current = { canvas, rw, rh, ratio };
      patch({ anStep: 2, master: { dimsLabel, ratio, url } });

      const sampler = canvasSampler(canvas);
      const bg = sampleBgColor(sampler, rw, rh);
      let model: ObjectModel;
      let note = '';
      try {
        model = normalizeModel(await visionPass(canvas), rh, bg);
      } catch (e) {
        const msg = errMsg(e);
        if (!isDemo) throw new Error(`Vision pass failed: ${msg}. The file parsed fine — retry in a moment (rate limit is 15 calls/min).`);
        model = demoModel(rh, bg, demoBoxes);
        note = `Vision pass unavailable (${msg}) — using the precomputed object model for the demo master.`;
      }
      model = measureContrast(model, sampler, rw, rh);
      patch({ anStep: 4, analysisNote: note, model });
      await delay(500);
      patch({ stage: 'analysis', hover: -1 });
    } catch (e) {
      masterRef.current = null;
      patch({ stage: 'upload', uploadError: errMsg(e), master: null, model: null });
    }
  }, [patch]);

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
  const download = useCallback((r: AdaptResult) => {
    if (!r.canDownload) return;
    const a = document.createElement('a');
    a.href = r.url;
    a.download = `FederalBank_${r.W}x${r.H}.${r.fmt.toLowerCase()}`;
    a.click();
  }, []);

  const downloadAll = useCallback(() => {
    state.results.filter((r) => r.canDownload).forEach((r, i) => setTimeout(() => download(r), i * 350));
  }, [download, state.results]);

  const restart = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    masterRef.current = null;
    setState((s) => ({ ...INITIAL_STATE, overlay: s.overlay }));
  }, []);

  return {
    state,
    allSizes,
    isSelected,
    selectedCount,
    actions: {
      handleFiles, loadDemo,
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
