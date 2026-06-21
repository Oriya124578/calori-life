// Firebase client initialization for the Calori Life app.
// Reads config from Vite env vars (`VITE_FIREBASE_*`) and exports the shared
// app, auth, firestore, storage handles plus a configured Google provider.
//
// Fail fast: if any required env var is missing we throw immediately so a
// developer running with a broken `.env.local` sees the problem at boot rather
// than as cryptic auth/firestore errors deep in the UI.

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';

const missing = [];
if (!import.meta.env.VITE_FIREBASE_API_KEY) missing.push('VITE_FIREBASE_API_KEY');
if (!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) missing.push('VITE_FIREBASE_PROJECT_ID');
if (!import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) missing.push('VITE_FIREBASE_STORAGE_BUCKET');
if (!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
if (!import.meta.env.VITE_FIREBASE_APP_ID) missing.push('VITE_FIREBASE_APP_ID');

if (missing.length) {
  throw new Error(
    `Firebase config is missing required env vars: ${missing.join(', ')}. ` +
      `Set them in .env.local (VITE_FIREBASE_*).`,
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // measurementId is optional (only used when Analytics is enabled).
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {}),
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// FCM messaging — only available in supported browsers (not Safari < 16.4 /
// some in-app webviews). Resolve to a messaging instance or null.
export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
export const getMessagingIfSupported = async () => {
  try {
    if (!(await isMessagingSupported())) return null;
    return getMessaging(app);
  } catch {
    return null;
  }
};
