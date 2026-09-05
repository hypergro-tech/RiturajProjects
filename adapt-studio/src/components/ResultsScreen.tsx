import { formatKb } from '../pipeline/safeZones';
import type { AdaptResult } from '../pipeline/types';
import { AdaptPreview, GateChip, StatusPill, StrategyBadge } from './ui';

interface Props {
  results: AdaptResult[]; overlay: boolean;
  onToggleOverlay: () => void; onDownloadAll: () => void; onRestart: () => void;
  onOpen: (i: number) => void; onDownload: (r: AdaptResult) => void;
}

export function ResultsScreen({ results, overlay, onToggleOverlay, onDownloadAll, onRestart, onOpen, onDownload }: Props) {
  const nReview = results.filter((r) => r.canDownload && r.status === 'review').length;
  const nBlocked = results.filter((r) => !r.canDownload).length;
  const nClean = results.length - nReview - nBlocked;
  return (
    <section className="results">
      <div className="results-toolbar">
        <h2 className="h2">Adapts</h2>
        <div className="subhead">{results.length} sizes · {nClean} QA-clean · {nReview} need review · {nBlocked} blocked</div>
        <div className="spacer" />
        <div className="toolbar-right">
          <button type="button" className="switch-row" onClick={onToggleOverlay} role="switch" aria-checked={overlay}>
            <span className={'switch' + (overlay ? ' is-on' : '')}><span className="switch-knob" /></span>
            <span className="switch-label">Safe zones + masks</span>
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onDownloadAll} disabled={results.every((r) => !r.canDownload)}>Download all (ZIP)</button>
          <button type="button" className="btn btn-link" onClick={onRestart}>Start over</button>
        </div>
      </div>
      <div className="card-grid">
        {results.map((r, i) => <AdaptCard key={`${r.dims}-${i}`} r={r} overlay={overlay} onOpen={() => onOpen(i)} onDownload={() => onDownload(r)} />)}
      </div>
    </section>
  );
}

function AdaptCard({ r, overlay, onOpen, onDownload }: { r: AdaptResult; overlay: boolean; onOpen: () => void; onDownload: () => void }) {
  const scale = Math.min(272 / r.W, 218 / r.H, 1);
  return (
    <article className="adapt-card">
      <div className={'adapt-field' + (r.blocked ? '' : ' is-zoomable')} onClick={r.blocked ? undefined : onOpen}>
        {r.blocked ? <div className="block-box">{r.blockMsg}</div> : <AdaptPreview r={r} scale={scale} overlay={overlay} variant="card" />}
      </div>
      <div className="adapt-body">
        <div className="adapt-title-row">
          <div className="adapt-name">{r.name}</div>
          <div className="mono muted">{r.dims}</div>
          <div className="spacer" />
          <StrategyBadge strategy={r.strategy} blocked={r.blocked} />
        </div>
        {r.escalations.length > 0 && <div className="note-amber">{r.escalations.map((e) => `↳ ${e}`).join('  ')}</div>}
        <div className="gates">{r.gates.map((g, i) => <GateChip key={i} gate={g} />)}</div>
        <div className="adapt-summary">{r.summary}</div>
        <div className="adapt-foot">
          <StatusPill status={r.status} label={r.statusLabel} />
          <div className="spacer" />
          {r.canDownload && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={(e) => { e.stopPropagation(); onDownload(); }}>
              Download {r.fmt}{r.kb ? ` · ${formatKb(r.kb)}` : ''}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
