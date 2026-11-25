import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

const DEFAULT_NOTIFICATION_ICON = '/pwa-192x192.png';
const DEFAULT_NOTIFICATION_BADGE = '/badge-96x96.png';
const PUSH_PREF_STORAGE_KEY = 'khelgalli_push_notifications';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

interface AndroidBridgeWindow extends Window {
  AndroidInterface?: {
    requestNotificationPermission?: () => void;
    showNotification?: (title: string, body: string, payloadJson?: string) => void;
  };
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      PushNotifications?: {
        requestPermissions?: () => Promise<{ receive?: string }>;
        register?: () => Promise<void>;
      };
      LocalNotifications?: {
        requestPermissions?: () => Promise<{ display?: string }>;
        schedule?: (options: unknown) => Promise<void>;
      };
    };
  };
}

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isAndroidAppMode(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as AndroidBridgeWindow;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isTwaReferrer = document.referrer?.startsWith('android-app://');
  const isCapacitorNative = Boolean(win.Capacitor?.isNativePlatform?.());
  const isWebViewBridge = Boolean(win.AndroidInterface || win.ReactNativeWebView);
  return isStandalone || isTwaReferrer || isCapacitorNative || isWebViewBridge;
}

export function arePushNotificationsLocallyEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(PUSH_PREF_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export async function setPushNotificationsPreference(enabled: boolean, userId?: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PUSH_PREF_STORAGE_KEY, String(enabled));
    } catch {}
  }

  if (userId) {
    const permGranted = getNotificationPermissionState() === 'granted';
    await updateDoc(doc(db, 'users', userId), {
      notificationsEnabled: enabled,
      fcmEnabled: enabled && permGranted
    }).catch(() => {});
  }
}

// Register Service Worker for Android TWA / Mobile PWA Notifications
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      return existing;
    }

    const swUrl = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js';
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: '/'
    });
    return registration;
  } catch (err) {
    console.warn('Service Worker registration notice:', err);
    return null;
  }
}

// Request Notification Permission (Web / PWA / Capacitor / Android WebView) & Sync with Firestore
export async function requestMobileNotificationPermission(userId?: string): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined') return 'unsupported';
  const win = window as AndroidBridgeWindow;

  // 1. Trigger Native Android WebView bridge if present
  try {
    win.AndroidInterface?.requestNotificationPermission?.();
    win.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'REQUEST_NOTIFICATION_PERMISSION' })
    );
  } catch {}

  // 2. Trigger Capacitor Native Push / Local Notifications if bundled via `npx cap add android`
  try {
    if (win.Capacitor?.isNativePlatform?.()) {
      const capPush = win.Capacitor.Plugins?.PushNotifications;
      const capLocal = win.Capacitor.Plugins?.LocalNotifications;
      let granted = false;

      if (capPush?.requestPermissions) {
        const res = await capPush.requestPermissions();
        if (res?.receive === 'granted') {
          granted = true;
          await capPush.register?.();
        }
      }
      if (capLocal?.requestPermissions) {
        const localRes = await capLocal.requestPermissions();
        if (localRes?.display === 'granted') {
          granted = true;
        }
      }

      if (granted) {
        await setPushNotificationsPreference(true, userId);
        return 'granted';
      }
    }
  } catch (capErr) {
    console.warn('Capacitor permission check notice:', capErr);
  }

  // 3. Web / Chrome Android / TWA Notification API
  if (!('Notification' in window)) {
    console.warn('Notifications are not supported on this browser/device.');
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      await registerNotificationServiceWorker();
      await setPushNotificationsPreference(true, userId);

      triggerMobileStatusBarNotification(
        'AP Tournament • Alerts Active!',
        'You will now receive instant Room ID, Password, and Match alerts directly in your phone status bar.',
        { tag: 'welcome-notification' }
      );
    } else if (permission === 'denied' && userId) {
      await updateDoc(doc(db, 'users', userId), {
        fcmEnabled: false
      }).catch(() => {});
    }

    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

export interface MobileNotificationOptions {
  tag?: string;
  targetMatchId?: string;
  actionPage?: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, unknown>;
}

// Trigger Native Mobile Status Bar & Lock Screen Notification
export async function triggerMobileStatusBarNotification(
  title: string,
  body: string,
  options: MobileNotificationOptions = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!arePushNotificationsLocallyEnabled()) {
    return;
  }

  const notifTitle = title?.trim() ? title : 'AP Tournament';
  const notifIcon = options.icon || DEFAULT_NOTIFICATION_ICON;
  const notifBadge = options.badge || DEFAULT_NOTIFICATION_BADGE;

  const notifData = {
    url: window.location.origin,
    targetMatchId: options.targetMatchId,
    actionPage: options.actionPage,
    ...(options.data || {})
  };

  const win = window as AndroidBridgeWindow;

  // Native WebView Android bridge forwarding (if wrapped in custom WebView APK)
  try {
    if (win.AndroidInterface?.showNotification) {
      win.AndroidInterface.showNotification(notifTitle, body, JSON.stringify({ ...notifData, image: options.image }));
    }
    if (win.ReactNativeWebView?.postMessage) {
      win.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'SHOW_NOTIFICATION',
          title: notifTitle,
          body,
          image: options.image,
          data: notifData
        })
      );
    }
  } catch {}

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = (await registerNotificationServiceWorker()) || (await navigator.serviceWorker.ready);
      if (reg && reg.showNotification) {
        const swOptions: NotificationOptions & { image?: string; vibrate?: number[]; renotify?: boolean } = {
          body,
          icon: notifIcon,
          badge: notifBadge,
          vibrate: [250, 100, 250, 100, 250],
          tag: options.tag || `ap-tournament-${Date.now()}`,
          renotify: true,
          data: notifData
        };
        if (options.image) {
          swOptions.image = options.image;
        }
        await reg.showNotification(notifTitle, swOptions);
        return;
      }
      if (reg?.active) {
        reg.active.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: notifTitle,
          body,
          icon: notifIcon,
          badge: notifBadge,
          image: options.image,
          tag: options.tag,
          data: notifData
        });
        return;
      }
    }

    // Standard fallback if SW ready didn't resolve
    new Notification(notifTitle, {
      body,
      icon: notifIcon,
      tag: options.tag || `ap-tournament-${Date.now()}`
    });
  } catch (err) {
    console.warn('Native mobile notification trigger failed:', err);
  }
}
