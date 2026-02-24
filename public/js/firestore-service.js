import { db } from './firebase-config.js';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const itemsRef = collection(db, 'items');

// Legg til nytt sted
export async function addItem(item) {
  const docRef = await addDoc(itemsRef, {
    name: item.name,
    type: item.type,
    placeId: item.placeId || null,
    address: item.address || '',
    mapsUrl: item.mapsUrl || '',
    addedBy: item.addedBy,
    addedAt: serverTimestamp(),
    ratings: {},
    averageRating: 0,
    ratingCount: 0,
    notes: ''
  });
  return docRef.id;
}

// Lytt til items av en bestemt type (sanntid)
export function listenToItems(type, callback) {
  const q = query(
    itemsRef,
    where('type', '==', type),
    orderBy('averageRating', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  }, (error) => {
    console.error('Feil ved lasting av items:', error);
    callback([]);
  });
}

// Lytt til alle items (for toppliste)
export function listenToAllItems(callback) {
  const q = query(itemsRef, orderBy('averageRating', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  }, (error) => {
    console.error('Feil ved lasting av items:', error);
    callback([]);
  });
}

// Gi stjernevurdering
export async function rateItem(itemId, userName, rating) {
  const itemRef = doc(db, 'items', itemId);

  // Hent gjeldende ratings for å beregne nytt snitt
  // Vi bruker en enkel tilnærming: oppdater rating-map og beregn snitt
  const q = query(itemsRef, where('__name__', '==', itemId));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return;

  const data = snapshot.docs[0].data();
  const ratings = { ...data.ratings, [userName]: rating };
  const values = Object.values(ratings);
  const averageRating = values.reduce((a, b) => a + b, 0) / values.length;

  await updateDoc(itemRef, {
    [`ratings.${userName}`]: rating,
    averageRating: Math.round(averageRating * 10) / 10,
    ratingCount: values.length
  });
}

// Oppdater notater
export async function updateNotes(itemId, notes) {
  const itemRef = doc(db, 'items', itemId);
  await updateDoc(itemRef, { notes });
}

// Slett item
export async function deleteItem(itemId) {
  const itemRef = doc(db, 'items', itemId);
  await deleteDoc(itemRef);
}

// Sjekk om et placeId allerede finnes
export async function placeIdExists(placeId) {
  if (!placeId) return false;
  const q = query(itemsRef, where('placeId', '==', placeId));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}
