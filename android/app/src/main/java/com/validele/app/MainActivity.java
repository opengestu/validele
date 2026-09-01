package com.validele.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		registerPlugin(PartialPlayStorePlugin.class);
		registerPlugin(InAppUpdatePlugin.class);
		super.onCreate(savedInstanceState);
		WebView.setWebContentsDebuggingEnabled(true);
		disableAppHapticFeedback();
	}

	@Override
	public void onResume() {
		super.onResume();
		disableAppHapticFeedback();
	}

	private void disableAppHapticFeedback() {
		try {
			getWindow().getDecorView().setHapticFeedbackEnabled(false);
			if (getBridge() != null && getBridge().getWebView() != null) {
				getBridge().getWebView().setHapticFeedbackEnabled(false);
			}
		} catch (Exception ignored) {
			// Ignore: haptic feedback is best-effort and should never block startup.
		}
	}
}
