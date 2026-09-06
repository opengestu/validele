import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { apiUrl } from '@/lib/api';
import InAppUpdate, {
  isPlayStoreUpdateAvailable,
  type AppUpdateInfoResult,
  type FlexibleUpdateStateEvent,
} from '@/plugins/inAppUpdate';
import { openPlayStoreListing } from '@/lib/openPlayStore';

type VersionApiResponse = {
  latestVersion: string;
  updateAvailable?: boolean;
  forceUpdate: boolean;
  message: string;
};

type UpdateInfo = {
  latestVersion: string;
  forceUpdate: boolean;
  message: string;
  source?: 'play-core' | 'version-api';
};

type SnoozeRecord = {
  version: string;
  expiresAt: number;
};

const SNOOZE_KEY = 'app_update_snooze_v1';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLAY_STORE_APP_ID = 'com.validele.app';
const DEFAULT_UPDATE_MESSAGE =
  'Une nouvelle version est disponible. Veuillez mettre à jour l\'application.';
const PLAY_STORE_UPDATE_SNOOZE_VERSION = 'play-store';

const normalizeUpdateMessage = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_UPDATE_MESSAGE;

  return trimmed
    .replace(/\bmettre a jour\b/gi, 'mettre à jour')
    .replace(/\bmise a jour\b/gi, 'mise à jour')
    .replace(/\bameliorations\b/gi, 'améliorations')
    .replace(/\bapres\b/gi, 'après');
};

const normalizeVersion = (value: string) => value.trim().replace(/^v/i, '');

const compareVersions = (current: string, latest: string) => {
  const left = normalizeVersion(current).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(latest).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }

  return 0;
};

const readSnoozeRecord = (): SnoozeRecord | null => {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SnoozeRecord>;
    if (typeof parsed.version !== 'string') return null;
    if (typeof parsed.expiresAt !== 'number') return null;
    return { version: parsed.version, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
};

const hasActiveSnooze = (latestVersion: string) => {
  const snooze = readSnoozeRecord();
  if (!snooze) return false;
  if (snooze.version !== latestVersion) return false;
  return Date.now() < snooze.expiresAt;
};

const saveSnooze = (latestVersion: string) => {
  const payload: SnoozeRecord = {
    version: latestVersion,
    expiresAt: Date.now() + SNOOZE_MS,
  };
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors.
  }
};

const getCurrentAppVersion = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      const info = await CapacitorApp.getInfo();
      if (info?.version) return normalizeVersion(info.version);
    }
  } catch {
    // Ignore plugin errors and fallback to env/default.
  }

  const envVersion = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_APP_VERSION;
  if (typeof envVersion === 'string' && envVersion.trim().length > 0) {
    return normalizeVersion(envVersion);
  }

  return '0.0.0';
};

const getPlayStoreAppId = () => {
  const envAppId = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_PLAY_STORE_APP_ID;
  return typeof envAppId === 'string' && envAppId.trim().length > 0
    ? envAppId.trim()
    : DEFAULT_PLAY_STORE_APP_ID;
};

const getVersionApiUpdate = async (appVersion: string): Promise<UpdateInfo | null> => {
  const versionEndpointCandidates = ['/api/version', '/version'];
  let json: Partial<VersionApiResponse> | null = null;
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';

  for (const endpoint of versionEndpointCandidates) {
    const baseUrl = apiUrl(endpoint);
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${sep}platform=${encodeURIComponent(platform)}&currentVersion=${encodeURIComponent(appVersion)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }).catch(() => null);

    if (!response || !response.ok) continue;

    const parsed = (await response.json().catch(() => null)) as Partial<VersionApiResponse> | null;
    if (!parsed) continue;

    json = parsed;
    if (typeof parsed.latestVersion === 'string' && normalizeVersion(parsed.latestVersion)) {
      break;
    }
  }

  if (!json) return null;

  const latestVersion = typeof json.latestVersion === 'string' ? normalizeVersion(json.latestVersion) : '';
  const forceUpdate = Boolean(json.forceUpdate);
  const message = typeof json.message === 'string' && json.message.trim().length > 0
    ? normalizeUpdateMessage(json.message)
    : DEFAULT_UPDATE_MESSAGE;

  if (!latestVersion) return null;
  if (appVersion === '0.0.0' && latestVersion === '0.0.0') return null;

  const updateAvailable = typeof json.updateAvailable === 'boolean'
    ? json.updateAvailable
    : compareVersions(appVersion, latestVersion) < 0;

  if (!updateAvailable) return null;

  return { latestVersion, forceUpdate, message, source: 'version-api' };
};

