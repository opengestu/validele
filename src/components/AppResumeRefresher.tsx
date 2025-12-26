import React from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

const PENDING_KEY = "validele:resume_pending_since";
const DONE_KEY = "validele:resume_reload_done_at";

// If the app was backgrounded at least this long, reload on resume.
const MIN_BACKGROUND_MS = 3000;

export default function AppResumeRefresher() {
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const sub = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      try {
        if (!isActive) {
          sessionStorage.setItem(PENDING_KEY, String(Date.now()));
          sessionStorage.removeItem(DONE_KEY);
          return;
        }

        const pendingSinceRaw = sessionStorage.getItem(PENDING_KEY);
        if (!pendingSinceRaw) return;

        const pendingSince = Number(pendingSinceRaw);
        if (!Number.isFinite(pendingSince)) {
          sessionStorage.removeItem(PENDING_KEY);
          return;
        }

        const elapsed = Date.now() - pendingSince;
        if (elapsed < MIN_BACKGROUND_MS) return;

        // Prevent loops: only reload once per background->foreground cycle.
        if (sessionStorage.getItem(DONE_KEY)) return;
        sessionStorage.setItem(DONE_KEY, String(Date.now()));
        sessionStorage.removeItem(PENDING_KEY);

        window.location.reload();
      } catch {
        // If anything goes wrong, do nothing (avoid trapping the user).
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  return null;
}
