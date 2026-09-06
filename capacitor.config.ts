import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.validele.app',
  appName: 'Validèl',
  webDir: 'dist',
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
      launchSplashStyle: 'dark',
      androidSplashResourceName: 'splash',
      androidSplashFit: 'CENTER',
      androidSplashImmersive: false,
      useSplashScreen: false
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#dcdedc',
      overlaysWebView: false
    },
    PartialPlayStore: {
      appId: 'com.validele.app'
    }
  }
};

export default config;
