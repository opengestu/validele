import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor, registerPlugin } from '@capacitor/core';

type PartialPlayStorePlugin = {
  openStore: (options: { appId: string }) => Promise<void>;
  open: (options: { url: string; heightRatio?: number }) => Promise<void>;
};

const PartialPlayStore = registerPlugin<PartialPlayStorePlugin>('PartialPlayStore');

export async function openPlayStoreListing(appId: string): Promise<void> {
  console.log('=== OPEN PLAY STORE LISTING START ===');
  console.log('[PlayStore] appId:', appId);
  const webUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`;
  const marketUrl = `market://details?id=${encodeURIComponent(appId)}`;
  console.log('[PlayStore] webUrl:', webUrl);
  console.log('[PlayStore] marketUrl:', marketUrl);

  if (!Capacitor.isNativePlatform()) {
    console.log('[PlayStore] Not native platform, using window.open');
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  if (Capacitor.getPlatform() === 'android') {
    console.log('[PlayStore] Android platform detected');
    // Try market:// URL first using AppLauncher (opens Play Store app directly)
    try {
      console.log('[PlayStore] Trying market:// URL with AppLauncher');
      await AppLauncher.openUrl({ url: marketUrl });
      console.log('[PlayStore] Market URL opened successfully with AppLauncher');
      return;
    } catch (error) {
      console.warn('[PlayStore] AppLauncher market URL failed:', error);
    }

    // Fallback to web URL
    try {
      console.log('[PlayStore] Trying web URL with Browser');
      await Browser.open({ url: webUrl });
      console.log('[PlayStore] Web URL opened successfully');
      return;
    } catch (error) {
      console.warn('[PlayStore] Browser.open failed:', error);
    }

    // Last resort: try custom plugin
    try {
      console.log('[PlayStore] Trying PartialPlayStore plugin');
      await PartialPlayStore.openStore({ appId });
      console.log('[PlayStore] PartialPlayStore opened successfully');
      return;
    } catch (error) {
      console.warn('[PlayStore] PartialPlayStore.openStore failed:', error);
    }

    // Final fallback: direct window location
    console.log('[PlayStore] Using window.location.assign as final fallback');
    window.location.assign(webUrl);
    return;
  }

  // iOS fallback
  try {
    console.log('[PlayStore] iOS platform detected');
    await Browser.open({ url: webUrl });
  } catch (error) {
    console.warn('[PlayStore] Browser.open failed:', error);
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  }
}
