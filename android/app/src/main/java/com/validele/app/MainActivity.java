package com.validele.app;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	private static final String TAG = "MainActivity";
	private static final int APP_UPDATE_REQUEST_CODE = 1571;
	private static final String STORE_FALLBACK_TITLE = "Mise a jour disponible";
	private static final String STORE_FALLBACK_MESSAGE = "Une nouvelle version de l'application est disponible. Veuillez mettre a jour depuis Google Play.";

	private AppUpdateManager appUpdateManager;
	private boolean isStoreFallbackDialogVisible = false;
	private final InstallStateUpdatedListener installStateUpdatedListener = state -> {
		if (state.installStatus() == InstallStatus.DOWNLOADED && appUpdateManager != null) {
			Log.i(TAG, "Flexible update downloaded, completing update now");
			appUpdateManager.completeUpdate();
		}
	};

	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		appUpdateManager = AppUpdateManagerFactory.create(this);
		appUpdateManager.registerListener(installStateUpdatedListener);
		checkForInAppUpdate();
	}

	private void checkForInAppUpdate() {
		if (appUpdateManager == null) {
			return;
		}

		appUpdateManager.getAppUpdateInfo().addOnSuccessListener(this::handleUpdateInfo);
	}

	private void handleUpdateInfo(AppUpdateInfo appUpdateInfo) {
		if (appUpdateInfo == null) {
			return;
		}

		int availability = appUpdateInfo.updateAvailability();
		Integer stalenessDays = appUpdateInfo.clientVersionStalenessDays();
		int priority = appUpdateInfo.updatePriority();
		Log.i(TAG, "Update info availability=" + availability + ", priority=" + priority + ", stalenessDays=" + stalenessDays);

		if (availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
			startImmediateUpdate(appUpdateInfo);
			return;
		}

		if (availability != UpdateAvailability.UPDATE_AVAILABLE) {
			return;
		}

		if (appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
			startImmediateUpdate(appUpdateInfo);
			return;
		}

		if (appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
			startFlexibleUpdate(appUpdateInfo);
			return;
		}

		Log.w(TAG, "Update available but neither IMMEDIATE nor FLEXIBLE is allowed");
		showStoreUpdateFallbackDialog(STORE_FALLBACK_MESSAGE);
	}

	private void startImmediateUpdate(AppUpdateInfo appUpdateInfo) {
		try {
			boolean started = appUpdateManager.startUpdateFlowForResult(
					appUpdateInfo,
					AppUpdateType.IMMEDIATE,
					this,
					APP_UPDATE_REQUEST_CODE
			);
			if (!started) {
				Log.w(TAG, "Play Core immediate flow did not start, opening fallback dialog");
				showStoreUpdateFallbackDialog(STORE_FALLBACK_MESSAGE);
			}
		} catch (IntentSender.SendIntentException error) {
			Log.e(TAG, "Failed to start in-app update flow", error);
			showStoreUpdateFallbackDialog(STORE_FALLBACK_MESSAGE);
		}
	}

	private void startFlexibleUpdate(AppUpdateInfo appUpdateInfo) {
		try {
			boolean started = appUpdateManager.startUpdateFlowForResult(
					appUpdateInfo,
					AppUpdateType.FLEXIBLE,
					this,
					APP_UPDATE_REQUEST_CODE
			);
			if (!started) {
				Log.w(TAG, "Play Core flexible flow did not start, opening fallback dialog");
				showStoreUpdateFallbackDialog(STORE_FALLBACK_MESSAGE);
			}
		} catch (IntentSender.SendIntentException error) {
			Log.e(TAG, "Failed to start flexible in-app update flow", error);
			showStoreUpdateFallbackDialog(STORE_FALLBACK_MESSAGE);
		}
	}

	private void showStoreUpdateFallbackDialog(String message) {
		if (isFinishing() || isDestroyed()) {
			return;
		}

		runOnUiThread(() -> {
			if (isFinishing() || isDestroyed() || isStoreFallbackDialogVisible) {
				return;
			}

			isStoreFallbackDialogVisible = true;
			new AlertDialog.Builder(this)
					.setTitle(STORE_FALLBACK_TITLE)
					.setMessage(message)
					.setCancelable(true)
					.setPositiveButton("Mettre a jour", (dialog, which) -> {
						isStoreFallbackDialogVisible = false;
						openPlayStoreListing();
					})
					.setNegativeButton("Plus tard", (dialog, which) -> {
						isStoreFallbackDialogVisible = false;
						dialog.dismiss();
					})
					.setOnDismissListener(dialog -> isStoreFallbackDialogVisible = false)
					.show();
		});
	}

	private void openPlayStoreListing() {
		String packageName = getPackageName();
		String marketUrl = "market://details?id=" + packageName;
		String webUrl = "https://play.google.com/store/apps/details?id=" + packageName;

		try {
			Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(marketUrl));
			marketIntent.setPackage("com.android.vending");
			marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
			startActivity(marketIntent);
			return;
		} catch (ActivityNotFoundException error) {
			Log.w(TAG, "Play Store app not found, falling back to web listing", error);
		} catch (Exception error) {
			Log.w(TAG, "Unable to open Play Store app, trying web listing", error);
		}

		try {
			Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
			webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
			startActivity(webIntent);
		} catch (Exception error) {
			Log.e(TAG, "Failed to open Play Store listing", error);
		}
	}

	@Override
	public void onResume() {
		super.onResume();
		checkForInAppUpdate();

		if (appUpdateManager == null) {
			return;
		}

		appUpdateManager.getAppUpdateInfo().addOnSuccessListener(appUpdateInfo -> {
			if (appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED) {
				appUpdateManager.completeUpdate();
			}
		});
	}

	@Override
	public void onDestroy() {
		if (appUpdateManager != null) {
			appUpdateManager.unregisterListener(installStateUpdatedListener);
		}
		super.onDestroy();
	}

	@Override
	public void onActivityResult(int requestCode, int resultCode, Intent data) {
		super.onActivityResult(requestCode, resultCode, data);

		if (requestCode == APP_UPDATE_REQUEST_CODE && resultCode != RESULT_OK) {
			Log.w(TAG, "In-app update canceled or failed with code: " + resultCode);
			showStoreUpdateFallbackDialog(STORE_FALLBACK_MESSAGE);
		}
	}
}
