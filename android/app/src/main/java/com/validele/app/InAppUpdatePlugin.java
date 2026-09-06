package com.validele.app;

import android.app.Activity;
import android.content.Intent;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallException;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "InAppUpdate")
public class InAppUpdatePlugin extends Plugin {
  private static final int REQUEST_CODE_UPDATE = 7412;

  private AppUpdateManager appUpdateManager;
  private InstallStateUpdatedListener installStateListener;
  private boolean installListenerRegistered;
  @Override
  public void load() {
    appUpdateManager = AppUpdateManagerFactory.create(getContext());
    installStateListener = this::onInstallStateUpdated;
  }

  @Override
  public void handleOnResume() {
    resumeFlexibleUpdateIfNeeded();
  }

  @Override
  public void handleOnDestroy() {
    unregisterInstallListener();
    super.handleOnDestroy();
  }

  @PluginMethod
  public void getAppUpdateInfo(PluginCall call) {
    fetchAppUpdateInfo(call, false);
  }

  @PluginMethod
  public void performImmediateUpdate(PluginCall call) {
    startUpdate(call, AppUpdateType.IMMEDIATE);
  }

  @PluginMethod
  public void startFlexibleUpdate(PluginCall call) {
    registerInstallListener();
    startUpdate(call, AppUpdateType.FLEXIBLE);
  }

  @PluginMethod
  public void completeFlexibleUpdate(PluginCall call) {
    if (appUpdateManager == null) {
      appUpdateManager = AppUpdateManagerFactory.create(getContext());
    }

    appUpdateManager
      .completeUpdate()
      .addOnSuccessListener(unused -> call.resolve())
      .addOnFailureListener(error -> call.reject("Unable to complete flexible update", error));
  }

  @PluginMethod
  public void checkResumeState(PluginCall call) {
    fetchAppUpdateInfo(call, true);
  }

