/// <reference types="google.maps" />
import React, { useState, useEffect, useMemo } from 'react';
import {
  Navigation,
  Search,
  Fuel,
  Clock,
  Compass,
  Wind,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  AlternateAerodrome,
  AlternateOriginMode,
  ComputedAlternate,
  FlightConfig,
  FuelPlanBreakdown,
  Waypoint,
  formatCalc,
  roundCalc,
} from '../utils/navlogMath';
import { KNOWN_AERODROMES } from '../utils/presetRoutes';
import { EditableNumberInput } from './EditableNumberInput';

interface AlternatePlannerProps {
  departureWaypoint: Waypoint | undefined;
  destinationWaypoint: Waypoint | undefined;
  alternate: AlternateAerodrome | null;
  computedAlternate: ComputedAlternate | null;
  fuelPlan: FuelPlanBreakdown;
  config: FlightConfig;
  showMagneticHeading: boolean;
  onSelectAlternate: (alt: AlternateAerodrome | null) => void;
  onUpdateAlternateFields: (partial: Partial<AlternateAerodrome>) => void;
  onUpdateConfig: (partial: Partial<FlightConfig>) => void;
}

interface GooglePlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  placePrediction: google.maps.places.PlacePrediction;
}

export const AlternatePlanner: React.FC<AlternatePlannerProps> = ({
  departureWaypoint,
  destinationWaypoint,
  alternate,
  computedAlternate,
  fuelPlan,
  config,
  showMagneticHeading,
  onSelectAlternate,
  onUpdateAlternateFields,
  onUpdateConfig,
}) => {
  const alternateFrom: AlternateOriginMode =
    config.alternateFrom === 'DEP' ? 'DEP' : 'DEST';
  const activeOriginWaypoint =
    alternateFrom === 'DEP' ? departureWaypoint : destinationWaypoint;
  const [searchQuery, setSearchQuery] = useState('');
  const [googleSuggestions, setGoogleSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [coordName, setCoordName] = useState(alternate?.name || '');
  const [coordLat, setCoordLat] = useState(
    alternate ? String(alternate.lat) : ''
  );
  const [coordLng, setCoordLng] = useState(
    alternate ? String(alternate.lng) : ''
  );
  const [coordError, setCoordError] = useState<string | null>(null);

  useEffect(() => {
    if (alternate) {
      setCoordName(alternate.name);
      setCoordLat(String(alternate.lat));
      setCoordLng(String(alternate.lng));
    } else {
      setCoordName('');
      setCoordLat('');
      setCoordLng('');
    }
  }, [alternate?.name, alternate?.lat, alternate?.lng, alternate]);

  // Filter local ICAO aerodromes matching searchQuery
  const matchingKnownAerodromes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return KNOWN_AERODROMES.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 5);
  }, [searchQuery]);

  // Also query Google Places AutocompleteSuggestion if google.maps.places is loaded
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setGoogleSuggestions([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const g = (window as unknown as { google?: typeof google }).google;
        if (!g?.maps?.importLibrary) return;
        const placesLib = (await g.maps.importLibrary('places')) as google.maps.PlacesLibrary;
        if (!placesLib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) return;

        const res = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: `${q} airport`,
        });
        if (!active) return;

        const items: GooglePlaceSuggestion[] = [];
        for (const s of res.suggestions || []) {
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
        setGoogleSuggestions(items.slice(0, 4));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setGoogleSuggestions([]);
      }
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSelectKnownAerodrome = (aero: AlternateAerodrome) => {
    onSelectAlternate({ ...aero });
    setSearchQuery('');
    setGoogleSuggestions([]);
    setCoordError(null);
  };

  const handleSelectGooglePlace = async (item: GooglePlaceSuggestion) => {
    try {
      const place = item.placePrediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'location'] });
      const loc = place.location;
      if (loc) {
        const lat = Math.round(loc.lat() * 10000) / 10000;
        const lng = Math.round(loc.lng() * 10000) / 10000;
        const cleanName = (place.displayName || item.mainText || 'ALT AERODROME')
          .toUpperCase()
          .slice(0, 28);
        onSelectAlternate({
          name: cleanName,
          lat,
          lng,
          windDir: destinationWaypoint?.windDir ?? 270,
          windSpd: destinationWaypoint?.windSpd ?? 14,
          windSource: 'Fetching...',
        });
        setSearchQuery('');
        setGoogleSuggestions([]);
        setCoordError(null);
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

  const handleApplyCoordinateAlternate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = parseFloat(coordLat);
    const parsedLng = parseFloat(coordLng);

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setCoordError('Latitude must be between -90° and +90°.');
      return;
    }
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setCoordError('Longitude must be between -180° and +180°.');
      return;
    }

    setCoordError(null);
    const cleanName = (coordName.trim() || 'ALT AERODROME').toUpperCase();
    onSelectAlternate({
      name: cleanName,
      lat: Math.round(parsedLat * 10000) / 10000,
      lng: Math.round(parsedLng * 10000) / 10000,
      windDir: alternate?.windDir ?? activeOriginWaypoint?.windDir ?? 270,
      windSpd: alternate?.windSpd ?? activeOriginWaypoint?.windSpd ?? 14,
      windSource: 'Fetching...',
    });
  };

  const showDropdown =
    searchQuery.trim().length > 0 &&
    (matchingKnownAerodromes.length > 0 || googleSuggestions.length > 0);

  return (
    <div
      id="alternate-planner"
      className="aerolog-card bg-white border border-slate-200/85 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_1px_3px_rgba(15,23,42,0.03),0_10px_30px_-5px_rgba(15,23,42,0.04)]"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-slate-100 pb-3.5">
        <div>
          <h2 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200/80 text-indigo-600 flex items-center justify-center shrink-0">
              <Navigation className="w-3.5 h-3.5" />
            </span>
            <span>
              Alternate Aerodrome & Complete Fuel Breakdown (Taxi · Trip · Contingency · Alternate · Holding)
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            No alternate is taken automatically. Choose whether to calculate Alternate data from{' '}
            <strong>DEP ({departureWaypoint?.name || 'Departure'})</strong> or{' '}
            <strong>DEST ({destinationWaypoint?.name || 'Destination'})</strong>, then select an aerodrome or enter coordinates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 no-print">
          {/* Calculate Alternate Data From: DEP vs DEST Selector */}
          <div
            className="aerolog-segmented flex flex-wrap items-center gap-1.5 bg-slate-100/90 border border-slate-200/80 rounded-xl p-1.5 w-full sm:w-auto"
            role="group"
            aria-label="Calculate Alternate Data From"
          >
            <span className="text-[11px] font-semibold text-slate-700 px-1.5 whitespace-nowrap">
              Calculate Alternate From:
            </span>
            <div className="flex items-center gap-1 flex-1 sm:flex-initial">
              <button
                id="alt-origin-dep-btn"
                type="button"
                onClick={() => onUpdateConfig({ alternateFrom: 'DEP' })}
                className={`flex-1 sm:flex-initial px-3 py-1 text-[11px] font-mono font-bold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  alternateFrom === 'DEP'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                DEP ({departureWaypoint?.name ? departureWaypoint.name.split(' ')[0] : 'Departure'})
              </button>
              <button
                id="alt-origin-dest-btn"
                type="button"
                onClick={() => onUpdateConfig({ alternateFrom: 'DEST' })}
                className={`flex-1 sm:flex-initial px-3 py-1 text-[11px] font-mono font-bold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  alternateFrom === 'DEST'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                DEST ({destinationWaypoint?.name ? destinationWaypoint.name.split(' ')[0] : 'Destination'})
              </button>
            </div>
          </div>

          {/* Quick-Pick Regional Aerodromes */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">
              Select Alternate:
            </span>
            {KNOWN_AERODROMES.slice(0, 5).map((aero) => {
              const isSelected = alternate?.name === aero.name;
              return (
                <button
                  key={aero.name}
                  type="button"
                  onClick={() => handleSelectKnownAerodrome(aero)}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 shadow-2xs ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                      : 'bg-slate-50/90 border-slate-200/90 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {aero.name.split(' ')[0]}
                </button>
              );
            })}
            {alternate && (
              <button
                type="button"
                onClick={() => onSelectAlternate(null)}
                className="px-2.5 py-1 text-[11px] font-semibold bg-rose-50/90 hover:bg-rose-100 text-rose-700 border border-rose-200/90 rounded-lg transition-all whitespace-nowrap shrink-0"
              >
                Clear Alternate
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search & Coordinate Entry Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 items-start no-print">
        {/* 1. Search Alternate Aerodrome by Name / ICAO / Google Places */}
        <div className="lg:col-span-5 space-y-1.5 relative">
          <label
            htmlFor="alternate-search-input"
            className="block text-[11px] font-semibold text-slate-600"
          >
            Search Alternate Aerodrome (ICAO / Airport Name / Places)
          </label>
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              id="alternate-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search e.g. VOBG, VOCI, Kempegowda, Salinas..."
              className="w-full pl-8 pr-8 py-2 text-xs bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear alternate search"
                className="absolute right-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-xl shadow-xl z-30 divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {matchingKnownAerodromes.map((aero) => (
                <button
                  key={aero.name}
                  type="button"
                  onClick={() => handleSelectKnownAerodrome(aero)}
                  className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-indigo-50/70 flex items-center justify-between gap-2 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{aero.name}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {aero.lat.toFixed(4)}°, {aero.lng.toFixed(4)}° · Elev {aero.elevationFt ?? 0} ft
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md shrink-0">
                    Select ICAO
                  </span>
                </button>
              ))}

              {googleSuggestions.map((item) => (
                <button
                  key={item.placeId}
                  type="button"
                  onClick={() => handleSelectGooglePlace(item)}
                  className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-indigo-50/70 flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="truncate">
                    <div className="font-semibold text-slate-900 truncate">
                      {item.mainText}
                    </div>
                    {item.secondaryText && (
                      <div className="text-[11px] text-slate-500 truncate">
                        {item.secondaryText}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md shrink-0">
                    Google Maps
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. Set Alternate Aerodrome by Coordinates */}
        <form
          onSubmit={handleApplyCoordinateAlternate}
          className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-12 gap-2.5 items-end"
        >
          <div className="col-span-2 sm:col-span-4">
            <label
              htmlFor="alt-coord-name"
              className="block text-[11px] font-semibold text-slate-600 mb-1.5"
            >
              Alternate Name / ICAO
            </label>
            <input
              id="alt-coord-name"
              type="text"
              value={coordName}
              onChange={(e) => setCoordName(e.target.value)}
              placeholder="e.g. VOBG / HAL"
              className="w-full px-2.5 py-2 text-xs font-mono font-semibold bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all"
            />
          </div>

          <div className="col-span-1 sm:col-span-3">
            <label
              htmlFor="alt-coord-lat"
              className="block text-[11px] font-semibold text-slate-600 mb-1.5"
            >
              Latitude (°)
            </label>
            <input
              id="alt-coord-lat"
              type="number"
              step="any"
              value={coordLat}
              onChange={(e) => setCoordLat(e.target.value)}
              placeholder="12.9499"
              className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all"
            />
          </div>

          <div className="col-span-1 sm:col-span-3">
            <label
              htmlFor="alt-coord-lng"
              className="block text-[11px] font-semibold text-slate-600 mb-1.5"
            >
              Longitude (°)
            </label>
            <input
              id="alt-coord-lng"
              type="number"
              step="any"
              value={coordLng}
              onChange={(e) => setCoordLng(e.target.value)}
              placeholder="77.6682"
              className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all"
            />
          </div>

          <div className="col-span-2 sm:col-span-2">
            <button
              type="submit"
              className="w-full px-3 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-xs transition-all whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              Set Coords
            </button>
          </div>
        </form>
      </div>

      {coordError && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2">
          {coordError}
        </div>
      )}

      {/* Computed Alternate Diversion Summary Strip */}
      {!alternate && (
        <div className="aerolog-subcard animate-fade-up bg-slate-50/80 border border-dashed border-slate-300/90 rounded-xl px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>No Alternate Selected:</strong> Search an airport above, click a quick ICAO button, enter coordinates, or use &ldquo;Click Map: Set Alternate&rdquo;.
          </span>
          <span className="font-mono text-[11px] text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80">
            Calculation Origin: <strong>FROM {alternateFrom} ({activeOriginWaypoint?.name || alternateFrom})</strong>
          </span>
        </div>
      )}

      {computedAlternate && alternate && (
        <div
          key={`alt-${alternate.name}-${computedAlternate.fromRole}`}
          className="aerolog-subcard animate-scale-in bg-slate-50/90 border border-slate-200/85 rounded-xl p-4 space-y-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2.5 py-0.5 text-[11px] font-mono font-bold rounded-lg border ${
                  computedAlternate.fromRole === 'DEP'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200/80'
                    : 'bg-indigo-50 text-indigo-900 border-indigo-200/80'
                }`}
              >
                ALTERNATE (FROM {computedAlternate.fromRole})
              </span>
              <span className="font-bold text-slate-900">
                {computedAlternate.fromName}
              </span>
              <span className="text-slate-400">→</span>
              <span className="font-bold text-indigo-900">
                {computedAlternate.toName}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                ({alternate.lat.toFixed(4)}°, {alternate.lng.toFixed(4)}°)
              </span>
            </div>

            {/* Editable Alternate Wind DIR / SPD */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <Wind className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-slate-600 font-sans font-medium">Alt Wind:</span>
              <EditableNumberInput
                min={0}
                max={360}
                fallbackOnEmptyBlur={0}
                ariaLabel="Alternate wind direction degrees"
                value={computedAlternate.windDir}
                onChange={(val) =>
                  onUpdateAlternateFields({ windDir: val, windSource: 'Manual' })
                }
                className="w-12 px-1.5 py-0.5 text-center font-mono font-bold bg-white border border-slate-200/90 rounded-lg text-slate-900"
              />
              <span>° /</span>
              <EditableNumberInput
                min={0}
                max={200}
                fallbackOnEmptyBlur={0}
                ariaLabel="Alternate wind speed knots"
                value={computedAlternate.windSpd}
                onChange={(val) =>
                  onUpdateAlternateFields({ windSpd: val, windSource: 'Manual' })
                }
                className="w-12 px-1.5 py-0.5 text-center font-mono font-bold bg-white border border-slate-200/90 rounded-lg text-slate-900"
              />
              <span>kt</span>
            </div>
          </div>

          {/* 5 Key Alternate Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono">
            {/* 1. Track & Distance */}
            <div className="bg-white border border-slate-200/85 rounded-xl p-3 shadow-2xs">
              <div className="text-[11px] font-sans font-semibold text-slate-500">
                Alt Track & Distance
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {String(computedAlternate.trackDeg).padStart(3, '0')}°T ·{' '}
                {formatCalc(computedAlternate.distanceNm, config.roundOffValues)} NM
              </div>
              <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                Calculated from {computedAlternate.fromRole} ({computedAlternate.fromName})
              </div>
            </div>

            {/* 2. Estimated Heading & WCA */}
            <div className="bg-white border border-slate-200/85 rounded-xl p-3 shadow-2xs">
              <div className="text-[11px] font-sans font-semibold text-slate-500 flex items-center gap-1">
                <Compass className="w-3 h-3 text-indigo-600" />
                Est. Heading ({showMagneticHeading ? '°M' : '°T'})
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {String(
                  showMagneticHeading
                    ? computedAlternate.magHeadingEst
                    : computedAlternate.trueHeadingEst
                ).padStart(3, '0')}
                °
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                WCA{' '}
                {computedAlternate.wcaDeg > 0
                  ? `+${computedAlternate.wcaDeg}°`
                  : `${computedAlternate.wcaDeg}°`}{' '}
                · TAS {config.cruiseTasKt} kt
              </div>
            </div>

            {/* 3. Estimated Ground Speed */}
            <div className="bg-white border border-slate-200/85 rounded-xl p-3 shadow-2xs">
              <div className="text-[11px] font-sans font-semibold text-slate-500">
                Est. Ground Speed
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {computedAlternate.gsEstKt} kt
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {computedAlternate.headwindKt >= 0
                  ? `Headwind ${formatCalc(computedAlternate.headwindKt, config.roundOffValues)} kt`
                  : `Tailwind ${formatCalc(Math.abs(computedAlternate.headwindKt), config.roundOffValues)} kt`}
              </div>
            </div>

            {/* 4. Estimated Time & ETA at Alternate */}
            <div className="bg-white border border-indigo-200/90 rounded-xl p-3 shadow-2xs">
              <div className="text-[11px] font-sans font-semibold text-indigo-900 flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-600" />
                Est. Time to Alternate
              </div>
              <div className="text-sm font-bold text-indigo-950 mt-1">
                {formatCalc(computedAlternate.timeEstMin, config.roundOffValues)} min ({computedAlternate.timeEstRoundedMin}m)
              </div>
              <div className="text-[10px] text-indigo-800 mt-0.5">
                Alt ETA: <strong>{computedAlternate.eta}</strong>
              </div>
            </div>

            {/* 5. Estimated Fuel for Alternate */}
            <div className="bg-white border border-indigo-200/90 rounded-xl p-3 shadow-2xs col-span-2 sm:col-span-1">
              <div className="text-[11px] font-sans font-semibold text-indigo-900 flex items-center gap-1">
                <Fuel className="w-3 h-3 text-indigo-600" />
                Est. Alternate Fuel
              </div>
              <div className="text-sm font-bold text-indigo-950 mt-1">
                {formatCalc(computedAlternate.fuelEstLiters, config.roundOffValues)} L
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5">
                {fuelPlan.isCustomAlternateFuel
                  ? `Custom override: ${formatCalc(fuelPlan.alternateFuelLiters, config.roundOffValues)} L`
                  : `@ ${config.fuelFlowLph} L/hr flow`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ICAO / VFR Complete Fuel Plan Breakdown (Taxi + Trip + Contingency % + Alternate + Holding) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-xl p-4 sm:p-5 space-y-3.5 border border-slate-800 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-display font-bold tracking-tight">
            <Fuel className="w-4 h-4 text-amber-400" />
            <span>Complete Flight Fuel Plan Breakdown (Flow: {config.fuelFlowLph} L/hr)</span>
          </div>

          <div className="text-xs font-mono">
            {fuelPlan.isBlockFuelSufficient ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg font-sans font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Block Fuel Sufficient (+{formatCalc(fuelPlan.extraFuelMarginLiters, config.roundOffValues)} L Extra Margin)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-rose-300 bg-rose-500/10 border border-rose-500/25 px-2.5 py-1 rounded-lg font-sans font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Shortfall: Need {formatCalc(Math.abs(fuelPlan.extraFuelMarginLiters), config.roundOffValues)} L More Block Fuel
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
          {/* 1. Taxi Fuel (User Given) */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
            <label
              htmlFor="fuel-breakdown-taxi"
              className="block text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wider"
            >
              1. Taxi Fuel (L)
            </label>
            <div className="mt-1.5 flex items-center gap-1">
              <EditableNumberInput
                id="fuel-breakdown-taxi"
                min={0}
                step="0.5"
                fallbackOnEmptyBlur={0}
                value={fuelPlan.taxiFuelLiters}
                onChange={(val) =>
                  onUpdateConfig({ taxiFuelLiters: Math.max(0, val) })
                }
                className="w-16 px-2 py-0.5 text-xs font-mono font-bold bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-amber-400 focus:outline-none"
              />
              <span className="text-slate-300">L</span>
            </div>
            <div className="text-[10px] font-sans text-slate-400 mt-1.5">
              Takeoff avail: {formatCalc(fuelPlan.takeoffFuelAvailableLiters, config.roundOffValues)} L
            </div>
          </div>

          {/* 2. Trip Fuel */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
            <div className="text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wider">
              2. Trip Fuel
            </div>
            <div className="text-base font-bold text-amber-300 mt-1.5">
              {formatCalc(fuelPlan.tripFuelLiters, config.roundOffValues)} L
            </div>
            <div className="text-[10px] font-sans text-slate-400 mt-1">
              From NavLog legs
            </div>
          </div>

          {/* 3. Contingency Fuel (% of Trip Fuel) */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
            <label
              htmlFor="fuel-breakdown-contingency-pct"
              className="block text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wider"
            >
              3. Contingency (% Trip)
            </label>
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <EditableNumberInput
                  id="fuel-breakdown-contingency-pct"
                  min={0}
                  max={100}
                  step="1"
                  fallbackOnEmptyBlur={0}
                  value={config.contingencyPercent}
                  onChange={(val) =>
                    onUpdateConfig({ contingencyPercent: Math.max(0, val) })
                  }
                  className="w-12 px-1.5 py-0.5 text-xs font-mono font-bold bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-amber-400 focus:outline-none"
                />
                <span className="text-slate-400">%</span>
              </div>
              <span className="text-sm font-bold text-sky-300">
                {formatCalc(fuelPlan.contingencyFuelLiters, config.roundOffValues)} L
              </span>
            </div>
            <div className="text-[10px] font-sans text-slate-400 mt-1.5">
              {config.contingencyPercent}% of {formatCalc(fuelPlan.tripFuelLiters, config.roundOffValues)} L trip
            </div>
          </div>

          {/* 4. Alternate Fuel (Auto from Alternate Leg OR Custom User Input) */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
            <label
              htmlFor="fuel-breakdown-alternate-liters"
              className="block text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wider"
            >
              4. Alternate Fuel (L)
            </label>
            <div className="mt-1.5 flex items-center gap-1">
              <EditableNumberInput
                id="fuel-breakdown-alternate-liters"
                min={0}
                step="0.5"
                fallbackOnEmptyBlur={fuelPlan.computedAlternateFuelLiters}
                value={fuelPlan.alternateFuelLiters}
                onChange={(val) =>
                  onUpdateConfig({ customAlternateFuelLiters: Math.max(0, val) })
                }
                className="w-16 px-2 py-0.5 text-xs font-mono font-bold bg-slate-900 border border-slate-600 rounded-lg text-indigo-300 focus:border-indigo-400 focus:outline-none"
              />
              <span className="text-slate-300">L</span>
            </div>
            <div className="text-[10px] font-sans text-slate-400 mt-1.5 flex items-center justify-between gap-1">
              <span className="truncate">
                {fuelPlan.isCustomAlternateFuel
                  ? 'Custom Alternate Fuel'
                  : alternate
                  ? `From ${alternateFrom} → ${alternate.name.split(' ')[0]}`
                  : 'No alternate selected'}
              </span>
              {fuelPlan.isCustomAlternateFuel && (
                <button
                  id="reset-auto-alternate-fuel-btn"
                  type="button"
                  onClick={() =>
                    onUpdateConfig({ customAlternateFuelLiters: null })
                  }
                  className="text-[10px] text-indigo-300 hover:underline shrink-0 no-print"
                >
                  Use Calc ({formatCalc(fuelPlan.computedAlternateFuelLiters, config.roundOffValues)}L)
                </button>
              )}
            </div>
          </div>

          {/* 5. Holding Fuel (Liters & Minutes) */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
            <label
              htmlFor="fuel-breakdown-holding-liters"
              className="block text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wider"
            >
              5. Holding Fuel (L)
            </label>
            <div className="mt-1.5 flex items-center gap-1">
              <EditableNumberInput
                id="fuel-breakdown-holding-liters"
                min={0}
                step="0.5"
                fallbackOnEmptyBlur={0}
                value={fuelPlan.holdingFuelLiters}
                onChange={(val) => {
                  const clean = Math.max(0, val);
                  onUpdateConfig({
                    holdingFuelLiters: clean,
                    reserveFuelLiters: clean,
                  });
                }}
                className="w-16 px-2 py-0.5 text-xs font-mono font-bold bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-amber-400 focus:outline-none"
              />
              <span className="text-slate-300">L</span>
            </div>
            <div className="text-[10px] font-sans text-slate-400 mt-1.5 flex items-center justify-between">
              <span>≈ {fuelPlan.holdingTimeMin} min hold</span>
              <button
                type="button"
                onClick={() => {
                  const hold45 = roundCalc(
                    (45 / 60) * config.fuelFlowLph,
                    config.roundOffValues
                  );
                  onUpdateConfig({
                    holdingFuelLiters: hold45,
                    reserveFuelLiters: hold45,
                  });
                }}
                className="text-[10px] text-amber-300 hover:underline no-print"
              >
                Set 45m
              </button>
            </div>
          </div>

          {/* 6. Total Required Block Fuel vs On Board */}
          <div className="bg-slate-800 border border-amber-500/40 rounded-xl p-3">
            <div className="text-[10px] font-sans font-semibold text-amber-300 uppercase tracking-wider">
              Total Required Fuel
            </div>
            <div className="text-base font-bold text-white mt-1.5">
              {formatCalc(fuelPlan.totalBlockFuelRequiredLiters, config.roundOffValues)} L
            </div>
            <div className="text-[10px] font-sans text-slate-300 mt-1">
              On Board: <strong>{formatCalc(fuelPlan.initialBlockFuelLiters, config.roundOffValues)} L</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

