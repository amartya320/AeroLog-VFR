export type RouteTrackMode = 'straight' | 'freeform';

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  freeformLat?: number; // Original freeform latitude before snapping to straight line
  freeformLng?: number; // Original freeform longitude before snapping to straight line
  lineFraction?: number; // Fractional position t in [0, 1] along DEP -> DEST straight line
  elevationFt?: number;
  windDir?: number; // Degrees True (FROM which wind blows, 0-360)
  windSpd?: number; // Knots
  windSource?: string; // e.g. 'Windy / GFS 850hPa (5000ft)' | 'Manual'
  notes?: string;
}

export interface AlternateAerodrome {
  name: string;
  lat: number;
  lng: number;
  elevationFt?: number;
  windDir: number; // Degrees True (0-360)
  windSpd: number; // Knots
  windSource?: string;
}

export interface LegOverride {
  trackDeg?: number; // Manual track override for leg
  distanceNm?: number; // Manual leg distance override (NM)
  windDir?: number; // Manual wind direction override (deg)
  windSpd?: number; // Manual wind speed override (kt)
}

export type WindModelId = 'best_match' | 'ecmwf_ifs025' | 'gfs_seamless' | 'icon_seamless';

export interface WindModelOption {
  id: WindModelId;
  label: string;
  shortLabel: string;
}

export const WIND_MODEL_OPTIONS: WindModelOption[] = [
  {
    id: 'best_match',
    label: 'Open-Meteo Multi-Model Blend (Free · Real Pressure Levels)',
    shortLabel: 'Open-Meteo Blend',
  },
  {
    id: 'ecmwf_ifs025',
    label: 'ECMWF IFS 9km Upper-Air (Same Default Model as Windy · Free)',
    shortLabel: 'ECMWF IFS',
  },
  {
    id: 'gfs_seamless',
    label: 'NOAA GFS Global Upper-Air (Aviation Standard · Free)',
    shortLabel: 'NOAA GFS',
  },
  {
    id: 'icon_seamless',
    label: 'DWD ICON Global Upper-Air (High-Res · Free)',
    shortLabel: 'DWD ICON',
  },
];

export type AlternateOriginMode = 'DEP' | 'DEST';

export interface FlightConfig {
  cruiseTasKt: number; // True Airspeed for whole flight (knots)
  fuelFlowLph: number; // Fuel flow in Liters / Hour (L/hr)
  initialFuelLiters: number; // Total usable ramp/block fuel on board (L)
  taxiFuelLiters: number; // User-given Taxi fuel (L)
  contingencyPercent: number; // Contingency fuel as % of Trip Fuel (e.g. 5 or 10)
  holdingFuelLiters: number; // Holding / reserve fuel (L)
  reserveFuelLiters: number; // Minimum VFR reserve threshold (L)
  departureDate: string; // Estimated departure date "YYYY-MM-DD" in IST
  airborneTime: string; // Estimated departure / airborne time in "HH:MM" (24h IST)
  selectedAltitudeFt: number; // Cruising altitude in feet (e.g. 3000, 5000, 7000, 10000)
  windModel?: WindModelId; // Selected NWP upper-air wind model
  magneticVariationDeg: number; // East positive (+), West negative (-)
  globalTrackOverrideDeg: number | null; // Optional fixed track for whole flight if specified
  alternate: AlternateAerodrome | null; // User-selected alternate aerodrome (null by default, no auto-alternate)
  alternateFrom?: AlternateOriginMode; // Where alternate leg data is calculated from: 'DEP' or 'DEST'
  customAlternateFuelLiters?: number | null; // Optional user-given custom alternate fuel (L)
  roundOffValues?: boolean; // Round off decimal values to nearest whole integer across all calculations
  routeTrackMode?: RouteTrackMode; // 'straight' (waypoints stick to DEP->DEST straight line) or 'freeform'
}

export interface ComputedLeg {
  index: number;
  legId: string;
  fromWaypoint: Waypoint;
  toWaypoint: Waypoint;
  fromName: string;
  toName: string;
  // Distance (NM)
  trackDeg: number; // True Track (0-359)
  legDistNm: number; // Leg Distance (NM)
  coveredDistNm: number; // Cumulative distance covered (NM)
  toGoDistNm: number; // Remaining distance to destination (NM)
  // Winds
  windDir: number; // Wind direction (°T)
  windSpd: number; // Wind speed (kt)
  windSource: string;
  // E6B Wind Triangle outputs
  wcaDeg: number; // Wind Correction Angle (-left, +right)
  trueHeadingEst: number; // True Heading (0-359)
  magHeadingEst: number; // Magnetic Heading (0-359)
  headwindKt: number; // Positive = headwind, Negative = tailwind
  crosswindKt: number; // Positive = from right, Negative = from left
  gsEstKt: number; // Estimated Ground Speed (kt)
  // Time
  timeTakenMin: number; // Leg time in minutes (exact decimal)
  timeTakenRoundedMin: number; // Rounded integer minutes for standard navlog
  runningTimeMin: number; // Cumulative time in minutes
  eta: string; // Estimated Time of Arrival (HH:MM)
  // Fuel (Liters)
  fuelEstLiters: number; // Fuel required for this leg (L)
  cumulativeFuelEstLiters: number; // Cumulative trip fuel burned up to end of leg (L)
  fuelRemainingLiters: number; // Fuel remaining at end of leg (L, after taxi + cumulative trip burn)
  // Midpoint for wind fetch
  midLat: number;
  midLng: number;
}

export interface ComputedAlternate {
  fromRole: AlternateOriginMode;
  fromName: string;
  toName: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  trackDeg: number;
  distanceNm: number;
  windDir: number;
  windSpd: number;
  windSource: string;
  wcaDeg: number;
  trueHeadingEst: number;
  magHeadingEst: number;
  headwindKt: number;
  crosswindKt: number;
  gsEstKt: number;
  timeEstMin: number;
  timeEstRoundedMin: number;
  eta: string;
  fuelEstLiters: number;
  fuelRemainingAtAltLiters: number;
  totalTripPlusAltFuelLiters: number;
  isFuelSufficientWithAlt: boolean;
}

export interface FuelPlanBreakdown {
  taxiFuelLiters: number;
  tripFuelLiters: number;
  contingencyPercent: number;
  contingencyFuelLiters: number;
  alternateFuelLiters: number;
  computedAlternateFuelLiters: number;
  isCustomAlternateFuel: boolean;
  holdingFuelLiters: number;
  holdingTimeMin: number;
  totalTakeoffFuelRequiredLiters: number; // Trip + Contingency + Alternate + Holding
  totalBlockFuelRequiredLiters: number; // Taxi + Trip + Contingency + Alternate + Holding
  initialBlockFuelLiters: number;
  takeoffFuelAvailableLiters: number; // Initial - Taxi
  extraFuelMarginLiters: number; // Initial - Total Block Fuel Required
  isBlockFuelSufficient: boolean;
}

export interface NavLogSummary {
  totalDistanceNm: number;
  totalTimeMin: number;
  totalFuelRequiredLiters: number; // Trip fuel
  finalFuelRemainingLiters: number;
  reserveFuelLiters: number;
  isFuelSufficient: boolean;
  averageGsKt: number;
  finalEta: string;
  legs: ComputedLeg[];
  alternateLeg: ComputedAlternate | null;
  fuelPlan: FuelPlanBreakdown;
}

