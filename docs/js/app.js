import { addItem, listenToItems, listenToAllItems, rateItem, updateNotes, deleteItem, placeIdExists, addToItinerary, moveItineraryItem, removeFromItinerary, listenToItinerary } from './firestore-service.js';
import { searchPlaces } from './places-search.js';

// === State ===
let currentUser = localStorage.getItem('turplan_user') || null;
let currentView = 'restaurants';
let currentSearchType = 'restaurant';
let allItems = [];
let itineraryItems = [];
let currentModalItemId = null;

const USERS = ['Thomas', 'Carina', 'Kristine', 'Kim'];

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  if (currentUser) {
    showApp();
  } else {
    showUserSelect();
  }
  setupEventListeners();
});

// === Brukervalg ===
function showUserSelect() {
  document.getElementById('user-select-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('user-select-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('current-user-name').textContent = currentUser;
  startListeners();
}

function selectUser(userName) {
  currentUser = userName;
  localStorage.setItem('turplan_user', userName);
  showApp();
}

// === Event Listeners ===
function setupEventListeners() {
  // Brukerknapper
  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.addEventListener('click', () => selectUser(btn.dataset.user));
  });

  // Bytt bruker
  document.getElementById('change-user-btn').addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('turplan_user');
    showUserSelect();
  });

  // Navigasjon
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Søk type toggle (dedikert søk-fane)
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSearchType = btn.dataset.searchType;
    });
  });

  // Dedikert søk
  document.getElementById('search-btn').addEventListener('click', performSearch);
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  // Inline søk på listesidene
  document.querySelectorAll('.inline-search').forEach(container => {
    const type = container.dataset.type;
    const input = container.querySelector('.inline-search-input');
    const btn = container.querySelector('.inline-search-btn');
    const resultsDiv = container.querySelector('.inline-search-results');

    btn.addEventListener('click', () => performInlineSearch(input, type, resultsDiv));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performInlineSearch(input, type, resultsDiv);
    });
  });

  // Manuell tillegging
  document.querySelectorAll('.inline-search').forEach(container => {
    const type = container.dataset.type;
    const manualBtn = container.querySelector('.btn-manual-add');
    const form = container.querySelector('.manual-add-form');
    const cancelBtn = form.querySelector('.btn-cancel');
    const addBtn = form.querySelector('.btn-add');

    manualBtn.addEventListener('click', () => {
      form.classList.toggle('hidden');
    });

    cancelBtn.addEventListener('click', () => {
      form.classList.add('hidden');
      form.querySelectorAll('input').forEach(i => i.value = '');
    });

    addBtn.addEventListener('click', () => handleManualAdd(form, type));
  });

  // Reiseplan: picker
  document.getElementById('add-from-toplist-btn').addEventListener('click', openPicker);
  document.getElementById('close-picker-btn').addEventListener('click', closePicker);

  // Reiseplan: drag-and-drop setup
  setupDragAndDrop();

  // Modal lukk
  document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.querySelector('.modal-close').addEventListener('click', closeModal);

  // Lagre notat
  document.getElementById('save-notes-btn').addEventListener('click', saveNotes);

  // Slett item
  document.getElementById('delete-item-btn').addEventListener('click', handleDelete);
}

// === Navigasjon ===
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
}

// === Firestore Listeners ===
function startListeners() {
  listenToItems('restaurant', (items) => {
    renderGroupedList('restaurant-list', items, 'restaurant');
  });

  listenToItems('activity', (items) => {
    renderGroupedList('activity-list', items, 'activity');
  });

  listenToAllItems((items) => {
    allItems = items;
    renderToplist();
  });

  listenToItinerary((items) => {
    itineraryItems = items;
    renderItinerary();
  });
}

// === Rendering: Grouped by user ===
function renderGroupedList(containerId, items, type) {
  const container = document.getElementById(containerId);
  const typeName = type === 'restaurant' ? 'restauranter' : 'aktiviteter';

  let html = '<div class="user-sections-grid">';
  USERS.forEach(user => {
    const userItems = items
      .filter(i => i.addedBy === user)
      .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));

    html += `<div class="user-section">`;
    html += `<div class="user-section-header">
      <img src="images/${user}.jpg" alt="${escapeHtml(user)}" class="user-avatar">
      ${escapeHtml(user)} sine ${typeName}
      <span class="user-section-count">${userItems.length}</span>
    </div>`;

    if (userItems.length === 0) {
      html += `<div class="user-section-empty">Ingen ${typeName} lagt til ennå</div>`;
    } else {
      html += `<div class="item-list">`;
      html += userItems.map(item => createItemCard(item)).join('');
      html += `</div>`;
    }
    html += `</div>`;
  });
  html += '</div>';

  container.innerHTML = html;

  // Event listeners for kort
  container.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.inline-rating')) return;
      openModal(card.dataset.id);
    });
  });

  // Event listeners for inline rating
  container.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = btn.closest('.item-card').dataset.id;
      const rating = parseInt(btn.dataset.rating);
      rateItem(itemId, currentUser, rating).catch(err => {
        showToast('Kunne ikke lagre vurdering');
        console.error(err);
      });
    });
  });
}

