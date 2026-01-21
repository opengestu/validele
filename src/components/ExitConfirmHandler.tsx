/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Dialog } from "@capacitor/dialog";

export default function ExitConfirmHandler() {
  const navigate = useNavigate();
  const dialogOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: any;
    CapacitorApp.addListener(
      "backButton",
      async ({ canGoBack }) => {
        if (dialogOpenRef.current) return;

        if (canGoBack) {
          navigate(-1);
          return;
        }

        dialogOpenRef.current = true;
        try {
          const { value } = await Dialog.confirm({
            title: "Quitter l’application",
            message: "Êtes-vous sûr de vouloir quitter l'application ?",
            okButtonTitle: "Oui",
            cancelButtonTitle: "Non",
          });

          if (value) {
            CapacitorApp.exitApp();
          }
        } finally {
          dialogOpenRef.current = false;
        }
      }
    ).then((h: any) => { listenerHandle = h; }).catch(() => {});

    return () => {
      listenerHandle?.remove?.();
    }; 
  }, [navigate]);

  return null;
}
