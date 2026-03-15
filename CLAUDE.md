# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Budapest 2026 - Turplanlegger" — a collaborative PWA for planning a group trip to Budapest (April 16–19, 2026). Norwegian UI, four users (Thomas, Carina, Kristine, Kim). Real-time sync via Firestore.

## Tech Stack

- **Vanilla JS** (ES Modules), HTML5, CSS3 — no framework, no build step
- **Firebase Firestore** v11.4.0 via CDN (not npm) — real-time database with offline persistence
- **Geoapify Places API** — location search bounded to Budapest
- **Service Worker** — PWA with cache versioning (`turplan-v8` in `sw.js`)
- **No Node.js** — no `package.json`, no build tools, no test framework

## Running Locally

```bash
python -m http.server 8765 -d docs
# Open http://localhost:8765
```

## Deploying

```bash
firebase deploy                        # Full deploy
firebase deploy --only hosting         # Static files only
firebase deploy --only firestore:rules # Security rules only
```

## Architecture

### File Layout (all source under `docs/`)

| File | Role |
|------|------|
| `index.html` | Complete app shell — all views as `<section>` elements |
| `js/firebase-config.js` | Firebase init, exports `db` |
| `js/firestore-service.js` | All Firestore CRUD + `onSnapshot` real-time listeners |
| `js/places-search.js` | Geoapify search client (standalone, no Firebase dependency) |
| `js/app.js` | All UI logic (~1300 lines): routing, rendering, modals, drag-and-drop |
| `css/style.css` | All styles, mobile-first |
| `sw.js` | Service Worker caching strategy |

### Routing

Hash-less SPA via `switchView(viewName)`. Views (`home`, `restaurants`, `activities`, `bars`, `toplist`, `itinerary`) are `<section>` elements toggled by CSS class `active`. Bottom nav buttons use `data-view` attributes.

### Data Flow

1. `startListeners()` sets up Firestore `onSnapshot` listeners on app load
2. Writes (add/rate/note/delete/move) go to Firestore
3. Snapshot callbacks re-render affected views automatically
4. State is module-level variables in `app.js` (`allItems`, `itineraryItems`, `currentUser`, etc.)
5. User identity stored in `localStorage` — no Firebase Auth

### Firestore Collections

- **`items`** — restaurants, activities, bars (field `type` distinguishes them)
- **`itinerary`** — items assigned to day/time-slot with `order` field for sorting

### Key Patterns

- **Drag-and-drop**: Native HTML5 drag API + custom touch implementation for mobile. Drops call `moveItineraryItem()` to persist to Firestore.
- **Modal system**: Shared `#detail-modal` for item details; `#link-popup` with iframe preview (with fallback for sites that block embedding).
- **Calendar export**: In-browser ICS file generation with `Europe/Budapest` timezone.
- **Service Worker versioning**: Bump `CACHE_NAME` in `sw.js` when deploying changes to cached assets.

## Important Notes

- Firestore rules are fully open (`allow read, write: if true`) — no authentication
- Geoapify API key is hardcoded in `places-search.js`
- Firebase config (project ID, API key) is in `firebase-config.js`
- The `public` directory for Firebase Hosting is `docs/` (configured in `firebase.json`)
