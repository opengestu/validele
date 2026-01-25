import React from 'react';
import Spinner from './spinner';

interface OverlaySpinnerProps {
  message?: string;
  visible?: boolean;
}

export const OverlaySpinner: React.FC<OverlaySpinnerProps> = ({ message = 'Chargement...', visible = true }) => {
  React.useEffect(() => {
    if (!visible || typeof window === 'undefined') return;
    const body = document.body;
    // Use a counter to support nested overlays
    const key = 'data-global-spinner-count';
    const current = Number(body.getAttribute(key) || '0');
    const next = current + 1;
    body.setAttribute(key, String(next));
    body.classList.add('has-global-spinner');
    return () => {
      const after = Number(body.getAttribute(key) || '1') - 1;
      if (after <= 0) {
        body.removeAttribute(key);
        body.classList.remove('has-global-spinner');
      } else {
        body.setAttribute(key, String(after));
      }
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 pointer-events-auto">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" className="text-white" hideWhenGlobal={false} />
        <div className="text-white text-base">{message}</div>
      </div>
    </div>
  );
};

export default OverlaySpinner;
