import type { Artboard } from '../pipeline/ingest';

export function ArtboardsScreen({ fileName, artboards, onPick }: { fileName: string; artboards: Artboard[]; onPick: (index: number) => void }) {
  return (
    <section className="sizes">
      <div className="sizes-head">
        <h2 className="h2">Choose an artboard</h2>
        <div className="subhead">{fileName} has {artboards.length} artboards — the vision pass and every adapt use the one you pick</div>
      </div>
      <div className="tile-grid">
        {artboards.map((a) => (
          <button key={a.index} type="button" className="tile artboard-tile" onClick={() => onPick(a.index)}>
            <div className="tile-shape-field artboard-thumb">
              <img src={a.url} alt={`Artboard ${a.index}`} />
            </div>
            <div className="tile-meta">
              <div>
                <div className="tile-name">Artboard {a.index}</div>
                <div className="mono muted">{a.dimsLabel}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
