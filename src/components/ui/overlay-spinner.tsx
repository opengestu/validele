import React from 'react';
import Spinner from './spinner';

// Add a global declaration so we can store a lightweight queue on window without using `any`
declare global {
  interface Window {
    __GLOBAL_SPINNER_QUEUE?: string[];
  }
}

interface OverlaySpinnerProps {
  message?: string;
  visible?: boolean;
}

export const OverlaySpinner: React.FC<OverlaySpinnerProps> = ({ message = 'Chargement...', visible = true }) => {
  // Track whether this instance should actually render markup: only the first visible overlay renders.
  const [shouldRender, setShouldRender] = React.useState(() => {
    if (typeof window === 'undefined') return visible;
    const body = document.body;
    const key = 'data-global-spinner-count';
    const current = Number(body.getAttribute(key) || '0');
    return visible && current === 0;
  });

  React.useEffect(() => {
    if (!visible || typeof window === 'undefined') return;
    const body = document.body;

    // Initialize global queue on window if missing (typed via global Window augmentation)
    if (!window.__GLOBAL_SPINNER_QUEUE) window.__GLOBAL_SPINNER_QUEUE = [];
    const queue = window.__GLOBAL_SPINNER_QUEUE as string[];

    // Unique id for this instance
    const id = Math.random().toString(36).slice(2, 9);

    // Push into queue
    queue.push(id);
    body.classList.add('has-global-spinner');

    // If we're at the head of queue, render
    if (queue[0] === id) {
      body.setAttribute('data-global-spinner-owner', id);
      setShouldRender(true);
    } else {
      setShouldRender(false);
    }

    const cleanup = () => {
      // Remove id from queue
      const idx = queue.indexOf(id);
      if (idx !== -1) queue.splice(idx, 1);

      if (queue.length === 0) {
        body.classList.remove('has-global-spinner');
        body.removeAttribute('data-global-spinner-owner');
        setShouldRender(false);
      } else {
        // Assign new owner to head of queue
        body.setAttribute('data-global-spinner-owner', queue[0]);
      }
    };

    return cleanup;
  }, [visible]);

  if (!visible || !shouldRender) return null;
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