const mapPlayInfoToUpdate = (info: AppUpdateInfoResult): UpdateInfo => {
  const versionCode = typeof info.availableVersionCode === 'number'
    ? String(info.availableVersionCode)
    : PLAY_STORE_UPDATE_SNOOZE_VERSION;

  return {
    latestVersion: versionCode,
    forceUpdate: false,
    message: 'Une nouvelle version est disponible sur le Google Play Store.',
    source: 'play-core',
  };
};

const mergeAndroidUpdates = (
  playUpdate: UpdateInfo | null,
  apiUpdate: UpdateInfo | null,
): UpdateInfo | null => {
  if (playUpdate && apiUpdate) {
    return {
      latestVersion: apiUpdate.latestVersion,
      forceUpdate: apiUpdate.forceUpdate,
      message: apiUpdate.message,
      source: 'play-core',
    };
  }
  return playUpdate ?? apiUpdate;
};

/** Lance le flux Play (Flexible - permet de continuer à utiliser l'application pendant le téléchargement). */
const startPlayInAppUpdate = async (info: AppUpdateInfoResult): Promise<boolean> => {
  try {
    // Utiliser le flux flexible par défaut (meilleure expérience utilisateur)
    if (info.flexibleUpdateAllowed) {
      const result = await InAppUpdate.startFlexibleUpdate();
      return Boolean(result?.started);
    }

    // Fallback vers immédiat si flexible n'est pas disponible
    if (info.immediateUpdateAllowed) {
      const result = await InAppUpdate.performImmediateUpdate();
      return Boolean(result?.started);
    }
  } catch (error) {
    console.warn('[UpdateChecker] Play in-app update flow failed:', error);
  }

  return false;
};

const applyFlexibleState = (
  event: FlexibleUpdateStateEvent,
  setDownloadProgress: (v: number | null) => void,
  setInstallReady: (v: boolean) => void,
) => {
  if (event.installStatus === 'DOWNLOADING') {
    const progress = typeof event.progress === 'number'
      ? Math.min(1, Math.max(0, event.progress))
      : null;
    setDownloadProgress(progress);
    setInstallReady(false);
    return;
  }

  if (event.installStatus === 'DOWNLOADED') {
    setDownloadProgress(null);
    setInstallReady(true);
    return;
  }

  if (event.installStatus === 'INSTALLED') {
    setDownloadProgress(null);
    setInstallReady(false);
  }
};

