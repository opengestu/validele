import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import validelLogo from '@/assets/validel-logo.png';

type UpdateModalProps = {
  open: boolean;
  latestVersion: string;
  currentVersion: string;
  message: string;
  forceUpdate: boolean;
  isOpeningStore: boolean;
  onUpdateNow: () => void | Promise<void>;
  onLater: () => void;
};

const UpdateModal: React.FC<UpdateModalProps> = ({
  open,
  latestVersion,
  currentVersion,
  message,
  forceUpdate,
  isOpeningStore,
  onUpdateNow,
  onLater,
}) => {
  if (!open) return null;

  const handleUpdateClick = () => {
    void Promise.resolve(onUpdateNow());
  };

  return (
    <div
      className="fixed inset-0 z-[200000] flex flex-col justify-end bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fermer"
        onClick={() => {
          if (!forceUpdate && !isOpeningStore) onLater();
        }}
      />

      <div
        className="relative z-[200001] mx-auto w-full max-w-lg rounded-t-[28px] bg-white px-6 pb-8 pt-6 shadow-[0_-12px_40px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden">
            <img src={validelLogo} alt="Validel" className="h-14 w-14 object-contain" />
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white shadow">
              <Download className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="update-dialog-title" className="text-xl font-semibold text-slate-900">
              Mise à jour disponible
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Validel {currentVersion} → {latestVersion}
            </p>
          </div>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-slate-700">{message}</p>

        {forceUpdate && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Cette mise à jour est obligatoire pour continuer à utiliser l&apos;application.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            onClick={handleUpdateClick}
            disabled={isOpeningStore}
            className="h-12 w-full rounded-full bg-[#1a73e8] text-base font-semibold text-white hover:bg-[#1558b0] disabled:opacity-70"
          >
            {isOpeningStore ? 'Ouverture du Play Store...' : 'Mettre à jour'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => onLater()}
            disabled={forceUpdate || isOpeningStore}
            className="h-12 w-full rounded-full border-[#1a73e8] bg-white text-base font-semibold text-[#1a73e8] hover:bg-blue-50 disabled:opacity-50"
          >
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