export interface AltitudeLevelOption {
  altitudeFt: number;
  pressureHpa: number;
  windyLevel: string;
  label: string;
}

export const ALTITUDE_LEVELS: AltitudeLevelOption[] = [
  { altitudeFt: 500, pressureHpa: 1000, windyLevel: '1000h', label: '500 ft (SFC / 1000 hPa)' },
  { altitudeFt: 1500, pressureHpa: 950, windyLevel: '950h', label: '1,500 ft (950 hPa)' },
  { altitudeFt: 2500, pressureHpa: 925, windyLevel: '925h', label: '2,500 ft (925 hPa)' },
  { altitudeFt: 3500, pressureHpa: 900, windyLevel: '900h', label: '3,500 ft (900 hPa)' },
  { altitudeFt: 5000, pressureHpa: 850, windyLevel: '850h', label: '5,000 ft (850 hPa)' },
  { altitudeFt: 6500, pressureHpa: 800, windyLevel: '800h', label: '6,500 ft (800 hPa)' },
  { altitudeFt: 10000, pressureHpa: 700, windyLevel: '700h', label: '10,000 ft (700 hPa)' },
  { altitudeFt: 14000, pressureHpa: 600, windyLevel: '600h', label: '14,000 ft (600 hPa)' },
  { altitudeFt: 18000, pressureHpa: 500, windyLevel: '500h', label: 'FL180 / 18,000 ft (500 hPa)' },
];

export function getClosestAltitudeLevel(altitudeFt: number): AltitudeLevelOption {
  let closest = ALTITUDE_LEVELS[0];
  let minDiff = Math.abs(altitudeFt - closest.altitudeFt);
  for (const level of ALTITUDE_LEVELS) {
    const diff = Math.abs(altitudeFt - level.altitudeFt);
    if (diff < minDiff) {
      minDiff = diff;
      closest = level;
    }
  }
  return closest;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_NM = 3440.065; // Mean Earth radius in Nautical Miles

/**
 * Round a numeric value according to roundOffValues flag (whole integer vs 1 decimal place)
 */
export function roundCalc(val: number, roundOff?: boolean): number {
  if (!isFinite(val) || isNaN(val)) return 0;
  return roundOff ? Math.round(val) : Math.round(val * 10) / 10;
}

/**
 * Format a numeric value as string according to roundOffValues flag ("12" vs "12.3")
 */
export function formatCalc(val: number, roundOff?: boolean): string {
  if (!isFinite(val) || isNaN(val)) return roundOff ? '0' : '0.0';
  return roundOff ? String(Math.round(val)) : val.toFixed(1);
}

export function normalizeDegrees(deg: number): number {
  const mod = deg % 360;
  const normalized = mod < 0 ? mod + 360 : mod;
  const rounded = Math.round(normalized);
  return rounded === 360 ? 0 : rounded;
}

/**
 * Round a wind direction in degrees True (0-359) to the nearest 10th degree (0, 10, 20, ..., 350)
 * matching standard aviation meteorology (METAR / WINTEM / FD) reporting conventions.
 */
export function roundWindDirToTenDeg(deg: number): number {
  if (!isFinite(deg) || isNaN(deg)) return 0;
  const mod = deg % 360;
  const normalized = mod < 0 ? mod + 360 : mod;
  const rounded = Math.round(normalized / 10) * 10;
  return rounded === 360 ? 0 : rounded;
}

/**
 * Great-circle distance between two coordinates in Nautical Miles (NM)
 */
export function calculateDistanceNm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const rLat1 = lat1 * DEG_TO_RAD;
  const rLat2 = lat2 * DEG_TO_RAD;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_NM * c;
}

/**
 * Initial True Track (bearing) from point 1 to point 2 in degrees (0-359)
 */
export function calculateTrueTrackDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (Math.abs(lat1 - lat2) < 1e-9 && Math.abs(lng1 - lng2) < 1e-9) {
    return 0;
  }
  const rLat1 = lat1 * DEG_TO_RAD;
  const rLat2 = lat2 * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;

  const y = Math.sin(dLng) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLng);
  const brng = Math.atan2(y, x) * RAD_TO_DEG;
  return normalizeDegrees(brng);
}

export interface StraightLineProjection {
  lat: number;
  lng: number;
  t: number; // Fractional progress along DEP -> DEST straight line (0 = DEP, 1 = DEST)
  distanceFromDepNm: number;
  totalLineDistanceNm: number;
  crossTrackDistanceNm: number;
}

/**
 * Interpolate a coordinate at a fractional position `fraction` (0..1) along the straight line
 * drawn between `dep` and `dest`.
 */
export function interpolatePointAlongLine(
  dep: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  fraction: number,
  clampMin = 0.02,
  clampMax = 0.98
): StraightLineProjection {
  const safeT = Math.max(clampMin, Math.min(clampMax, isFinite(fraction) ? fraction : 0.5));
  const lat = Math.round((dep.lat + safeT * (dest.lat - dep.lat)) * 10000) / 10000;
  const lng = Math.round((dep.lng + safeT * (dest.lng - dep.lng)) * 10000) / 10000;
  const totalLineDistanceNm = calculateDistanceNm(dep.lat, dep.lng, dest.lat, dest.lng);
  const distanceFromDepNm = calculateDistanceNm(dep.lat, dep.lng, lat, lng);
  return {
    lat,
    lng,
    t: Math.round(safeT * 10000) / 10000,
    distanceFromDepNm: Math.round(distanceFromDepNm * 10) / 10,
    totalLineDistanceNm: Math.round(totalLineDistanceNm * 10) / 10,
    crossTrackDistanceNm: 0,
  };
}

/**
 * Orthogonally project any coordinate `(lat, lng)` onto the straight line drawn between `dep` and `dest`.
 * Returns the snapped `(lat, lng)` on the line, its fractional progress `t` in `[clampMin, clampMax]`,
 * distance from departure in NM, and cross-track distance in NM.
 */
export function projectPointOntoStraightLine(
  dep: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  lat: number,
  lng: number,
  clampMin = 0.02,
  clampMax = 0.98
): StraightLineProjection {
  const midLatRad = ((dep.lat + dest.lat) / 2) * DEG_TO_RAD;
  const cosLat = Math.max(0.1, Math.cos(midLatRad));
  const dx = (dest.lng - dep.lng) * cosLat;
  const dy = dest.lat - dep.lat;
  const lenSq = dx * dx + dy * dy;

  let rawT = 0.5;
  if (lenSq > 1e-10) {
    const px = (lng - dep.lng) * cosLat;
    const py = lat - dep.lat;
    rawT = (px * dx + py * dy) / lenSq;
  }

  const t = Math.max(clampMin, Math.min(clampMax, rawT));
  const snappedLat = Math.round((dep.lat + t * (dest.lat - dep.lat)) * 10000) / 10000;
  const snappedLng = Math.round((dep.lng + t * (dest.lng - dep.lng)) * 10000) / 10000;
  const totalLineDistanceNm = calculateDistanceNm(dep.lat, dep.lng, dest.lat, dest.lng);
  const distanceFromDepNm = calculateDistanceNm(dep.lat, dep.lng, snappedLat, snappedLng);
  const crossTrackDistanceNm = calculateDistanceNm(lat, lng, snappedLat, snappedLng);

  return {
    lat: snappedLat,
    lng: snappedLng,
    t: Math.round(t * 10000) / 10000,
    distanceFromDepNm: Math.round(distanceFromDepNm * 10) / 10,
    totalLineDistanceNm: Math.round(totalLineDistanceNm * 10) / 10,
    crossTrackDistanceNm: Math.round(crossTrackDistanceNm * 10) / 10,
  };
}