function createItemCard(item) {
  const myRating = item.ratings?.[currentUser] || 0;
  const hasLink = item.mapsUrl && !item.placeId;

  return `
    <div class="item-card" data-id="${item.id}">
      <div class="item-card-header">
        <span class="item-card-name">${escapeHtml(item.name)}</span>
        ${item.averageRating > 0 ? `
          <div class="item-card-rating">
            ${renderStars(item.averageRating)}
            <span class="rating-value">${item.averageRating}</span>
            <span class="rating-count">(${item.ratingCount})</span>
          </div>
        ` : ''}
      </div>
      ${item.address ? `<div class="item-card-address">${escapeHtml(item.address)}</div>` : ''}
      ${hasLink ? `<a href="${escapeHtml(item.mapsUrl)}" target="_blank" rel="noopener" class="item-card-link" onclick="event.stopPropagation()">Åpne lenke ↗</a>` : ''}
      <div class="item-card-meta">
        <span></span>
        <div class="inline-rating">
          ${[1,2,3,4,5].map(i => `
            <button class="star-btn ${i <= myRating ? 'filled' : ''}" data-rating="${i}">★</button>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function renderStars(rating) {
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      html += '<span class="star filled">★</span>';
    } else if (i - 0.5 <= rating) {
      html += '<span class="star half">★</span>';
    } else {
      html += '<span class="star">★</span>';
    }
  }
  html += '</span>';
  return html;
}

// === Toppliste ===
function renderToplist() {
  const restaurants = allItems
    .filter(i => i.type === 'restaurant' && i.ratingCount > 0)
    .sort((a, b) => b.averageRating - a.averageRating);

  const activities = allItems
    .filter(i => i.type === 'activity' && i.ratingCount > 0)
    .sort((a, b) => b.averageRating - a.averageRating);

  renderToplistSection('top-restaurants', restaurants);
  renderToplistSection('top-activities', activities);
}

function renderToplistSection(containerId, items) {
  const container = document.getElementById(containerId);

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Ingen vurderinger ennå</p></div>';
    return;
  }

  container.innerHTML = items.map((item, index) => {
    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
    return `
      <div class="item-card" data-id="${item.id}">
        <div class="toplist-rank">
          <span class="rank-number ${rankClass}">${index + 1}</span>
          <div style="flex:1">
            <div class="item-card-header">
              <span class="item-card-name">${escapeHtml(item.name)}</span>
              <div class="item-card-rating">
                ${renderStars(item.averageRating)}
                <span class="rating-value">${item.averageRating}</span>
                <span class="rating-count">(${item.ratingCount})</span>
              </div>
            </div>
            ${item.address ? `<div class="item-card-address">${escapeHtml(item.address)}</div>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

// === Inline søk (på listesidene) ===
async function performInlineSearch(input, type, resultsContainer) {
  const queryText = input.value.trim();
  if (!queryText) return;

  resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Søker...</p></div>';

  try {
    const results = await searchPlaces(queryText, type);

    if (results.length === 0) {
      resultsContainer.innerHTML = '<div class="empty-state"><p>Ingen resultater funnet</p></div>';
      return;
    }

    const existChecks = await Promise.all(results.map(r => placeIdExists(r.placeId)));

    resultsContainer.innerHTML = results.map((result, index) => {
      const alreadyAdded = existChecks[index];
      return `
        <div class="search-result-card">
          <div class="search-result-header">
            <span class="search-result-name">${escapeHtml(result.name)}</span>
          </div>
          <div class="search-result-address">${escapeHtml(result.address)}</div>
          <div class="search-result-actions">
            <button class="btn-add" data-index="${index}" ${alreadyAdded ? 'disabled' : ''}>
              ${alreadyAdded ? 'Allerede lagt til' : 'Legg til'}
            </button>
          </div>
        </div>`;
    }).join('');

    resultsContainer.querySelectorAll('.btn-add:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const result = results[parseInt(btn.dataset.index)];
        btn.disabled = true;
        btn.textContent = 'Legger til...';
        try {
          await addItem({
            name: result.name,
            type: type,
            placeId: result.placeId,
            address: result.address,
            mapsUrl: result.mapsUrl,
            addedBy: currentUser
          });
          btn.textContent = 'Lagt til!';
          showToast(`${result.name} lagt til`);
        } catch (error) {
          btn.disabled = false;
          btn.textContent = 'Legg til';
          showToast('Kunne ikke legge til');
        }
      });
    });
  } catch (error) {
    console.error('Søkefeil:', error);
    resultsContainer.innerHTML = '<div class="empty-state"><p>Søket feilet. Prøv igjen.</p></div>';
  }
}

