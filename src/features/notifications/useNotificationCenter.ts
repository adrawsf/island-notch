import { useEffect, useRef } from "react";
import { onToastAdded, showToast } from "../../core/toast/toastQueue";
import { useSettings } from "../../core/settings/useSettings";
import { useDndController } from "./dnd";
import {
  configureNotifications,
  notificationIcon,
  onNewNotifications,
  openNotificationApp,
  recordNotchToast,
} from "./notifBridge";

/**
 * Runs the notification center in the notch window: starts reading Windows
 * notifications, pops new ones up as notch toasts, and keeps a history of
 * the notch's own toasts.
 */
export function useNotificationCenter() {
  const settings = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => configureNotifications(settings.windowsNotifications), [settings.windowsNotifications]);

  // Do not disturb (the notch's own, or Windows'): no toasts in the notch.
  useDndController();

  useEffect(
    () =>
      onToastAdded((toast) => {
        if (toast.source !== "windows") recordNotchToast(toast.title, toast.body);
      }),
    [],
  );

  useEffect(
    () =>
      onNewNotifications(async (items) => {
        const { notificationToasts, notificationMutedApps } = settingsRef.current;
        if (!notificationToasts) return;
        for (const n of items) {
          if (notificationMutedApps.some((m) => m.id === n.appId)) continue;
          const icon = (await notificationIcon(n.appId)) ?? undefined;
          showToast({
            title: n.title || n.appName,
            body: n.body || (n.title ? n.appName : undefined),
            icon,
            onClick: () => void openNotificationApp(n.appId),
            source: "windows",
            durationMs: 5000,
          });
        }
      }),
    [],
  );
}
