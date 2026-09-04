import type { AdaptResult, Gate, StatusKind, Strategy } from '../pipeline/types';

const BADGES: Record<Strategy | 'BLOCKED', { label: string; bg: string; color: string }> = {
  SCALE: { label: 'SCALE', bg: '#E3F4E8', color: '#167A3D' },
  SMART_CROP: { label: 'SMART CROP', bg: '#E3ECFB', color: '#004BBE' },
  EXPAND: { label: 'EXPAND', bg: '#FFF0DB', color: '#8A5A00' },
  RECOMPOSE: { label: 'REBUILT', bg: '#FDEBD7', color: '#B4530A' },
  BLOCKED: { label: 'BLOCKED', bg: '#FDECEC', color: '#B4231F' },
};

/** Strategy pill. `planned` shows the pre-generation form ("REBUILD" instead of "REBUILT"). */
export function StrategyBadge({ strategy, blocked = false, planned = false }: { strategy: Strategy; blocked?: boolean; planned?: boolean }) {
  const b = blocked ? BADGES.BLOCKED : BADGES[strategy];
  const label = planned && strategy === 'RECOMPOSE' ? 'REBUILD' : b.label;
  return <span className="badge" style={{ background: b.bg, color: b.color }}>{label}</span>;
}

const STATUS_TINT: Record<StatusKind, [string, string]> = {
  clean: ['#E3ECFB', '#004BBE'],
  review: ['#FFF0DB', '#8A5A00'],
  'blocked-compliance': ['#FDECEC', '#B4231F'],
  'blocked-qa': ['#FDECEC', '#B4231F'],
};

export function StatusPill({ status, label }: { status: StatusKind; label: string }) {
  const [bg, color] = STATUS_TINT[status];
  return <span className="status-pill" style={{ background: bg, color }}>{label}</span>;
}

export function GateChip({ gate }: { gate: Gate }) {
  return (
    <span className={'gate' + (gate.pass ? ' gate-pass' : ' gate-fail')}>
      <span aria-hidden="true">{gate.pass ? '✓' : '✕'}</span>
      <span className="sr-only">{gate.pass ? 'passed' : 'failed'}</span>
      {gate.label}
    </span>
  );
}

/** Adapt shown at fit scale with the optional safe-zone + mask overlay (shared by cards and the zoom modal). */
export function AdaptPreview({ r, scale, overlay, variant }: { r: AdaptResult; scale: number; overlay: boolean; variant: 'card' | 'modal' }) {
  const pvW = Math.round(r.W * scale), pvH = Math.round(r.H * scale);
  return (
    <div className={'pv pv-' + variant} style={{ width: pvW, height: pvH }}>
      <div className="pv-inner" style={{ width: r.W, height: r.H, transform: `scale(${scale})` }}>
        <img src={r.url} alt={`${r.name} ${r.dims} adapt`} style={{ width: r.W, height: r.H }} draggable={false} />
        {overlay && (
          <>
            {r.masks.map((m, i) => (
              <div key={i} className="pv-mask" style={{ left: m.x, top: m.y, width: m.w, height: m.h }} />
            ))}
            <div
              className="pv-safe"
              style={{ width: r.W, height: r.H, borderTopWidth: r.safe.t, borderBottomWidth: r.safe.b, borderLeftWidth: r.safe.l, borderRightWidth: r.safe.r }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function formatKb(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${kb}KB`;
}