// === Manuell tillegging ===
async function handleManualAdd(form, type) {
  const nameInput = form.querySelector('.manual-name');
  const addressInput = form.querySelector('.manual-address');
  const urlInput = form.querySelector('.manual-url');

  const name = nameInput.value.trim();
  if (!name) {
    showToast('Du må fylle inn et navn');
    nameInput.focus();
    return;
  }

  const addBtn = form.querySelector('.btn-add');
  addBtn.disabled = true;
  addBtn.textContent = 'Legger til...';

  try {
    await addItem({
      name: name,
      type: type,
      placeId: null,
      address: addressInput.value.trim(),
      mapsUrl: urlInput.value.trim(),
      addedBy: currentUser
    });

    showToast(`${name} lagt til`);
    form.querySelectorAll('input').forEach(i => i.value = '');
    form.classList.add('hidden');
  } catch (error) {
    console.error('Feil ved manuell tillegging:', error);
    showToast('Kunne ikke legge til');
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = 'Legg til';
  }
}

// === Dedikert søk (søk-fanen) ===
async function performSearch() {
  const input = document.getElementById('search-input');
  const queryText = input.value.trim();
  if (!queryText) return;

  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Søker...</p></div>';

  try {
    const results = await searchPlaces(queryText, currentSearchType);

    if (results.length === 0) {
      resultsContainer.innerHTML = '<div class="empty-state"><p>Ingen resultater funnet</p><p>Prøv et annet søkeord</p></div>';
      return;
    }

    const existChecks = await Promise.all(results.map(r => placeIdExists(r.placeId)));

    resultsContainer.innerHTML = results.map((result, index) => {
      const alreadyAdded = existChecks[index];
      return `
        <div class="search-result-card">
          <div class="search-result-header">
            <span class="search-result-name">${escapeHtml(result.name)}</span>
          </div>
          <div class="search-result-address">${escapeHtml(result.address)}</div>
          ${result.osmType ? `<span class="search-result-type">${escapeHtml(result.osmType)}</span>` : ''}
          <div class="search-result-actions">
            <button class="btn-add" data-index="${index}" ${alreadyAdded ? 'disabled' : ''}>
              ${alreadyAdded ? 'Allerede lagt til' : 'Legg til'}
            </button>
          </div>
        </div>`;
    }).join('');

    resultsContainer.querySelectorAll('.btn-add:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const result = results[parseInt(btn.dataset.index)];
        await handleAddFromSearch(result, btn);
      });
    });
  } catch (error) {
    console.error('Søkefeil:', error);
    resultsContainer.innerHTML = '<div class="empty-state"><p>Søket feilet. Prøv igjen.</p></div>';
  }
}

async function handleAddFromSearch(result, button) {
  button.disabled = true;
  button.textContent = 'Legger til...';

  try {
    await addItem({
      name: result.name,
      type: currentSearchType,
      placeId: result.placeId,
      address: result.address,
      mapsUrl: result.mapsUrl,
      addedBy: currentUser
    });

    button.textContent = 'Lagt til!';
    showToast(`${result.name} lagt til i ${currentSearchType === 'restaurant' ? 'restauranter' : 'aktiviteter'}`);
  } catch (error) {
    console.error('Feil ved tillegging:', error);
    button.disabled = false;
    button.textContent = 'Legg til';
    showToast('Kunne ikke legge til. Prøv igjen.');
  }
}

