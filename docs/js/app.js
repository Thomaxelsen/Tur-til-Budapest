import { addItem, listenToItems, listenToAllItems, rateItem, updateNotes, deleteItem, placeIdExists, addToItinerary, moveItineraryItem, removeFromItinerary, listenToItinerary } from './firestore-service.js';
import { searchPlaces } from './places-search.js';

// === State ===
let currentUser = localStorage.getItem('turplan_user') || null;
let currentView = 'restaurants';
let currentSearchType = 'restaurant';
let allItems = [];
let itineraryItems = [];
let currentModalItemId = null;
const searchLoadingStates = new WeakMap();
let allItemsLoaded = false;

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
    const clearBtn = container.querySelector('.inline-search-clear');
    const resultsDiv = container.querySelector('.inline-search-results');

    const doSearch = () => {
      performInlineSearch(input, type, resultsDiv).then(() => {
        clearBtn.classList.toggle('hidden', !resultsDiv.hasChildNodes());
      });
    };

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    clearBtn.addEventListener('click', () => {
      clearInlineSearchContainer(container, { clearInput: true });
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

  // Reiseplan: drag-and-drop setup
  setupDragAndDrop();

  // Modal lukk
  document.querySelector('#detail-modal .modal-backdrop').addEventListener('click', closeModal);
  document.querySelector('#detail-modal .modal-close').addEventListener('click', closeModal);

  // Link-popup (delegert for alle app-lenker vi markerer)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.link-popup-trigger');
    if (!trigger) return;
    if (trigger.id === 'link-popup-external') return;

    e.preventDefault();
    e.stopPropagation();
    openLinkPopup(
      trigger.dataset.url || trigger.href,
      trigger.dataset.title || trigger.textContent.trim(),
      {
        provider: trigger.dataset.provider || '',
        entityLabel: trigger.dataset.entityLabel || ''
      }
    );
  });
  document.getElementById('link-popup-close').addEventListener('click', closeLinkPopup);
  document.querySelector('#link-popup .modal-backdrop').addEventListener('click', closeLinkPopup);
  document.getElementById('link-popup-iframe').addEventListener('load', () => {
    const status = document.getElementById('link-popup-status');
    const fallback = document.getElementById('link-popup-fallback');
    if (fallback && !fallback.classList.contains('hidden')) return;
    if (status) status.classList.add('hidden');
  });

  // Lagre notat
  document.getElementById('save-notes-btn').addEventListener('click', saveNotes);

  // Slett item
  document.getElementById('delete-item-btn').addEventListener('click', handleDelete);

  // Lukk inline-sokeresultater ved klikk utenfor sokepanel
  document.addEventListener('click', (e) => {
    if (e.target.closest('.inline-search')) return;
    clearAllInlineSearchResults({ clearInputs: false });
  });
}

// === Navigasjon ===
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  // Tøm søkeresultater ved visningsbytte
  clearAllInlineSearchResults({ clearInputs: true });
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  if (searchInput) searchInput.value = '';
  if (searchResults) {
    stopSearchLoading(searchResults);
    searchResults.innerHTML = '<div class="empty-state"><p>Søk etter restauranter, aktiviteter eller barer i Budapest</p></div>';
  }
}

// === Firestore Listeners ===
function startListeners() {
  listenToItems('restaurant', (items) => {
    renderGroupedList('restaurant-list', items, 'restaurant');
  });

  listenToItems('activity', (items) => {
    renderGroupedList('activity-list', items, 'activity');
  });

  listenToItems('bar', (items) => {
    renderGroupedList('bars-list', items, 'bar');
  });

  listenToAllItems((items) => {
    allItemsLoaded = true;
    allItems = items;
    renderToplist();
    renderItinerary();
  });

  listenToItinerary((items) => {
    itineraryItems = items;
    renderItinerary();
  });
}

