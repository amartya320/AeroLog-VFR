import {
  AlternateAerodrome,
  AlternateOriginMode,
  RouteTrackMode,
  Waypoint,
  calculateDistanceNm,
  normalizeDegrees,
  parseKmlWaypoints,
} from './navlogMath';

export const SAVED_ROUTES_STORAGE_KEY = 'aerolog_saved_routes_v1';

export interface SavedFlightRoute {
  id: string;
  name: string;
  savedAt: string; // ISO timestamp
  routeTrackMode: RouteTrackMode;
  globalTrackOverrideDeg: number | null;
  waypoints: Waypoint[];
  alternate: AlternateAerodrome | null;
  alternateFrom: AlternateOriginMode;
  cruiseTasKt?: number;
  fuelFlowLph?: number;
  selectedAltitudeFt?: number;
}

export interface SaveRouteDraft {
  id?: string;
  name: string;
  routeTrackMode: RouteTrackMode;
  globalTrackOverrideDeg: number | null;
  waypoints: Waypoint[];
  alternate: AlternateAerodrome | null;
  alternateFrom: AlternateOriginMode;
  cruiseTasKt?: number;
  fuelFlowLph?: number;
  selectedAltitudeFt?: number;
}

export function countModifiedWaypointLegs(waypoints: Waypoint[]): number {
  let count = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (wp.customTrackDeg !== undefined || wp.customDistanceNm !== undefined) {
      count++;
    }
  }
  return count;
}

export function computeSavedRouteTotalNm(waypoints: Waypoint[]): number {
  if (waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const fromWp = waypoints[i];
    const toWp = waypoints[i + 1];
    const dist =
      toWp.customDistanceNm !== undefined &&
      isFinite(toWp.customDistanceNm) &&
      toWp.customDistanceNm >= 0
        ? toWp.customDistanceNm
        : calculateDistanceNm(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng);
    total += dist;
  }
  return Math.round(total * 10) / 10;
}

export function suggestRouteName(waypoints: Waypoint[]): string {
  if (waypoints.length === 0) return 'My Custom Route';
  if (waypoints.length === 1) return waypoints[0].name;
  const dep = waypoints[0].name.split('(')[0].trim() || waypoints[0].name;
  const dest =
    waypoints[waypoints.length - 1].name.split('(')[0].trim() ||
    waypoints[waypoints.length - 1].name;
  return `${dep} → ${dest}`;
}

export function sanitizeSavedWaypoint(wp: Waypoint): Waypoint {
  const clean: Waypoint = {
    id: wp.id,
    name: wp.name,
    lat: Math.round(wp.lat * 10000) / 10000,
    lng: Math.round(wp.lng * 10000) / 10000,
  };
  if (wp.freeformLat !== undefined) clean.freeformLat = wp.freeformLat;
  if (wp.freeformLng !== undefined) clean.freeformLng = wp.freeformLng;
  if (wp.lineFraction !== undefined) clean.lineFraction = wp.lineFraction;
  if (wp.customTrackDeg !== undefined && isFinite(wp.customTrackDeg)) {
    clean.customTrackDeg = normalizeDegrees(wp.customTrackDeg);
  }
  if (
    wp.customDistanceNm !== undefined &&
    isFinite(wp.customDistanceNm) &&
    wp.customDistanceNm >= 0
  ) {
    clean.customDistanceNm = Math.round(wp.customDistanceNm * 10) / 10;
  }
  if (wp.elevationFt !== undefined) clean.elevationFt = wp.elevationFt;
  if (wp.windDir !== undefined) clean.windDir = wp.windDir;
  if (wp.windSpd !== undefined) clean.windSpd = wp.windSpd;
  if (wp.windSource !== undefined) clean.windSource = wp.windSource;
  if (wp.notes !== undefined) clean.notes = wp.notes;
  return clean;
}

