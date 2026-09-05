import type { Stage } from '../state/types';

const STEPS = ['Master', 'Analysis', 'Sizes', 'Generate', 'Adapts'];
const STAGE_INDEX: Record<Stage, number> = { upload: 0, analyzing: 1, artboards: 0, analysis: 1, sizes: 2, generating: 3, results: 4 };

export function Header({ stage }: { stage: Stage }) {
  const active = STAGE_INDEX[stage];
  return (
    <header className="header">
      <img src="/assets/wordmark-on-blue.png" alt="Federal Bank" className="header-wordmark" />
      <div className="header-divider" />
      <div className="header-title">Adapt Studio</div>
      <div className="spacer" />
      <nav className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <div key={label} className={'step-pill' + (i === active ? ' is-active' : '')} aria-current={i === active ? 'step' : undefined}>
            <span>{i + 1}</span>
            <span>{label}</span>
          </div>
        ))}
      </nav>
    </header>
  );
}