export default function useAppUpdateChecker() {
  const [currentVersion, setCurrentVersion] = useState('0.0.0');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const [installReady, setInstallReady] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isCompletingInstall, setIsCompletingInstall] = useState(false);
  const isCheckingRef = useRef(false);
  const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const getSnoozeVersion = useCallback((info: UpdateInfo | null, playDetected: boolean) => {
    if (playDetected || info?.source === 'play-core') {
      return PLAY_STORE_UPDATE_SNOOZE_VERSION;
    }
    return info?.latestVersion ?? PLAY_STORE_UPDATE_SNOOZE_VERSION;
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      console.log('=== UPDATE CHECKER START ===');
      const appVersion = await getCurrentAppVersion();
      console.log('[UpdateChecker] Version actuelle détectée:', appVersion);
      console.error('[UpdateChecker] Version actuelle détectée:', appVersion);
      setCurrentVersion(appVersion);

      if (nativeAndroid) {
        let playInfo: AppUpdateInfoResult | null = null;
        try {
          playInfo = await InAppUpdate.checkResumeState();
          console.log('[UpdateChecker] checkResumeState result:', playInfo);
        } catch (checkResumeError) {
          console.error('[UpdateChecker] checkResumeState failed:', checkResumeError);
          try {
            playInfo = await InAppUpdate.getAppUpdateInfo();
            console.log('[UpdateChecker] getAppUpdateInfo result:', playInfo);
          } catch (getInfoError) {
            console.error('[UpdateChecker] getAppUpdateInfo failed:', getInfoError);
            playInfo = null;
          }
        }

        console.log('[UpdateChecker] playInfo:', playInfo);
        console.log('[UpdateChecker] playInfo.updateAvailability:', playInfo?.updateAvailability);
        console.log('[UpdateChecker] playInfo.availableVersionCode:', playInfo?.availableVersionCode);
        console.log('[UpdateChecker] playInfo.immediateUpdateAllowed:', playInfo?.immediateUpdateAllowed);
        console.log('[UpdateChecker] playInfo.flexibleUpdateAllowed:', playInfo?.flexibleUpdateAllowed);
        console.log('[UpdateChecker] isPlayStoreUpdateAvailable(playInfo):', isPlayStoreUpdateAvailable(playInfo));

        if (playInfo?.installStatus === 'DOWNLOADED') {
          setInstallReady(true);
          setIsOpen(false);
          setUpdateInfo(playInfo ? mapPlayInfoToUpdate(playInfo) : null);
          return;
        }

        // Utiliser le backend API pour les tests en développement (APK de débogage)
        // Le flux in-app Google Play ne fonctionne qu'avec les applications installées depuis le Play Store
        console.log('[UpdateChecker] Calling getVersionApiUpdate with appVersion:', appVersion);
        const apiUpdate = await getVersionApiUpdate(appVersion);
        console.log('[UpdateChecker] API update response:', apiUpdate);
        const playUpdate = playInfo && isPlayStoreUpdateAvailable(playInfo)
          ? mapPlayInfoToUpdate(playInfo)
          : null;
        console.log('[UpdateChecker] Play update:', playUpdate);
        const merged = mergeAndroidUpdates(playUpdate, apiUpdate);
        console.log('[UpdateChecker] Merged update info:', merged);
        console.log('[UpdateChecker] merged is null?', merged === null);
        console.log('[UpdateChecker] merged exists?', !!merged);

        if (!merged) {
          console.log('[UpdateChecker] No update available, closing modal');
          setUpdateInfo(null);
          setIsOpen(false);
          return;
        }

        const snoozeVersion = getSnoozeVersion(merged, Boolean(playUpdate));
        // Désactiver temporairement le snooze pour le développement
        if (!merged.forceUpdate && hasActiveSnooze(snoozeVersion)) {
          console.log('[UpdateChecker] Update snoozed, but ignoring for development');
          setUpdateInfo(null);
          setIsOpen(false);
          return;
        }

        setUpdateInfo(merged);

        // Priorité au flux natif Play Store si disponible (production)
        if (playInfo && isPlayStoreUpdateAvailable(playInfo)) {
          console.log('[UpdateChecker] Starting Play in-app update (Flexible)');

          // Lancement du flux flexible
          const result = await InAppUpdate.startFlexibleUpdate();

          if (result.started) {
            setIsOpen(false);

            // Écoute de la fin du téléchargement pour finaliser l'installation
            InAppUpdate.addListener('flexibleUpdateState', (state) => {
              if (state.installStatus === 'DOWNLOADED') {
                InAppUpdate.completeFlexibleUpdate();
              }
            });
            return;
          }
          console.log('[UpdateChecker] Play in-app update failed, falling back to custom modal');
        }

        // Fallback vers le modal personnalisé pour les tests en développement
        // Désactivé pour éviter les conflits avec le flux Play Store natif
        // if (merged) {
        //   console.log('[UpdateChecker] Showing custom modal for development/testing');
        //   setUpdateInfo(merged);
        //   setIsOpen(true);
        //   return;
        // }

        console.log('[UpdateChecker] No update available, closing modal');
        setIsOpen(false);
        return;
      }

      // Ne pas afficher le popup sur le web ou iOS (uniquement Android natif)
      console.log('[UpdateChecker] Not Android native, skipping update check for web/iOS');
      setUpdateInfo(null);
      setIsOpen(false);
      return;
    } catch (error) {
      console.warn('[UpdateChecker] Impossible de vérifier les mises à jour:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [getSnoozeVersion, nativeAndroid]);

  useEffect(() => {
    let cleanedUp = false;
    let appStateListener: PluginListenerHandle | null = null;
    let flexibleStateListener: PluginListenerHandle | null = null;
    let flexibleCanceledListener: PluginListenerHandle | null = null;

    const runCheck = () => {
      if (cleanedUp) return;
      void checkForUpdate();
    };

    const timeoutId = window.setTimeout(runCheck, 0);

    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return;
        runCheck();
      })
        .then((listener) => {
          if (cleanedUp) {
            void listener.remove();
            return;
          }
          appStateListener = listener;
        })
        .catch(() => {});

      if (nativeAndroid) {
        void InAppUpdate.addListener('flexibleUpdateState', (event) => {
          applyFlexibleState(event, setDownloadProgress, setInstallReady);
        })
          .then((listener) => {
            if (cleanedUp) {
              void listener.remove();
              return;
            }
            flexibleStateListener = listener;
          })
          .catch(() => {});

        void InAppUpdate.addListener('flexibleUpdateCanceled', () => {
          saveSnooze(PLAY_STORE_UPDATE_SNOOZE_VERSION);
          setIsOpen(false);
        })
          .then((listener) => {
            if (cleanedUp) {
              void listener.remove();
              return;
            }
            flexibleCanceledListener = listener;
          })
          .catch(() => {});
      }
    }

    return () => {
      cleanedUp = true;
      window.clearTimeout(timeoutId);
      if (appStateListener) void appStateListener.remove();
      if (flexibleStateListener) void flexibleStateListener.remove();
      if (flexibleCanceledListener) void flexibleCanceledListener.remove();
    };
  }, [checkForUpdate, nativeAndroid]);

  const handleUpdateNow = useCallback(async () => {
    console.log('=== HANDLE UPDATE NOW START ===');
    console.log('[UpdateChecker] handleUpdateNow called');
    setIsOpeningStore(true);

    try {
      const appId = getPlayStoreAppId();
      console.log('[UpdateChecker] Opening Play Store with appId:', appId);
      // Ouvrir directement le Play Store (comportement classique Google Play)
      await openPlayStoreListing(appId);
      console.log('[UpdateChecker] Play Store opened successfully');
      if (!updateInfo?.forceUpdate) {
        console.log('[UpdateChecker] Closing modal (not force update)');
        setIsOpen(false);
      }
    } catch (error) {
      console.error('[UpdateChecker] Erreur ouverture mise à jour:', error);
    } finally {
      console.log('[UpdateChecker] handleUpdateNow finished');
      setIsOpeningStore(false);
    }
  }, [updateInfo?.forceUpdate]);

  const handleLater = useCallback(() => {
    saveSnooze(getSnoozeVersion(updateInfo, updateInfo?.source === 'play-core'));
    setIsOpen(false);
  }, [getSnoozeVersion, updateInfo]);

  const handleCompleteInstall = useCallback(async () => {
    if (!nativeAndroid) return;
    setIsCompletingInstall(true);
    try {
      await InAppUpdate.completeFlexibleUpdate();
      setInstallReady(false);
      setDownloadProgress(null);
    } catch (error) {
      console.error('[UpdateChecker] completeFlexibleUpdate failed:', error);
    } finally {
      setIsCompletingInstall(false);
    }
  }, [nativeAndroid]);

  const dismissInstallSnackbar = useCallback(() => {
    setInstallReady(false);
    setDownloadProgress(null);
  }, []);

  const showInstallSnackbar = nativeAndroid && (installReady || downloadProgress !== null) && updateInfo?.source !== 'play-core';

  return {
    currentVersion,
    updateInfo,
    isOpen,
    isOpeningStore,
    showInstallSnackbar,
    installReady,
    downloadProgress,
    isCompletingInstall,
    checkForUpdate,
    handleUpdateNow,
    handleLater,
    handleCompleteInstall,
    dismissInstallSnackbar,
  };
}
