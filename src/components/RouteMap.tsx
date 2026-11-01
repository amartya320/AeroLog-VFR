/// <reference types="google.maps" />
import React, { useState, useEffect, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Wind,
  RefreshCw,
  Globe,
  Maximize2,
  MapPin,
  Navigation,
  Search,
  Satellite,
} from 'lucide-react';
import {
  AlternateAerodrome,
  AlternateOriginMode,
  ComputedAlternate,
  ComputedLeg,
  Waypoint,
  WindModelId,
  WIND_MODEL_OPTIONS,
  getClosestAltitudeLevel,
} from '../utils/navlogMath';
import { FreeWeatherMapView } from './FreeWeatherMapView';
import { ImdSatelliteView } from './ImdSatelliteView';

declare const __VERCEL_GOOGLE_MAPS_API_KEY__: string | undefined;

const DEMO_API_KEY = 'AIzaSyB2_u33-2_u33-2_u33-2_u33-2_u33';

function getGoogleMapsApiKey(): string {
  const candidates = [
    import.meta.env?.VITE_GOOGLE_MAPS_API_KEY,
    typeof __VERCEL_GOOGLE_MAPS_API_KEY__ !== 'undefined' ? __VERCEL_GOOGLE_MAPS_API_KEY__ : '',
  ];
  for (const key of candidates) {
    if (
      typeof key === 'string' &&
      key.trim().length > 10 &&
      key.trim() !== 'MY_GOOGLE_MAPS_API_KEY'
    ) {
      return key.trim();
    }
  }
  return DEMO_API_KEY;
}

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();

interface RouteMapProps {
  waypoints: Waypoint[];
  legs: ComputedLeg[];
  alternate: AlternateAerodrome | null;
  alternateFrom?: AlternateOriginMode;
  computedAlternate: ComputedAlternate | null;
  selectedAltitudeFt: number;
  windModel?: WindModelId;
  onWindModelChange?: (model: WindModelId) => void;
  departureDate: string;
  departureTime: string;
  selectedLegIndex: number;
  onSelectLeg: (index: number) => void;
  onAddWaypointFromMap: (lat: number, lng: number, suggestedName?: string) => void;
  onUpdateWaypointCoord: (id: string, lat: number, lng: number) => void;
  onUpdateAlternateCoord: (lat: number, lng: number, suggestedName?: string) => void;
  onRemoveWaypoint: (id: string) => void;
  onSyncAllWinds: () => void;
  isSyncingWinds: boolean;
}

/**
 * Google Places Search Box inside the Map Toolbar so users can search any airport, city, or VFR landmark
 * and add it directly as a Route Waypoint or set it as the Alternate Aerodrome.
 */
const PlacesSearchBox: React.FC<{
  clickMode: 'waypoint' | 'alternate';
  onPlaceChosen: (lat: number, lng: number, name: string) => void;
}> = ({ clickMode, onPlaceChosen }) => {
  const placesLib = useMapsLibrary('places');
  const map = useMap();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ['name', 'geometry', 'formatted_address'],
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) return;
      const lat = Math.round(place.geometry.location.lat() * 10000) / 10000;
      const lng = Math.round(place.geometry.location.lng() * 10000) / 10000;
      const cleanName = (place.name || place.formatted_address || 'MAP FIX')
        .toUpperCase()
        .slice(0, 22);

      onPlaceChosen(lat, lng, cleanName);
      if (map) {
        map.panTo({ lat, lng });
      }
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    });

    return () => {
      listener.remove();
    };
  }, [placesLib, map, onPlaceChosen]);

  return (
    <div className="relative flex items-center flex-1 sm:flex-initial min-w-0 sm:min-w-[200px] lg:min-w-[240px]">
      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder={
          clickMode === 'alternate'
            ? 'Search Google Maps for Alternate...'
            : 'Search airport / city to add WPT...'
        }
        aria-label="Search Google Maps for airport or landmark"
        className="w-full pl-8 pr-2.5 py-1 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-sky-600 focus:outline-none"
      />
    </div>
  );
};

/**
 * Draws geodesic polylines for the main flight route AND a dashed magenta/purple line to the Alternate Aerodrome.
 */