/**
 * Snap all intermediate waypoints (`1 .. waypoints.length - 2`) onto the straight line drawn
 * between Departure (`waypoints[0]`) and Destination (`waypoints[waypoints.length - 1]`),
 * ordering them sequentially from Departure (`t = 0`) to Destination (`t = 1`).
 */
export function snapWaypointsToStraightLine(waypoints: Waypoint[]): Waypoint[] {
  if (waypoints.length === 0) return [];
  if (waypoints.length === 1) {
    return [{ ...waypoints[0], lineFraction: 0 }];
  }
  const dep = { ...waypoints[0], lineFraction: 0 };
  const dest = { ...waypoints[waypoints.length - 1], lineFraction: 1 };
  if (waypoints.length === 2) {
    return [dep, dest];
  }

  const intermediates = waypoints.slice(1, waypoints.length - 1);
  const projected = intermediates.map((wp, idx) => {
    const proj = projectPointOntoStraightLine(dep, dest, wp.lat, wp.lng, 0.03, 0.97);
    return {
      wp,
      originalIdx: idx,
      t: proj.t,
    };
  });

  // Sort intermediate waypoints along the line from DEP (t=0) to DEST (t=1)
  projected.sort((a, b) => {
    if (Math.abs(a.t - b.t) > 1e-4) return a.t - b.t;
    return a.originalIdx - b.originalIdx;
  });

  // Ensure distinct fractional positions if multiple waypoints were projected to the exact same spot
  const n = projected.length;
  for (let i = 1; i < n; i++) {
    if (projected[i].t - projected[i - 1].t < 0.015) {
      projected[i].t = Math.min(0.97, projected[i - 1].t + 0.02);
    }
  }

  const snappedIntermediates: Waypoint[] = projected.map(({ wp, t }) => {
    const interp = interpolatePointAlongLine(dep, dest, t, 0.02, 0.98);
    return {
      ...wp,
      freeformLat: wp.freeformLat ?? wp.lat,
      freeformLng: wp.freeformLng ?? wp.lng,
      lat: interp.lat,
      lng: interp.lng,
      lineFraction: interp.t,
    };
  });

  return [dep, ...snappedIntermediates, dest];
}

/**
 * Restore saved freeform coordinates when switching from Straight-Line mode to Freeform mode.
 */
export function restoreFreeformWaypoints(waypoints: Waypoint[]): Waypoint[] {
  if (waypoints.length <= 2) return waypoints;
  return waypoints.map((wp, idx) => {
    if (idx === 0 || idx === waypoints.length - 1) return wp;
    if (wp.freeformLat !== undefined && wp.freeformLng !== undefined) {
      return {
        ...wp,
        lat: wp.freeformLat,
        lng: wp.freeformLng,
      };
    }
    return wp;
  });
}

/**
 * Insert a new waypoint into the flight plan:
 * - If 0 waypoints exist, sets Departure (`DEP`).
 * - If 1 waypoint exists, sets Destination (`DEST`).
 * - If 2+ waypoints exist, inserts the waypoint BETWEEN Departure and Destination:
 *   - In `'straight'` mode, sticks the waypoint onto the `DEP -> DEST` straight line and orders all intermediate waypoints along the line.
 *   - In `'freeform'` mode, inserts the waypoint into the route segment between `DEP` and `DEST` with minimal detour.
 */
export function insertEnRouteWaypoint(
  waypoints: Waypoint[],
  candidateWp: Waypoint,
  mode: RouteTrackMode = 'straight',
  explicitFraction?: number
): Waypoint[] {
  if (waypoints.length === 0) {
    return [{ ...candidateWp, lineFraction: 0 }];
  }
  if (waypoints.length === 1) {
    const dep = { ...waypoints[0], lineFraction: 0 };
    const dest = { ...candidateWp, lineFraction: 1 };
    return [dep, dest];
  }

  const dep = waypoints[0];
  const dest = waypoints[waypoints.length - 1];

  if (mode === 'straight') {
    const proj =
      explicitFraction !== undefined
        ? interpolatePointAlongLine(dep, dest, explicitFraction, 0.03, 0.97)
        : projectPointOntoStraightLine(dep, dest, candidateWp.lat, candidateWp.lng, 0.03, 0.97);

    const snappedNewWp: Waypoint = {
      ...candidateWp,
      freeformLat:
        explicitFraction !== undefined ? proj.lat : (candidateWp.freeformLat ?? candidateWp.lat),
      freeformLng:
        explicitFraction !== undefined ? proj.lng : (candidateWp.freeformLng ?? candidateWp.lng),
      lat: proj.lat,
      lng: proj.lng,
      lineFraction: proj.t,
    };

    const withInserted = [
      ...waypoints.slice(0, waypoints.length - 1),
      snappedNewWp,
      dest,
    ];
    return snapWaypointsToStraightLine(withInserted);
  }

  // Freeform mode: if explicitFraction is provided, place at that fraction between DEP and DEST;
  // otherwise keep exact freeform coordinates and insert into the segment with minimum detour.
  let wpToInsert: Waypoint = {
    ...candidateWp,
    freeformLat: candidateWp.lat,
    freeformLng: candidateWp.lng,
  };

  if (explicitFraction !== undefined) {
    const interp = interpolatePointAlongLine(dep, dest, explicitFraction, 0.03, 0.97);
    wpToInsert = {
      ...candidateWp,
      lat: interp.lat,
      lng: interp.lng,
      freeformLat: interp.lat,
      freeformLng: interp.lng,
      lineFraction: interp.t,
    };
  }

  // Find segment [bestIdx, bestIdx + 1] that minimizes added distance
  let bestInsertAfterIdx = waypoints.length - 2;
  let minExtraDist = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const origLeg = calculateDistanceNm(a.lat, a.lng, b.lat, b.lng);
    const viaCandidate =
      calculateDistanceNm(a.lat, a.lng, wpToInsert.lat, wpToInsert.lng) +
      calculateDistanceNm(wpToInsert.lat, wpToInsert.lng, b.lat, b.lng);
    const extra = viaCandidate - origLeg;
    if (extra < minExtraDist) {
      minExtraDist = extra;
      bestInsertAfterIdx = i;
    }
  }

  const copy = [...waypoints];
  copy.splice(bestInsertAfterIdx + 1, 0, wpToInsert);
  return copy;
}

/**
 * Update or set the Departure (`DEP`, index 0) or Destination (`DEST`, last index) waypoint.
 * When `mode === 'straight'`, all existing intermediate waypoints automatically stick to the
 * updated straight line drawn between the new Departure and Destination.
 */
