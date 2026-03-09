package com.validele.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.Nullable;

import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "InAppUpdate";
    private static final int UPDATE_REQUEST_CODE = 100;
    private AppUpdateManager appUpdateManager;
    private InstallStateUpdatedListener installStateUpdatedListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        checkForUpdate();
    }

    private void checkForUpdate() {
        appUpdateManager = AppUpdateManagerFactory.create(this);

        installStateUpdatedListener = state -> {
            if (state.installStatus() == InstallStatus.DOWNLOADED) {
                showRestartDialog();
            }
        };
        appUpdateManager.registerListener(installStateUpdatedListener);

        appUpdateManager.getAppUpdateInfo().addOnSuccessListener(appUpdateInfo -> {
            if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
                int updateType = appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
                    ? AppUpdateType.IMMEDIATE
                    : AppUpdateType.FLEXIBLE;
                try {
                    appUpdateManager.startUpdateFlowForResult(
                        appUpdateInfo,
                        this,
                        AppUpdateOptions.newBuilder(updateType).build(),
                        UPDATE_REQUEST_CODE
                    );
                } catch (Exception e) {
                    Log.e(TAG, "Erreur demarrage mise a jour", e);
                }
            } else if (appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED) {
                showRestartDialog();
            }
        }).addOnFailureListener(e -> Log.w(TAG, "Impossible de verifier les mises a jour", e));
    }

    private void showRestartDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Mise a jour disponible")
            .setMessage("Une nouvelle version est prete. Redemarrez l'application pour l'appliquer.")
            .setPositiveButton("Redemarrer", (dialog, which) -> {
                if (appUpdateManager != null) appUpdateManager.completeUpdate();
            })
            .setNegativeButton("Plus tard", null)
            .setCancelable(false)
            .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == UPDATE_REQUEST_CODE && resultCode != Activity.RESULT_OK) {
            Log.w(TAG, "Mise a jour annulee. Code: " + resultCode);
        }
    }
}
