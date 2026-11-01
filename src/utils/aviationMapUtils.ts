export interface AerodromeSearchItem {
  id: string;
  code: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  elevationFt?: number;
}

/**
 * Curated directory of Indian Aerodromes, VFR Reporting Points, and Regional Hubs
 * for instant zero-latency search, supplemented by live Open-Meteo Global Geocoding API.
 */
export const INDIAN_AERODROMES_AND_VFR_FIXES: AerodromeSearchItem[] = [
  { id: 'vocl', code: 'VOCL', name: 'Calicut International (Kozhikode)', region: 'Kerala, India', lat: 11.1368, lng: 75.9553, elevationFt: 342 },
  { id: 'vomy', code: 'VOMY', name: 'Mysore Airport (Mandakalli)', region: 'Karnataka, India', lat: 12.2300, lng: 76.6558, elevationFt: 2346 },
  { id: 'vobg', code: 'VOBG', name: 'HAL Bengaluru Airport', region: 'Karnataka, India', lat: 12.9499, lng: 77.6682, elevationFt: 2912 },
  { id: 'vobl', code: 'VOBL', name: 'Kempegowda Intl Bengaluru', region: 'Karnataka, India', lat: 13.1986, lng: 77.7066, elevationFt: 3000 },
  { id: 'voci', code: 'VOCI', name: 'Cochin International (Kochi)', region: 'Kerala, India', lat: 10.1520, lng: 76.4019, elevationFt: 30 },
  { id: 'vocb', code: 'VOCB', name: 'Coimbatore International', region: 'Tamil Nadu, India', lat: 11.0300, lng: 77.0434, elevationFt: 1324 },
  { id: 'vokn', code: 'VOKN', name: 'Kannur International', region: 'Kerala, India', lat: 11.9186, lng: 75.5472, elevationFt: 330 },
  { id: 'voml', code: 'VOML', name: 'Mangaluru International (Mangalore)', region: 'Karnataka, India', lat: 12.9613, lng: 74.8901, elevationFt: 337 },
  { id: 'votv', code: 'VOTV', name: 'Trivandrum International', region: 'Kerala, India', lat: 8.4821, lng: 76.9200, elevationFt: 15 },
  { id: 'vomm', code: 'VOMM', name: 'Chennai International', region: 'Tamil Nadu, India', lat: 12.9941, lng: 80.1709, elevationFt: 52 },
  { id: 'vosm', code: 'VOSM', name: 'Salem Airport', region: 'Tamil Nadu, India', lat: 11.7833, lng: 78.0656, elevationFt: 998 },
  { id: 'vomd', code: 'VOMD', name: 'Madurai Airport', region: 'Tamil Nadu, India', lat: 9.8345, lng: 78.0934, elevationFt: 459 },
  { id: 'votr', code: 'VOTR', name: 'Tiruchirappalli International (Trichy)', region: 'Tamil Nadu, India', lat: 10.7654, lng: 78.7097, elevationFt: 288 },
  { id: 'vopc', code: 'VOPC', name: 'Puducherry Airport (Pondicherry)', region: 'Puducherry, India', lat: 11.9689, lng: 79.8100, elevationFt: 141 },
  { id: 'vohs', code: 'VOHS', name: 'Rajiv Gandhi Intl Hyderabad', region: 'Telangana, India', lat: 17.2403, lng: 78.4294, elevationFt: 2024 },
  { id: 'vohY', code: 'VOHY', name: 'Begumpet Airport Hyderabad', region: 'Telangana, India', lat: 17.4531, lng: 78.4676, elevationFt: 1742 },
  { id: 'vabb', code: 'VABB', name: 'Chhatrapati Shivaji Maharaj Intl Mumbai', region: 'Maharashtra, India', lat: 19.0896, lng: 72.8656, elevationFt: 39 },
  { id: 'vajj', code: 'VAJJ', name: 'Juhu Aerodrome Mumbai', region: 'Maharashtra, India', lat: 19.0980, lng: 72.8339, elevationFt: 12 },
  { id: 'vapo', code: 'VAPO', name: 'Pune Airport (Lohegaon)', region: 'Maharashtra, India', lat: 18.5822, lng: 73.9197, elevationFt: 1942 },
  { id: 'vogo', code: 'VOGO', name: 'Goa Dabolim Airport', region: 'Goa, India', lat: 15.3808, lng: 73.8314, elevationFt: 184 },
  { id: 'vidp', code: 'VIDP', name: 'Indira Gandhi Intl New Delhi', region: 'Delhi, India', lat: 28.5562, lng: 77.1000, elevationFt: 777 },
  { id: 'vidd', code: 'VIDD', name: 'Safdarjung Airport New Delhi', region: 'Delhi, India', lat: 28.5843, lng: 77.2058, elevationFt: 705 },
  { id: 'vecc', code: 'VECC', name: 'Netaji Subhas Chandra Bose Intl Kolkata', region: 'West Bengal, India', lat: 22.6547, lng: 88.4467, elevationFt: 16 },
  { id: 'vaah', code: 'VAAH', name: 'Sardar Vallabhbhai Patel Intl Ahmedabad', region: 'Gujarat, India', lat: 23.0772, lng: 72.6347, elevationFt: 189 },
  { id: 'vijp', code: 'VIJP', name: 'Jaipur International', region: 'Rajasthan, India', lat: 26.8242, lng: 75.8122, elevationFt: 1263 },
  { id: 'vilk', code: 'VILK', name: 'Chaudhary Charan Singh Intl Lucknow', region: 'Uttar Pradesh, India', lat: 26.7606, lng: 80.8893, elevationFt: 410 },
  { id: 'vanp', code: 'VANP', name: 'Dr. Babasaheb Ambedkar Intl Nagpur', region: 'Maharashtra, India', lat: 21.0922, lng: 79.0472, elevationFt: 1033 },
  { id: 'vabp', code: 'VABP', name: 'Raja Bhoj Airport Bhopal', region: 'Madhya Pradesh, India', lat: 23.2875, lng: 77.3374, elevationFt: 1719 },
  { id: 'vaid', code: 'VAID', name: 'Devi Ahilyabai Holkar Airport Indore', region: 'Madhya Pradesh, India', lat: 22.7218, lng: 75.8011, elevationFt: 1850 },
  { id: 'vovz', code: 'VOVZ', name: 'Visakhapatnam Airport', region: 'Andhra Pradesh, India', lat: 17.7212, lng: 83.2245, elevationFt: 15 },
  { id: 'vobz', code: 'VOBZ', name: 'Vijayawada Airport', region: 'Andhra Pradesh, India', lat: 16.5304, lng: 80.7968, elevationFt: 82 },
  { id: 'votp', code: 'VOTP', name: 'Tirupati Airport', region: 'Andhra Pradesh, India', lat: 13.6325, lng: 79.5433, elevationFt: 350 },
  { id: 'vohb', code: 'VOHB', name: 'Hubballi Airport (Hubli)', region: 'Karnataka, India', lat: 15.3617, lng: 75.0849, elevationFt: 2171 },
  { id: 'vobm', code: 'VOBM', name: 'Belagavi Airport (Belgaum)', region: 'Karnataka, India', lat: 15.8593, lng: 74.6183, elevationFt: 2489 },
  { id: 'vogb', code: 'VOGB', name: 'Kalaburagi Airport (Gulbarga)', region: 'Karnataka, India', lat: 17.3056, lng: 76.9531, elevationFt: 1473 },
  { id: 'vasl', code: 'VASL', name: 'Solapur Airport', region: 'Maharashtra, India', lat: 17.6280, lng: 75.9348, elevationFt: 1585 },
  { id: 'vokl', code: 'VOKL', name: 'Kalaburagi Airport (Gulbarga)', region: 'Karnataka, India', lat: 17.3056, lng: 76.9531, elevationFt: 1473 },
  // Popular VFR Reporting Points along South India Training Corridors
  { id: 'nilambur', code: 'NILAMBUR', name: 'Nilambur VFR Fix', region: 'Malappuram, Kerala', lat: 11.2789, lng: 76.2255, elevationFt: 150 },
  { id: 'gundlupet', code: 'GUNDLUPET', name: 'Gundlupet VFR Checkpoint', region: 'Chamarajanagar, Karnataka', lat: 11.8087, lng: 76.6914, elevationFt: 2610 },
  { id: 'wayanad', code: 'WAYANAD', name: 'Kalpetta / Wayanad VFR Pass', region: 'Wayanad, Kerala', lat: 11.6103, lng: 76.0828, elevationFt: 2560 },
  { id: 'kabini', code: 'KABINI', name: 'Kabini Reservoir VFR Fix', region: 'HD Kote, Karnataka', lat: 11.9647, lng: 76.3372, elevationFt: 2290 },
  { id: 'ooty', code: 'OOTY', name: 'Udhagamandalam / Ooty Ridge', region: 'Nilgiris, Tamil Nadu', lat: 11.4102, lng: 76.6950, elevationFt: 7350 },
  { id: 'palakkad', code: 'PALAKKAD', name: 'Palakkad Gap VFR Corridor', region: 'Palakkad, Kerala', lat: 10.7867, lng: 76.6548, elevationFt: 275 },
  { id: 'hassan', code: 'HASSAN', name: 'Hassan VFR Reporting Point', region: 'Karnataka, India', lat: 13.0068, lng: 76.0996, elevationFt: 3080 },
  { id: 'mandya', code: 'MANDYA', name: 'Mandya VFR Checkpoint', region: 'Karnataka, India', lat: 12.5218, lng: 76.8951, elevationFt: 2225 },
  { id: 'chamarajanagar', code: 'CHAMARAJANAGAR', name: 'Chamarajanagar VFR Point', region: 'Karnataka, India', lat: 11.9261, lng: 76.9437, elevationFt: 2280 },
];

