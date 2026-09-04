import { useState } from 'react';
import { route } from '../pipeline/router';
import type { TargetSize } from '../pipeline/types';
import { StrategyBadge } from './ui';

interface Props {
  masterRatio: number; sizes: TargetSize[]; isSelected: (i: number) => boolean; selectedCount: number;
  onToggle: (i: number) => void; onAddCustom: (w: number, h: number) => string | null; onGenerate: () => void;
}

export function SizesScreen({ masterRatio, sizes, isSelected, selectedCount, onToggle, onAddCustom, onGenerate }: Props) {
  const [cw, setCw] = useState('');
  const [ch, setCh] = useState('');
  const [err, setErr] = useState('');
  const add = () => {
    const e = onAddCustom(parseInt(cw, 10), parseInt(ch, 10));
    setErr(e ?? '');
    if (!e) { setCw(''); setCh(''); }
  };
  return (
    <section className="sizes">
      <div className="sizes-head">
        <h2 className="h2">Target sizes</h2>
        <div className="subhead">Strategy badge computed before generation — router: Δ = |ln(target ÷ master ratio {masterRatio.toFixed(2)})|</div>
      </div>
      <div className="tile-grid">
        {sizes.map((s, i) => {
          const rt = route(masterRatio, s.w, s.h);
          const sc = Math.min(150 / s.w, 58 / s.h);
          const on = isSelected(i);
          return (
            <div
              key={`${s.name}-${s.w}x${s.h}-${i}`}
              className={'tile' + (on ? ' is-on' : '')}
              onClick={() => onToggle(i)}
              role="checkbox"
              aria-checked={on}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(i); } }}
            >
              <div className="tile-shape-field">
                <div className="tile-shape" style={{ width: Math.max(8, Math.round(s.w * sc)), height: Math.max(4, Math.round(s.h * sc)) }} />
              </div>
              <div className="tile-meta">
                <div>
                  <div className="tile-name">{s.name}</div>
                  <div className="mono muted">{s.w}×{s.h}</div>
                </div>
                <div className="tile-check" aria-hidden="true">{on ? '✓' : ''}</div>
              </div>
              <div className="tile-badge-row">
                <StrategyBadge strategy={rt.strategy} planned />
                <span className="mono tile-delta">{rt.skinny ? 'skinny' : `Δ ${rt.delta.toFixed(2)}`}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="sizes-footer">
        <div className="label">Custom size:</div>
        <input className="input" value={cw} onChange={(e) => setCw(e.target.value)} placeholder="W" inputMode="numeric" aria-label="Custom width" />
        <span className="muted">×</span>
        <input className="input" value={ch} onChange={(e) => setCh(e.target.value)} placeholder="H" inputMode="numeric" aria-label="Custom height" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={add}>Add</button>
        {err && <span className="inline-error">{err}</span>}
        <div className="spacer" />
        <div className="muted">{selectedCount} selected</div>
        <button type="button" className="btn btn-primary btn-lg" onClick={onGenerate} disabled={selectedCount === 0}>Generate adapts →</button>
      </div>
    </section>
  );
}
