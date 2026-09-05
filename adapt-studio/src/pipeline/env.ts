/**
 * True in the single-file build published as a claude.ai artifact: no server, pdf.js runs its worker
 * in-bundle, standard fonts are inlined, the vision pass and file saves go through the viewer's runtime.
 */
export const ARTIFACT_MODE = import.meta.env.VITE_ARTIFACT === '1';

/** The claude.ai viewer runtime, when this page is framed by one. Only `use()` is promised. */
export interface ViewerRuntime { use(name: string): Promise<unknown> }

export function viewerRuntime(): ViewerRuntime | null {
  const c = (globalThis as { claude?: Partial<ViewerRuntime> }).claude;
  return c && typeof c.use === 'function' ? (c as ViewerRuntime) : null;
}
