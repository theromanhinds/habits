import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase config should be provided via environment variables in .env
const apiKeyRaw = process.env.REACT_APP_FIREBASE_API_KEY;
const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : apiKeyRaw;
const firebaseConfig = {
  apiKey,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

// Diagnostic: helpful logging to debug invalid-api-key issues in dev
if (!apiKey) {
  // If there's no API key at runtime, Firebase will later fail with invalid-api-key.
  // Log a clear error to console to help debugging.
  // Note: process.env variables are baked into the build at start time by CRA — restart dev server after changing .env
  // eslint-disable-next-line no-console
  console.error('[firebase] Missing REACT_APP_FIREBASE_API_KEY — did you restart the dev server after editing .env?');
} else {
  // mask the key when logging
  const masked = apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
  // eslint-disable-next-line no-console
  console.info('[firebase] Using API key', masked);
}

const app = initializeApp(firebaseConfig as any);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export default app;
