import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Polyline,
  InfoWindow,
  useMap,
  useMapsLibrary,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  Plus,
  Search,
  Wind,
  Navigation,
  MapPin,
  Trash2,
  RefreshCw,
  Satellite,
} from 'lucide-react';
import {
  Waypoint,
  ComputedLeg,
  AlternateAerodrome,
  AlternateOriginMode,
  ComputedAlternate,
  WIND_MODEL_OPTIONS,
  WindModelId,
  getClosestAltitudeLevel,
} from '../utils/navlogMath';
import { FreeWeatherMapView } from './FreeWeatherMapView';
import { ImdSatelliteView } from './ImdSatelliteView';

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

interface RouteMapProps {
  waypoints: Waypoint[];
  legs: ComputedLeg[];
  alternate: AlternateAerodrome | null;
  alternateFrom?: AlternateOriginMode;
  computedAlternate: ComputedAlternate | null;
  selectedAltitudeFt: number;
  windModel?: WindModelId;
  onWindModelChange?: (newModel: WindModelId) => void;
  departureDate: string;
  departureTime: string;
  selectedLegIndex: number;
  onSelectLeg: (idx: number) => void;
  onAddWaypointFromMap: (lat: number, lng: number, suggestedName?: string) => void;
  onUpdateWaypointCoord: (id: string, lat: number, lng: number) => void;
  onUpdateAlternateCoord: (lat: number, lng: number, suggestedName?: string) => void;
  onRemoveWaypoint: (id: string) => void;
  onSyncAllWinds: () => void;
  isSyncingWinds: boolean;
}

interface PlaceSuggestionItem {
  placeId: string;
  mainText: string;
  secondaryText: string;
  placePrediction: google.maps.places.PlacePrediction;
}

/**
 * Modern Places API (New) Search Box using AutocompleteSuggestion.fetchAutocompleteSuggestions
 */
