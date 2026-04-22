import React from 'react';
import { RefreshCw, ShieldAlert, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

type UpdateModalProps = {
  open: boolean;
  latestVersion: string;
  currentVersion: string;
  message: string;
  forceUpdate: boolean;
  isOpeningStore: boolean;
  onUpdateNow: () => void;
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
  return (
    <Drawer
      open={open}
      dismissible
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onLater();
      }}
    >
      <DrawerContent className="z-[12000] border-none bg-slate-950 text-white rounded-t-[28px]">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-white/25" />

        <DrawerHeader className="px-5 pb-2 pt-4 text-left">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-400 to-indigo-500 shadow-lg shadow-cyan-900/40">
              <RefreshCw className={`h-6 w-6 text-slate-950 ${isOpeningStore ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <DrawerTitle className="text-xl font-bold leading-tight text-white">
                Nouvelle version disponible
              </DrawerTitle>
              <p className="mt-1 text-xs text-slate-300">
                Version actuelle {currentVersion} {'->'} Version {latestVersion}
              </p>
            </div>
          </div>

          <DrawerDescription className="text-sm leading-relaxed text-slate-100/90">
            {message}
          </DrawerDescription>

          {forceUpdate && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-amber-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-xs">
                Cette mise a jour est obligatoire pour continuer a utiliser l'application.
              </span>
            </div>
          )}
        </DrawerHeader>

        <DrawerFooter className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
          <Button
            type="button"
            onClick={onUpdateNow}
            disabled={isOpeningStore}
            className="h-12 w-full rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-semibold"
          >
            <span className="flex items-center gap-2">
              <span>{isOpeningStore ? 'Ouverture du Store...' : 'Mettre a jour maintenant'}</span>
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onLater}
            className="h-11 w-full rounded-xl border-slate-600 bg-transparent text-slate-200 hover:bg-slate-900 hover:text-white"
          >
            {forceUpdate ? 'Continuer sans mettre a jour' : 'Plus tard'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default UpdateModal;