const RoutePolylines: React.FC<{
  waypoints: Waypoint[];
  alternate: AlternateAerodrome | null;
  alternateFrom: AlternateOriginMode;
  selectedLegIndex: number;
  onSelectLeg: (index: number) => void;
}> = ({ waypoints, alternate, alternateFrom, selectedLegIndex, onSelectLeg }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib) return;

    const polylines: google.maps.Polyline[] = [];

    // 1. Main Route Legs
    if (waypoints.length >= 2) {
      for (let i = 0; i < waypoints.length - 1; i++) {
        const isSelected = i === selectedLegIndex;
        const from = waypoints[i];
        const to = waypoints[i + 1];

        const line = new mapsLib.Polyline({
          path: [
            { lat: from.lat, lng: from.lng },
            { lat: to.lat, lng: to.lng },
          ],
          geodesic: true,
          strokeColor: isSelected ? '#f59e0b' : '#38bdf8',
          strokeOpacity: 0.95,
          strokeWeight: isSelected ? 5 : 3.5,
          zIndex: isSelected ? 10 : 5,
          map,
        });

        line.addListener('click', () => {
          onSelectLeg(i);
        });

        polylines.push(line);
      }
    }

    // 2. Alternate Aerodrome Leg (Dashed Line from Selected Origin: Destination or Departure)
    const originWp =
      alternateFrom === 'DEP'
        ? waypoints[0]
        : waypoints[waypoints.length - 1];

    if (alternate && originWp) {
      const altLine = new mapsLib.Polyline({
        path: [
          { lat: originWp.lat, lng: originWp.lng },
          { lat: alternate.lat, lng: alternate.lng },
        ],
        geodesic: true,
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 1,
              strokeColor: '#a855f7',
              scale: 3.5,
            },
            offset: '0',
            repeat: '14px',
          },
        ],
        zIndex: 8,
        map,
      });

      polylines.push(altLine);
    }

    return () => {
      polylines.forEach((p) => p.setMap(null));
    };
  }, [map, mapsLib, waypoints, alternate, alternateFrom, selectedLegIndex, onSelectLeg]);

  return null;
};

