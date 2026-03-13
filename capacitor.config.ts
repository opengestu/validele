import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.validele.app',
  appName: 'Validèl',
  webDir: 'dist',
  android: {
    backgroundColor: '#f7fafa',
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#f7fafa',
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
