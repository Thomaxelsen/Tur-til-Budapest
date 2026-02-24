// Firebase-konfigurasjon

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBZGGKwbumRAuf1bxSyd2RBNbI6C0f6cV8",
  authDomain: "budapest-2026.firebaseapp.com",
  projectId: "budapest-2026",
  storageBucket: "budapest-2026.firebasestorage.app",
  messagingSenderId: "1029352289974",
  appId: "1:1029352289974:web:7d47775605046d20479817"
};

const app = initializeApp(firebaseConfig);

// Firestore med offline-støtte
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager({})
  })
});

export { db };
