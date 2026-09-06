package com.validele.app;

import android.content.Intent;
import android.net.Uri;

import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PartialPlayStore")
public class PartialPlayStorePlugin extends Plugin {

  @PluginMethod
  public void openStore(PluginCall call) {
    String appId = call.getString("appId", "com.validele.app").trim();
    if (appId.isEmpty()) {
      appId = "com.validele.app";
    }

    if (getActivity() == null) {
      call.reject("Activity is not available");
      return;
    }

    String marketUrl = "market://details?id=" + appId;
    String webUrl = "https://play.google.com/store/apps/details?id=" + appId;

    try {
      Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(marketUrl));
      marketIntent.setPackage("com.android.vending");
      marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getActivity().startActivity(marketIntent);
      call.resolve();
      return;
    } catch (Exception ignored) {
      // Fall back to https URL below.
    }

    try {
      Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
      webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getActivity().startActivity(webIntent);
      call.resolve();
    } catch (Exception error) {
      call.reject("Unable to open Play Store", error);
    }
  }

  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url", "").trim();
    double heightRatio = call.getDouble("heightRatio", 0.5);

    if (url.isEmpty()) {
      call.reject("URL is required");
      return;
    }

    double clampedRatio = Math.max(0.3, Math.min(0.9, heightRatio));

    // Fix : getContext().getResources() au lieu de getResources()
    int heightPx = (int) Math.round(
      getContext().getResources().getDisplayMetrics().heightPixels * clampedRatio
    );
    int radiusPx = Math.round(
      24 * getContext().getResources().getDisplayMetrics().density
    );

    CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
    builder.setShowTitle(true);
    builder.setInitialActivityHeightPx(heightPx);
    try {
      builder.getClass()
        .getMethod("setToolbarCornerRadius", int.class)
        .invoke(builder, radiusPx);
    } catch (Exception ignored) {
      // Older androidx.browser versions do not expose rounded partial custom tabs.
    }

    if (getActivity() == null) {
      call.reject("Activity is not available");
      return;
    }

    CustomTabsIntent intent = builder.build();
    intent.launchUrl(getActivity(), Uri.parse(url));

    call.resolve();
  }
}
