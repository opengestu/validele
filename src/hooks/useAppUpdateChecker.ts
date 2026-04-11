import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { apiUrl } from '@/lib/api';

type VersionApiResponse = {
  latestVersion: string;
  forceUpdate: boolean;
  message: string;
};

type UpdateInfo = {
  latestVersion: string;
  forceUpdate: boolean;
  message: string;
};

type SnoozeRecord = {
  version: string;
  expiresAt: number;
};

const SNOOZE_KEY = 'app_update_snooze_v1';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLAY_STORE_APP_ID = 'com.validele.app';

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

export default function useAppUpdateChecker() {
  const [currentVersion, setCurrentVersion] = useState('0.0.0');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const isCheckingRef = useRef(false);
  const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const checkForUpdate = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const appVersion = await getCurrentAppVersion();
      setCurrentVersion(appVersion);

      const versionEndpointCandidates = ['/api/version', '/version'];
      let json: Partial<VersionApiResponse> | null = null;

      for (const endpoint of versionEndpointCandidates) {
        const response = await fetch(apiUrl(endpoint), {
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

      if (!json) return;

      const latestVersion = typeof json.latestVersion === 'string' ? normalizeVersion(json.latestVersion) : '';

      const forceUpdate = Boolean(json.forceUpdate);
      const message = typeof json.message === 'string' && json.message.trim().length > 0
        ? json.message.trim()
        : 'Une nouvelle version est disponible avec des améliorations importantes.';

      if (!latestVersion) {
        if (forceUpdate) {
          // Emergency path: let backend force update even if latestVersion is misconfigured.
          setUpdateInfo({ latestVersion: appVersion, forceUpdate: true, message });
          setIsOpen(true);
        }
        console.warn('[UpdateChecker] latestVersion manquant depuis /api/version');
        return;
      }

      if (compareVersions(appVersion, latestVersion) < 0) {
        // Emergency behavior: on Android, always re-show update prompt until user updates.
        if (!nativeAndroid && !forceUpdate && hasActiveSnooze(latestVersion)) return;

        setUpdateInfo({ latestVersion, forceUpdate, message });
        setIsOpen(true);
      }
    } catch (error) {
      console.warn('[UpdateChecker] Impossible de vérifier les mises à jour:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [nativeAndroid]);

  useEffect(() => {
    let cleanedUp = false;
    let appStateListener: PluginListenerHandle | null = null;

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
        .catch(() => {
          // Ignore listener registration errors.
        });
    }

    return () => {
      cleanedUp = true;
      window.clearTimeout(timeoutId);
      if (appStateListener) {
        void appStateListener.remove();
      }
    };
  }, [checkForUpdate]);

  const handleUpdateNow = useCallback(async () => {
    const appId = getPlayStoreAppId();
    const marketUrl = `market://details?id=${encodeURIComponent(appId)}`;
    const webUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`;
    setIsOpeningStore(true);

    try {
      if (Capacitor.isNativePlatform()) {
        if (nativeAndroid) {
          const appAny = CapacitorApp as unknown as { openUrl?: (options: { url: string }) => Promise<void> };
          if (typeof appAny.openUrl === 'function') {
            try {
              await appAny.openUrl({ url: marketUrl });
            } catch {
              await appAny.openUrl({ url: webUrl });
            }
          } else {
            await Browser.open({ url: webUrl });
          }
        } else {
          await Browser.open({ url: webUrl });
        }
      } else {
        window.open(webUrl, '_blank', 'noopener,noreferrer');
      }

      if (!updateInfo?.forceUpdate) {
        setIsOpen(false);
      }
    } catch (error) {
      console.error('[UpdateChecker] Erreur ouverture Play Store:', error);
      try {
        if (Capacitor.isNativePlatform()) {
          window.location.href = nativeAndroid ? marketUrl : webUrl;
        } else {
          window.open(webUrl, '_blank', 'noopener,noreferrer');
        }
      } catch {
        // Ignore final fallback error.
      }
    } finally {
      setIsOpeningStore(false);
    }
  }, [nativeAndroid, updateInfo?.forceUpdate]);

  const handleLater = useCallback(() => {
    if (!updateInfo || updateInfo.forceUpdate) return;
    saveSnooze(updateInfo.latestVersion);
    setIsOpen(false);
  }, [updateInfo]);

  return {
    currentVersion,
    updateInfo,
    isOpen,
    isOpeningStore,
    checkForUpdate,
    handleUpdateNow,
    handleLater,
  };
}
