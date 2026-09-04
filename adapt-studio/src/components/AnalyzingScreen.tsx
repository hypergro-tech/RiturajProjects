const LABELS = [
  'Parsing artboard',
  'Rasterizing working preview (2000px long edge)',
  'Vision pass — Claude tagging elements & background',
  'Object model ready',
];

export function AnalyzingScreen({ fileName, step }: { fileName: string; step: number }) {
  return (
    <section className="analyzing" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <div className="analyzing-file">{fileName}</div>
      <ul className="checklist">
        {LABELS.map((label, i) => {
          const st = i < step ? 'done' : i === step ? 'active' : 'pending';
          return (
            <li key={label} className={'check check-' + st}>
              <span className="check-icon" aria-hidden="true">{st === 'done' ? '✓' : st === 'active' ? '●' : '○'}</span>
              {label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