// === Modal ===
function openModal(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  currentModalItemId = itemId;
  const modal = document.getElementById('detail-modal');

  document.getElementById('modal-name').textContent = item.name;
  document.getElementById('modal-address').textContent = item.address || '';

  const mapsLink = document.getElementById('modal-maps-link');
  if (item.mapsUrl) {
    mapsLink.href = item.mapsUrl;
    mapsLink.textContent = item.placeId ? 'Åpne i kart' : 'Åpne lenke';
    mapsLink.classList.remove('hidden');
  } else {
    mapsLink.classList.add('hidden');
  }

  // Alle brukeres vurderinger
  const ratingsContainer = document.getElementById('modal-ratings');
  ratingsContainer.innerHTML = USERS.map(user => {
    const rating = item.ratings?.[user] || 0;
    return `
      <div class="modal-rating-row">
        <span class="user-name">${escapeHtml(user)}</span>
        <span>${rating > 0 ? renderStars(rating) : '<span style="color:var(--text-secondary)">Ikke vurdert</span>'}</span>
      </div>`;
  }).join('');

  // Min vurdering (interaktiv)
  const myRating = item.ratings?.[currentUser] || 0;
  const myRatingContainer = document.getElementById('modal-my-rating');
  myRatingContainer.innerHTML = [1,2,3,4,5].map(i => `
    <button class="star-input ${i <= myRating ? 'filled' : ''}" data-rating="${i}">★</button>
  `).join('');

  myRatingContainer.querySelectorAll('.star-input').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rating = parseInt(btn.dataset.rating);
      try {
        await rateItem(itemId, currentUser, rating);
        showToast('Vurdering lagret');
        openModal(itemId);
      } catch (err) {
        showToast('Kunne ikke lagre vurdering');
        console.error(err);
      }
    });
  });

  document.getElementById('modal-notes').value = item.notes || '';
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
  currentModalItemId = null;
}

async function saveNotes() {
  if (!currentModalItemId) return;
  const notes = document.getElementById('modal-notes').value;
  try {
    await updateNotes(currentModalItemId, notes);
    showToast('Notat lagret');
  } catch (err) {
    showToast('Kunne ikke lagre notat');
    console.error(err);
  }
}

async function handleDelete() {
  if (!currentModalItemId) return;
  const item = allItems.find(i => i.id === currentModalItemId);
  if (!confirm(`Er du sikker på at du vil slette "${item?.name}"?`)) return;

  try {
    await deleteItem(currentModalItemId);
    closeModal();
    showToast('Slettet');
  } catch (err) {
    showToast('Kunne ikke slette');
    console.error(err);
  }
}

// === Toast ===
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

// === Reiseplan ===
function renderItinerary() {
  // Render uplanlagte items
  const unplanned = itineraryItems.filter(i => !i.day || !i.slot);
  const unplannedContainer = document.querySelector('#unplanned-items .slot-items') ||
    document.getElementById('unplanned-items');

  const unplannedEl = document.getElementById('unplanned-items');
  if (unplanned.length === 0) {
    unplannedEl.innerHTML = '<div class="slot-empty">Legg til items og dra dem hit eller til en dag</div>';
  } else {
    unplannedEl.innerHTML = unplanned.map(item => createItineraryCard(item)).join('');
  }

  // Render planlagte items i tidsslotter
  document.querySelectorAll('.day-slots .time-slot').forEach(slot => {
    const day = slot.dataset.day;
    const slotName = slot.dataset.slot;
    const slotItemsContainer = slot.querySelector('.slot-items');

    const slotItems = itineraryItems
      .filter(i => i.day === day && i.slot === slotName)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    slotItemsContainer.innerHTML = slotItems.length > 0
      ? slotItems.map(item => createItineraryCard(item)).join('')
      : '';
  });

  // Sett opp draggable og remove-knapper
  document.querySelectorAll('.itinerary-card').forEach(card => {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    setupTouchDrag(card);
  });

  document.querySelectorAll('.itin-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const docId = btn.closest('.itinerary-card').dataset.itinId;
      try {
        await removeFromItinerary(docId);
        showToast('Fjernet fra reiseplan');
      } catch (err) {
        showToast('Kunne ikke fjerne');
        console.error(err);
      }
    });
  });
}

function createItineraryCard(item) {
  const typeLabel = item.type === 'restaurant' ? 'Restaurant' : 'Aktivitet';
  return `
    <div class="itinerary-card" data-itin-id="${item.id}" draggable="true">
      <span class="grip">⠿</span>
      <span class="itin-name">${escapeHtml(item.name)}</span>
      <span class="itin-type ${item.type}">${typeLabel}</span>
      <button class="itin-remove" title="Fjern">&times;</button>
    </div>`;
}

