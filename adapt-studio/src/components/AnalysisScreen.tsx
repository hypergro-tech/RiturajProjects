import type { ElementType, ObjectModel } from '../pipeline/types';
import type { AnalysisSource, MasterView } from '../state/types';

const PRIO_COLORS: Record<number, [string, string]> = {
  1: ['#004BBE', '#fff'], 2: ['#1A5FD0', '#fff'], 3: ['#FF9C00', '#3A2800'],
  4: ['#B4231F', '#fff'], 5: ['#7A8AA6', '#fff'], 6: ['#C3CEE0', '#3A4A63'],
};

const SOURCE_LABEL: Record<AnalysisSource, string> = {
  vision: 'vision pass on the rasterized artboard',
  'text-model': 'text layer + artwork, classified by Claude from a description',
  heuristic: 'text layer + artwork, classified by rule (no model)',
  demo: 'precomputed for the demo master',
};

const TYPE_OPTIONS: ElementType[] = ['logo', 'headline', 'subhead', 'body', 'cta', 'legal', 'product', 'person', 'decorative'];

interface Props {
  master: MasterView; model: ObjectModel; note: string; source: AnalysisSource | null;
  hover: number; onHover: (i: number) => void; onRetag: (index: number, type: ElementType) => void; onNext: () => void;
}

export function AnalysisScreen({ master, model, note, source, hover, onHover, onRetag, onNext }: Props) {
  const mpW = Math.min(430, Math.round(430 * (master.ratio >= 1 ? 1 : master.ratio)));
  const mpH = Math.round(mpW / master.ratio);
  const hd = hover >= 0 ? model.elements[hover] : null;
  const bg = model.background;
  const regLabel = model.detectedRegulated ? 'REGULATED · disclaimer detected · BFSI (RBI — lending)' : 'REGULATED · BFSI vertical default';
  return (
    <section className="analysis">
      <div className="card master-card">
        <div className="card-label">MASTER · {master.dimsLabel} · ratio {master.ratio.toFixed(2)}</div>
        <div className="master-preview" style={{ width: mpW, height: mpH }}>
          <img src={master.url} alt="Master key visual" />
          {hd && (
            <div className="hover-box" style={{ left: hd.box.x * mpW, top: hd.box.y * mpH, width: hd.box.w * mpW, height: hd.box.h * mpH }} />
          )}
        </div>
        {note && <div className="note-amber">{note}</div>}
      </div>
      <div className="analysis-right">
        <div className="card">
          <div className="card-label">TAGGED OBJECT MODEL — {SOURCE_LABEL[source ?? 'vision']}</div>
          <div className="chips" onMouseLeave={() => onHover(-1)}>
            {model.elements.map((e, i) => {
              const [pbg, pcol] = PRIO_COLORS[e.priority] ?? PRIO_COLORS[6];
              return (
                <div key={i} className="chip" onMouseEnter={() => onHover(i)} onFocus={() => onHover(i)} tabIndex={0}>
                  <div className="chip-prio" style={{ background: pbg, color: pcol }}>{e.priority}</div>
                  <select
                    className="chip-type chip-select"
                    value={e.type}
                    aria-label={`Element ${i + 1} type`}
                    title="Change the element type if the analysis got it wrong"
                    onChange={(ev) => onRetag(i, ev.target.value as ElementType)}
                  >
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="chip-desc">
                    {e.desc}
                    {e.text && (
                      <div className="chip-sub">
                        “{e.text.content.replace(/\n/g, ' / ')}” · {e.text.source === 'pdf' ? 'PDF text' : e.text.source === 'vision' ? 'transcribed by the vision model' : 'demo text'} · {e.text.fontLabel}
                      </div>
                    )}
                    {!e.text && e.minLegiblePx > 0 && <div className="chip-sub">no readable text — will be scaled as a raster patch</div>}
                  </div>
                  {e.minLegiblePx > 0 && <div className="chip-min">min {e.minLegiblePx}px</div>}
                  <div className={'chip-keep' + (e.mustKeep ? ' is-keep' : '')}>{e.mustKeep ? 'must keep' : 'droppable'}</div>
                </div>
              );
            })}
            {model.elements.length === 0 && <div className="chip-desc">No elements were tagged. Try a cleaner artboard or re-run the analysis.</div>}
          </div>
          {model.notes && <div className="model-notes">Protect first: {model.notes}</div>}
          <div className="model-notes">Wrong type? Change it in the dropdown; keep rules and legibility floors follow the type.</div>
        </div>
        <div className="analysis-row">
          <div className="card">
            <div className="card-label">BACKGROUND</div>
            <div className="card-text">{bg.desc} · complexity: <b>{bg.complexity}</b></div>
            <div className="card-text">
              {bg.extendable ? `Extendable ✓ — ${bg.extendDirections.join(', ') || 'no directions given'}` : 'Not extendable — expand will escalate to rebuild'}
            </div>
          </div>
          <div className="card card-navy">
            <div className="card-label card-label-orange">{regLabel}</div>
            <div className="card-text-light">The disclaimer is kept wherever it fits legibly and dropped where it cannot — no size is blocked for it. Every adapt routes to human review.</div>
          </div>
        </div>
        <div className="row-end">
          <button type="button" className="btn btn-primary btn-lg" onClick={onNext}>Choose sizes →</button>
        </div>
      </div>
    </section>
  );
}
