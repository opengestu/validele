package com.validele.app;

import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;
import android.util.Log;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	private static final String TAG = "MainActivity";
	private static final int APP_UPDATE_REQUEST_CODE = 1571;

	private AppUpdateManager appUpdateManager;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		appUpdateManager = AppUpdateManagerFactory.create(this);
		checkForImmediateUpdate();
	}

	private void checkForImmediateUpdate() {
		if (appUpdateManager == null) {
			return;
		}

		appUpdateManager.getAppUpdateInfo().addOnSuccessListener(this::handleUpdateInfo);
	}

	private void handleUpdateInfo(AppUpdateInfo appUpdateInfo) {
		if (appUpdateInfo == null) {
			return;
		}

		boolean updateAvailable = appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
				&& appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);
		boolean updateInProgress = appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;

		if (updateAvailable || updateInProgress) {
			startImmediateUpdate(appUpdateInfo);
		}
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
			Log.e(TAG, "Failed to start in-app update flow", error);
		}
	}

	@Override
	public void onResume() {
		super.onResume();
		checkForImmediateUpdate();
	}

	@Override
	public void onActivityResult(int requestCode, int resultCode, Intent data) {
		super.onActivityResult(requestCode, resultCode, data);

		if (requestCode == APP_UPDATE_REQUEST_CODE && resultCode != RESULT_OK) {
			Log.w(TAG, "In-app update canceled or failed with code: " + resultCode);
		}
	}
}
