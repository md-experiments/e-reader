import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// Static imports are fine — importing these functions doesn't initialize Firebase.
// Initialization only happens when getApp() is called, which is inside lazy getters
// that are only ever called from client-side effects/handlers, never during SSR.

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _storage: FirebaseStorage | undefined;

function getApp(): FirebaseApp {
  if (!_app) _app = getApps()[0] ?? initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(getApp());
  return _auth;
}

export function getFirebaseDb(): Firestore {
  if (!_db) {
    const app = getApp();
    try {
      // Persistent cache, not the default in-memory one. The default also
      // answers offline reads rather than hanging — but it starts empty on
      // every page load, so an offline launch would show an empty library.
      // Backed by IndexedDB, the documents (and any writes made offline)
      // survive a reload, a restart and a week on a plane.
      // The multi-tab manager keeps two open tabs from fighting over the lease.
      _db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      // Already initialised (dev fast-refresh), or the browser won't give us
      // storage (private window, blocked cookies). Fall back to memory-only.
      _db = getFirestore(app);
    }
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) _storage = getStorage(getApp());
  return _storage;
}