export function updateEndpointWaypoint(
  waypoints: Waypoint[],
  role: 'DEP' | 'DEST',
  newEndpoint: Waypoint,
  mode: RouteTrackMode = 'straight'
): Waypoint[] {
  if (waypoints.length === 0) {
    return [{ ...newEndpoint, lineFraction: role === 'DEP' ? 0 : 1 }];
  }
  if (waypoints.length === 1) {
    if (role === 'DEP') {
      return [{ ...newEndpoint, lineFraction: 0 }];
    }
    return [
      { ...waypoints[0], lineFraction: 0 },
      { ...newEndpoint, lineFraction: 1 },
    ];
  }

  const oldDep = waypoints[0];
  const oldDest = waypoints[waypoints.length - 1];
  const nextDep: Waypoint = role === 'DEP' ? { ...newEndpoint, lineFraction: 0 } : oldDep;
  const nextDest: Waypoint = role === 'DEST' ? { ...newEndpoint, lineFraction: 1 } : oldDest;
  const intermediates = waypoints.slice(1, waypoints.length - 1);

  if (mode === 'straight' && intermediates.length > 0) {
    const reprojected = intermediates.map((wp, idx) => {
      const prevT =
        wp.lineFraction !== undefined && wp.lineFraction > 0 && wp.lineFraction < 1
          ? wp.lineFraction
          : projectPointOntoStraightLine(
              oldDep,
              oldDest,
              wp.lat,
              wp.lng,
              0.05,
              0.95
            ).t || (idx + 1) / (intermediates.length + 1);
      const interp = interpolatePointAlongLine(nextDep, nextDest, prevT, 0.03, 0.97);
      return {
        ...wp,
        lat: interp.lat,
        lng: interp.lng,
        freeformLat: interp.lat,
        freeformLng: interp.lng,
        lineFraction: interp.t,
      };
    });
    return snapWaypointsToStraightLine([nextDep, ...reprojected, nextDest]);
  }

  return [nextDep, ...intermediates, nextDest];
}

/**
 * Generate `intermediateCount` evenly spaced en-route waypoints along the straight line
 * between `dep` and `dest`, returning `[dep, ...intermediates, dest]`.
 */
export function generateWaypointsAlongStraightLine(
  dep: Waypoint,
  dest: Waypoint,
  intermediateCount: number
): Waypoint[] {
  const safeCount = Math.max(0, Math.min(12, Math.round(intermediateCount)));
  const cleanDep: Waypoint = { ...dep, lineFraction: 0 };
  const cleanDest: Waypoint = { ...dest, lineFraction: 1 };
  if (safeCount === 0) {
    return [cleanDep, cleanDest];
  }

  const generated: Waypoint[] = [];
  for (let i = 1; i <= safeCount; i++) {
    const fraction = i / (safeCount + 1);
    const interp = interpolatePointAlongLine(cleanDep, cleanDest, fraction, 0.02, 0.98);
    generated.push({
      id: `wp-line-${Date.now()}-${i}`,
      name: `WPT ${i} (${Math.round(interp.distanceFromDepNm)}NM)`,
      lat: interp.lat,
      lng: interp.lng,
      freeformLat: interp.lat,
      freeformLng: interp.lng,
      lineFraction: interp.t,
      windDir: dep.windDir ?? 270,
      windSpd: dep.windSpd ?? 15,
      windSource: dep.windSource || 'Forecast',
    });
  }

  return [cleanDep, ...generated, cleanDest];
}

export interface WindTriangleResult {
  wcaDeg: number; // Wind Correction Angle in degrees (-left, +right)
  trueHeadingDeg: number; // True Heading (0-359)
  magHeadingDeg: number; // Magnetic Heading (0-359)
  groundSpeedKt: number; // Ground Speed in knots
  headwindKt: number; // Headwind component (+ headwind, - tailwind)
  crosswindKt: number; // Crosswind component (+ right, - left)
}

/**
 * Standard E6B Flight Computer Wind Triangle Solver
 */
export function solveWindTriangle(
  trackDeg: number,
  tasKt: number,
  windDirDeg: number,
  windSpdKt: number,
  magVarDeg: number = 0
): WindTriangleResult {
  const safeTas = Math.max(1, tasKt);
  const safeWindSpd = Math.max(0, windSpdKt);

  const windToTrackRad = (windDirDeg - trackDeg) * DEG_TO_RAD;
  const crosswindKt = safeWindSpd * Math.sin(windToTrackRad);
  const headwindKt = safeWindSpd * Math.cos(windToTrackRad);

  const sinWca = Math.max(-0.999, Math.min(0.999, crosswindKt / safeTas));
  const wcaRad = Math.asin(sinWca);
  const wcaDeg = wcaRad * RAD_TO_DEG;

  const gsRaw = safeTas * Math.cos(wcaRad) - headwindKt;
  const groundSpeedKt = Math.max(5, gsRaw);

  const trueHeadingExact = trackDeg + wcaDeg;
  const trueHeadingDeg = normalizeDegrees(trueHeadingExact);
  const magHeadingDeg = normalizeDegrees(trueHeadingExact - magVarDeg);

  return {
    wcaDeg: Math.round(wcaDeg * 10) / 10,
    trueHeadingDeg,
    magHeadingDeg,
    groundSpeedKt: Math.round(groundSpeedKt * 10) / 10,
    headwindKt: Math.round(headwindKt * 10) / 10,
    crosswindKt: Math.round(crosswindKt * 10) / 10,
  };
}

/**
 * Return current Date and Time in Indian Standard Time (IST, UTC+05:30) as YYYY-MM-DD and HH:MM
 */
export function getCurrentIstDateTime(now: Date = new Date()): {
  date: string;
  time: string;
} {
  // IST is UTC + 5 hours 30 minutes (330 minutes)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  const hh = String(istDate.getUTCHours()).padStart(2, '0');
  const min = String(istDate.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
  };
}

/**
 * Add minutes to a "HH:MM" time string and return "HH:MM"
 */
