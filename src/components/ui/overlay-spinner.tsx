import React from 'react';
import { Spinner } from './spinner';

interface OverlaySpinnerProps {
  visible?: boolean;
  message?: string;
}

const OverlaySpinner: React.FC<OverlaySpinnerProps> = ({ visible = true, message }) => {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 pointer-events-auto">
      <div className="bg-white/95 rounded-lg p-6 flex flex-col items-center gap-3 shadow-lg max-w-sm mx-4">
        <Spinner size="xl" />
        {message && <div className="text-sm text-gray-700 text-center">{message}</div>}
      </div>
    </div>
  );
};

export default OverlaySpinner;
