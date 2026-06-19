// ─────────────────────────────────────────────────────────────────────────────
// FCM push registration (Phase 5b).
//
// Obtains an FCM token bound to our VAPID key + the firebase-messaging-sw.js
// service worker, and stores it under cl_fcmTokens so the scheduled Cloud
// Function can deliver reminders when the app is closed.
// ─────────────────────────────────────────────────────────────────────────────

import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { getMessagingIfSupported, VAPID_KEY } from './firebase';
import { setFcmToken, deleteFcmToken } from './firestoreRepo';

const FCM_SW_URL = '/firebase-messaging-sw.js';

let cachedToken = null;

const registerFcmSW = () => {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register(FCM_SW_URL).catch((err) => {
    console.warn('[push] FCM SW registration failed:', err);
    return null;
  });
};

/**
 * Acquire an FCM token for this device and persist it. Assumes notification
 * permission is already 'granted'. Returns the token or null.
 */
export const enablePush = async (uid) => {
  if (!uid || !VAPID_KEY) return null;
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  try {
    const swReg = await registerFcmSW();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg || undefined,
    });
    if (!token) return null;
    cachedToken = token;
    await setFcmToken(uid, token);
    // Foreground messages: let the OS-level notification still appear by
    // painting via the SW registration.
    onMessage(messaging, (payload) => {
      const n = payload.notification || payload.data || {};
      if (swReg && n.title) {
        swReg.showNotification(n.title, {
          body: n.body || '',
          icon: '/logo-192.png',
          badge: '/logo-192.png',
          data: { url: (payload.data && payload.data.url) || '/' },
        });
      }
    });
    return token;
  } catch (err) {
    console.warn('[push] enablePush failed:', err);
    return null;
  }
};

/** Revoke this device's FCM token and remove it from Firestore. */
export const disablePush = async (uid) => {
  try {
    const messaging = await getMessagingIfSupported();
    if (messaging) await deleteToken(messaging).catch(() => {});
    if (uid && cachedToken) await deleteFcmToken(uid, cachedToken).catch(() => {});
    cachedToken = null;
  } catch (err) {
    console.warn('[push] disablePush failed:', err);
  }
};