export function saveRouteToList(
  existing: SavedFlightRoute[],
  draft: SaveRouteDraft,
  nowIso: string = new Date().toISOString()
): { routes: SavedFlightRoute[]; savedRoute: SavedFlightRoute } {
  const trimmedName = draft.name.trim() || suggestRouteName(draft.waypoints);
  const existingById = draft.id ? existing.find((r) => r.id === draft.id) : undefined;
  const existingByName = existing.find(
    (r) => r.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  const matched = existingById || existingByName;

  const savedRoute: SavedFlightRoute = {
    id: matched ? matched.id : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmedName,
    savedAt: nowIso,
    routeTrackMode: draft.routeTrackMode,
    globalTrackOverrideDeg: draft.globalTrackOverrideDeg,
    waypoints: draft.waypoints.map(sanitizeSavedWaypoint),
    alternate: draft.alternate ? { ...draft.alternate } : null,
    alternateFrom: draft.alternateFrom,
    cruiseTasKt: draft.cruiseTasKt,
    fuelFlowLph: draft.fuelFlowLph,
    selectedAltitudeFt: draft.selectedAltitudeFt,
  };

  const remaining = existing.filter((r) => r.id !== savedRoute.id);
  return {
    routes: [savedRoute, ...remaining],
    savedRoute,
  };
}

export function deleteRouteFromList(
  existing: SavedFlightRoute[],
  routeId: string
): SavedFlightRoute[] {
  return existing.filter((r) => r.id !== routeId);
}

export function loadSavedRoutes(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null
): SavedFlightRoute[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SAVED_ROUTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedFlightRoute =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          Array.isArray(item.waypoints)
      )
      .map((item) => ({
        ...item,
        routeTrackMode: item.routeTrackMode === 'freeform' ? 'freeform' : 'straight',
        globalTrackOverrideDeg:
          typeof item.globalTrackOverrideDeg === 'number'
            ? item.globalTrackOverrideDeg
            : null,
        alternate: item.alternate ?? null,
        alternateFrom: item.alternateFrom === 'DEP' ? 'DEP' : 'DEST',
        waypoints: item.waypoints.map(sanitizeSavedWaypoint),
      }));
  } catch {
    return [];
  }
}

export function persistSavedRoutes(
  routes: SavedFlightRoute[],
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null
): void {
  if (!storage) return;
  try {
    storage.setItem(SAVED_ROUTES_STORAGE_KEY, JSON.stringify(routes));
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

export interface ImportedRoutePayload {
  waypoints: Waypoint[];
  routeTrackMode?: RouteTrackMode;
  globalTrackOverrideDeg?: number | null;
  name?: string;
}

/**
 * Parse either an AeroLog JSON route export or a Google Earth KML file (preserving
 * `<ExtendedData>` customTrackDeg, customDistanceNm, routeTrackMode, and winds).
 */
export function parseImportedRouteText(text: string): ImportedRoutePayload {
  const trimmed = (text || '').trim();
  if (!trimmed) return { waypoints: [] };

  // Try AeroLog JSON format first if it looks like JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawWaypoints = Array.isArray(parsed) ? parsed : parsed?.waypoints;
      if (Array.isArray(rawWaypoints)) {
        const waypoints = rawWaypoints
          .filter(
            (w) =>
              w &&
              typeof w.lat === 'number' &&
              typeof w.lng === 'number' &&
              isFinite(w.lat) &&
              isFinite(w.lng)
          )
          .map((w, idx) =>
            sanitizeSavedWaypoint({
              ...w,
              id: typeof w.id === 'string' && w.id ? w.id : `json-${Date.now()}-${idx}`,
              name: typeof w.name === 'string' && w.name ? w.name : `WPT ${idx + 1}`,
            })
          );
        return {
          waypoints,
          routeTrackMode:
            parsed?.routeTrackMode === 'freeform'
              ? 'freeform'
              : parsed?.routeTrackMode === 'straight'
              ? 'straight'
              : undefined,
          globalTrackOverrideDeg:
            typeof parsed?.globalTrackOverrideDeg === 'number'
              ? parsed.globalTrackOverrideDeg
              : parsed?.globalTrackOverrideDeg === null
              ? null
              : undefined,
          name: typeof parsed?.name === 'string' ? parsed.name : undefined,
        };
      }
    } catch {
      // Fall through to KML parser
    }
  }

  const waypoints = parseKmlWaypoints(trimmed);
  const modeMatch =
    /<Data\s+name=["']routeTrackMode["'][^>]*>\s*<value>([\s\S]*?)<\/value>\s*<\/Data>/i.exec(
      trimmed
    );
  const globalTrackMatch =
    /<Data\s+name=["']globalTrackOverrideDeg["'][^>]*>\s*<value>([\s\S]*?)<\/value>\s*<\/Data>/i.exec(
      trimmed
    );
  const docNameMatch = /<Document>[\s\S]*?<name>([\s\S]*?)<\/name>/i.exec(trimmed);

  const routeTrackMode: RouteTrackMode | undefined =
    modeMatch?.[1]?.trim() === 'freeform'
      ? 'freeform'
      : modeMatch?.[1]?.trim() === 'straight'
      ? 'straight'
      : undefined;

  const parsedGlobal =
    globalTrackMatch?.[1]?.trim() && globalTrackMatch[1].trim() !== ''
      ? Number(globalTrackMatch[1].trim())
      : NaN;

  return {
    waypoints,
    routeTrackMode,
    globalTrackOverrideDeg: !isNaN(parsedGlobal) ? normalizeDegrees(parsedGlobal) : undefined,
    name: docNameMatch?.[1]?.trim() || undefined,
  };
}