  private void fetchAppUpdateInfo(PluginCall call, boolean notifyDownloaded) {
    if (appUpdateManager == null) {
      appUpdateManager = AppUpdateManagerFactory.create(getContext());
    }

    Log.i("UpdateChecker", "fetchAppUpdateInfo called from JavaScript");

    appUpdateManager
      .getAppUpdateInfo()
      .addOnSuccessListener(info -> {
        Log.i("UpdateChecker", "--- PLAY CORE RESULT ---");
        Log.i("UpdateChecker", "playInfo.updateAvailability: " + info.updateAvailability());
        Log.i("UpdateChecker", "playInfo.availableVersionCode: " + info.availableVersionCode());
        Log.i("UpdateChecker", "playInfo.immediateUpdateAllowed: " + info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        Log.i("UpdateChecker", "playInfo.flexibleUpdateAllowed: " + info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
        Log.i("UpdateChecker", "playInfo.installStatus: " + info.installStatus());
        Log.i("UpdateChecker", "playInfo.updatePriority: " + info.updatePriority());
        Log.i("UpdateChecker", "------------------------");

        JSObject result = toJson(info);
        if (notifyDownloaded && info.installStatus() == InstallStatus.DOWNLOADED) {
          emitFlexibleState(info.installStatus(), 0L, 0L);
        }
        call.resolve(result);
      })
      .addOnFailureListener(error -> {
        String errorMessage = getPlayCoreErrorMessage(error);
        Log.e("UpdateChecker", "Play Core getAppUpdateInfo failed: " + errorMessage, error);
        call.reject("Unable to get app update info: " + errorMessage, error);
      });
  }

  private void resumeFlexibleUpdateIfNeeded() {
    if (appUpdateManager == null) {
      return;
    }

    appUpdateManager
      .getAppUpdateInfo()
      .addOnSuccessListener(info -> {
        if (info.installStatus() == InstallStatus.DOWNLOADED) {
          emitFlexibleState(InstallStatus.DOWNLOADED, 0L, 0L);
          return;
        }

        if (
          info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
            && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
        ) {
          registerInstallListener();
          startUpdateFlow(info, AppUpdateType.FLEXIBLE, null);
        }
      });
  }

  private void startUpdate(PluginCall call, int updateType) {
    if (appUpdateManager == null) {
      appUpdateManager = AppUpdateManagerFactory.create(getContext());
    }

    Log.i("UpdateChecker", "startUpdate requested. updateType=" + updateType);

    appUpdateManager
      .getAppUpdateInfo()
      .addOnSuccessListener(info -> {
        boolean available =
          info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
            || info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;

        Log.i("UpdateChecker", "--- START UPDATE CHECK ---");
        Log.i("UpdateChecker", "requestedUpdateType: " + updateType);
        Log.i("UpdateChecker", "updateAvailability: " + info.updateAvailability());
        Log.i("UpdateChecker", "availableVersionCode: " + info.availableVersionCode());
        Log.i("UpdateChecker", "requestedTypeAllowed: " + info.isUpdateTypeAllowed(updateType));
        Log.i("UpdateChecker", "immediateUpdateAllowed: " + info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        Log.i("UpdateChecker", "flexibleUpdateAllowed: " + info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
        Log.i("UpdateChecker", "--------------------------");

        if (!available || !info.isUpdateTypeAllowed(updateType)) {
          JSObject result = toJson(info);
          result.put("started", false);
          Log.i("UpdateChecker", "Play update flow not started. available=" + available + ", allowed=" + info.isUpdateTypeAllowed(updateType));
          call.resolve(result);
          return;
        }

        if (updateType == AppUpdateType.FLEXIBLE) {
          registerInstallListener();
        }

        startUpdateFlow(info, updateType, call);
      })
      .addOnFailureListener(error -> {
        String errorMessage = getPlayCoreErrorMessage(error);
        Log.e("UpdateChecker", "Play Core startUpdate getAppUpdateInfo failed: " + errorMessage, error);
        call.reject("Unable to get app update info: " + errorMessage, error);
      });
  }

  private void startUpdateFlow(AppUpdateInfo info, int updateType, PluginCall call) {
    Activity activity = getActivity();
    if (activity == null) {
      if (call != null) {
        call.reject("Activity is not available");
      }
      return;
    }

    try {
      AppUpdateOptions options = AppUpdateOptions.newBuilder(updateType).build();
      Log.i("UpdateChecker", "Calling startUpdateFlowForResult. updateType=" + updateType);
      appUpdateManager.startUpdateFlowForResult(
        info,
        activity,
        options,
        REQUEST_CODE_UPDATE
      );

      if (call != null) {
        JSObject result = toJson(info);
        result.put("started", true);
        call.resolve(result);
      }
    } catch (Exception error) {
      String errorMessage = getPlayCoreErrorMessage(error);
      Log.e("UpdateChecker", "Unable to start update flow: " + errorMessage, error);
      if (call != null) {
        call.reject("Unable to start update flow: " + errorMessage, error);
      }
    }
  }

  private String getPlayCoreErrorMessage(Exception error) {
    if (error == null) {
      return "Unknown Play Core error";
    }

    String message = error.getMessage();
    if (message == null || message.trim().isEmpty()) {
      message = error.getClass().getSimpleName();
    }

    if (error instanceof InstallException) {
      InstallException installException = (InstallException) error;
      return message + " (InstallException errorCode=" + installException.getErrorCode() + ")";
    }

    return message + " (" + error.getClass().getSimpleName() + ")";
  }

  @Override
  @SuppressWarnings("deprecation")
  protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
    super.handleOnActivityResult(requestCode, resultCode, data);

    if (requestCode != REQUEST_CODE_UPDATE) {
      return;
    }

    JSObject payload = new JSObject();
    payload.put("resultCode", resultCode);

    if (resultCode != Activity.RESULT_OK) {
      notifyListeners("flexibleUpdateCanceled", payload);
    }

  }

  private void onInstallStateUpdated(InstallState state) {
    emitFlexibleState(
      state.installStatus(),
      state.bytesDownloaded(),
      state.totalBytesToDownload()
    );
  }

  private void emitFlexibleState(int installStatus, long bytesDownloaded, long totalBytes) {
    JSObject payload = new JSObject();
    payload.put("installStatus", installStatusToString(installStatus));

    if (installStatus == InstallStatus.DOWNLOADING) {
      payload.put("bytesDownloaded", bytesDownloaded);
      payload.put("totalBytesToDownload", totalBytes);
      if (totalBytes > 0) {
        payload.put("progress", (double) bytesDownloaded / (double) totalBytes);
      }
    }

    notifyListeners("flexibleUpdateState", payload);
  }

  private void registerInstallListener() {
    if (appUpdateManager == null || installListenerRegistered || installStateListener == null) {
      return;
    }
    appUpdateManager.registerListener(installStateListener);
    installListenerRegistered = true;
  }

  private void unregisterInstallListener() {
    if (appUpdateManager == null || !installListenerRegistered || installStateListener == null) {
      return;
    }
    appUpdateManager.unregisterListener(installStateListener);
    installListenerRegistered = false;
  }

  private JSObject toJson(AppUpdateInfo info) {
    JSObject result = new JSObject();
    result.put("updateAvailability", availabilityToString(info.updateAvailability()));
    result.put("installStatus", installStatusToString(info.installStatus()));
    result.put("availableVersionCode", info.availableVersionCode());
    result.put("updatePriority", info.updatePriority());
    if (info.clientVersionStalenessDays() != null) {
      result.put("clientVersionStalenessDays", info.clientVersionStalenessDays());
    }
    result.put("immediateUpdateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
    result.put("flexibleUpdateAllowed", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
    return result;
  }

  private String availabilityToString(int availability) {
    switch (availability) {
      case UpdateAvailability.UPDATE_AVAILABLE:
        return "UPDATE_AVAILABLE";
      case UpdateAvailability.UPDATE_NOT_AVAILABLE:
        return "UPDATE_NOT_AVAILABLE";
      case UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS:
        return "DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS";
      case UpdateAvailability.UNKNOWN:
      default:
        return "UNKNOWN";
    }
  }

  private String installStatusToString(int status) {
    switch (status) {
      case InstallStatus.DOWNLOADED:
        return "DOWNLOADED";
      case InstallStatus.DOWNLOADING:
        return "DOWNLOADING";
      case InstallStatus.FAILED:
        return "FAILED";
      case InstallStatus.INSTALLED:
        return "INSTALLED";
      case InstallStatus.INSTALLING:
        return "INSTALLING";
      case InstallStatus.PENDING:
        return "PENDING";
      case InstallStatus.CANCELED:
        return "CANCELED";
      case InstallStatus.REQUIRES_UI_INTENT:
        return "REQUIRES_UI_INTENT";
      case InstallStatus.UNKNOWN:
      default:
        return "UNKNOWN";
    }
  }
}
