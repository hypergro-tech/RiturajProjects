import type { Artboard } from '../pipeline/ingest';
import type { AdaptResult, ObjectModel, TargetSize } from '../pipeline/types';

export type Stage = 'upload' | 'analyzing' | 'artboards' | 'analysis' | 'sizes' | 'generating' | 'results';
export type Tone = 'muted' | 'secondary' | 'ok' | 'warn' | 'bad';

export interface GenRow { name: string; dims: string; pct: number; phase: string; tone: Tone; failed: boolean }
export interface MasterView { dimsLabel: string; ratio: number; url: string }

export interface StudioState {
  stage: Stage;
  fileName: string;
  anStep: number;
  uploadError: string;
  analysisNote: string;
  master: MasterView | null;
  model: ObjectModel | null;
  hover: number;
  /** null = every size selected (the Stage 7 default). */
  selected: Record<number, boolean> | null;
  customSizes: TargetSize[];
  genRows: GenRow[];
  results: AdaptResult[];
  overlay: boolean;
  modalIdx: number;
  /** Thumbnails when the uploaded file has more than one artboard. */
  artboards: Artboard[];
  /** null = unknown (health check pending or failed). */
  visionConfigured: boolean | null;
  visionProvider: string;
}

export const INITIAL_STATE: StudioState = {
  stage: 'upload', fileName: '', anStep: 0, uploadError: '', analysisNote: '',
  master: null, model: null, hover: -1, selected: null, customSizes: [],
  genRows: [], results: [], overlay: false, modalIdx: -1,
  artboards: [], visionConfigured: null, visionProvider: '',
};