// === Rendering: Grouped by user ===
function renderGroupedList(containerId, items, type) {
  const container = document.getElementById(containerId);
  const typeName = type === 'restaurant' ? 'restauranter' : type === 'activity' ? 'aktiviteter' : 'barer';

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
      if (e.target.closest('.inline-rating') || e.target.closest('.link-popup-trigger')) return;
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
  const hasMapsLink = !!item.mapsUrl;
  const hasTripAdvisorLink = !!item.tripAdvisorUrl;

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
      ${(hasMapsLink || hasTripAdvisorLink) ? `
        <div class="item-card-links">
          ${hasMapsLink ? `<a href="${escapeHtml(item.mapsUrl)}" class="card-link link-popup-trigger" data-url="${escapeHtml(item.mapsUrl)}" data-title="${escapeHtml(item.name)} - Google Maps" data-provider="google_maps" data-entity-label="${getEntityLabelDefinite(item.type)}">Maps</a>` : ''}
          ${hasTripAdvisorLink ? `<a href="${escapeHtml(item.tripAdvisorUrl)}" class="card-link link-popup-trigger" data-url="${escapeHtml(item.tripAdvisorUrl)}" data-title="${escapeHtml(item.name)} - TripAdvisor" data-provider="tripadvisor" data-entity-label="${getEntityLabelDefinite(item.type)}">TripAdvisor</a>` : ''}
        </div>
      ` : ''}
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

  const bars = allItems
    .filter(i => i.type === 'bar' && i.ratingCount > 0)
    .sort((a, b) => b.averageRating - a.averageRating);

  renderToplistSection('top-restaurants', restaurants);
  renderToplistSection('top-activities', activities);
  renderToplistSection('top-bars', bars);
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

  renderSearchLoading(resultsContainer, {
    title: 'Soker i Budapest...',
    subtitle: 'Henter steder og filtrerer resultater'
  });

  try {
    const results = await searchPlaces(queryText, type);

    if (results.length === 0) {
      stopSearchLoading(resultsContainer);
      resultsContainer.innerHTML = '<div class="empty-state"><p>Ingen resultater funnet</p></div>';
      return;
    }

    const existChecks = await getExistingPlaceChecks(results);
    renderSearchResults(resultsContainer, results, existChecks, type);

    wireSearchAddButtons(resultsContainer, results, async (result, btn) => {
      btn.disabled = true;
      btn.textContent = 'Legger til...';
      try {
        await addItem({
          name: result.name,
          type,
          placeId: result.placeId,
          address: result.address,
          mapsUrl: result.googleMapsUrl || result.mapsUrl,
          tripAdvisorUrl: result.tripAdvisorUrl || '',
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
  } catch (error) {
    console.error('Søkefeil:', error);
    stopSearchLoading(resultsContainer);
    resultsContainer.innerHTML = `<div class="empty-state"><p>${escapeHtml(getSearchErrorMessage(error))}</p></div>`;
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
  renderSearchLoading(resultsContainer, {
    title: 'Soker i Budapest...',
    subtitle: 'Soker etter restauranter, aktiviteter eller barer'
  });

  try {
    const results = await searchPlaces(queryText, currentSearchType);

    if (results.length === 0) {
      stopSearchLoading(resultsContainer);
      resultsContainer.innerHTML = '<div class="empty-state"><p>Ingen resultater funnet</p><p>Prøv et annet søkeord</p></div>';
      return;
    }

    const existChecks = await getExistingPlaceChecks(results);
    renderSearchResults(resultsContainer, results, existChecks, currentSearchType);
    wireSearchAddButtons(resultsContainer, results, async (result, btn) => {
      await handleAddFromSearch(result, btn);
    });
  } catch (error) {
    console.error('Søkefeil:', error);
    stopSearchLoading(resultsContainer);
    resultsContainer.innerHTML = `<div class="empty-state"><p>${escapeHtml(getSearchErrorMessage(error))}</p></div>`;
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
      mapsUrl: result.googleMapsUrl || result.mapsUrl,
      tripAdvisorUrl: result.tripAdvisorUrl || '',
      addedBy: currentUser
    });

    button.textContent = 'Lagt til!';
    showToast(`${result.name} lagt til i ${currentSearchType === 'restaurant' ? 'restauranter' : currentSearchType === 'activity' ? 'aktiviteter' : 'barer'}`);
  } catch (error) {
    console.error('Feil ved tillegging:', error);
    button.disabled = false;
    button.textContent = 'Legg til';
    showToast('Kunne ikke legge til. Prøv igjen.');
  }
}

function renderSearchResults(container, results, existChecks, type = currentSearchType) {
  stopSearchLoading(container);
  container.innerHTML = results.map((result, index) => buildSearchResultCard(result, index, !!existChecks[index], type)).join('');
}

function buildSearchResultCard(result, index, alreadyAdded, type) {
  const mapsUrl = result.googleMapsUrl || result.mapsUrl;
  const entityLabel = getEntityLabelDefinite(type);
  return `
    <div class="search-result-card">
      <div class="search-result-header">
        <span class="search-result-name">${escapeHtml(result.name)}</span>
      </div>
      <div class="search-result-address">${escapeHtml(result.address || '')}</div>
      ${result.category ? `<span class="search-result-type">${escapeHtml(result.category)}</span>` : ''}
      <div class="search-result-links">
        ${mapsUrl ? `<a href="${escapeHtml(mapsUrl)}" class="search-link link-popup-trigger" data-url="${escapeHtml(mapsUrl)}" data-title="${escapeHtml(result.name)} - Google Maps" data-provider="google_maps" data-entity-label="${entityLabel}">Google Maps</a>` : ''}
        ${result.tripAdvisorUrl ? `<a href="${escapeHtml(result.tripAdvisorUrl)}" class="search-link link-popup-trigger" data-url="${escapeHtml(result.tripAdvisorUrl)}" data-title="${escapeHtml(result.name)} - TripAdvisor" data-provider="tripadvisor" data-entity-label="${entityLabel}">TripAdvisor</a>` : ''}
      </div>
      <div class="search-result-actions">
        <button class="btn-add" data-index="${index}" ${alreadyAdded ? 'disabled' : ''}>
          ${alreadyAdded ? 'Allerede lagt til' : 'Legg til'}
        </button>
      </div>
    </div>`;
}

function wireSearchAddButtons(container, results, onAdd) {
  container.querySelectorAll('.btn-add:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const result = results[parseInt(btn.dataset.index)];
      await onAdd(result, btn);
    });
  });
}

function getSearchErrorMessage(error) {
  switch (error?.code) {
    case 'missing_api_key':
      return 'Geoapify API-key mangler. Opprett prosjekt og lim inn nokkelen i docs/js/places-search.js.';
    case 'invalid_api_key':
      return 'Geoapify API-key er ugyldig. Sjekk nokkelen i docs/js/places-search.js.';
    case 'rate_limit':
      return 'Geoapify kvote/rate limit er brukt opp. Prov igjen senere.';
    case 'network':
      return 'Nettverksfeil. Sjekk internett og prov igjen.';
    default:
      return 'Soket feilet. Prov igjen.';
  }
}

async function getExistingPlaceChecks(results) {
  // Fast path: use the already-synced local items instead of N Firestore queries.
  if (allItemsLoaded) {
    const knownPlaceIds = new Set(
      allItems
        .map(item => item.placeId)
        .filter(Boolean)
    );
    return results.map(result => !!result.placeId && knownPlaceIds.has(result.placeId));
  }

  // Safe fallback during initial app load before allItems listener returns.
  return Promise.all(results.map(r => placeIdExists(r.placeId)));
}

function renderSearchLoading(container, options = {}) {
  stopSearchLoading(container);

  const title = options.title || 'Soker...';
  const subtitle = options.subtitle || 'Henter resultater';

  container.innerHTML = `
    <div class="loading search-loading" role="status" aria-live="polite">
      <div class="search-loading-row">
        <div class="spinner"></div>
        <div class="search-loading-copy">
          <div class="search-loading-title">${escapeHtml(title)}</div>
          <div class="search-loading-subtitle">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <div class="search-loading-progress">
        <div class="search-loading-progress-bar" style="width: 14%"></div>
      </div>
    </div>`;

  const bar = container.querySelector('.search-loading-progress-bar');
  let progress = 14;
  const timerId = setInterval(() => {
    progress += Math.max(1.4, (90 - progress) * 0.14);
    progress = Math.min(progress, 90);
    if (bar) {
      bar.style.width = `${progress.toFixed(1)}%`;
    }
  }, 120);

  searchLoadingStates.set(container, { timerId });
}

function stopSearchLoading(container) {
  const state = searchLoadingStates.get(container);
  if (!state) return;
  clearInterval(state.timerId);
  searchLoadingStates.delete(container);
}

function clearInlineSearchContainer(container, { clearInput = false } = {}) {
  if (!container) return;
  const resultsDiv = container.querySelector('.inline-search-results');
  const clearBtn = container.querySelector('.inline-search-clear');
  const input = container.querySelector('.inline-search-input');

  if (resultsDiv) {
    stopSearchLoading(resultsDiv);
    resultsDiv.innerHTML = '';
  }
  if (clearBtn) clearBtn.classList.add('hidden');
  if (clearInput && input) input.value = '';
}

function clearAllInlineSearchResults({ clearInputs = false } = {}) {
  document.querySelectorAll('.inline-search').forEach(container => {
    clearInlineSearchContainer(container, { clearInput: clearInputs });
  });
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
  const tripAdvisorLink = document.getElementById('modal-tripadvisor-link');
  if (item.mapsUrl) {
    mapsLink.dataset.url = item.mapsUrl;
    mapsLink.dataset.title = `${item.name} - Google Maps`;
    mapsLink.dataset.provider = 'google_maps';
    mapsLink.dataset.entityLabel = getEntityLabelDefinite(item.type);
    mapsLink.classList.remove('hidden');
  } else {
    mapsLink.classList.add('hidden');
  }

  if (tripAdvisorLink) {
    if (item.tripAdvisorUrl) {
      tripAdvisorLink.dataset.url = item.tripAdvisorUrl;
      tripAdvisorLink.dataset.title = `${item.name} - TripAdvisor`;
      tripAdvisorLink.dataset.provider = 'tripadvisor';
      tripAdvisorLink.dataset.entityLabel = getEntityLabelDefinite(item.type);
      tripAdvisorLink.classList.remove('hidden');
    } else {
      tripAdvisorLink.classList.add('hidden');
    }
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

function openLinkPopup(url, title, options = {}) {
  const safeUrl = (url || '').trim();
  if (!safeUrl || safeUrl === '#') return;

  const provider = normalizeProvider(options.provider, safeUrl);
  const entityLabel = options.entityLabel || 'stedet';
  const forceExternalCta = shouldShowExternalCtaOnly(safeUrl, provider);

  document.getElementById('link-popup-title').textContent = title;
  document.getElementById('link-popup-external').href = safeUrl;
  const externalLink = document.getElementById('link-popup-external');
  const iframe = document.getElementById('link-popup-iframe');
  const fallback = document.getElementById('link-popup-fallback');
  const fallbackText = document.getElementById('link-popup-fallback-text');
  const fallbackBtn = document.getElementById('link-popup-fallback-btn');
  const status = document.getElementById('link-popup-status');

  if (status) {
    status.textContent = 'Laster side...';
    status.classList.toggle('hidden', forceExternalCta);
  }

  if (fallback && fallbackText && fallbackBtn) {
    fallbackText.textContent = buildPopupFallbackDescription(provider);
    fallbackBtn.textContent = buildPopupFallbackText(provider, entityLabel);
    fallbackBtn.href = safeUrl;
    fallback.classList.toggle('hidden', !forceExternalCta);
  }

  if (externalLink) {
    externalLink.textContent = forceExternalCta ? 'Åpne i ny fane ↗' : 'Åpne i ny fane ↗';
  }

  iframe.classList.toggle('hidden', forceExternalCta);
  iframe.src = forceExternalCta ? 'about:blank' : safeUrl;
  document.getElementById('link-popup').classList.remove('hidden');
}

function closeLinkPopup() {
  document.getElementById('link-popup').classList.add('hidden');
  const iframe = document.getElementById('link-popup-iframe');
  iframe.src = '';
  iframe.classList.remove('hidden');
  const status = document.getElementById('link-popup-status');
  if (status) status.classList.add('hidden');
  const fallback = document.getElementById('link-popup-fallback');
  if (fallback) fallback.classList.add('hidden');
}

function normalizeProvider(provider, url) {
  if (provider) return provider;
  const lower = (url || '').toLowerCase();
  if (lower.includes('tripadvisor.')) return 'tripadvisor';
  if (lower.includes('google.com/maps') || lower.includes('maps.google.')) return 'google_maps';
  return 'website';
}

function shouldShowExternalCtaOnly(url, provider) {
  if (provider === 'tripadvisor' || provider === 'google_maps') return true;
  const lower = (url || '').toLowerCase();
  return lower.includes('tripadvisor.') || lower.includes('google.com/maps') || lower.includes('maps.google.');
}

function buildPopupFallbackText(provider, entityLabel) {
  if (provider === 'tripadvisor') return `Se ${entityLabel} på Tripadvisor`;
  if (provider === 'google_maps') return `Se ${entityLabel} i Google Maps`;
  return `Se ${entityLabel} i ny fane`;
}

function buildPopupFallbackDescription(provider) {
  if (provider === 'tripadvisor' || provider === 'google_maps') {
    return 'Denne siden kan ikke vises inne i popupen, men du kan åpne den direkte.';
  }
  return 'Lenken åpnes best i ny fane.';
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
  // Render uplanlagte items — auto-populert fra allItems med ≥3 stjerner
  const itinItemIds = new Set(itineraryItems.map(i => i.itemId));

  const suggestions = allItems
    .filter(i => i.averageRating >= 3 && i.ratingCount > 0 && !itinItemIds.has(i.id))
    .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));

  const unplanned = itineraryItems.filter(i => !i.day || !i.slot);

  const byType = { restaurant: [], activity: [], bar: [] };
  unplanned.forEach(i => { if (byType[i.type]) byType[i.type].push({ ...i, kind: 'itin' }); });
  suggestions.forEach(i => { if (byType[i.type]) byType[i.type].push({ ...i, kind: 'new' }); });

  const unplannedIds = { restaurant: 'unplanned-restaurants', activity: 'unplanned-activities', bar: 'unplanned-bars' };
  for (const type of ['restaurant', 'activity', 'bar']) {
    const el = document.getElementById(unplannedIds[type]);
    if (!el) continue;
    const items = byType[type];
    el.innerHTML = items.length > 0
      ? items.map(i => i.kind === 'itin' ? createItineraryCard(i) : createSuggestionCard(i)).join('')
      : '<div class="slot-empty">Ingen forslag ennå</div>';
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

function getTypeLabel(type) {
  return type === 'restaurant' ? 'Restaurant' : type === 'activity' ? 'Aktivitet' : 'Bar';
}

function getEntityLabelDefinite(type) {
  if (type === 'restaurant') return 'restauranten';
  if (type === 'activity') return 'aktiviteten';
  if (type === 'bar') return 'baren';
  return 'stedet';
}

function createItineraryCard(item) {
  const typeLabel = getTypeLabel(item.type);
  return `
    <div class="itinerary-card" data-itin-id="${item.id}" draggable="true">
      <span class="grip">⠿</span>
      <span class="itin-name">${escapeHtml(item.name)}</span>
      <span class="itin-type ${item.type}">${typeLabel}</span>
      <button class="itin-remove" title="Fjern">&times;</button>
    </div>`;
}

function createSuggestionCard(item) {
  const typeLabel = getTypeLabel(item.type);
  return `
    <div class="itinerary-card suggestion-card"
         data-item-id="${item.id}"
         data-name="${escapeHtml(item.name)}"
         data-item-type="${item.type}"
         draggable="true">
      <span class="grip">⠿</span>
      <span class="itin-name">${escapeHtml(item.name)}</span>
      <span class="itin-type ${item.type}">${typeLabel}</span>
      ${item.averageRating > 0 ? `<span class="itin-rating">★ ${item.averageRating}</span>` : ''}
    </div>`;
}

// === Drag-and-drop ===
let draggedData = null;

function setupDragAndDrop() {
  document.querySelectorAll('.time-slot').forEach(slot => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });
    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;

      const day = slot.dataset.day || null;
      const slotName = slot.dataset.slot || null;

      try {
        const data = JSON.parse(raw);
        if (data.kind === 'itin') {
          await moveItineraryItem(data.id, day, slotName, 0);
        } else {
          const docRef = await addToItinerary(data.itemId, data.name, data.itemType, currentUser);
          if (day && slotName) {
            await moveItineraryItem(docRef.id, day, slotName, 0);
          }
        }
      } catch (err) {
        showToast('Kunne ikke flytte');
        console.error(err);
      }
    });
  });
}

