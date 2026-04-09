package com.validele.app;

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

	private AppUpdateManager appUpdateManager;
	private boolean storeFallbackOpened;

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
		boolean immediateAllowed = appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);
		boolean flexibleAllowed = appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE);

		Log.i(TAG, "Update info | availability=" + availability
				+ " | installStatus=" + appUpdateInfo.installStatus()
				+ " | immediateAllowed=" + immediateAllowed
				+ " | flexibleAllowed=" + flexibleAllowed);

		if (availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
			startImmediateUpdate(appUpdateInfo);
			return;
		}

		if (availability != UpdateAvailability.UPDATE_AVAILABLE) {
			return;
		}

		if (immediateAllowed) {
			startImmediateUpdate(appUpdateInfo);
			return;
		}

		if (flexibleAllowed) {
			startFlexibleUpdate(appUpdateInfo);
			return;
		}

		Log.w(TAG, "Update available but neither IMMEDIATE nor FLEXIBLE is allowed. Opening Play Store fallback.");
		openPlayStoreFallback();
	}

	private void startImmediateUpdate(AppUpdateInfo appUpdateInfo) {
		try {
			appUpdateManager.startUpdateFlowForResult(
					appUpdateInfo,
					AppUpdateType.IMMEDIATE,
					this,
					APP_UPDATE_REQUEST_CODE
			);
		} catch (IntentSender.SendIntentException error) {
			Log.e(TAG, "Failed to start in-app immediate update flow", error);
			openPlayStoreFallback();
		}
	}

	private void startFlexibleUpdate(AppUpdateInfo appUpdateInfo) {
		try {
			appUpdateManager.startUpdateFlowForResult(
					appUpdateInfo,
					AppUpdateType.FLEXIBLE,
					this,
					APP_UPDATE_REQUEST_CODE
			);
		} catch (IntentSender.SendIntentException error) {
			Log.e(TAG, "Failed to start in-app flexible update flow", error);
			openPlayStoreFallback();
		}
	}

	private void openPlayStoreFallback() {
		if (storeFallbackOpened) {
			return;
		}

		storeFallbackOpened = true;
		String packageName = getPackageName();

		try {
			Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageName));
			marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
			startActivity(marketIntent);
		} catch (ActivityNotFoundException error) {
			Log.w(TAG, "Play Store app not found, opening web fallback", error);
			Intent webIntent = new Intent(
					Intent.ACTION_VIEW,
					Uri.parse("https://play.google.com/store/apps/details?id=" + packageName)
			);
			webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
			startActivity(webIntent);
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
			openPlayStoreFallback();
		}
	}
}
