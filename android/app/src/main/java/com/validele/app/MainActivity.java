package com.validele.app;

import android.os.Bundle;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {

	private AppUpdateManager appUpdateManager;
	private ActivityResultLauncher<IntentSenderRequest> updateLauncher;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		disableAppHapticFeedback();

		appUpdateManager = AppUpdateManagerFactory.create(this);
		updateLauncher = registerForActivityResult(
				new ActivityResultContracts.StartIntentSenderForResult(),
				result -> {
					// No-op: onResume re-checks and resumes if update is still pending/in-progress.
				}
		);

		checkForInAppUpdate();
	}

	@Override
	public void onResume() {
		super.onResume();
		disableAppHapticFeedback();
		checkForInAppUpdate();
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

	private void checkForInAppUpdate() {
		if (appUpdateManager == null) {
			return;
		}

		appUpdateManager
				.getAppUpdateInfo()
				.addOnSuccessListener(this::startImmediateUpdateIfNeeded)
				.addOnFailureListener(error -> {
					// Silent failure: app remains usable if Play update API is unavailable.
				});
	}

	private void startImmediateUpdateIfNeeded(AppUpdateInfo appUpdateInfo) {
		if (appUpdateInfo == null) {
			return;
		}

		boolean isUpdateAvailable =
				appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
						&& appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);

		boolean isInProgress =
				appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
						|| appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED
						|| appUpdateInfo.installStatus() == InstallStatus.DOWNLOADING;

		if (!isUpdateAvailable && !isInProgress) {
			return;
		}

		try {
			appUpdateManager.startUpdateFlowForResult(
					appUpdateInfo,
					updateLauncher,
					AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE)
			);
		} catch (Exception ignored) {
			// Ignore: fallback is no forced update popup from native layer.
		}
	}
}
