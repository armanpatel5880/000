// Custom Notification & Push Handler for AP Tournament Service Worker & Android PWA

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, image, data, tag } = event.data;

    const options = {
      body: body || 'You have a new match update on AP Tournament.',
      icon: icon || '/pwa-192x192.png',
      badge: badge || '/badge-96x96.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: tag || 'ap-tournament-' + Date.now(),
      renotify: true,
      requireInteraction: false,
      data: data || {},
      actions: [
        { action: 'open', title: 'Open AP Tournament' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    if (image) {
      options.image = image;
    }

    self.registration.showNotification(title || 'AP Tournament', options);
  }
});

// Handle background push notifications (FCM / Web Push / Android APK)
self.addEventListener('push', (event) => {
  let notifData = {
    title: 'AP Tournament',
    body: 'New match update available on AP Tournament',
    icon: '/pwa-192x192.png',
    badge: '/badge-96x96.png',
    image: '',
    tag: 'ap-tournament-push',
    data: {}
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      const notificationObj = parsed.notification || {};
      notifData = {
        ...notifData,
        ...parsed,
        title: parsed.title || notificationObj.title || notifData.title,
        body: parsed.body || notificationObj.body || notifData.body,
        image: parsed.image || parsed.imageUrl || notificationObj.image || ''
      };
    } catch (e) {
      notifData.body = event.data.text();
    }
  }

  const pushOptions = {
    body: notifData.body,
    icon: notifData.icon || '/pwa-192x192.png',
    badge: notifData.badge || '/badge-96x96.png',
    vibrate: [200, 100, 200],
    tag: notifData.tag || 'ap-tournament-push',
    renotify: true,
    data: notifData.data || {},
    actions: [
      { action: 'open', title: 'Open Match' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  if (notifData.image) {
    pushOptions.image = notifData.image;
  }

  event.waitUntil(
    self.registration.showNotification(notifData.title || 'AP Tournament', pushOptions)
  );
});

// When user taps the notification in Android notification bar
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (event.notification.data && event.notification.data.actionPage) {
            client.postMessage({
              type: 'NAVIGATE_FROM_NOTIFICATION',
              actionPage: event.notification.data.actionPage,
              targetMatchId: event.notification.data.targetMatchId
            });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
