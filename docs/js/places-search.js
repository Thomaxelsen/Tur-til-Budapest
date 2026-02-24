// Geoapify Places API (client-side friendly with CORS).
// Create a project/API key at https://myprojects.geoapify.com/ and paste the key below.
const GEOAPIFY_API_KEY = '80414bfb37ad4bb48ac56b2432a08173';

const BUDAPEST_RECT = '18.9,47.35,19.2,47.6'; // lon1,lat1,lon2,lat2
const BUDAPEST_CENTER = '19.0402,47.4979'; // lon,lat
const RESULT_LIMIT = '12';
// Use name+address for better Google Maps place matching.
// Set to 'coordinates' to quickly roll back to the old behavior.
const GOOGLE_MAPS_LINK_MODE = 'name_address'; // 'name_address' | 'coordinates' | 'hybrid'
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map();

const TYPE_CATEGORIES = {
  restaurant: 'catering.restaurant',
  bar: 'catering.bar,catering.pub',
  activity: 'tourism.attraction,tourism.sights,entertainment,leisure'
};

export async function searchPlaces(queryText, type) {
  const trimmedQuery = (queryText || '').trim();
  if (!trimmedQuery) return [];
  const cacheKey = `${type || 'restaurant'}::${trimmedQuery.toLowerCase()}`;

  if (!GEOAPIFY_API_KEY || GEOAPIFY_API_KEY === 'SET_GEOAPIFY_API_KEY_HERE') {
    throw createSearchError('missing_api_key', 'Geoapify API key mangler');
  }

  const cached = getCachedSearchResults(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    categories: TYPE_CATEGORIES[type] || TYPE_CATEGORIES.restaurant,
    filter: `rect:${BUDAPEST_RECT}`,
    bias: `proximity:${BUDAPEST_CENTER}`,
    limit: RESULT_LIMIT,
    lang: 'en',
    name: trimmedQuery,
    apiKey: GEOAPIFY_API_KEY
  });

  const url = `https://api.geoapify.com/v2/places?${params.toString()}`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw createSearchError('network', 'Nettverksfeil ved sok');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw createSearchError('invalid_api_key', 'Ugyldig Geoapify API key');
    }
    if (response.status === 429) {
      throw createSearchError('rate_limit', 'Geoapify rate limit eller kvote overskredet');
    }
    throw createSearchError('api_error', `Sok feilet (${response.status})`);
  }

  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];

  const mappedResults = features.map(mapGeoapifyResult).filter(Boolean);
  setCachedSearchResults(cacheKey, mappedResults);
  return mappedResults;
}

function mapGeoapifyResult(feature) {
  const p = feature?.properties || {};
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  const safeLat = Number.isFinite(lat) ? lat : null;
  const safeLon = Number.isFinite(lon) ? lon : null;
  const placeIdRaw = p.place_id || p.datasource?.raw?.osm_id || `${p.name || 'place'}_${safeLat || 'x'}_${safeLon || 'y'}`;
  const name = p.name || p.address_line1 || (p.formatted ? p.formatted.split(',')[0] : 'Ukjent sted');
  const address = p.address_line2 || p.formatted || '';
  const category = normalizeCategoryLabel(p.categories?.[0] || '');

  const googleMapsUrl = buildGoogleMapsUrl({
    name,
    address,
    lat: safeLat,
    lon: safeLon
  });

  return {
    placeId: `geoapify_${placeIdRaw}`,
    name,
    address,
    lat: safeLat,
    lon: safeLon,
    category,
    mapsUrl: googleMapsUrl,
    googleMapsUrl,
    tripAdvisorUrl: `https://www.tripadvisor.com/Search?q=${encodeURIComponent(`${name} Budapest`)}`,
    source: 'geoapify'
  };
}

function normalizeCategoryLabel(category) {
  if (!category) return '';
  return category
    .split('.')
    .slice(-2)
    .join(' / ')
    .replace(/_/g, ' ');
}

function buildGoogleMapsUrl({ name, address, lat, lon }) {
  const coordinateQuery = (lat !== null && lon !== null) ? `${lat},${lon}` : '';
  const placeQuery = buildPlaceQuery(name, address);

  let query = '';
  if (GOOGLE_MAPS_LINK_MODE === 'coordinates') {
    query = coordinateQuery || placeQuery;
  } else if (GOOGLE_MAPS_LINK_MODE === 'hybrid') {
    query = placeQuery || coordinateQuery;
  } else {
    // name_address (default)
    query = placeQuery || coordinateQuery;
  }

  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildPlaceQuery(name, address) {
  const cleanName = (name || '').trim();
  const cleanAddress = (address || '').trim();

  if (cleanName && cleanAddress) {
    return `${cleanName}, ${cleanAddress}, Budapest`;
  }
  if (cleanName) {
    return `${cleanName}, Budapest`;
  }
  return '';
}

function createSearchError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getCachedSearchResults(cacheKey) {
  const entry = searchCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(cacheKey);
    return null;
  }
  return entry.results;
}

function setCachedSearchResults(cacheKey, results) {
  searchCache.set(cacheKey, {
    createdAt: Date.now(),
    results
  });
}
