// Firebase-konfigurasjon
// VIKTIG: Erstatt verdiene under med dine egne fra Firebase Console
// Gå til: Firebase Console > Prosjektinnstillinger > Generelt > Din app > SDK-konfigurasjon

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBZGGKwbumRAuf1bxSyd2RBNbI6C0f6cV8",
  authDomain: "budapest-2026.firebaseapp.com",
  projectId: "budapest-2026",
  storageBucket: "budapest-2026.firebasestorage.app",
  messagingSenderId: "1029352289974",
  appId: "1:1029352289974:web:7d47775605046d20479817"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Aktiver offline-støtte
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline-støtte krever at bare én fane er åpen.');
  } else if (err.code === 'unimplemented') {
    console.warn('Nettleseren støtter ikke offline-lagring.');
  }
});

export { db };