export function addMinutesToTime(baseTimeHhMm: string, minutesToAdd: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec((baseTimeHhMm || '').trim());
  if (!match) return '--:--';
  const baseHours = parseInt(match[1], 10);
  const baseMins = parseInt(match[2], 10);
  if (isNaN(baseHours) || isNaN(baseMins)) return '--:--';

  const totalMins =
    ((baseHours * 60 + baseMins + Math.round(minutesToAdd)) % (24 * 60) + 24 * 60) %
    (24 * 60);
  const hh = Math.floor(totalMins / 60)
    .toString()
    .padStart(2, '0');
  const mm = (totalMins % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Compute Alternate Aerodrome leg from the chosen origin waypoint (DEP or DEST)
 */
export function computeAlternateLeg(
  originWp: Waypoint,
  alternate: AlternateAerodrome,
  config: FlightConfig,
  originBaseEta: string,
  fuelUsedBeforeAltLiters: number,
  fromRole: AlternateOriginMode = 'DEST'
): ComputedAlternate {
  const roundOff = Boolean(config.roundOffValues);
  const rawDist = calculateDistanceNm(
    originWp.lat,
    originWp.lng,
    alternate.lat,
    alternate.lng
  );
  const distanceNm = roundCalc(rawDist, roundOff);
  const trackDeg = calculateTrueTrackDeg(
    originWp.lat,
    originWp.lng,
    alternate.lat,
    alternate.lng
  );

  const windDir = normalizeDegrees(alternate.windDir ?? originWp.windDir ?? 0);
  const windSpd = Math.max(0, Math.round(alternate.windSpd ?? originWp.windSpd ?? 0));
  const windSource = alternate.windSource || originWp.windSource || 'Forecast';

  const windTriangle = solveWindTriangle(
    trackDeg,
    config.cruiseTasKt,
    windDir,
    windSpd,
    config.magneticVariationDeg
  );

  const gsEstKt = Math.round(windTriangle.groundSpeedKt);
  const effectiveGs = Math.max(5, windTriangle.groundSpeedKt);

  const timeEstMin =
    distanceNm > 0 ? roundCalc((distanceNm / effectiveGs) * 60, roundOff) : 0;
  const timeEstRoundedMin = Math.round(timeEstMin);
  const eta = addMinutesToTime(originBaseEta, timeEstMin);

  const fuelEstLiters = roundCalc(
    (timeEstMin / 60) * Math.max(0, config.fuelFlowLph),
    roundOff
  );
  const taxiLiters = roundCalc(Math.max(0, config.taxiFuelLiters || 0), roundOff);
  const totalTripPlusAltFuelLiters = roundCalc(
    fuelUsedBeforeAltLiters + fuelEstLiters,
    roundOff
  );
  const fuelRemainingAtAltLiters = roundCalc(
    config.initialFuelLiters - taxiLiters - totalTripPlusAltFuelLiters,
    roundOff
  );

  return {
    fromRole,
    fromName: originWp.name,
    toName: alternate.name,
    fromLat: originWp.lat,
    fromLng: originWp.lng,
    toLat: alternate.lat,
    toLng: alternate.lng,
    trackDeg,
    distanceNm,
    windDir,
    windSpd,
    windSource,
    wcaDeg: Math.round(windTriangle.wcaDeg),
    trueHeadingEst: windTriangle.trueHeadingDeg,
    magHeadingEst: windTriangle.magHeadingDeg,
    headwindKt: roundCalc(windTriangle.headwindKt, roundOff),
    crosswindKt: roundCalc(windTriangle.crosswindKt, roundOff),
    gsEstKt,
    timeEstMin,
    timeEstRoundedMin,
    eta,
    fuelEstLiters,
    fuelRemainingAtAltLiters,
    totalTripPlusAltFuelLiters,
    isFuelSufficientWithAlt: fuelRemainingAtAltLiters >= (config.holdingFuelLiters || 0),
  };
}

/**
 * Compute full fuel plan breakdown (Taxi + Trip + Contingency % + Alternate + Holding)
 */
export function computeFuelPlanBreakdown(
  tripFuelLiters: number,
  computedAlternateFuelLiters: number,
  config: FlightConfig
): FuelPlanBreakdown {
  const roundOff = Boolean(config.roundOffValues);
  const taxiFuelLiters = roundCalc(Math.max(0, config.taxiFuelLiters || 0), roundOff);
  const cleanTripFuelLiters = roundCalc(Math.max(0, tripFuelLiters), roundOff);
  const contingencyPercent = Math.max(0, config.contingencyPercent || 0);
  const contingencyFuelLiters = roundCalc(
    cleanTripFuelLiters * (contingencyPercent / 100),
    roundOff
  );

  const hasCustomAltFuel =
    config.customAlternateFuelLiters !== null &&
    config.customAlternateFuelLiters !== undefined &&
    !isNaN(config.customAlternateFuelLiters);

  const cleanComputedAltFuel = roundCalc(
    Math.max(0, computedAlternateFuelLiters || 0),
    roundOff
  );
  const alternateFuelLiters = hasCustomAltFuel
    ? roundCalc(Math.max(0, Number(config.customAlternateFuelLiters)), roundOff)
    : cleanComputedAltFuel;

  const holdingFuelLiters = roundCalc(
    Math.max(0, config.holdingFuelLiters || 0),
    roundOff
  );
  const holdingTimeMin =
    config.fuelFlowLph > 0
      ? Math.round((holdingFuelLiters / config.fuelFlowLph) * 60)
      : 0;

  const totalTakeoffFuelRequiredLiters = roundCalc(
    cleanTripFuelLiters +
      contingencyFuelLiters +
      alternateFuelLiters +
      holdingFuelLiters,
    roundOff
  );

  const totalBlockFuelRequiredLiters = roundCalc(
    taxiFuelLiters + totalTakeoffFuelRequiredLiters,
    roundOff
  );

  const initialBlockFuelLiters = roundCalc(
    Math.max(0, config.initialFuelLiters),
    roundOff
  );
  const takeoffFuelAvailableLiters = roundCalc(
    initialBlockFuelLiters - taxiFuelLiters,
    roundOff
  );
  const extraFuelMarginLiters = roundCalc(
    initialBlockFuelLiters - totalBlockFuelRequiredLiters,
    roundOff
  );

  return {
    taxiFuelLiters,
    tripFuelLiters: cleanTripFuelLiters,
    contingencyPercent,
    contingencyFuelLiters,
    alternateFuelLiters,
    computedAlternateFuelLiters: cleanComputedAltFuel,
    isCustomAlternateFuel: hasCustomAltFuel,
    holdingFuelLiters,
    holdingTimeMin,
    totalTakeoffFuelRequiredLiters,
    totalBlockFuelRequiredLiters,
    initialBlockFuelLiters,
    takeoffFuelAvailableLiters,
    extraFuelMarginLiters,
    isBlockFuelSufficient: initialBlockFuelLiters >= totalBlockFuelRequiredLiters,
  };
}

/**
 * Compute full Flight NavLog table rows and summary from waypoints, overrides, and config
 */
export function computeNavLog(
  waypoints: Waypoint[],
  config: FlightConfig,
  overrides: Record<string, LegOverride> = {}
): NavLogSummary {
  const roundOff = Boolean(config.roundOffValues);
  const taxiLiters = roundCalc(Math.max(0, config.taxiFuelLiters || 0), roundOff);
  const takeoffFuelAvailable = roundCalc(
    config.initialFuelLiters - taxiLiters,
    roundOff
  );
  const altOriginMode: AlternateOriginMode =
    config.alternateFrom === 'DEP' ? 'DEP' : 'DEST';

  if (waypoints.length < 2) {
    const altLeg =
      waypoints.length === 1 && config.alternate
        ? computeAlternateLeg(
            waypoints[0],
            config.alternate,
            config,
            config.airborneTime || '--:--',
            0,
            'DEP'
          )
        : null;
    const fuelPlan = computeFuelPlanBreakdown(
      0,
      altLeg ? altLeg.fuelEstLiters : 0,
      config
    );
    return {
      totalDistanceNm: 0,
      totalTimeMin: 0,
      totalFuelRequiredLiters: 0,
      finalFuelRemainingLiters: takeoffFuelAvailable,
      reserveFuelLiters: roundCalc(config.holdingFuelLiters, roundOff),
      isFuelSufficient: fuelPlan.isBlockFuelSufficient,
      averageGsKt: 0,
      finalEta: config.airborneTime || '--:--',
      legs: [],
      alternateLeg: altLeg,
      fuelPlan,
    };
  }

  // First pass: determine leg distances so we can compute "Covered" and "To go"
  const rawLegDistances: number[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const fromWp = waypoints[i];
    const toWp = waypoints[i + 1];
    const legId = `${fromWp.id}->${toWp.id}`;
    const ov = overrides[legId];
    const geoDist = calculateDistanceNm(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng);
    const dist =
      ov?.distanceNm !== undefined && !isNaN(ov.distanceNm) && ov.distanceNm >= 0
        ? roundCalc(ov.distanceNm, roundOff)
        : roundCalc(geoDist, roundOff);
    rawLegDistances.push(dist);
  }

  const totalDistanceNm = roundCalc(
    rawLegDistances.reduce((acc, d) => acc + d, 0),
    roundOff
  );

  let coveredDistNm = 0;
  let runningTimeMin = 0;
  let cumulativeFuelUsedLiters = 0;

  const computedLegs: ComputedLeg[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const fromWp = waypoints[i];
    const toWp = waypoints[i + 1];
    const legId = `${fromWp.id}->${toWp.id}`;
    const ov = overrides[legId] || {};

    const legDistNm = rawLegDistances[i];
    coveredDistNm = roundCalc(coveredDistNm + legDistNm, roundOff);
    const toGoDistNm = Math.max(
      0,
      roundCalc(totalDistanceNm - coveredDistNm, roundOff)
    );

    const geoTrack = calculateTrueTrackDeg(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng);
    const masterStraightTrack =
      config.routeTrackMode === 'straight' && waypoints.length >= 2
        ? calculateTrueTrackDeg(
            waypoints[0].lat,
            waypoints[0].lng,
            waypoints[waypoints.length - 1].lat,
            waypoints[waypoints.length - 1].lng
          )
        : geoTrack;
    const trackDeg =
      ov.trackDeg !== undefined && !isNaN(ov.trackDeg)
        ? normalizeDegrees(ov.trackDeg)
        : config.globalTrackOverrideDeg !== null &&
          !isNaN(config.globalTrackOverrideDeg)
        ? normalizeDegrees(config.globalTrackOverrideDeg)
        : masterStraightTrack;

    // Wind data for leg: override -> destination waypoint wind -> departure waypoint wind -> 0
    const windDir =
      ov.windDir !== undefined && !isNaN(ov.windDir)
        ? normalizeDegrees(ov.windDir)
        : toWp.windDir !== undefined
        ? normalizeDegrees(toWp.windDir)
        : fromWp.windDir !== undefined
        ? normalizeDegrees(fromWp.windDir)
        : 0;

    const windSpd =
      ov.windSpd !== undefined && !isNaN(ov.windSpd)
        ? Math.max(0, ov.windSpd)
        : toWp.windSpd !== undefined
        ? Math.max(0, toWp.windSpd)
        : fromWp.windSpd !== undefined
        ? Math.max(0, fromWp.windSpd)
        : 0;

    const windSource =
      ov.windDir !== undefined || ov.windSpd !== undefined
        ? 'Manual Override'
        : toWp.windSource || fromWp.windSource || 'Default';

    const windTriangle = solveWindTriangle(
      trackDeg,
      config.cruiseTasKt,
      windDir,
      windSpd,
      config.magneticVariationDeg
    );

    const gsEstKt = Math.round(windTriangle.groundSpeedKt);
    const effectiveGs = Math.max(5, windTriangle.groundSpeedKt);

    // Time Taken (minutes) = (Leg Distance NM / Ground Speed kt) * 60
    const timeTakenMin =
      legDistNm > 0 ? roundCalc((legDistNm / effectiveGs) * 60, roundOff) : 0;
    const timeTakenRoundedMin = Math.round(timeTakenMin);

    runningTimeMin = roundCalc(runningTimeMin + timeTakenMin, roundOff);
    const eta = addMinutesToTime(config.airborneTime, runningTimeMin);

    // Fuel Required for leg (Liters) = (Leg Time in hours) * Fuel Flow (L/hr)
    const fuelEstLiters = roundCalc(
      (timeTakenMin / 60) * Math.max(0, config.fuelFlowLph),
      roundOff
    );

    cumulativeFuelUsedLiters = roundCalc(
      cumulativeFuelUsedLiters + fuelEstLiters,
      roundOff
    );

    const fuelRemainingLiters = roundCalc(
      takeoffFuelAvailable - cumulativeFuelUsedLiters,
      roundOff
    );

    computedLegs.push({
      index: i + 1,
      legId,
      fromWaypoint: fromWp,
      toWaypoint: toWp,
      fromName: fromWp.name,
      toName: toWp.name,
      trackDeg,
      legDistNm,
      coveredDistNm,
      toGoDistNm,
      windDir,
      windSpd: Math.round(windSpd),
      windSource,
      wcaDeg: roundCalc(windTriangle.wcaDeg, roundOff),
      trueHeadingEst: windTriangle.trueHeadingDeg,
      magHeadingEst: windTriangle.magHeadingDeg,
      headwindKt: roundCalc(windTriangle.headwindKt, roundOff),
      crosswindKt: roundCalc(windTriangle.crosswindKt, roundOff),
      gsEstKt,
      timeTakenMin,
      timeTakenRoundedMin,
      runningTimeMin,
      eta,
      fuelEstLiters,
      cumulativeFuelEstLiters: cumulativeFuelUsedLiters,
      fuelRemainingLiters,
      midLat: (fromWp.lat + toWp.lat) / 2,
      midLng: (fromWp.lng + toWp.lng) / 2,
    });
  }

  const finalFuelRemainingLiters =
    computedLegs.length > 0
      ? computedLegs[computedLegs.length - 1].fuelRemainingLiters
      : takeoffFuelAvailable;

  const averageGsKt =
    runningTimeMin > 0
      ? roundCalc(totalDistanceNm / (runningTimeMin / 60), roundOff)
      : config.cruiseTasKt;

  const finalEta =
    computedLegs.length > 0
      ? computedLegs[computedLegs.length - 1].eta
      : config.airborneTime;

  const departureWp = waypoints[0];
  const destinationWp = waypoints[waypoints.length - 1];
  const altOriginWp = altOriginMode === 'DEP' ? departureWp : destinationWp;
  const altBaseTime = altOriginMode === 'DEP' ? config.airborneTime : finalEta;

  const alternateLeg = config.alternate
    ? computeAlternateLeg(
        altOriginWp,
        config.alternate,
        config,
        altBaseTime,
        cumulativeFuelUsedLiters,
        altOriginMode
      )
    : null;

  const fuelPlan = computeFuelPlanBreakdown(
    cumulativeFuelUsedLiters,
    alternateLeg ? alternateLeg.fuelEstLiters : 0,
    config
  );

  return {
    totalDistanceNm,
    totalTimeMin: runningTimeMin,
    totalFuelRequiredLiters: cumulativeFuelUsedLiters,
    finalFuelRemainingLiters,
    reserveFuelLiters: roundCalc(config.holdingFuelLiters, roundOff),
    isFuelSufficient: fuelPlan.isBlockFuelSufficient,
    averageGsKt,
    finalEta,
    legs: computedLegs,
    alternateLeg,
    fuelPlan,
  };
}

/**
 * Parse Google Earth KML XML text into a list of Waypoints.
 * Prefers <Point> placemarks over <LineString> route path placemarks so exported KMLs
 * do not duplicate waypoints from the decorative Flight Route Path LineString.
 */
export function parseKmlWaypoints(kmlText: string): Waypoint[] {
  const waypoints: Waypoint[] = [];
  if (!kmlText || typeof kmlText !== 'string') return waypoints;

  const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/gi;
  const allPlacemarks = kmlText.match(placemarkRegex) || [];

  // Separate <Point> placemarks from <LineString> placemarks
  const pointPlacemarks = allPlacemarks.filter((pm) => /<Point[\s>]/i.test(pm));
  const targetPlacemarks =
    pointPlacemarks.length > 0 ? pointPlacemarks : allPlacemarks;

  for (let i = 0; i < targetPlacemarks.length; i++) {
    const pm = targetPlacemarks[i];
    const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(pm);
    const cleanedName = nameMatch
      ? nameMatch[1]
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .trim()
          .replace(/^\d+\.\s*/, '') // Strip leading "1. ", "2. " numbering if present
      : `WPT ${i + 1}`;

    // If it's a <Point> placemark, extract coordinates specifically from <Point>
    const pointBlockMatch = /<Point[\s\S]*?<\/Point>/i.exec(pm);
    const coordSource = pointBlockMatch ? pointBlockMatch[0] : pm;
    const coordMatch = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(coordSource);

    if (coordMatch) {
      const coordTuples = coordMatch[1]
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      for (let j = 0; j < coordTuples.length; j++) {
        const parts = coordTuples[j].split(',').map((s) => parseFloat(s.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const lng = Math.round(parts[0] * 10000) / 10000;
          const lat = Math.round(parts[1] * 10000) / 10000;
          const altMeters = parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : 0;

          // Avoid consecutive duplicate coordinates
          const prev = waypoints[waypoints.length - 1];
          if (
            prev &&
            Math.abs(prev.lat - lat) < 1e-5 &&
            Math.abs(prev.lng - lng) < 1e-5
          ) {
            continue;
          }

          waypoints.push({
            id: `kml-${Date.now()}-${i}-${j}`,
            name:
              coordTuples.length === 1
                ? cleanedName.toUpperCase()
                : `${cleanedName.toUpperCase()} ${j + 1}`,
            lat,
            lng,
            elevationFt: Math.round(altMeters * 3.28084),
            windDir: 270,
            windSpd: 12,
            windSource: 'KML Import',
          });
        }
      }
    }
  }

  return waypoints;
}

export interface WeatherGridNode {
  lat: number;
  lng: number;
  windDir: number; // Degrees True (0-359)
  windSpd: number; // Knots
  tempC: number; // Upper-air temperature (°C) at pressure level
  cloudCoverPct: number; // Total cloud cover (0-100%)
  precipMm: number; // Hourly precipitation (mm)
}

export interface WeatherGridBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

/**
 * Compute bounding box with aviation margin around route waypoints & optional alternate
 */
export function computeRouteWeatherBounds(
  waypoints: Array<{ lat: number; lng: number }>,
  alternate?: { lat: number; lng: number } | null
): WeatherGridBounds {
  const pts = [
    ...waypoints,
    ...(alternate ? [{ lat: alternate.lat, lng: alternate.lng }] : []),
  ];
  if (pts.length === 0) {
    return {
      minLat: 10.3,
      maxLat: 12.7,
      minLng: 75.1,
      maxLng: 77.5,
      centerLat: 11.5,
      centerLng: 76.3,
    };
  }
  let minLat = pts[0].lat;
  let maxLat = pts[0].lat;
  let minLng = pts[0].lng;
  let maxLng = pts[0].lng;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const latSpan = Math.max(0.8, maxLat - minLat);
  const lngSpan = Math.max(0.8, maxLng - minLng);
  const padLat = latSpan * 0.42;
  const padLng = lngSpan * 0.42;
  const finalMinLat = Number((minLat - padLat).toFixed(4));
  const finalMaxLat = Number((maxLat + padLat).toFixed(4));
  const finalMinLng = Number((minLng - padLng).toFixed(4));
  const finalMaxLng = Number((maxLng + padLng).toFixed(4));
  return {
    minLat: finalMinLat,
    maxLat: finalMaxLat,
    minLng: finalMinLng,
    maxLng: finalMaxLng,
    centerLat: Number(((finalMinLat + finalMaxLat) / 2).toFixed(4)),
    centerLng: Number(((finalMinLng + finalMaxLng) / 2).toFixed(4)),
  };
}

/**
 * Interpolate upper-air wind vector (u/v components), speed, temperature, cloud cover, and precipitation
 * at any arbitrary (lat, lng) coordinate from a set of WeatherGridNodes using inverse-distance weighting.
 */
export function interpolateWeatherAtCoord(
  nodes: WeatherGridNode[],
  lat: number,
  lng: number
): WeatherGridNode {
  if (!nodes || nodes.length === 0) {
    return {
      lat,
      lng,
      windDir: 270,
      windSpd: 14,
      tempC: 10,
      cloudCoverPct: 20,
      precipMm: 0,
    };
  }

  let weightSum = 0;
  let uSum = 0;
  let vSum = 0;
  let spdSum = 0;
  let tempSum = 0;
  let cloudSum = 0;
  let precipSum = 0;

  for (const node of nodes) {
    const dLat = lat - node.lat;
    const dLng = lng - node.lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < 1e-8) {
      return {
        lat,
        lng,
        windDir: roundWindDirToTenDeg(node.windDir),
        windSpd: node.windSpd,
        tempC: node.tempC,
        cloudCoverPct: node.cloudCoverPct,
        precipMm: node.precipMm,
      };
    }
    const w = 1 / Math.pow(distSq, 1.15);
    const rad = (node.windDir * Math.PI) / 180;
    uSum += Math.sin(rad) * node.windSpd * w;
    vSum += Math.cos(rad) * node.windSpd * w;
    spdSum += node.windSpd * w;
    tempSum += node.tempC * w;
    cloudSum += node.cloudCoverPct * w;
    precipSum += node.precipMm * w;
    weightSum += w;
  }

  const avgU = uSum / weightSum;
  const avgV = vSum / weightSum;
  const interpDir = roundWindDirToTenDeg((Math.atan2(avgU, avgV) * 180) / Math.PI);
  const interpSpd = Math.max(1, Math.round(spdSum / weightSum));
  const interpTemp = Math.round((tempSum / weightSum) * 10) / 10;
  const interpCloud = Math.min(100, Math.max(0, Math.round(cloudSum / weightSum)));
  const interpPrecip = Math.max(0, Math.round((precipSum / weightSum) * 10) / 10);

  return {
    lat,
    lng,
    windDir: interpDir,
    windSpd: interpSpd,
    tempC: interpTemp,
    cloudCoverPct: interpCloud,
    precipMm: interpPrecip,
  };
}

export type ImdSatelliteChannelId =
  | 'asia_ir1'
  | 'asia_ctbt'
  | 'asia_vis'
  | 'asia_wv'
  | 'globe_ir1'
  | 'globe_vis'
  | 'globe_wv';

export interface ImdSatelliteChannel {
  id: ImdSatelliteChannelId;
  shortLabel: string;
  label: string;
  sector: 'Asia / India Sector' | 'Full Disk Globe';
  wavelength: string;
  fileName: string;
  upstreamUrl: string;
  aviationSummary: string;
  bestFor: string;
}

export const IMD_SATELLITE_CHANNELS: ImdSatelliteChannel[] = [
  {
    id: 'asia_ir1',
    shortLabel: 'IR1 Thermal (10.8 µm)',
    label: 'INSAT-3DR/3DS Asia Sector · Thermal Infrared (IR1)',
    sector: 'Asia / India Sector',
    wavelength: '10.8 µm',
    fileName: '3Dasiasec_ir1.jpg',
    upstreamUrl: 'https://mausam.imd.gov.in/Satellite/3Dasiasec_ir1.jpg',
    aviationSummary:
      '24×7 day/night cloud-top brightness temperature. Brighter white indicates colder, higher cloud tops (deep cumulonimbus / convective cells).',
    bestFor: '24×7 En-Route Cloud Tops & CB Detection',
  },
  {
    id: 'asia_ctbt',
    shortLabel: 'CTBT Color (Convective)',
    label: 'INSAT-3DR/3DS Asia Sector · Cloud Top Brightness Temp (CTBT)',
    sector: 'Asia / India Sector',
    wavelength: '10.8 µm Color Enhanced',
    fileName: '3Dasiasec_ctbt.jpg',
    upstreamUrl: 'https://mausam.imd.gov.in/Satellite/3Dasiasec_ctbt.jpg',
    aviationSummary:
      'Color-enhanced infrared imagery highlighting severe convection, thunderstorm anvils, and icing/turbulence cloud top altitudes in Kelvin/°C.',
    bestFor: 'Thunderstorm Cells & Convective Weather Avoidance',
  },
  {
    id: 'asia_vis',
    shortLabel: 'VIS Visible (0.65 µm)',
    label: 'INSAT-3DR/3DS Asia Sector · Visible Channel (VIS)',
    sector: 'Asia / India Sector',
    wavelength: '0.65 µm',
    fileName: '3Dasiasec_vis.jpg',
    upstreamUrl: 'https://mausam.imd.gov.in/Satellite/3Dasiasec_vis.jpg',
    aviationSummary:
      'High-resolution daytime solar reflectance showing low stratus, valley fog, fair-weather cumulus, and coastal sea-breeze fronts (dark at night).',
    bestFor: 'Daytime VFR Fog, Low Stratus & Cloud Texture',
  },
  {
    id: 'asia_wv',
    shortLabel: 'WV Water Vapour (6.8 µm)',
    label: 'INSAT-3DR/3DS Asia Sector · Water Vapour (WV)',
    sector: 'Asia / India Sector',
    wavelength: '6.8 µm',
    fileName: '3Dasiasec_wv.jpg',
    upstreamUrl: 'https://mausam.imd.gov.in/Satellite/3Dasiasec_wv.jpg',
    aviationSummary:
      'Mid- and upper-tropospheric moisture distribution (600–200 hPa). Reveals upper-level troughs, jet stream boundaries, and clear-air turbulence zones.',
    bestFor: 'Upper-Level Moisture, Troughs & Jet Stream Shear',
  },
  {
    id: 'globe_ir1',
    shortLabel: 'Full Disk IR1',
    label: 'INSAT-3DR/3DS Full Disk Globe · Thermal Infrared (IR1)',
    sector: 'Full Disk Globe',
    wavelength: '10.8 µm',
    fileName: '3Dglobe_ir1.jpg',
    upstreamUrl: 'https://mausam.imd.gov.in/Satellite/3Dglobe_ir1.jpg',
    aviationSummary:
      'Full-disk hemispheric thermal infrared view covering the Indian Ocean, Arabian Sea, Bay of Bengal, and tropical cyclone/monsoon depressions.',
    bestFor: 'Synoptic Overview & Bay of Bengal / Arabian Sea Systems',
  },
  {
    id: 'globe_vis',
    shortLabel: 'Full Disk VIS',
    label: 'INSAT-3DR/3DS Full Disk Globe · Visible (VIS)',
    sector: 'Full Disk Globe',
    wavelength: '0.65 µm',
    fileName: '3Dglobe_vis.jpg',
    upstreamUrl: 'https://mausam.imd.gov.in/Satellite/3Dglobe_vis.jpg',
    aviationSummary:
      'Full-disk daytime visible albedo imagery across the Indian subcontinent and surrounding oceanic flight information regions (FIRs).',
    bestFor: 'Daytime Hemispheric Cloud Albedo',
  },
  {
    id: 'globe_wv',
    shortLabel: 'Full Disk WV',
    label: 'INSAT-3DR/3DS Full Disk Globe · Water Vapour (WV)',
    sector: 'Full Disk Globe',
    wavelength: '6.8 µm',
    fileName: '3Dglobe_wv.jpg',
    upstreamUrl: 'https://mausam.imd.gov.in/Satellite/3Dglobe_wv.jpg',
    aviationSummary:
      'Full-disk upper-tropospheric water vapour circulation across the Indian Ocean and subtropical westerly jet corridor.',
    bestFor: 'Hemispheric Moisture & Subtropical Jet',
  },
];

export function getImdChannelById(channelId?: string | null): ImdSatelliteChannel {
  const found = IMD_SATELLITE_CHANNELS.find((ch) => ch.id === channelId);
  return found || IMD_SATELLITE_CHANNELS[0];
}

export interface FormattedImdScanTime {
  utcString: string;
  istString: string;
  ageMinutes: number;
}

/**
 * Convert an HTTP Last-Modified date (or Date instance) into formatted UTC and IST strings
 * along with the age of the satellite scan in minutes.
 */
export function formatImdScanTimestamps(
  lastModifiedInput?: string | Date | null,
  referenceNow: Date = new Date()
): FormattedImdScanTime {
  let parsed =
    lastModifiedInput instanceof Date
      ? lastModifiedInput
      : lastModifiedInput
      ? new Date(lastModifiedInput)
      : new Date(referenceNow.getTime());

  if (isNaN(parsed.getTime())) {
    parsed = new Date(referenceNow.getTime());
  }

  const yyyyUtc = parsed.getUTCFullYear();
  const mmUtc = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const ddUtc = String(parsed.getUTCDate()).padStart(2, '0');
  const hhUtc = String(parsed.getUTCHours()).padStart(2, '0');
  const minUtc = String(parsed.getUTCMinutes()).padStart(2, '0');
  const utcString = `${yyyyUtc}-${mmUtc}-${ddUtc} ${hhUtc}:${minUtc} UTC`;

  const istTime = getCurrentIstDateTime(parsed);
  const istString = `${istTime.date} ${istTime.time} IST`;

  const diffMs = Math.max(0, referenceNow.getTime() - parsed.getTime());
  const ageMinutes = Math.round(diffMs / 60000);

  return {
    utcString,
    istString,
    ageMinutes,
  };
}



