/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Printer,
  Compass,
  Fuel,
  Clock,
  Navigation,
  Calendar,
  Trash2,
  Hash,
  Moon,
  Sun,
  Sparkles,
  Flame,
  X,
} from 'lucide-react';
import {
  ALTITUDE_LEVELS,
  AlternateAerodrome,
  FlightConfig,
  LegOverride,
  RouteTrackMode,
  WIND_MODEL_OPTIONS,
  Waypoint,
  WindModelId,
  computeNavLog,
  formatCalc,
  generateWaypointsAlongStraightLine,
  getClosestAltitudeLevel,
  getCurrentIstDateTime,
  insertEnRouteWaypoint,
  restoreFreeformWaypoints,
  roundWindDirToTenDeg,
  snapWaypointsToStraightLine,
  updateEndpointWaypoint,
} from './utils/navlogMath';
import { PRESET_ROUTES } from './utils/presetRoutes';
import { fetchUpperAirWindsBatchClient } from './utils/weatherClient';
import { RouteMap } from './components/RouteMap';
import { NavLogTable } from './components/NavLogTable';
import { WaypointManager } from './components/WaypointManager';
import { AlternatePlanner } from './components/AlternatePlanner';
import { EditableNumberInput } from './components/EditableNumberInput';
import { DiwaliFirecrackers } from './components/DiwaliFirecrackers';

