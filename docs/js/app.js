import { addItem, listenToItems, listenToAllItems, rateItem, updateNotes, deleteItem, placeIdExists } from './firestore-service.js';
import { searchPlaces } from './places-search.js';

// === State ===
let currentUser = localStorage.getItem('turplan_user') || null;
let currentView = 'restaurants';
let currentSearchType = 'restaurant';
let allItems = [];
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

// === Helpers ===
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
