import { db } from './firebase-config.js';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
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
    tripAdvisorUrl: item.tripAdvisorUrl || '',
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
  const q = query(itemsRef, where('type', '==', type));

  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    callback(items);
  }, (error) => {
    console.error('Feil ved lasting av items:', error);
    callback([]);
  });
}

// Lytt til alle items (for toppliste)
export function listenToAllItems(callback) {
  return onSnapshot(itemsRef, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
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
  const itemSnap = await getDoc(itemRef);
  if (!itemSnap.exists()) return;

  const data = itemSnap.data();
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

// === Reiseplan (Itinerary) ===
const itineraryRef = collection(db, 'itinerary');

export async function addToItinerary(itemId, name, type, addedBy) {
  return await addDoc(itineraryRef, {
    itemId,
    name,
    type,
    day: null,
    slot: null,
    order: 0,
    addedBy,
    addedAt: serverTimestamp()
  });
}

export async function moveItineraryItem(docId, day, slot, order) {
  const ref = doc(db, 'itinerary', docId);
  await updateDoc(ref, { day, slot, order });
}

export async function removeFromItinerary(docId) {
  const ref = doc(db, 'itinerary', docId);
  await deleteDoc(ref);
}

export function listenToItinerary(callback) {
  return onSnapshot(itineraryRef, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  }, (error) => {
    console.error('Feil ved lasting av reiseplan:', error);
    callback([]);
  });
}