function ModernWaypointSearch({
  onSelectLocation,
  onSelectAsAlternate,
}: {
  onSelectLocation: (lat: number, lng: number, name: string) => void;
  onSelectAsAlternate: (lat: number, lng: number, name: string) => void;
}) {
  const placesLib = useMapsLibrary('places');
  const map = useMap();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestionItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!placesLib || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const { AutocompleteSuggestion } = placesLib;
        if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          setIsSearching(false);
          return;
        }
        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query.trim(),
        });
        if (!active) return;

        const items: PlaceSuggestionItem[] = [];
        for (const s of response.suggestions || []) {
          if (s.placePrediction) {
            items.push({
              placeId: s.placePrediction.placeId,
              mainText:
                s.placePrediction.mainText?.text || s.placePrediction.text?.text || '',
              secondaryText: s.placePrediction.secondaryText?.text || '',
              placePrediction: s.placePrediction,
            });
          }
        }
        setSuggestions(items.slice(0, 5));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSuggestions([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 240);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, placesLib]);

  const handlePickSuggestion = async (
    item: PlaceSuggestionItem,
    mode: 'waypoint' | 'alternate'
  ) => {
    try {
      const place = item.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'location'],
      });
      const loc = place.location;
      if (loc) {
        const lat = loc.lat();
        const lng = loc.lng();
        const cleanName = (place.displayName || item.mainText || 'WPT')
          .toUpperCase()
          .slice(0, 22);
        if (mode === 'alternate') {
          onSelectAsAlternate(lat, lng, cleanName);
        } else {
          onSelectLocation(lat, lng, cleanName);
        }
        if (map) {
          map.panTo({ lat, lng });
        }
        setQuery('');
        setSuggestions([]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('OVER_QUERY_LIMIT') ||
        msg.includes('429')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    }
  };

  return (
    <div className="relative flex-1 max-w-xs">
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Airport / VFR Fix (Places)..."
          aria-label="Search Airport or VFR Fix on Google Maps"
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-sky-600"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-30 divide-y divide-slate-100 max-h-60 overflow-y-auto">
          {suggestions.map((item) => (
            <div
              key={item.placeId}
              className="px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2 transition-colors"
            >
              <div className="truncate flex-1">
                <div className="font-semibold text-slate-900 truncate">{item.mainText}</div>
                {item.secondaryText && (
                  <div className="text-[11px] text-slate-500 truncate">
                    {item.secondaryText}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePickSuggestion(item, 'waypoint')}
                  className="px-1.5 py-0.5 text-[10px] font-semibold bg-sky-50 text-sky-800 hover:bg-sky-100 rounded border border-sky-200"
                >
                  + WPT
                </button>
                <button
                  type="button"
                  onClick={() => handlePickSuggestion(item, 'alternate')}
                  className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-800 hover:bg-indigo-100 rounded border border-indigo-200"
                >
                  Set ALT
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {isSearching && query.trim().length >= 2 && suggestions.length === 0 && (
        <div className="absolute right-2.5 top-2 text-[10px] text-slate-400">...</div>
      )}
    </div>
  );
}

/**
 * Helper to fit map camera when route changes significantly
 */
function MapBoundsFitter({
  waypoints,
  alternate,
  fitTrigger,
}: {
  waypoints: Waypoint[];
  alternate: AlternateAerodrome | null;
  fitTrigger: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    if (waypoints.length === 1 && !alternate) {
      map.setCenter({ lat: waypoints[0].lat, lng: waypoints[0].lng });
      map.setZoom(10);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    waypoints.forEach((wp) => bounds.extend({ lat: wp.lat, lng: wp.lng }));
    if (alternate) {
      bounds.extend({ lat: alternate.lat, lng: alternate.lng });
    }
    map.fitBounds(bounds, 56);
  }, [map, fitTrigger]);

  return null;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  waypoints,
  legs,
  alternate,
  alternateFrom = 'DEST',
  computedAlternate,
  selectedAltitudeFt,
  windModel = 'ecmwf_ifs025',
  onWindModelChange,
  departureDate,
  departureTime,
  selectedLegIndex,
  onSelectLeg,
  onAddWaypointFromMap,
  onUpdateWaypointCoord,
  onUpdateAlternateCoord,
  onRemoveWaypoint,
  onSyncAllWinds,
  isSyncingWinds,
}) => {
  const [surfaceTab, setSurfaceTab] = useState<'google-map' | 'weather-map' | 'imd-sat'>('google-map');
  const [mapTypeId, setMapTypeId] = useState<'hybrid' | 'roadmap' | 'terrain' | 'satellite'>('hybrid');
  const [mapClickMode, setMapClickMode] = useState<'add-wpt' | 'set-alt' | 'off'>('add-wpt');
  const [activeWaypointId, setActiveWaypointId] = useState<string | null>(null);
  const [fitTrigger, setFitTrigger] = useState<number>(1);

  const levelInfo = useMemo(
    () => getClosestAltitudeLevel(selectedAltitudeFt),
    [selectedAltitudeFt]
  );

  const routeCenter = useMemo(() => {
    if (waypoints.length === 0) return { lat: 11.5, lng: 76.3 };
    const sumLat = waypoints.reduce((acc, w) => acc + w.lat, 0);
    const sumLng = waypoints.reduce((acc, w) => acc + w.lng, 0);
    return {
      lat: Number((sumLat / waypoints.length).toFixed(4)),
      lng: Number((sumLng / waypoints.length).toFixed(4)),
    };
  }, [waypoints]);

  const polylinePath = useMemo(
    () => waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng })),
    [waypoints]
  );

  const alternatePath = useMemo(() => {
    if (!alternate || waypoints.length === 0) return [];
    const origin =
      alternateFrom === 'DEP'
        ? waypoints[0]
        : waypoints[waypoints.length - 1];
    return [
      { lat: origin.lat, lng: origin.lng },
      { lat: alternate.lat, lng: alternate.lng },
    ];
  }, [alternate, alternateFrom, waypoints]);

  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      if (mapClickMode === 'off') return;
      const latLng = e.detail?.latLng;
      if (!latLng) return;
      const lat = Math.round(latLng.lat * 10000) / 10000;
      const lng = Math.round(latLng.lng * 10000) / 10000;
      if (mapClickMode === 'set-alt') {
        onUpdateAlternateCoord(lat, lng);
      } else {
        onAddWaypointFromMap(lat, lng);
      }
    },
    [mapClickMode, onAddWaypointFromMap, onUpdateAlternateCoord]
  );

  const activeWaypoint = useMemo(
    () => waypoints.find((w) => w.id === activeWaypointId) || null,
    [waypoints, activeWaypointId]
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
      {/* Map & Wind Layer Toolbar */}
      <div className="px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-200 space-y-2">
        {/* Primary Row: Surface Mode Switcher + Wind Model & Sync Button */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          {/* Surface Mode Switcher: Google Map / Earth vs Free Weather Map vs IMD INSAT Satellite */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex items-center gap-1 p-1 bg-slate-200/80 rounded-md w-full lg:w-auto">
            <button
              type="button"
              onClick={() => setSurfaceTab('google-map')}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 flex items-center justify-center sm:justify-start gap-1.5 ${
                surfaceTab === 'google-map'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span className="truncate">Google Maps & Earth Waypoints</span>
            </button>
            <button
              type="button"
              onClick={() => setSurfaceTab('weather-map')}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 flex items-center justify-center sm:justify-start gap-1.5 ${
                surfaceTab === 'weather-map'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wind className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span className="truncate">
                Free Weather Map · {levelInfo.pressureHpa} hPa ({levelInfo.altitudeFt} ft)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSurfaceTab('imd-sat')}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 flex items-center justify-center sm:justify-start gap-1.5 ${
                surfaceTab === 'imd-sat'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Satellite className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span className="truncate">IMD Sat Weather (INSAT)</span>
            </button>
          </div>

          {/* Wind Model Selector & Sync Upper-Air Winds Button */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full lg:w-auto justify-between lg:justify-end">
            {onWindModelChange && (
              <select
                aria-label="Map Toolbar Wind Model"
                value={windModel}
                onChange={(e) => onWindModelChange(e.target.value as WindModelId)}
                className="px-2 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-sky-600 flex-1 sm:flex-initial min-w-0 truncate"
              >
                {WIND_MODEL_OPTIONS.map((mdl) => (
                  <option key={mdl.id} value={mdl.id}>
                    Model: {mdl.shortLabel}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={onSyncAllWinds}
              disabled={isSyncingWinds}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWinds ? 'animate-spin' : ''}`} />
              {isSyncingWinds
                ? 'Fetching Winds...'
                : `Sync Winds (${departureDate} ${departureTime})`}
            </button>
          </div>
        </div>

        {/* Secondary Row: Map Controls when Google Map tab is active */}
        {surfaceTab === 'google-map' && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/80">
            {/* Map Type Selector (Earth Hybrid / Satellite / Terrain / Chart) */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-white border border-slate-300 rounded-md p-0.5 overflow-x-auto max-w-full">
              {(
                [
                  { id: 'hybrid', label: 'Earth Hybrid' },
                  { id: 'satellite', label: 'Satellite' },
                  { id: 'terrain', label: 'Terrain' },
                  { id: 'roadmap', label: 'Chart 2D' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMapTypeId(m.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    mapTypeId === m.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Click Mode Selector: Add WPT vs Set Alternate */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-white border border-slate-300 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setMapClickMode((m) => (m === 'add-wpt' ? 'off' : 'add-wpt'))
                  }
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    mapClickMode === 'add-wpt'
                      ? 'bg-sky-700 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  Click Map: Add WPT
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMapClickMode((m) => (m === 'set-alt' ? 'off' : 'set-alt'))
                  }
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    mapClickMode === 'set-alt'
                      ? 'bg-indigo-700 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  Click Map: Set Alternate
                </button>
              </div>

              <button
                type="button"
                onClick={() => setFitTrigger((c) => c + 1)}
                className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Fit Route
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Viewport Container (Explicit Height Required per CF2) */}
      <div
        className={`relative w-full ${
          surfaceTab === 'imd-sat'
            ? 'h-[430px] sm:h-[500px] lg:h-[540px]'
            : 'h-[360px] sm:h-[410px] lg:h-[430px]'
        } bg-slate-900 transition-all`}
        data-testid="route-map-viewport"
      >
        {surfaceTab === 'google-map' ? (
          <APIProvider
            apiKey={GOOGLE_MAPS_API_KEY}
            libraries={['places', 'marker', 'geometry']}
          >
            {/* Floating Search & Quick Add Overlay inside APIProvider */}
            <div className="absolute top-2.5 left-2.5 right-12 sm:right-auto sm:top-3 sm:left-3 z-10 flex items-center gap-2 sm:w-80">
              <ModernWaypointSearch
                onSelectLocation={(lat, lng, name) =>
                  onAddWaypointFromMap(lat, lng, name)
                }
                onSelectAsAlternate={(lat, lng, name) =>
                  onUpdateAlternateCoord(lat, lng, name)
                }
              />
            </div>

            <Map
              defaultCenter={routeCenter}
              defaultZoom={8}
              mapId="DEMO_MAP_ID"
              mapTypeId={mapTypeId}
              gestureHandling="greedy"
              disableDefaultUI={false}
              streetViewControl={false}
              fullscreenControl={false}
              mapTypeControl={false}
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapBoundsFitter
                waypoints={waypoints}
                alternate={alternate}
                fitTrigger={fitTrigger}
              />

              {/* Full Flight Route Polyline */}
              {polylinePath.length >= 2 && (
                <Polyline
                  path={polylinePath}
                  strokeColor="#d97706"
                  strokeOpacity={0.95}
                  strokeWeight={4}
                  geodesic={true}
                />
              )}

              {/* Diversion Leg Polyline (Destination -> Alternate) */}
              {alternatePath.length === 2 && (
                <Polyline
                  path={alternatePath}
                  strokeColor="#6366f1"
                  strokeOpacity={0.9}
                  strokeWeight={3}
                  geodesic={true}
                />
              )}

              {/* Selected Leg Midpoint Callout Marker */}
              {legs.map((leg, idx) =>
                selectedLegIndex === idx ? (
                  <AdvancedMarker
                    key={`leg-mid-${leg.legId}`}
                    position={{ lat: leg.midLat, lng: leg.midLng }}
                    onClick={() => onSelectLeg(idx)}
                  >
                    <div className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-400 text-slate-950 border border-amber-600 shadow-md">
                      Leg {leg.index}: {String(leg.trackDeg).padStart(3, '0')}° · {leg.legDistNm} NM · {leg.gsEstKt} kt
                    </div>
                  </AdvancedMarker>
                ) : null
              )}

              {/* Alternate Aerodrome Marker */}
              {alternate && (
                <AdvancedMarker
                  position={{ lat: alternate.lat, lng: alternate.lng }}
                  draggable={true}
                  onDragEnd={(e) => {
                    const lat = e.latLng?.lat();
                    const lng = e.latLng?.lng();
                    if (typeof lat === 'number' && typeof lng === 'number') {
                      onUpdateAlternateCoord(
                        Math.round(lat * 10000) / 10000,
                        Math.round(lng * 10000) / 10000
                      );
                    }
                  }}
                  title={`ALT: ${alternate.name} (${alternate.lat.toFixed(4)}, ${alternate.lng.toFixed(4)})`}
                >
                  <div className="flex flex-col items-center cursor-grab active:cursor-grabbing">
                    <div className="px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-md border bg-indigo-800 text-white border-indigo-400 flex items-center gap-1 whitespace-nowrap">
                      <span>ALT: {alternate.name}</span>
                      {computedAlternate && (
                        <span className="text-[10px] font-normal opacity-90">
                          ({computedAlternate.distanceNm.toFixed(1)} NM · {computedAlternate.timeEstRoundedMin}m · {computedAlternate.fuelEstLiters.toFixed(1)}L)
                        </span>
                      )}
                    </div>
                    <div className="w-3 h-3 rounded-full border-2 border-white shadow-md -mt-0.5 bg-indigo-500" />
                  </div>
                </AdvancedMarker>
              )}

              {/* Draggable Waypoint AdvancedMarkers */}
              {waypoints.map((wp, idx) => {
                const isDep = idx === 0;
                const isDest = idx === waypoints.length - 1 && waypoints.length > 1;
                return (
                  <AdvancedMarker
                    key={wp.id}
                    position={{ lat: wp.lat, lng: wp.lng }}
                    draggable={true}
                    onClick={() => setActiveWaypointId(wp.id)}
                    onDragEnd={(e) => {
                      const lat = e.latLng?.lat();
                      const lng = e.latLng?.lng();
                      if (typeof lat === 'number' && typeof lng === 'number') {
                        onUpdateWaypointCoord(
                          wp.id,
                          Math.round(lat * 10000) / 10000,
                          Math.round(lng * 10000) / 10000
                        );
                      }
                    }}
                    title={`${idx + 1}. ${wp.name} (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})`}
                  >
                    <div className="flex flex-col items-center group cursor-grab active:cursor-grabbing">
                      <div
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-md border flex items-center gap-1 whitespace-nowrap ${
                          isDep
                            ? 'bg-emerald-700 text-white border-emerald-400'
                            : isDest
                            ? 'bg-rose-700 text-white border-rose-400'
                            : 'bg-sky-900 text-white border-sky-400'
                        }`}
                      >
                        <span>{idx + 1}. {wp.name}</span>
                        {wp.windSpd !== undefined && (
                          <span className="text-[10px] font-normal opacity-90">
                            ({String(wp.windDir ?? 0).padStart(3, '0')}°/{wp.windSpd}kt)
                          </span>
                        )}
                      </div>
                      <div
                        className={`w-3 h-3 rounded-full border-2 border-white shadow-md -mt-0.5 ${
                          isDep
                            ? 'bg-emerald-500'
                            : isDest
                            ? 'bg-rose-500'
                            : 'bg-sky-500'
                        }`}
                      />
                    </div>
                  </AdvancedMarker>
                );
              })}

              {/* Selected Waypoint InfoWindow */}
              {activeWaypoint && (
                <InfoWindow
                  position={{ lat: activeWaypoint.lat, lng: activeWaypoint.lng }}
                  onCloseClick={() => setActiveWaypointId(null)}
                >
                  <div className="p-1 min-w-[190px] text-xs text-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 flex items-center justify-between gap-2">
                      <span>{activeWaypoint.name}</span>
                      <MapPin className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                    </div>
                    <div className="font-mono text-[11px] text-slate-600">
                      {activeWaypoint.lat.toFixed(4)}°N, {activeWaypoint.lng.toFixed(4)}°E
                    </div>
                    <div className="text-[11px] text-slate-700 bg-slate-100 px-2 py-1 rounded font-mono">
                      Wind @ {selectedAltitudeFt} ft:{' '}
                      <strong>
                        {String(activeWaypoint.windDir ?? 0).padStart(3, '0')}° /{' '}
                        {activeWaypoint.windSpd ?? 0} kt
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onRemoveWaypoint(activeWaypoint.id);
                        setActiveWaypointId(null);
                      }}
                      className="w-full mt-1 px-2 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded flex items-center justify-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove Waypoint
                    </button>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </APIProvider>
        ) : surfaceTab === 'weather-map' ? (
          <FreeWeatherMapView
            waypoints={waypoints}
            legs={legs}
            alternate={alternate}
            alternateFrom={alternateFrom}
            computedAlternate={computedAlternate}
            selectedAltitudeFt={selectedAltitudeFt}
            windModel={windModel}
            departureDate={departureDate}
            departureTime={departureTime}
            selectedLegIndex={selectedLegIndex}
            onSelectLeg={onSelectLeg}
          />
        ) : (
          <ImdSatelliteView
            waypoints={waypoints}
            alternate={alternate}
            selectedAltitudeFt={selectedAltitudeFt}
            departureDate={departureDate}
            departureTime={departureTime}
          />
        )}

        {/* Subtle Bottom-Left Status Strip on Map away from zoom controls */}
        <div className="absolute bottom-2.5 sm:bottom-5 left-2.5 sm:left-3 max-w-[calc(100%-20px)] z-10 bg-slate-900/85 backdrop-blur-xs text-white px-2.5 sm:px-3 py-1 rounded text-[10px] sm:text-[11px] font-mono flex items-center gap-1.5 sm:gap-2 pointer-events-none">
          <Navigation className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="truncate">
            {waypoints.length} WPTs · {legs.length} Legs · ETD: {departureDate} {departureTime} · Alt: {selectedAltitudeFt} ft
          </span>
        </div>
      </div>
    </div>
  );
};