/**
 * Filter built-in Indian aerodromes & VFR fixes by query string
 */
export function filterLocalAerodromes(query: string): AerodromeSearchItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return INDIAN_AERODROMES_AND_VFR_FIXES.filter(
    (item) =>
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.region.toLowerCase().includes(q)
  ).slice(0, 6);
}

const TILE_SIZE = 256;

/**
 * Convert (lat, lng) at zoom level `z` into global Web Mercator pixel coordinates (worldX, worldY)
 */
export function latLngToWorldPixel(
  lat: number,
  lng: number,
  zoom: number
): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * Convert global Web Mercator pixel coordinates (worldX, worldY) at zoom `z` back to (lat, lng)
 */
export function worldPixelToLatLng(
  worldX: number,
  worldY: number,
  zoom: number
): { lat: number; lng: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lng = (worldX / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * worldY) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Math.max(-85, Math.min(85, Number(lat.toFixed(4)))),
    lng: Math.max(-180, Math.min(180, Number(lng.toFixed(4)))),
  };
}

/**
 * Compute optimal zoom level (integer 4..13) and center (lat, lng) to fit all route waypoints & alternate
 */
export function computeBestFitZoomAndCenter(
  points: Array<{ lat: number; lng: number }>,
  viewportWidth = 800,
  viewportHeight = 400
): { center: { lat: number; lng: number }; zoom: number } {
  if (!points || points.length === 0) {
    return { center: { lat: 11.68, lng: 76.3 }, zoom: 8 };
  }
  if (points.length === 1) {
    return {
      center: {
        lat: Number(points[0].lat.toFixed(4)),
        lng: Number(points[0].lng.toFixed(4)),
      },
      zoom: 10,
    };
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const center = {
    lat: Number(((minLat + maxLat) / 2).toFixed(4)),
    lng: Number(((minLng + maxLng) / 2).toFixed(4)),
  };

  const usableW = Math.max(220, viewportWidth - 140);
  const usableH = Math.max(160, viewportHeight - 130);

  for (let z = 12; z >= 4; z--) {
    const pMin = latLngToWorldPixel(maxLat, minLng, z);
    const pMax = latLngToWorldPixel(minLat, maxLng, z);
    const spanX = Math.abs(pMax.x - pMin.x);
    const spanY = Math.abs(pMax.y - pMin.y);
    if (spanX <= usableW && spanY <= usableH) {
      return { center, zoom: z };
    }
  }

  return { center, zoom: 6 };
}