// === Picker: legg til fra listene ===
function openPicker() {
  const picker = document.getElementById('itinerary-picker');
  const container = document.getElementById('picker-items');

  // Vis alle items, marker de som allerede er i reiseplanen
  const itineraryItemIds = new Set(itineraryItems.map(i => i.itemId));

  const sorted = [...allItems].sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));

  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Ingen steder lagt til ennå. Legg til restauranter og aktiviteter først.</p></div>';
  } else {
    container.innerHTML = sorted.map(item => {
      const alreadyAdded = itineraryItemIds.has(item.id);
      const typeLabel = item.type === 'restaurant' ? '🍽️' : '🎯';
      return `
        <div class="picker-item">
          <div class="picker-item-info">
            <span class="picker-item-name">${typeLabel} ${escapeHtml(item.name)}</span>
            ${item.averageRating > 0 ? `<span class="picker-item-rating">★ ${item.averageRating} (${item.ratingCount})</span>` : ''}
          </div>
          <button class="btn-add" data-item-id="${item.id}" data-name="${escapeHtml(item.name)}" data-type="${item.type}" ${alreadyAdded ? 'disabled' : ''}>
            ${alreadyAdded ? 'Lagt til' : 'Legg til'}
          </button>
        </div>`;
    }).join('');

    container.querySelectorAll('.btn-add:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Legger til...';
        try {
          await addToItinerary(btn.dataset.itemId, btn.dataset.name, btn.dataset.type, currentUser);
          btn.textContent = 'Lagt til';
          showToast('Lagt til i reiseplan');
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Legg til';
          showToast('Kunne ikke legge til');
          console.error(err);
        }
      });
    });
  }

  picker.classList.remove('hidden');
}

function closePicker() {
  document.getElementById('itinerary-picker').classList.add('hidden');
}

// === Drag-and-drop ===
let draggedId = null;

function setupDragAndDrop() {
  document.querySelectorAll('.time-slot, #unplanned-items').forEach(slot => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const itinId = e.dataTransfer.getData('text/plain');
      if (!itinId) return;

      const day = slot.dataset.day || null;
      const slotName = slot.dataset.slot || null;

      moveItineraryItem(itinId, day, slotName, 0).catch(err => {
        showToast('Kunne ikke flytte');
        console.error(err);
      });
    });
  });
}

function handleDragStart(e) {
  const id = e.target.dataset.itinId;
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
  draggedId = id;
  setTimeout(() => e.target.classList.add('dragging'), 0);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedId = null;
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// === Touch drag-and-drop (mobil) ===
function setupTouchDrag(card) {
  let clone = null;
  let startX, startY;
  let currentDropTarget = null;

  card.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    draggedId = card.dataset.itinId;

    clone = card.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.width = card.offsetWidth + 'px';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '1000';
    clone.style.opacity = '0.85';
    clone.style.transform = 'scale(1.05)';
    document.body.appendChild(clone);
    positionClone(touch);

    card.classList.add('dragging');
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!clone) return;
    e.preventDefault();
    const touch = e.touches[0];
    positionClone(touch);

    // Find drop target
    clone.style.display = 'none';
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    clone.style.display = '';

    const dropTarget = elementBelow?.closest('.time-slot, #unplanned-items');
    if (currentDropTarget && currentDropTarget !== dropTarget) {
      currentDropTarget.classList.remove('drag-over');
    }
    if (dropTarget) {
      dropTarget.classList.add('drag-over');
      currentDropTarget = dropTarget;
    }
  }, { passive: false });

  card.addEventListener('touchend', () => {
    if (clone) {
      clone.remove();
      clone = null;
    }
    card.classList.remove('dragging');

    if (currentDropTarget && draggedId) {
      const day = currentDropTarget.dataset.day || null;
      const slot = currentDropTarget.dataset.slot || null;
      currentDropTarget.classList.remove('drag-over');

      moveItineraryItem(draggedId, day, slot, 0).catch(err => {
        showToast('Kunne ikke flytte');
        console.error(err);
      });
    }
    currentDropTarget = null;
    draggedId = null;
  }, { passive: true });

  function positionClone(touch) {
    if (clone) {
      clone.style.left = (touch.clientX - clone.offsetWidth / 2) + 'px';
      clone.style.top = (touch.clientY - 20) + 'px';
    }
  }
}

// === Helpers ===
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
