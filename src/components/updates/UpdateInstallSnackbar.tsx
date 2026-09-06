import React from 'react';
import { Button } from '@/components/ui/button';

type UpdateInstallSnackbarProps = {
  visible: boolean;
  progress: number | null;
  isCompleting: boolean;
  onInstall: () => void;
  onDismiss: () => void;
};

const UpdateInstallSnackbar: React.FC<UpdateInstallSnackbarProps> = ({
  visible,
  progress,
  isCompleting,
  onInstall,
  onDismiss,
}) => {
  if (!visible) return null;

  const isDownloading = progress !== null && progress < 1;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[200002] px-4 pb-6 pt-2 pointer-events-none">
      <div className="pointer-events-auto mx-auto flex max-w-lg flex-col gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl">
        {isDownloading ? (
          <>
            <p className="text-sm font-medium">Téléchargement de la mise à jour…</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              Validel a téléchargé une mise à jour.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs font-medium text-slate-300 hover:text-white"
              >
                Plus tard
              </button>
              <Button
                type="button"
                size="sm"
                onClick={onInstall}
                disabled={isCompleting}
                className="h-8 rounded-full bg-emerald-500 px-4 text-xs font-semibold text-white hover:bg-emerald-600"
              >
                {isCompleting ? 'Installation…' : 'Redémarrer'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateInstallSnackbar;
