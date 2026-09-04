import { useEffect } from 'react';
import type { AdaptResult } from '../pipeline/types';
import { AdaptPreview } from './ui';

export function ZoomModal({ result: r, overlay, onClose }: { result: AdaptResult; overlay: boolean; onClose: () => void }) {
  const scale = Math.min(880 / r.W, 540 / r.H, 1.5);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${r.name} ${r.dims}`}>
      <div className="modal-card">
        <div className="modal-head">
          <div className="modal-name">{r.name}</div>
          <div className="mono muted">{r.dims}</div>
          <div className="spacer" />
          <div className="muted-light">click anywhere to close</div>
        </div>
        <div className="modal-field">
          <AdaptPreview r={r} scale={scale} overlay={overlay} variant="modal" />
        </div>
      </div>
    </div>
  );
}
