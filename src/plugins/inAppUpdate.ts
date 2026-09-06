import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type PlayUpdateAvailability =
  | 'UPDATE_AVAILABLE'
  | 'UPDATE_NOT_AVAILABLE'
  | 'DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS'
  | 'UNKNOWN';

export type PlayInstallStatus =
  | 'DOWNLOADED'
  | 'DOWNLOADING'
  | 'FAILED'
  | 'INSTALLED'
  | 'INSTALLING'
  | 'PENDING'
  | 'CANCELED'
  | 'REQUIRES_UI_INTENT'
  | 'UNKNOWN';

export type AppUpdateInfoResult = {
  updateAvailability: PlayUpdateAvailability;
  installStatus?: PlayInstallStatus;
  availableVersionCode?: number;
  updatePriority?: number;
  clientVersionStalenessDays?: number | null;
  immediateUpdateAllowed?: boolean;
  flexibleUpdateAllowed?: boolean;
  started?: boolean;
  resultCode?: number;
};

export type FlexibleUpdateStateEvent = {
  installStatus: PlayInstallStatus;
  bytesDownloaded?: number;
  totalBytesToDownload?: number;
  progress?: number;
};

type InAppUpdatePlugin = {
  getAppUpdateInfo: () => Promise<AppUpdateInfoResult>;
  checkResumeState: () => Promise<AppUpdateInfoResult>;
  performImmediateUpdate: () => Promise<AppUpdateInfoResult>;
  startFlexibleUpdate: () => Promise<AppUpdateInfoResult>;
  completeFlexibleUpdate: () => Promise<void>;
  addListener: (
    eventName: 'flexibleUpdateState' | 'flexibleUpdateCanceled',
    listenerFunc: (event: FlexibleUpdateStateEvent) => void,
  ) => Promise<PluginListenerHandle>;
};

const InAppUpdate = registerPlugin<InAppUpdatePlugin>('InAppUpdate');

export const isPlayStoreUpdateAvailable = (info: AppUpdateInfoResult | null | undefined) => {
  if (!info) return false;
  return (
    info.updateAvailability === 'UPDATE_AVAILABLE'
    || info.updateAvailability === 'DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS'
  );
};

/** Priorité Play >= 4 ou forceUpdate API → mise à jour immédiate (plein écran). */
export const HIGH_PLAY_UPDATE_PRIORITY = 4;

export const shouldUseImmediatePlayUpdate = (
  info: AppUpdateInfoResult,
  forceUpdate: boolean,
) => {
  if (forceUpdate) return Boolean(info.immediateUpdateAllowed);
  const priority = typeof info.updatePriority === 'number' ? info.updatePriority : 0;
  return priority >= HIGH_PLAY_UPDATE_PRIORITY && Boolean(info.immediateUpdateAllowed);
};

export default InAppUpdate;
