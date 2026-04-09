import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
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

const getPlayStoreUrl = () => {
  const envAppId = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_PLAY_STORE_APP_ID;
  const appId = typeof envAppId === 'string' && envAppId.trim().length > 0
    ? envAppId.trim()
    : DEFAULT_PLAY_STORE_APP_ID;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`;
};

export default function useAppUpdateChecker() {
  const [currentVersion, setCurrentVersion] = useState('0.0.0');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isOpeningStore, setIsOpeningStore] = useState(false);

  const checkForUpdate = useCallback(async () => {
    try {
      const appVersion = await getCurrentAppVersion();
      setCurrentVersion(appVersion);

      const response = await fetch(apiUrl('/api/version'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return;

      const json = (await response.json().catch(() => null)) as Partial<VersionApiResponse> | null;
      if (!json || typeof json.latestVersion !== 'string') return;

      const latestVersion = normalizeVersion(json.latestVersion);
      if (!latestVersion) return;

      const forceUpdate = Boolean(json.forceUpdate);
      const message = typeof json.message === 'string' && json.message.trim().length > 0
        ? json.message.trim()
        : 'Une nouvelle version est disponible avec des améliorations importantes.';

      if (compareVersions(appVersion, latestVersion) < 0) {
        if (!forceUpdate && hasActiveSnooze(latestVersion)) return;

        setUpdateInfo({ latestVersion, forceUpdate, message });
        setIsOpen(true);
      }
    } catch (error) {
      console.warn('[UpdateChecker] Impossible de vérifier les mises à jour:', error);
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  const handleUpdateNow = useCallback(async () => {
    const url = getPlayStoreUrl();
    setIsOpeningStore(true);

    try {
      if (Capacitor.isNativePlatform()) {
        const appAny = CapacitorApp as unknown as { openUrl?: (options: { url: string }) => Promise<void> };

        if (typeof appAny.openUrl === 'function') {
          await appAny.openUrl({ url });
        } else {
          await Browser.open({ url });
        }
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }

      if (!updateInfo?.forceUpdate) {
        setIsOpen(false);
      }
    } catch (error) {
      console.error('[UpdateChecker] Erreur ouverture Play Store:', error);
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        // Ignore final fallback error.
      }
    } finally {
      setIsOpeningStore(false);
    }
  }, [updateInfo?.forceUpdate]);

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
