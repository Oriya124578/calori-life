/* global firebase, importScripts */
/* Calori Life — FCM background service worker (Phase 5b).
 * Receives push messages when the app is closed / backgrounded and paints the
 * notification. Config values below are public Firebase identifiers (safe to
 * ship). Keep in sync with src/lib/firebase.js. */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBsD4JBT814Cz44bfqF7ugPpd0F7i5seMc',
  authDomain: 'calori1300.firebaseapp.com',
  projectId: 'calori1300',
  storageBucket: 'calori1300.firebasestorage.app',
  messagingSenderId: '411703703093',
  appId: '1:411703703093:web:2be0fff7b0e6258586e37c',
});

const messaging = firebase.messaging();

// Background data-message → paint a notification ourselves so we control the
// icon/badge/click target consistently across platforms.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Calori Life';
  self.registration.showNotification(title, {
    body: n.body || d.body || '',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    dir: 'auto',
    tag: d.tag || undefined,
    data: { url: d.url || '/' },
  });
});

// Focus an existing window (or open one) on click.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        return undefined;
      }),
  );
});
