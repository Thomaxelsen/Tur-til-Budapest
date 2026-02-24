// Stedssøk via Nominatim (OpenStreetMap) - helt gratis, ingen API-nøkkel
// Brukspolicy: maks 1 forespørsel/sekund, User-Agent påkrevd
// https://nominatim.org/release-docs/latest/api/Search/

const BUDAPEST_BBOX = '18.9,47.35,19.2,47.6'; // vest,sør,øst,nord
const SEARCH_DELAY_MS = 1000; // Respekter rate-limit

let lastSearchTime = 0;

export async function searchPlaces(queryText, type) {
  // Rate-limiting: vent hvis forrige søk var for nylig
  const now = Date.now();
  const timeSinceLastSearch = now - lastSearchTime;
  if (timeSinceLastSearch < SEARCH_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY_MS - timeSinceLastSearch));
  }
  lastSearchTime = Date.now();

  // Bygg søkestreng med Budapest-kontekst
  const searchQuery = `${queryText} Budapest`;

  const params = new URLSearchParams({
    q: searchQuery,
    format: 'json',
    addressdetails: '1',
    limit: '10',
    viewbox: BUDAPEST_BBOX,
    bounded: '0', // Foretrekk resultater innenfor viewbox, men vis også utenfor
    'accept-language': 'no,en',
    countrycodes: 'hu'
  });

  // Legg til type-filter for restauranter
  if (type === 'restaurant') {
    // Nominatim støtter ikke direkte type-filter i fritekst-søk,
    // men vi kan bruke amenity-parametre i spesialiserte søk.
    // For fritekst bruker vi queryText som det er.
  }

  const url = `https://nominatim.openstreetmap.org/search?${params}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TurplanleggerenBudapest/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Søk feilet: ${response.status}`);
  }

  const data = await response.json();

  // Konverter til vårt format
  return data.map(place => ({
    placeId: `osm_${place.osm_type}_${place.osm_id}`,
    name: place.name || place.display_name.split(',')[0],
    address: formatAddress(place),
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
    osmType: place.type,
    category: place.category,
    mapsUrl: `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`
  }));
}

function formatAddress(place) {
  const addr = place.address;
  if (!addr) return place.display_name;

  const parts = [];
  if (addr.road) {
    parts.push(addr.road + (addr.house_number ? ' ' + addr.house_number : ''));
  }
  if (addr.suburb || addr.city_district) {
    parts.push(addr.suburb || addr.city_district);
  }
  if (addr.city || addr.town) {
    parts.push(addr.city || addr.town);
  }

  return parts.join(', ') || place.display_name.split(',').slice(0, 3).join(',');
}