function handleDragStart(e) {
  const card = e.currentTarget;
  let data;
  if (card.dataset.itinId) {
    data = { kind: 'itin', id: card.dataset.itinId };
  } else {
    data = { kind: 'new', itemId: card.dataset.itemId,
             name: card.dataset.name, itemType: card.dataset.itemType };
  }
  e.dataTransfer.setData('text/plain', JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'move';
  draggedData = data;
  setTimeout(() => card.classList.add('dragging'), 0);
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  draggedData = null;
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
    if (card.dataset.itinId) {
      draggedData = { kind: 'itin', id: card.dataset.itinId };
    } else {
      draggedData = { kind: 'new', itemId: card.dataset.itemId,
                      name: card.dataset.name, itemType: card.dataset.itemType };
    }

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

    const dropTarget = elementBelow?.closest('.time-slot');
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

    if (currentDropTarget && draggedData) {
      const day = currentDropTarget.dataset.day || null;
      const slot = currentDropTarget.dataset.slot || null;
      currentDropTarget.classList.remove('drag-over');

      (async () => {
        try {
          if (draggedData.kind === 'itin') {
            await moveItineraryItem(draggedData.id, day, slot, 0);
          } else {
            const docRef = await addToItinerary(draggedData.itemId, draggedData.name, draggedData.itemType, currentUser);
            if (day && slot) {
              await moveItineraryItem(docRef.id, day, slot, 0);
            }
          }
        } catch (err) {
          showToast('Kunne ikke flytte');
          console.error(err);
        }
      })();
    }
    currentDropTarget = null;
    draggedData = null;
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
