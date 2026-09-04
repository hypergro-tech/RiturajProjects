import type { GenRow } from '../state/types';

export function GeneratingScreen({ rows }: { rows: GenRow[] }) {
  return (
    <section className="generating" aria-busy="true">
      <h2 className="h2">Generating adapts…</h2>
      <div className="gen-rows">
        {rows.map((g, i) => (
          <div key={i} className="gen-row">
            <div className="gen-name"><b>{g.name}</b> <span className="mono muted">{g.dims}</span></div>
            <div className="bar"><div className={'bar-fill' + (g.failed ? ' is-bad' : '')} style={{ width: `${g.pct}%` }} /></div>
            <div className={'gen-phase tone-' + g.tone}>{g.phase}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