export default function App() {
  const [activePresetId, setActivePresetId] = useState<string>(PRESET_ROUTES[0].id);
  const [config, setConfig] = useState<FlightConfig>(() => {
    const ist = getCurrentIstDateTime();
    return {
      ...PRESET_ROUTES[0].config,
      windModel: 'ecmwf_ifs025',
      routeTrackMode: 'straight',
      departureDate: ist.date,
      airborneTime: ist.time,
    };
  });
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() =>
    snapWaypointsToStraightLine(PRESET_ROUTES[0].waypoints)
  );
  const [overrides, setOverrides] = useState<Record<string, LegOverride>>({});
  const [selectedLegIndex, setSelectedLegIndex] = useState<number>(0);
  const [showMagneticHeading, setShowMagneticHeading] = useState<boolean>(false);
  const [paperBlankRowsCount, setPaperBlankRowsCount] = useState<number>(3);
  const [isSyncingWinds, setIsSyncingWinds] = useState<boolean>(false);
  const [windSyncSuccess, setWindSyncSuccess] = useState<boolean>(false);
  const [windSyncCount, setWindSyncCount] = useState<number>(0);
  const [showChangelog, setShowChangelog] = useState<boolean>(true);
  const [diwaliEasterEggActive, setDiwaliEasterEggActive] = useState<boolean>(true);
  const [diwaliTriggerKey, setDiwaliTriggerKey] = useState<number>(1);
  const diwaliTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDiwaliEasterEgg = useCallback(() => {
    if (diwaliTimerRef.current) {
      clearTimeout(diwaliTimerRef.current);
    }
    setDiwaliEasterEggActive(true);
    setDiwaliTriggerKey((k) => k + 1);
    diwaliTimerRef.current = setTimeout(() => {
      setDiwaliEasterEggActive(false);
      diwaliTimerRef.current = null;
    }, 10000);
  }, []);

  useEffect(() => {
    diwaliTimerRef.current = setTimeout(() => {
      setDiwaliEasterEggActive(false);
      diwaliTimerRef.current = null;
    }, 10000);
    return () => {
      if (diwaliTimerRef.current) {
        clearTimeout(diwaliTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showChangelog) return;
    const timer = setTimeout(() => {
      setShowChangelog(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [showChangelog]);
  const syncSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [windSyncStatus, setWindSyncStatus] = useState<string>(
    'Upper-air winds synced via Open-Meteo ECMWF IFS for 5,000 ft (850 hPa)'
  );
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('aerolog_dark_mode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('aerolog_dark_mode', String(darkMode));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [darkMode]);

  // Compute NavLog summary, legs, alternate leg, and fuel breakdown reactively
  const navLogSummary = useMemo(
    () => computeNavLog(waypoints, config, overrides),
    [waypoints, config, overrides]
  );

  const safeSelectedLegIndex = useMemo(() => {
    if (navLogSummary.legs.length === 0) return 0;
    return Math.min(selectedLegIndex, navLogSummary.legs.length - 1);
  }, [selectedLegIndex, navLogSummary.legs.length]);

  const updateConfig = useCallback((partial: Partial<FlightConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  // Fetch upper-air winds from Open-Meteo / backend /api/winds using altitude, departureDate, departureTime, and windModel
  const fetchUpperAirWinds = useCallback(
    async (
      targetWaypoints: Waypoint[],
      altitudeFt: number,
      departureDate: string,
      departureTime: string,
      targetAlternate: AlternateAerodrome | null,
      windModel: WindModelId = 'ecmwf_ifs025',
      forceRefresh: boolean = false
    ) => {
      if (targetWaypoints.length === 0 && !targetAlternate) return;
      if (syncSuccessTimerRef.current) {
        clearTimeout(syncSuccessTimerRef.current);
        syncSuccessTimerRef.current = null;
      }
      setWindSyncSuccess(false);
      setIsSyncingWinds(true);
      if (forceRefresh) {
        setWindSyncCount((c) => c + 1);
      }

      try {
        const pointsPayload = [
          ...targetWaypoints.map((w) => ({
            id: w.id,
            lat: w.lat,
            lng: w.lng,
          })),
          ...(targetAlternate
            ? [
                {
                  id: '__alternate__',
                  lat: targetAlternate.lat,
                  lng: targetAlternate.lng,
                },
              ]
            : []),
        ];

        const [data] = await Promise.all([
          fetchUpperAirWindsBatchClient({
            altitudeFt,
            departureDate,
            departureTime,
            windModel,
            points: pointsPayload,
            forceRefresh,
          }),
          forceRefresh
            ? new Promise((resolve) => setTimeout(resolve, 350))
            : Promise.resolve(),
        ]);

        const windMap = new Map(data.winds.map((w) => [w.id, w]));
        setWaypoints((prev) =>
          prev.map((wp, idx) => {
            const matched = windMap.get(wp.id) || data.winds[idx];
            if (!matched) return wp;
            return {
              ...wp,
              windDir: roundWindDirToTenDeg(matched.windDir),
              windSpd: matched.windSpd,
              windSource: matched.source,
            };
          })
        );

        // Clear any per-leg windDir/windSpd overrides so the newly synced model winds apply across all legs
        setOverrides((prev) => {
          const next: Record<string, LegOverride> = {};
          for (const [legId, ov] of Object.entries(prev)) {
            const cleaned: LegOverride = { ...ov };
            delete cleaned.windDir;
            delete cleaned.windSpd;
            if (cleaned.trackDeg !== undefined || cleaned.distanceNm !== undefined) {
              next[legId] = cleaned;
            }
          }
          return next;
        });

        const altWind = windMap.get('__alternate__');
        if (altWind) {
          setConfig((prev) =>
            prev.alternate
              ? {
                  ...prev,
                  alternate: {
                    ...prev.alternate,
                    windDir: roundWindDirToTenDeg(altWind.windDir),
                    windSpd: altWind.windSpd,
                    windSource: altWind.source,
                  },
                }
              : prev
          );
        }

        const firstSource =
          data.winds[0]?.source ||
          `${data.level.pressureHpa} hPa (${altitudeFt} ft · ${departureDate} ${departureTime})`;
        setWindSyncStatus(`Synced: ${firstSource}`);

        if (forceRefresh) {
          setWindSyncSuccess(true);
          syncSuccessTimerRef.current = setTimeout(() => {
            setWindSyncSuccess(false);
          }, 2200);
        }
      } catch {
        const lvl = getClosestAltitudeLevel(altitudeFt);
        setWindSyncStatus(
          `Using synoptic profile @ ${lvl.pressureHpa} hPa (${altitudeFt} ft · ${departureDate} ${departureTime})`
        );
      } finally {
        setIsSyncingWinds(false);
      }
    },
    []
  );

  const latestSyncRef = useRef({
    waypoints,
    selectedAltitudeFt: config.selectedAltitudeFt,
    departureDate: config.departureDate,
    airborneTime: config.airborneTime,
    alternate: config.alternate,
    windModel: config.windModel || 'ecmwf_ifs025',
  });
  latestSyncRef.current = {
    waypoints,
    selectedAltitudeFt: config.selectedAltitudeFt,
    departureDate: config.departureDate,
    airborneTime: config.airborneTime,
    alternate: config.alternate,
    windModel: config.windModel || 'ecmwf_ifs025',
  };

  const handleManualSyncWinds = useCallback(() => {
    if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement.tagName === 'INPUT'
    ) {
      document.activeElement.blur();
    }
    const cur = latestSyncRef.current;
    fetchUpperAirWinds(
      cur.waypoints,
      cur.selectedAltitudeFt,
      cur.departureDate,
      cur.airborneTime,
      cur.alternate,
      cur.windModel,
      true
    );
  }, [fetchUpperAirWinds]);

  // Automatically sync upper-air winds on initial mount and whenever config.windModel changes
  useEffect(() => {
    const cur = latestSyncRef.current;
    fetchUpperAirWinds(
      cur.waypoints,
      cur.selectedAltitudeFt,
      cur.departureDate,
      cur.airborneTime,
      cur.alternate,
      config.windModel || 'ecmwf_ifs025',
      false
    );
  }, [config.windModel, fetchUpperAirWinds]);

  const handleClearFlightPlan = useCallback(() => {
    setActivePresetId('custom');
    setWaypoints([]);
    setOverrides({});
    setSelectedLegIndex(0);
    setConfig((prev) => ({
      ...prev,
      alternate: null,
    }));
    setWindSyncStatus(
      'Flight plan cleared — click on the map, search Places, or enter coordinates to add waypoints'
    );
  }, []);

  const handleLoadPreset = (presetId: string) => {
    if (presetId === 'custom') {
      handleClearFlightPlan();
      return;
    }
    const found = PRESET_ROUTES.find((r) => r.id === presetId);
    if (!found) return;
    const currentModel = config.windModel || 'ecmwf_ifs025';
    const currentTrackMode: RouteTrackMode = config.routeTrackMode || 'straight';
    const nextWaypoints =
      currentTrackMode === 'straight'
        ? snapWaypointsToStraightLine(found.waypoints)
        : found.waypoints;
    setActivePresetId(found.id);
    setConfig({
      ...found.config,
      windModel: currentModel,
      routeTrackMode: currentTrackMode,
    });
    setWaypoints(nextWaypoints);
    setOverrides({});
    setSelectedLegIndex(0);
    fetchUpperAirWinds(
      nextWaypoints,
      found.config.selectedAltitudeFt,
      found.config.departureDate,
      found.config.airborneTime,
      found.config.alternate,
      currentModel
    );
  };

  const handleAltitudeChange = (newAltFt: number) => {
    updateConfig({ selectedAltitudeFt: newAltFt });
    fetchUpperAirWinds(
      waypoints,
      newAltFt,
      config.departureDate,
      config.airborneTime,
      config.alternate,
      config.windModel || 'ecmwf_ifs025'
    );
  };

  const handleWindModelChange = (newModel: WindModelId) => {
    updateConfig({ windModel: newModel });
  };

  const handleDepartureDateChange = (newDate: string) => {
    updateConfig({ departureDate: newDate });
    if (/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      fetchUpperAirWinds(
        waypoints,
        config.selectedAltitudeFt,
        newDate,
        config.airborneTime,
        config.alternate,
        config.windModel || 'ecmwf_ifs025'
      );
    }
  };

  const handleDepartureTimeChange = (newTime: string) => {
    updateConfig({ airborneTime: newTime });
    if (/^\d{1,2}:\d{2}$/.test(newTime.trim())) {
      fetchUpperAirWinds(
        waypoints,
        config.selectedAltitudeFt,
        config.departureDate,
        newTime.trim(),
        config.alternate,
        config.windModel || 'ecmwf_ifs025'
      );
    }
  };

  const handleChangeRouteTrackMode = useCallback(
    (newMode: RouteTrackMode) => {
      updateConfig({ routeTrackMode: newMode });
      const nextWaypoints =
        newMode === 'straight'
          ? snapWaypointsToStraightLine(waypoints)
          : restoreFreeformWaypoints(waypoints);
      setWaypoints(nextWaypoints);
      setOverrides({});
      fetchUpperAirWinds(
        nextWaypoints,
        config.selectedAltitudeFt,
        config.departureDate,
        config.airborneTime,
        config.alternate,
        config.windModel || 'ecmwf_ifs025'
      );
    },
    [
      waypoints,
      config.selectedAltitudeFt,
      config.departureDate,
      config.airborneTime,
      config.alternate,
      config.windModel,
      updateConfig,
      fetchUpperAirWinds,
    ]
  );

  const handleSetEndpointWaypoint = useCallback(
    (
      role: 'DEP' | 'DEST',
      name: string,
      lat: number,
      lng: number,
      elevationFt?: number
    ) => {
      const mode: RouteTrackMode = config.routeTrackMode || 'straight';
      const existingEndpoint =
        role === 'DEP' ? waypoints[0] : waypoints[waypoints.length - 1];
      const endpointWp: Waypoint = {
        id: existingEndpoint?.id || `wp-${role.toLowerCase()}-${Date.now()}`,
        name: name || (role === 'DEP' ? 'DEPARTURE' : 'DESTINATION'),
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
        elevationFt,
        windDir: existingEndpoint?.windDir ?? 270,
        windSpd: existingEndpoint?.windSpd ?? 15,
        windSource: 'Fetching...',
      };
      const updated = updateEndpointWaypoint(waypoints, role, endpointWp, mode);
      setWaypoints(updated);
      setOverrides({});
      fetchUpperAirWinds(
        updated,
        config.selectedAltitudeFt,
        config.departureDate,
        config.airborneTime,
        config.alternate,
        config.windModel || 'ecmwf_ifs025'
      );
    },
    [
      waypoints,
      config.routeTrackMode,
      config.selectedAltitudeFt,
      config.departureDate,
      config.airborneTime,
      config.alternate,
      config.windModel,
      fetchUpperAirWinds,
    ]
  );

  const handleAddWaypointFromMap = useCallback(
    (lat: number, lng: number, suggestedName?: string, explicitFraction?: number) => {
      const mode: RouteTrackMode = config.routeTrackMode || 'straight';
      const isDepFirst = waypoints.length === 0;
      const isDestSecond = waypoints.length === 1;
      const enRouteNumber = Math.max(1, waypoints.length - 1);
      const defaultName = isDepFirst
        ? 'DEP AERODROME'
        : isDestSecond
        ? 'DEST AERODROME'
        : `WPT ${enRouteNumber}`;

      const newWp: Waypoint = {
        id: `wp-${Date.now()}-${waypoints.length}`,
        name: suggestedName || defaultName,
        lat,
        lng,
        freeformLat: lat,
        freeformLng: lng,
        windDir: waypoints[waypoints.length - 1]?.windDir ?? 270,
        windSpd: waypoints[waypoints.length - 1]?.windSpd ?? 15,
        windSource: 'Fetching...',
      };

      const updated = insertEnRouteWaypoint(waypoints, newWp, mode, explicitFraction);
      setWaypoints(updated);
      fetchUpperAirWinds(
        updated,
        config.selectedAltitudeFt,
        config.departureDate,
        config.airborneTime,
        config.alternate,
        config.windModel || 'ecmwf_ifs025'
      );
    },
    [
      waypoints,
      config.routeTrackMode,
      config.selectedAltitudeFt,
      config.departureDate,
      config.airborneTime,
      config.alternate,
      config.windModel,
      fetchUpperAirWinds,
    ]
  );

  const handleGenerateEvenWaypoints = useCallback(
    (count: number) => {
      if (waypoints.length < 2) return;
      const dep = waypoints[0];
      const dest = waypoints[waypoints.length - 1];
      const generated = generateWaypointsAlongStraightLine(dep, dest, count);
      updateConfig({ routeTrackMode: 'straight' });
      setWaypoints(generated);
      setOverrides({});
      setSelectedLegIndex(0);
      fetchUpperAirWinds(
        generated,
        config.selectedAltitudeFt,
        config.departureDate,
        config.airborneTime,
        config.alternate,
        config.windModel || 'ecmwf_ifs025'
      );
    },
    [
      waypoints,
      config.selectedAltitudeFt,
      config.departureDate,
      config.airborneTime,
      config.alternate,
      config.windModel,
      updateConfig,
      fetchUpperAirWinds,
    ]
  );

  const handleUpdateWaypointCoord = useCallback(
    (id: string, lat: number, lng: number) => {
      const mode: RouteTrackMode = config.routeTrackMode || 'straight';
      const idx = waypoints.findIndex((wp) => wp.id === id);
      if (idx === -1) return;

      let updated: Waypoint[];
      if (idx === 0) {
        updated = updateEndpointWaypoint(
          waypoints,
          'DEP',
          { ...waypoints[0], lat, lng },
          mode
        );
      } else if (idx === waypoints.length - 1 && waypoints.length > 1) {
        updated = updateEndpointWaypoint(
          waypoints,
          'DEST',
          { ...waypoints[waypoints.length - 1], lat, lng },
          mode
        );
      } else {
        const rawUpdated = waypoints.map((wp) =>
          wp.id === id
            ? {
                ...wp,
                lat,
                lng,
                freeformLat: mode === 'freeform' ? lat : wp.freeformLat,
                freeformLng: mode === 'freeform' ? lng : wp.freeformLng,
              }
            : wp
        );
        updated =
          mode === 'straight' ? snapWaypointsToStraightLine(rawUpdated) : rawUpdated;
      }

      setWaypoints(updated);
      fetchUpperAirWinds(
        updated,
        config.selectedAltitudeFt,
        config.departureDate,
        config.airborneTime,
        config.alternate,
        config.windModel || 'ecmwf_ifs025'
      );
    },
    [
      waypoints,
      config.routeTrackMode,
      config.selectedAltitudeFt,
      config.departureDate,
      config.airborneTime,
      config.alternate,
      config.windModel,
      fetchUpperAirWinds,
    ]
  );

  const handleSelectAlternate = useCallback(
    (newAlt: AlternateAerodrome | null) => {
      updateConfig({ alternate: newAlt });
      if (newAlt) {
        fetchUpperAirWinds(
          waypoints,
          config.selectedAltitudeFt,
          config.departureDate,
          config.airborneTime,
          newAlt,
          config.windModel || 'ecmwf_ifs025'
        );
      }
    },
    [
      waypoints,
      config.selectedAltitudeFt,
      config.departureDate,
      config.airborneTime,
      config.windModel,
      updateConfig,
      fetchUpperAirWinds,
    ]
  );

  const handleUpdateAlternateCoord = useCallback(
    (lat: number, lng: number, suggestedName?: string) => {
      const updatedAlt: AlternateAerodrome = {
        name: suggestedName || config.alternate?.name || 'ALT AERODROME',
        lat,
        lng,
        windDir: config.alternate?.windDir ?? 270,
        windSpd: config.alternate?.windSpd ?? 14,
        windSource: 'Fetching...',
      };
      handleSelectAlternate(updatedAlt);
    },
    [config.alternate, handleSelectAlternate]
  );

  const handleUpdateAlternateFields = useCallback(
    (partial: Partial<AlternateAerodrome>) => {
      setConfig((prev) =>
        prev.alternate
          ? {
              ...prev,
              alternate: {
                ...prev.alternate,
                ...partial,
              },
            }
          : prev
      );
    },
    []
  );

  const handleUpdateWaypoint = useCallback(
    (id: string, partial: Partial<Waypoint>) => {
      setWaypoints((prev) =>
        prev.map((wp) => (wp.id === id ? { ...wp, ...partial } : wp))
      );
    },
    []
  );

  const handleMoveWaypoint = useCallback(
    (index: number, direction: 'up' | 'down') => {
      setWaypoints((prev) => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;
        const copy = [...prev];
        const [item] = copy.splice(index, 1);
        copy.splice(targetIndex, 0, item);
        return copy;
      });
    },
    []
  );

  const handleRemoveWaypoint = useCallback((id: string) => {
    setWaypoints((prev) => prev.filter((wp) => wp.id !== id));
  }, []);

  const handleReverseRoute = useCallback(() => {
    setWaypoints((prev) => [...prev].reverse());
    setOverrides({});
  }, []);

  const handleUpdateLegOverride = useCallback(
    (legId: string, partial: Partial<LegOverride>) => {
      setOverrides((prev) => ({
        ...prev,
        [legId]: {
          ...(prev[legId] || {}),
          ...partial,
        },
      }));
    },
    []
  );

  const handleResetLegOverride = useCallback((legId: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[legId];
      return next;
    });
  }, []);

  return (
    <div
      id="top"
      className="min-h-screen flex flex-col bg-[#f4f7fb] text-slate-900 overflow-x-hidden selection:bg-sky-500/20 selection:text-sky-900"
    >
      {/* Festive 10-Second Diwali Firecrackers Easter Egg Canvas Overlay */}
      <DiwaliFirecrackers
        active={diwaliEasterEggActive}
        triggerKey={diwaliTriggerKey}
        darkMode={darkMode}
      />

      {/* Top Navigation Bar (Glassmorphic Sticky Header + Mobile Section Jump Strip) */}
      <header className="sticky top-0 z-30 bg-white/88 backdrop-blur-xl border-b border-slate-200/80 px-3 sm:px-6 py-2.5 sm:py-3 no-print shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Zone 1: Brand wordmark + vibecoded credit */}
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-x-2.5 gap-y-0.5 min-w-0 shrink-0">
            <a
              href="#top"
              className="flex items-center gap-2 text-base sm:text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 group"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <Compass className="w-4 h-4 animate-compass" />
              </span>
              <span>AeroLog VFR</span>
            </a>
            <span className="text-[10px] sm:text-[11px] font-mono font-medium text-slate-500 bg-slate-100/80 border border-slate-200/70 px-2 py-0.5 rounded-md whitespace-nowrap inline-flex items-center gap-1">
              <span>vibe coded with</span>
              <button
                id="diwali-heart-easter-egg"
                type="button"
                onClick={triggerDiwaliEasterEgg}
                title="✨ Easter Egg: Launch 10s Diwali Firecrackers!"
                aria-label="Launch 10-second Diwali Firecrackers Easter Egg"
                className="text-rose-500 hover:scale-125 active:scale-95 transition-transform cursor-pointer focus:outline-none"
              >
                ♥
              </button>
              <span>by</span>
              <a
                href="https://www.instagram.com/amartya320/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 hover:text-sky-800 font-semibold underline decoration-sky-300 underline-offset-2 transition-colors"
              >
                @amartya320
              </a>
            </span>
          </div>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav
            aria-label="Primary Section Navigation"
            className="hidden md:flex items-center gap-1 bg-slate-100/80 border border-slate-200/70 p-1 rounded-xl text-xs font-semibold text-slate-600 aerolog-segmented"
          >
            <a
              href="#flight-parameters"
              className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 hover:shadow-2xs transition-all whitespace-nowrap shrink-0"
            >
              Flight Parameters
            </a>
            <a
              href="#map-waypoints"
              className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 hover:shadow-2xs transition-all whitespace-nowrap shrink-0"
            >
              Map & Waypoints
            </a>
            <a
              href="#alternate-planner"
              className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 hover:shadow-2xs transition-all whitespace-nowrap shrink-0"
            >
              Alternate & Fuel Plan
            </a>
            <a
              href="#navlog-sheet"
              className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 hover:shadow-2xs transition-all whitespace-nowrap shrink-0"
            >
              NavLog Sheet
            </a>
          </nav>

          {/* Zone 3: 10s Diwali Easter Egg, Changelog & Dark Mode Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              id="diwali-easter-egg-btn"
              type="button"
              onClick={triggerDiwaliEasterEgg}
              aria-label="Trigger 10-second Diwali Firecrackers Easter Egg"
              title="🪔 Easter Egg: Launch 10-second Diwali Firecrackers celebration!"
              className={`p-1.5 sm:px-2.5 sm:py-2 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs ${
                diwaliEasterEggActive
                  ? 'bg-amber-50/90 border-amber-400 text-amber-900 shadow-[0_0_12px_rgba(245,158,11,0.28)]'
                  : 'bg-white border-slate-200/90 text-slate-600 hover:bg-amber-50/60 hover:border-amber-300 hover:text-amber-700'
              }`}
            >
              <Flame
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                  diwaliEasterEggActive
                    ? 'text-amber-500 animate-bounce scale-110'
                    : 'text-amber-500/80 hover:scale-110'
                }`}
              />
              <span className="hidden lg:inline">
                {diwaliEasterEggActive ? '10s Diwali ✨' : '🪔'}
              </span>
            </button>

            <button
              id="changelog-toggle-btn"
              type="button"
              onClick={() => setShowChangelog((prev) => !prev)}
              aria-expanded={showChangelog}
              title="View latest AeroLog VFR changelog & release notes"
              className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs ${
                showChangelog
                  ? 'bg-sky-50/90 border-sky-300 text-sky-800 hover:bg-sky-100'
                  : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>What&apos;s New</span>
              <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </button>

            <button
              id="dark-mode-toggle"
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-pressed={darkMode}
              title={
                darkMode
                  ? 'Switch to Daylight Kneeboard (Light Mode)'
                  : 'Switch to Cockpit Night View (Dark Mode)'
              }
              className={`px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs ${
                darkMode
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-300 hover:bg-amber-500/25'
                  : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {darkMode ? (
                <span key="sun" className="flex items-center gap-1.5 animate-theme-icon">
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Light Mode</span>
                </span>
              ) : (
                <span key="moon" className="flex items-center gap-1.5 animate-theme-icon">
                  <Moon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Dark Mode</span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Quick-Jump Section Bar (< 768px) */}
        <nav
          aria-label="Mobile Quick Section Jump"
          className="md:hidden grid grid-cols-5 gap-1 pt-2 mt-2 border-t border-slate-100"
        >
          <a
            href="#flight-parameters"
            className="px-1.5 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-center truncate"
          >
            1. Params
          </a>
          <a
            href="#map-waypoints"
            className="px-1.5 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-center truncate"
          >
            2. Map/Wx
          </a>
          <a
            href="#wind-triangle"
            className="px-1.5 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-center truncate"
          >
            3. Waypoints
          </a>
          <a
            href="#alternate-planner"
            className="px-1.5 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-center truncate"
          >
            4. Alt/Fuel
          </a>
          <a
            href="#navlog-sheet"
            className="px-1.5 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-center truncate"
          >
            5. NavLog
          </a>
        </nav>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
        {/* Changelog Notification Banner */}
        {showChangelog && (
          <aside
            id="changelog-notification"
            role="status"
            aria-label="Latest Changelog Notification"
            className="aerolog-card animate-slide-down bg-white border border-sky-200/90 rounded-2xl p-3.5 sm:p-4 no-print shadow-[0_1px_3px_rgba(15,23,42,0.03),0_10px_25px_-5px_rgba(14,165,233,0.08)]"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-sky-50/90 text-sky-800 border border-sky-200/80">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0 animate-pulse" />
                  Changelog Update
                </span>
                <span
                  id="changelog-date-badge"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-slate-100/90 text-slate-700 border border-slate-200/80"
                >
                  <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                  07-11-2026
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 flex-1 lg:mx-2">
                <div className="aerolog-subcard aerolog-hover-lift animate-fade-up bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 py-2 flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <div className="text-xs leading-snug">
                    <strong className="font-semibold text-slate-900">Modern UI &amp; Animations:</strong>{' '}
                    <span className="text-slate-600">
                      Refined EFB command deck, smooth 60fps UI animations &amp; true AMOLED black dark mode.
                    </span>
                  </div>
                </div>

                <div className="aerolog-subcard aerolog-hover-lift animate-fade-up-delay-1 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 py-2 flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                  <div className="text-xs leading-snug">
                    <strong className="font-semibold text-slate-900">10s Diwali Easter Egg:</strong>{' '}
                    <span className="text-slate-600">
                      10-second Diwali firecrackers &amp; phuljhari sparkler celebration (click 🪔 or ♥).
                    </span>
                  </div>
                </div>

                <div className="aerolog-subcard aerolog-hover-lift animate-fade-up-delay-1 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 py-2 flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div className="text-xs leading-snug">
                    <strong className="font-semibold text-slate-900">Rounded Wind Direction:</strong>{' '}
                    <span className="text-slate-600">
                      Wind direction degrees automatically rounded to the nearest 10° increment.
                    </span>
                  </div>
                </div>

                <div className="aerolog-subcard aerolog-hover-lift animate-fade-up-delay-2 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 py-2 flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <div className="text-xs leading-snug">
                    <strong className="font-semibold text-slate-900">Accurate Wind Data &amp; Sync:</strong>{' '}
                    <span className="text-slate-600">
                      Live Open-Meteo ECMWF IFS / GFS / ICON upper-air winds with one-click Sync Winds.
                    </span>
                  </div>
                </div>
              </div>

              <button
                id="dismiss-changelog-btn"
                type="button"
                onClick={() => setShowChangelog(false)}
                aria-label="Dismiss changelog notification"
                title="Dismiss changelog notification"
                className="self-end lg:self-center p-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 border border-slate-200/80 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </aside>
        )}

        {/* Section 1: Departure Date/Time, Aircraft Performance & Fuel Reserves Ribbon */}
        <section
          id="flight-parameters"
          className="aerolog-card animate-fade-up bg-white border border-slate-200/85 rounded-2xl p-4 sm:p-5 space-y-4 no-print shadow-[0_1px_3px_rgba(15,23,42,0.03),0_10px_30px_-5px_rgba(15,23,42,0.04)]"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-slate-100 pb-3.5">
            <div>
              <h1 className="text-base sm:text-lg font-display font-bold text-slate-900 tracking-tight">
                Flight Navigation Log & Upper-Air Wind Calculator
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Set Estimated Departure Date & Time (IST), Cruise Altitude, and Free Upper-Air Weather Model (ECMWF IFS, NOAA GFS, or DWD ICON) to compute leg winds, headings, ground speeds, and fuel.
              </p>
            </div>

            {/* Preset Route Selector, Round Off Values Toggle & Clear Flight Plan Button */}
            <div className="flex flex-wrap items-center lg:justify-end gap-2 w-full lg:w-auto shrink-0">
              <button
                id="toggle-round-off-btn"
                type="button"
                onClick={() =>
                  updateConfig({ roundOffValues: !config.roundOffValues })
                }
                title="Toggle rounding off decimal values to whole integers across all distance, time, and fuel calculations"
                className={`px-3 py-1.5 text-xs font-semibold border rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs ${
                  config.roundOffValues
                    ? 'bg-amber-100/90 border-amber-400 text-amber-950'
                    : 'bg-slate-50/90 border-slate-200/90 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                {config.roundOffValues
                  ? 'Round Off: ON (Whole Numbers)'
                  : 'Round Off: OFF (Decimals)'}
              </button>

              <button
                id="clear-flight-plan-btn"
                type="button"
                onClick={handleClearFlightPlan}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-50/90 hover:bg-rose-100 text-rose-700 border border-rose-200/90 rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 sm:order-3 shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Flight Plan
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 lg:flex-initial min-w-0 sm:order-2 bg-slate-50/90 border border-slate-200/90 rounded-xl px-2.5 py-1 aerolog-subcard">
                <label
                  htmlFor="preset-route-select"
                  className="text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0"
                >
                  Sample Flight Plan:
                </label>
                <select
                  id="preset-route-select"
                  value={activePresetId}
                  onChange={(e) => handleLoadPreset(e.target.value)}
                  className="flex-1 sm:w-auto sm:max-w-[200px] min-w-0 truncate text-xs font-semibold bg-transparent border-0 py-0.5 text-slate-900 focus:outline-none"
                >
                  {PRESET_ROUTES.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.title}
                    </option>
                  ))}
                  <option value="custom">Custom / Blank Flight Plan</option>
                </select>
              </div>
            </div>
          </div>

          {/* Primary Flight Parameters Grid: Est Departure Date, Est Departure Time, Altitude, Wind Model, TAS, Fuel Flow, Initial Fuel, Taxi, Fixed Track */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-3 items-end">
            {/* 1. Estimated Departure Date (IST) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-2 lg:col-span-2">
              <label
                htmlFor="input-departure-date"
                className="block text-[11px] font-semibold text-sky-900 mb-1.5 flex items-center gap-1 truncate"
              >
                <Calendar className="w-3 h-3 text-sky-600 shrink-0" />
                <span className="truncate">Est. Departure Date (IST)</span>
              </label>
              <input
                id="input-departure-date"
                type="date"
                value={config.departureDate}
                onChange={(e) => handleDepartureDateChange(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-sky-50/60 border border-sky-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              />
            </div>

            {/* 2. Estimated Departure Time (IST) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-airborne-time"
                className="block text-[11px] font-semibold text-sky-900 mb-1.5 flex items-center gap-1 whitespace-nowrap"
              >
                <Clock className="w-3 h-3 text-sky-600 shrink-0" />
                <span>Dep Time (IST)</span>
              </label>
              <input
                id="input-airborne-time"
                type="time"
                value={config.airborneTime}
                onChange={(e) => handleDepartureTimeChange(e.target.value)}
                className="w-full px-2 py-2 text-xs font-mono font-bold bg-sky-50/60 border border-sky-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              />
            </div>

            {/* 3. Cruising Altitude (Pressure Level) */}
            <div className="col-span-2 sm:col-span-1 md:col-span-3 lg:col-span-2">
              <label
                htmlFor="select-altitude-ft"
                className="block text-[11px] font-semibold text-slate-600 mb-1.5 truncate"
              >
                Cruise Altitude (Pressure Level)
              </label>
              <select
                id="select-altitude-ft"
                value={config.selectedAltitudeFt}
                onChange={(e) => handleAltitudeChange(Number(e.target.value))}
                className="w-full px-2.5 py-2 text-xs font-mono font-semibold bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              >
                {ALTITUDE_LEVELS.map((lvl) => (
                  <option key={lvl.altitudeFt} value={lvl.altitudeFt}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Free Upper-Air Wind Model Selector (Open-Meteo ECMWF IFS / NOAA GFS / DWD ICON) */}
            <div className="col-span-2 sm:col-span-2 md:col-span-2 lg:col-span-2">
              <label
                htmlFor="select-wind-model"
                className="block text-[11px] font-semibold text-emerald-900 mb-1.5 truncate"
                title="Open-Meteo provides 100% free, unshuffled upper-air pressure-level wind forecasts from ECMWF IFS (Windy's default model), NOAA GFS, and DWD ICON"
              >
                Upper-Air Wind Model (Free)
              </label>
              <select
                id="select-wind-model"
                value={config.windModel || 'ecmwf_ifs025'}
                onChange={(e) => handleWindModelChange(e.target.value as WindModelId)}
                className="w-full px-2.5 py-2 text-xs font-mono font-semibold bg-emerald-50/70 border border-emerald-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none transition-all"
              >
                {WIND_MODEL_OPTIONS.map((mdl) => (
                  <option key={mdl.id} value={mdl.id}>
                    {mdl.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Cruise TAS (kt) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-tas-kt"
                className="block text-[11px] font-semibold text-slate-600 mb-1.5 truncate"
              >
                Cruise TAS (kt)
              </label>
              <EditableNumberInput
                id="input-tas-kt"
                min={20}
                max={600}
                fallbackOnEmptyBlur={85}
                value={config.cruiseTasKt}
                onChange={(val) => updateConfig({ cruiseTasKt: Math.max(1, val) })}
                className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              />
            </div>

            {/* 6. Fuel Flow (L/hr) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-fuel-flow"
                className="block text-[11px] font-semibold text-slate-600 mb-1.5 truncate"
              >
                Fuel Flow (L/hr)
              </label>
              <EditableNumberInput
                id="input-fuel-flow"
                min={0}
                step="0.5"
                fallbackOnEmptyBlur={15}
                value={config.fuelFlowLph}
                onChange={(val) => updateConfig({ fuelFlowLph: Math.max(0, val) })}
                className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              />
            </div>

            {/* 7. Initial Block Fuel On Board (L) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-initial-fuel"
                className="block text-[11px] font-semibold text-slate-600 mb-1.5 truncate"
              >
                Block Fuel (L)
              </label>
              <EditableNumberInput
                id="input-initial-fuel"
                min={0}
                step="1"
                fallbackOnEmptyBlur={120}
                value={config.initialFuelLiters}
                onChange={(val) =>
                  updateConfig({ initialFuelLiters: Math.max(0, val) })
                }
                className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              />
            </div>

            {/* 8. Taxi Fuel (L) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-taxi-fuel"
                className="block text-[11px] font-semibold text-slate-600 mb-1.5 truncate"
              >
                Taxi Fuel (L)
              </label>
              <EditableNumberInput
                id="input-taxi-fuel"
                min={0}
                step="0.5"
                fallbackOnEmptyBlur={5}
                value={config.taxiFuelLiters}
                onChange={(val) => updateConfig({ taxiFuelLiters: Math.max(0, val) })}
                className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              />
            </div>

            {/* 9. Whole-Flight Fixed Track Override (Optional) */}
            <div className="col-span-2 sm:col-span-2 md:col-span-6 lg:col-span-1">
              <label
                htmlFor="input-global-track"
                className="block text-[11px] font-semibold text-slate-600 mb-1.5 truncate"
                title="Leave blank to auto-calculate track between each map waypoint, or enter a fixed track (0-359°) for the whole flight"
              >
                Fixed Track (°T)
              </label>
              <input
                id="input-global-track"
                type="number"
                min={0}
                max={359}
                placeholder="Auto Map"
                value={
                  config.globalTrackOverrideDeg !== null
                    ? config.globalTrackOverrideDeg
                    : ''
                }
                onChange={(e) => {
                  const val = e.target.value.trim();
                  updateConfig({
                    globalTrackOverrideDeg:
                      val === '' ? null : Math.max(0, Math.min(359, Number(val))),
                  });
                }}
                className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-slate-50/90 border border-slate-200/90 rounded-xl text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Flight Summary KPI Telemetry Ribbon */}
          <div className="aerolog-subcard bg-slate-50/90 border border-slate-200/80 rounded-xl px-3.5 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-slate-700 font-mono">
              <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                <Navigation className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="text-slate-500 font-sans font-medium">Total Dist:</span>
                <strong className="text-slate-900">
                  {formatCalc(navLogSummary.totalDistanceNm, config.roundOffValues)} NM
                </strong>
              </span>
              <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="text-slate-500 font-sans font-medium">Trip Time:</span>
                <strong className="text-slate-900">
                  {formatCalc(navLogSummary.totalTimeMin, config.roundOffValues)} min (ETA{' '}
                  {navLogSummary.finalEta})
                </strong>
              </span>
              <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                <Compass className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="text-slate-500 font-sans font-medium">Avg G/S:</span>
                <strong className="text-slate-900">
                  {formatCalc(navLogSummary.averageGsKt, config.roundOffValues)} kt
                </strong>
              </span>
              <span className="w-full lg:w-auto pt-1.5 lg:pt-0 border-t lg:border-t-0 border-slate-200/70 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs bg-white lg:px-2.5 lg:py-1 lg:rounded-lg lg:border lg:border-slate-200/80 lg:shadow-2xs">
                <Fuel className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  Trip:{' '}
                  <strong>
                    {formatCalc(navLogSummary.fuelPlan.tripFuelLiters, config.roundOffValues)} L
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Cont ({navLogSummary.fuelPlan.contingencyPercent}%):{' '}
                  <strong>
                    {formatCalc(
                      navLogSummary.fuelPlan.contingencyFuelLiters,
                      config.roundOffValues
                    )}{' '}
                    L
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Alt:{' '}
                  <strong>
                    {formatCalc(
                      navLogSummary.fuelPlan.alternateFuelLiters,
                      config.roundOffValues
                    )}{' '}
                    L
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Hold:{' '}
                  <strong>
                    {formatCalc(
                      navLogSummary.fuelPlan.holdingFuelLiters,
                      config.roundOffValues
                    )}{' '}
                    L
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Taxi:{' '}
                  <strong>
                    {formatCalc(
                      navLogSummary.fuelPlan.taxiFuelLiters,
                      config.roundOffValues
                    )}{' '}
                    L
                  </strong>
                </span>
                <span>= Req Block:</span>
                <strong className="text-sky-700">
                  {formatCalc(
                    navLogSummary.fuelPlan.totalBlockFuelRequiredLiters,
                    config.roundOffValues
                  )}{' '}
                  L
                </strong>
              </span>
            </div>

            <div className="text-[11px] text-slate-500 font-mono truncate px-2 py-0.5 bg-white/80 rounded-md border border-slate-200/60">
              {windSyncStatus}
            </div>
          </div>
        </section>

        {/* Section 2: Interactive Google Maps / Earth + Waypoint Manager */}
        <section id="map-waypoints" className="space-y-5 no-print">
          <RouteMap
            waypoints={waypoints}
            legs={navLogSummary.legs}
            routeTrackMode={config.routeTrackMode || 'straight'}
            onChangeRouteTrackMode={handleChangeRouteTrackMode}
            alternate={config.alternate}
            alternateFrom={config.alternateFrom || 'DEST'}
            computedAlternate={navLogSummary.alternateLeg}
            selectedAltitudeFt={config.selectedAltitudeFt}
            windModel={config.windModel}
            onWindModelChange={handleWindModelChange}
            departureDate={config.departureDate}
            departureTime={config.airborneTime}
            selectedLegIndex={safeSelectedLegIndex}
            onSelectLeg={setSelectedLegIndex}
            onAddWaypointFromMap={(lat, lng, suggestedName) =>
              handleAddWaypointFromMap(lat, lng, suggestedName)
            }
            onSetEndpointFromMap={(role, lat, lng, suggestedName) =>
              handleSetEndpointWaypoint(
                role,
                suggestedName || (role === 'DEP' ? 'MAP DEP' : 'MAP DEST'),
                lat,
                lng
              )
            }
            onUpdateWaypointCoord={handleUpdateWaypointCoord}
            onUpdateAlternateCoord={handleUpdateAlternateCoord}
            onRemoveWaypoint={handleRemoveWaypoint}
            onSyncAllWinds={handleManualSyncWinds}
            isSyncingWinds={isSyncingWinds}
            windSyncSuccess={windSyncSuccess}
            windSyncCount={windSyncCount}
          />

          <div id="wind-triangle" className="flex flex-col">
            <WaypointManager
              waypoints={waypoints}
              selectedAltitudeFt={config.selectedAltitudeFt}
              routeTrackMode={config.routeTrackMode || 'straight'}
              onChangeRouteTrackMode={handleChangeRouteTrackMode}
              onSetEndpointWaypoint={handleSetEndpointWaypoint}
              onAddWaypoint={(name, lat, lng, explicitFraction) =>
                handleAddWaypointFromMap(lat, lng, name, explicitFraction)
              }
              onGenerateEvenWaypoints={handleGenerateEvenWaypoints}
              onUpdateWaypoint={handleUpdateWaypoint}
              onUpdateWaypointCoord={handleUpdateWaypointCoord}
              onMoveWaypoint={handleMoveWaypoint}
              onRemoveWaypoint={handleRemoveWaypoint}
              onReverseRoute={handleReverseRoute}
              onClearAllWaypoints={handleClearFlightPlan}
              onImportWaypoints={(imported) => {
                const nextWpts =
                  (config.routeTrackMode || 'straight') === 'straight'
                    ? snapWaypointsToStraightLine(imported)
                    : imported;
                setWaypoints(nextWpts);
                setOverrides({});
                setSelectedLegIndex(0);
                setConfig((prev) => ({ ...prev, alternate: null }));
                fetchUpperAirWinds(
                  nextWpts,
                  config.selectedAltitudeFt,
                  config.departureDate,
                  config.airborneTime,
                  null,
                  config.windModel || 'ecmwf_ifs025',
                  true
                );
              }}
              onSyncAllWinds={handleManualSyncWinds}
              isSyncingWinds={isSyncingWinds}
              windSyncSuccess={windSyncSuccess}
            />
          </div>
        </section>

        {/* Section 3: Alternate Aerodrome Search / Coordinates & Complete Fuel Breakdown */}
        <section>
          <AlternatePlanner
            departureWaypoint={waypoints[0]}
            destinationWaypoint={waypoints[waypoints.length - 1]}
            alternate={config.alternate}
            computedAlternate={navLogSummary.alternateLeg}
            fuelPlan={navLogSummary.fuelPlan}
            config={config}
            showMagneticHeading={showMagneticHeading}
            onSelectAlternate={handleSelectAlternate}
            onUpdateAlternateFields={handleUpdateAlternateFields}
            onUpdateConfig={updateConfig}
          />
        </section>

        {/* Section 4: Paper-Faithful Flight NavLog Table (Estimated Pre-Flight Columns) */}
        <section id="navlog-sheet" className="space-y-3.5">
          <div className="aerolog-card bg-white border border-slate-200/85 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3.5 no-print shadow-[0_1px_3px_rgba(15,23,42,0.03),0_10px_30px_-5px_rgba(15,23,42,0.04)]">
            <div>
              <h2 className="text-base font-display font-bold text-slate-900">
                Flight Navigation Log Sheet (Pre-Flight Estimated Values)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ready to copy onto your physical flight logbook. Click any Track, Leg Distance, or Wind cell to override values.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Round Off Values Switch */}
              <button
                type="button"
                onClick={() =>
                  updateConfig({ roundOffValues: !config.roundOffValues })
                }
                className={`px-3 py-1.5 text-xs font-semibold border rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs ${
                  config.roundOffValues
                    ? 'bg-amber-100/90 border-amber-400 text-amber-950'
                    : 'bg-slate-50/90 border-slate-200/90 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                {config.roundOffValues ? 'Rounded (Whole)' : 'Round Off Values'}
              </button>

              {/* True vs Magnetic Heading Switch */}
              <div className="flex items-center gap-1 p-1 bg-slate-100/90 border border-slate-200/80 rounded-xl aerolog-segmented">
                <button
                  type="button"
                  onClick={() => setShowMagneticHeading(false)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                    !showMagneticHeading
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  True HDG (°T)
                </button>
                <button
                  type="button"
                  onClick={() => setShowMagneticHeading(true)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                    showMagneticHeading
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mag HDG (°M)
                </button>
              </div>

              {/* Extra Blank Rows Toggle */}
              <button
                type="button"
                onClick={() =>
                  setPaperBlankRowsCount((c) => (c === 3 ? 10 : c === 10 ? 0 : 3))
                }
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50/90 border border-slate-200/90 text-slate-700 hover:bg-slate-100 rounded-xl transition-all whitespace-nowrap shrink-0 shadow-2xs"
              >
                Blank Rows: {paperBlankRowsCount}
              </button>

              {/* Print Kneeboard Sheet */}
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 text-xs font-semibold bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Sheet
              </button>
            </div>
          </div>

          {/* The Pre-Flight Estimated NavLog Sheet */}
          <NavLogTable
            summary={navLogSummary}
            config={config}
            overrides={overrides}
            selectedLegIndex={safeSelectedLegIndex}
            showMagneticHeading={showMagneticHeading}
            paperBlankRowsCount={paperBlankRowsCount}
            onSelectLeg={setSelectedLegIndex}
            onUpdateLegOverride={handleUpdateLegOverride}
            onResetLegOverride={handleResetLegOverride}
          />
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200/80 bg-white px-4 sm:px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-display font-semibold text-slate-700">
            AeroLog VFR Navigation Log Calculator · E6B Wind Triangle & Fuel Planner
          </span>
          <span className="text-slate-300">•</span>
          <span className="font-mono text-slate-700 font-medium">
            vibe coded with <span className="text-rose-500">♥</span> by{' '}
            <a
              href="https://www.instagram.com/amartya320/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 hover:text-sky-800 font-semibold underline decoration-sky-300 underline-offset-2"
            >
              @amartya320
            </a>
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-400">
          Upper-Air Wind & Weather Map: Open-Meteo Free Pressure-Level API · IMD INSAT-3DR/3DS
        </span>
      </footer>
    </div>
  );
}

