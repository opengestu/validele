import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.validele.app',
  appName: 'Validèl',
  webDir: 'dist',
  android: {
    backgroundColor: '#22c55e',
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#22c55e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#dcdedc',
      overlaysWebView: false
    }
  }
};

export default config;
