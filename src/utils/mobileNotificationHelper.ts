import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

const DEFAULT_NOTIFICATION_ICON = '/pwa-192x192.png';
const DEFAULT_NOTIFICATION_BADGE = '/badge-96x96.png';

// Register Service Worker for Mobile & PWA Notifications
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (import.meta.env.DEV || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    return registration;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
    return null;
  }
}

// Request Notification Permission from User & Sync with Firestore
export async function requestMobileNotificationPermission(userId?: string): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('Notifications are not supported on this browser/device.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      await registerNotificationServiceWorker();

      if (userId) {
        await updateDoc(doc(db, 'users', userId), {
          fcmEnabled: true,
          notificationsEnabled: true
        }).catch(() => {});
      }

      triggerMobileStatusBarNotification(
        'AP Tournament • Alerts Active!',
        'You will now receive instant Room ID, Password, and Match alerts directly in your phone status bar.',
        { tag: 'welcome-notification' }
      );
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
  data?: Record<string, unknown>;
}

// Trigger Native Mobile Status Bar & Lock Screen Notification
export async function triggerMobileStatusBarNotification(
  title: string,
  body: string,
  options: MobileNotificationOptions = {}
) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
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

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(notifTitle, {
          body,
          icon: notifIcon,
          badge: notifBadge,
          vibrate: [250, 100, 250, 100, 250],
          tag: options.tag || `ap-tournament-${Date.now()}`,
          renotify: true,
          data: notifData
        } as NotificationOptions);
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
