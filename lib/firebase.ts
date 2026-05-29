import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

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

// Lazy getters — only called from client-side effects/handlers, never during SSR module eval.
export function getFirebaseAuth(): Auth {
  if (!_auth) {
    const { getAuth } = require('firebase/auth');
    _auth = getAuth(getApp());
  }
  return _auth!;
}

export function getFirebaseDb(): Firestore {
  if (!_db) {
    const { getFirestore } = require('firebase/firestore');
    _db = getFirestore(getApp());
  }
  return _db!;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) {
    const { getStorage } = require('firebase/storage');
    _storage = getStorage(getApp());
  }
  return _storage!;
}