const FitBoundsHelper: React.FC<{
  waypoints: Waypoint[];
  alternate: AlternateAerodrome | null;
  triggerFit: number;
}> = ({ waypoints, alternate, triggerFit }) => {
  const map = useMap();

  // Create a signature of waypoint coordinates so selecting a preset route automatically fits bounds
  const routeSignature =
    waypoints.map((w) => `${w.id}:${w.lat.toFixed(2)},${w.lng.toFixed(2)}`).join('|') +
    (alternate ? `|ALT:${alternate.lat.toFixed(2)},${alternate.lng.toFixed(2)}` : '');

  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    waypoints.forEach((wp) => bounds.extend({ lat: wp.lat, lng: wp.lng }));
    if (alternate) {
      bounds.extend({ lat: alternate.lat, lng: alternate.lng });
    }
    map.fitBounds(bounds, 55);
  }, [map, triggerFit, routeSignature]);

  return null;
};

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
  const [viewMode, setViewMode] = useState<'route' | 'weather_map' | 'imd_satellite'>('route');
  const [mapTypeId, setMapTypeId] = useState<
    'hybrid' | 'satellite' | 'terrain' | 'roadmap'
  >('hybrid');
  const [clickMode, setClickMode] = useState<'waypoint' | 'alternate'>('waypoint');
  const [fitTrigger, setFitTrigger] = useState(0);

  const selectedLeg = legs[selectedLegIndex];
  const pressureHpa = getClosestAltitudeLevel(selectedAltitudeFt).pressureHpa;

  const centerLat =
    waypoints.length > 0
      ? waypoints.reduce((acc, w) => acc + w.lat, 0) / waypoints.length
      : 21.1458;
  const centerLng =
    waypoints.length > 0
      ? waypoints.reduce((acc, w) => acc + w.lng, 0) / waypoints.length
      : 79.0882;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
      {/* Map Mode & Layer Header Bar */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 bg-white">
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary View Mode Switcher: Route Map vs Free Weather Map vs IMD Satellite */}
          <div className="grid grid-cols-1 sm:flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 w-full sm:w-auto gap-0.5 sm:gap-0">
            <button
              type="button"
              onClick={() => setViewMode('route')}
              className={`px-2.5 py-1.5 sm:py-1 text-xs font-semibold rounded transition-colors flex items-center justify-center sm:justify-start gap-1.5 ${
                viewMode === 'route'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Satellite & Chart Waypoints</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('weather_map')}
              className={`px-2.5 py-1.5 sm:py-1 text-xs font-semibold rounded transition-colors flex items-center justify-center sm:justify-start gap-1.5 ${
                viewMode === 'weather_map'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wind className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Free Weather Map · {pressureHpa} hPa ({selectedAltitudeFt.toLocaleString()} ft)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('imd_satellite')}
              className={`px-2.5 py-1.5 sm:py-1 text-xs font-semibold rounded transition-colors flex items-center justify-center sm:justify-start gap-1.5 ${
                viewMode === 'imd_satellite'
                  ? 'bg-indigo-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Satellite className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">IMD Sat Weather (INSAT)</span>
            </button>
          </div>

          {viewMode === 'route' && (
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 w-full sm:w-auto">
              {(
                [
                  { id: 'hybrid', label: 'Earth Hybrid' },
                  { id: 'satellite', label: 'Satellite' },
                  { id: 'terrain', label: 'Terrain' },
                  { id: 'roadmap', label: 'Chart 2D' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setMapTypeId(mode.id)}
                  className={`flex-1 sm:flex-initial px-2 py-1 text-[11px] font-medium rounded transition-colors text-center whitespace-nowrap ${
                    mapTypeId === mode.id
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          {viewMode === 'route' && (
            <>
              {/* Click Mode Selector: Add Route Waypoint vs Set Alternate Aerodrome */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setClickMode('waypoint')}
                  className={`flex-1 sm:flex-initial px-2 py-1 text-[11px] font-semibold rounded transition-colors flex items-center justify-center gap-1 whitespace-nowrap ${
                    clickMode === 'waypoint'
                      ? 'bg-sky-700 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MapPin className="w-3 h-3 shrink-0" />
                  + Click Map: Add WPT
                </button>
                <button
                  type="button"
                  onClick={() => setClickMode('alternate')}
                  className={`flex-1 sm:flex-initial px-2 py-1 text-[11px] font-semibold rounded transition-colors flex items-center justify-center gap-1 whitespace-nowrap ${
                    clickMode === 'alternate'
                      ? 'bg-purple-700 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Navigation className="w-3 h-3 shrink-0" />
                  Click Map: Set Alternate
                </button>
              </div>

              <button
                type="button"
                onClick={() => setFitTrigger((v) => v + 1)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                Fit Route
              </button>
            </>
          )}

          {/* Wind Model Quick Selector inside Map Toolbar */}
          {onWindModelChange && (
            <select
              aria-label="Upper-Air Forecast Model"
              value={windModel}
              onChange={(e) => onWindModelChange(e.target.value as WindModelId)}
              className="px-2 py-1 text-xs font-mono font-semibold bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-md focus:outline-none focus:border-emerald-600 max-w-full sm:max-w-[210px] truncate"
              title="Select Free Upper-Air Forecast Model (Open-Meteo ECMWF IFS / GFS / ICON)"
            >
              {WIND_MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortLabel}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={onSyncAllWinds}
            disabled={isSyncingWinds}
            className="px-2.5 py-1 text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${isSyncingWinds ? 'animate-spin' : ''}`}
            />
            <span className="truncate">
              {isSyncingWinds
                ? 'Syncing...'
                : `Sync Winds (${selectedAltitudeFt.toLocaleString()} ft)`}
            </span>
          </button>
        </div>
      </div>

      {/* Main Map Viewport: Either Google Maps/Earth OR Free Interactive Weather Map OR IMD Satellite */}
      <div className="relative h-[320px] sm:h-[400px] lg:h-[440px] w-full bg-slate-900">
        {viewMode === 'route' ? (
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
            {/* Floating Search Box on top-left of Google Map */}
            <div className="absolute top-2.5 left-2.5 right-2.5 sm:right-auto z-10 bg-white/95 backdrop-blur-xs p-1.5 rounded-md shadow-md border border-slate-200 flex items-center gap-2 max-w-full sm:max-w-xs">
              <PlacesSearchBox
                clickMode={clickMode}
                onPlaceChosen={(lat, lng, name) => {
                  if (clickMode === 'alternate') {
                    onUpdateAlternateCoord(lat, lng, name);
                  } else {
                    onAddWaypointFromMap(lat, lng, name);
                  }
                }}
              />
            </div>

            <Map
              defaultCenter={{ lat: centerLat, lng: centerLng }}
              defaultZoom={6}
              mapId="DEMO_MAP_ID"
              mapTypeId={mapTypeId}
              gestureHandling="greedy"
              disableDefaultUI={false}
              streetViewControl={false}
              fullscreenControl={false}
              mapTypeControl={false}
              onClick={(ev) => {
                if (!ev.detail.latLng) return;
                const lat = Math.round(ev.detail.latLng.lat * 10000) / 10000;
                const lng = Math.round(ev.detail.latLng.lng * 10000) / 10000;
                if (clickMode === 'alternate') {
                  onUpdateAlternateCoord(lat, lng);
                } else {
                  onAddWaypointFromMap(lat, lng);
                }
              }}
            >
              <FitBoundsHelper
                waypoints={waypoints}
                alternate={alternate}
                triggerFit={fitTrigger}
              />
              <RoutePolylines
                waypoints={waypoints}
                alternate={alternate}
                alternateFrom={alternateFrom}
                selectedLegIndex={selectedLegIndex}
                onSelectLeg={onSelectLeg}
              />

              {/* Main Route Waypoint Markers */}
              {waypoints.map((wp, index) => {
                const isDep = index === 0;
                const isDest = index === waypoints.length - 1 && waypoints.length > 1;
                const bg = isDep ? '#0284c7' : isDest ? '#16a34a' : '#f59e0b';
                const borderColor = isDep ? '#0369a1' : isDest ? '#15803d' : '#b45309';

                return (
                  <AdvancedMarker
                    key={wp.id}
                    position={{ lat: wp.lat, lng: wp.lng }}
                    draggable={true}
                    onClick={() => {
                      // Clicking a waypoint deletes it directly from the flight plan
                      onRemoveWaypoint(wp.id);
                    }}
                    onDragEnd={(e) => {
                      if (!e.latLng) return;
                      const lat = Math.round(e.latLng.lat() * 10000) / 10000;
                      const lng = Math.round(e.latLng.lng() * 10000) / 10000;
                      onUpdateWaypointCoord(wp.id, lat, lng);
                    }}
                    title={`${wp.name} (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}) — Click to delete waypoint, or drag to move`}
                  >
                    <Pin
                      background={bg}
                      borderColor={borderColor}
                      glyphColor="#ffffff"
                      glyph={String(index + 1)}
                    />
                  </AdvancedMarker>
                );
              })}

              {/* Alternate Aerodrome Marker (Purple Pin 'A') */}
              {alternate && (
                <AdvancedMarker
                  position={{ lat: alternate.lat, lng: alternate.lng }}
                  draggable={true}
                  onDragEnd={(e) => {
                    if (!e.latLng) return;
                    const lat = Math.round(e.latLng.lat() * 10000) / 10000;
                    const lng = Math.round(e.latLng.lng() * 10000) / 10000;
                    onUpdateAlternateCoord(lat, lng, alternate.name);
                  }}
                  title={`ALTERNATE: ${alternate.name} (${alternate.lat.toFixed(4)}, ${alternate.lng.toFixed(4)})`}
                >
                  <Pin
                    background="#9333ea"
                    borderColor="#6b21a8"
                    glyphColor="#ffffff"
                    glyph="A"
                  />
                </AdvancedMarker>
              )}
            </Map>
          </APIProvider>
        ) : viewMode === 'weather_map' ? (
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
      </div>

      {/* Bottom Selected Leg & Alternate Telemetry Strip */}
      <div className="px-3 sm:px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        {selectedLeg ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-slate-900">
              Leg {selectedLeg.index}: {selectedLeg.fromName} → {selectedLeg.toName}
            </span>
            <span className="font-mono text-slate-700">
              Track: <strong>{String(selectedLeg.trackDeg).padStart(3, '0')}°T</strong>
            </span>
            <span className="font-mono text-slate-700">
              Dist: <strong>{selectedLeg.legDistNm.toFixed(1)} NM</strong>
            </span>
            <span className="font-mono text-slate-700">
              Wind ({selectedAltitudeFt.toLocaleString()} ft):{' '}
              <strong>
                {String(selectedLeg.windDir).padStart(3, '0')}°/{selectedLeg.windSpd} kt
              </strong>
            </span>
            <span className="font-mono text-slate-700">
              HDG: <strong>{String(selectedLeg.trueHeadingEst).padStart(3, '0')}°T</strong>
            </span>
            <span className="font-mono text-slate-700">
              G/S: <strong>{selectedLeg.gsEstKt} kt</strong>
            </span>
            {computedAlternate && (
              <span className="font-mono text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                ALT ({computedAlternate.fromRole} → {computedAlternate.toName}):{' '}
                <strong>
                  {String(computedAlternate.trackDeg).padStart(3, '0')}°T ·{' '}
                  {computedAlternate.distanceNm.toFixed(1)} NM ·{' '}
                  {computedAlternate.timeEstMin.toFixed(1)} min
                </strong>
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-500">
            Click anywhere on the map or search above to add route waypoints.
          </span>
        )}
        <span className="text-slate-500 hidden xl:inline">
          Click a pin to delete · Drag pins to reposition · Dashed purple line = Alternate route
        </span>
      </div>
    </div>
  );
};
