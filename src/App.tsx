/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Download,
  Printer,
  Compass,
  Fuel,
  Clock,
  Navigation,
  Calendar,
  Trash2,
  Hash,
} from 'lucide-react';
import {
  ALTITUDE_LEVELS,
  AlternateAerodrome,
  FlightConfig,
  LegOverride,
  WIND_MODEL_OPTIONS,
  Waypoint,
  WindModelId,
  computeNavLog,
  formatCalc,
  getClosestAltitudeLevel,
  getCurrentIstDateTime,
} from './utils/navlogMath';
import { PRESET_ROUTES } from './utils/presetRoutes';
import { RouteMap } from './components/RouteMap';
import { NavLogTable } from './components/NavLogTable';
import { WaypointManager } from './components/WaypointManager';
import { WindTriangleInspector } from './components/WindTriangleInspector';
import { AlternatePlanner } from './components/AlternatePlanner';
import { EditableNumberInput } from './components/EditableNumberInput';

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const [activePresetId, setActivePresetId] = useState<string>(PRESET_ROUTES[0].id);
  const [config, setConfig] = useState<FlightConfig>(() => {
    const ist = getCurrentIstDateTime();
    return {
      ...PRESET_ROUTES[0].config,
      windModel: 'ecmwf_ifs025',
      departureDate: ist.date,
      airborneTime: ist.time,
    };
  });
  const [waypoints, setWaypoints] = useState<Waypoint[]>(PRESET_ROUTES[0].waypoints);
  const [overrides, setOverrides] = useState<Record<string, LegOverride>>({});
  const [selectedLegIndex, setSelectedLegIndex] = useState<number>(0);
  const [showMagneticHeading, setShowMagneticHeading] = useState<boolean>(false);
  const [paperBlankRowsCount, setPaperBlankRowsCount] = useState<number>(3);
  const [isSyncingWinds, setIsSyncingWinds] = useState<boolean>(false);
  const [windSyncStatus, setWindSyncStatus] = useState<string>(
    'Upper-air winds synced via Open-Meteo ECMWF IFS for 5,000 ft (850 hPa)'
  );

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

  // Fetch upper-air winds from backend /api/winds using altitude, departureDate, departureTime, and windModel
  const fetchUpperAirWinds = useCallback(
    async (
      targetWaypoints: Waypoint[],
      altitudeFt: number,
      departureDate: string,
      departureTime: string,
      targetAlternate: AlternateAerodrome | null,
      windModel: WindModelId = 'ecmwf_ifs025'
    ) => {
      if (targetWaypoints.length === 0 && !targetAlternate) return;
      setIsSyncingWinds(true);
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

        const res = await fetch('/api/winds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            altitudeFt,
            departureDate,
            departureTime,
            windModel,
            points: pointsPayload,
          }),
        });
        if (!res.ok) throw new Error('Wind API error');
        const data = (await res.json()) as {
          altitudeFt: number;
          departureDate: string;
          departureTime: string;
          level: { pressureHpa: number; altitudeFt: number };
          winds: Array<{
            id: string;
            windDir: number;
            windSpd: number;
            source: string;
          }>;
        };

        const windMap = new Map(data.winds.map((w) => [w.id, w]));
        setWaypoints((prev) =>
          prev.map((wp) => {
            const matched = windMap.get(wp.id);
            if (!matched) return wp;
            return {
              ...wp,
              windDir: matched.windDir,
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
                    windDir: altWind.windDir,
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

  // Automatically sync upper-air winds on initial mount and whenever config.windModel changes
  useEffect(() => {
    const cur = latestSyncRef.current;
    fetchUpperAirWinds(
      cur.waypoints,
      cur.selectedAltitudeFt,
      cur.departureDate,
      cur.airborneTime,
      cur.alternate,
      config.windModel || 'ecmwf_ifs025'
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
    setActivePresetId(found.id);
    setConfig({
      ...found.config,
      windModel: currentModel,
    });
    setWaypoints(found.waypoints);
    setOverrides({});
    setSelectedLegIndex(0);
    fetchUpperAirWinds(
      found.waypoints,
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

  const handleAddWaypointFromMap = useCallback(
    (lat: number, lng: number, suggestedName?: string) => {
      const nextNum = waypoints.length;
      const newWp: Waypoint = {
        id: `wp-${Date.now()}-${nextNum}`,
        name: suggestedName || `WPT ${nextNum}`,
        lat,
        lng,
        windDir: waypoints[waypoints.length - 1]?.windDir ?? 270,
        windSpd: waypoints[waypoints.length - 1]?.windSpd ?? 15,
        windSource: 'Fetching...',
      };
      // Insert en-route between departure and destination when 2+ waypoints exist
      const updated =
        waypoints.length >= 2
          ? [
              ...waypoints.slice(0, waypoints.length - 1),
              newWp,
              waypoints[waypoints.length - 1],
            ]
          : [...waypoints, newWp];
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
      config.selectedAltitudeFt,
      config.departureDate,
      config.airborneTime,
      config.alternate,
      config.windModel,
      fetchUpperAirWinds,
    ]
  );

  const handleUpdateWaypointCoord = useCallback(
    (id: string, lat: number, lng: number) => {
      const updated = waypoints.map((wp) =>
        wp.id === id ? { ...wp, lat, lng } : wp
      );
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

  const handleDownloadCsv = () => {
    const roundOff = Boolean(config.roundOffValues);
    const headers = [
      'From',
      'To',
      'Track (deg)',
      'Leg Dist (NM)',
      'Covered (NM)',
      'To Go (NM)',
      'Time Taken (min)',
      'ETA',
      'G/S EST (kt)',
      'Fuel EST (L)',
      'Fuel Remaining (L)',
      'Heading EST (deg)',
      'Wind DIR (deg)',
      'Wind SPD (kt)',
    ];

    const rows = navLogSummary.legs.map((l) => [
      `"${l.fromName}"`,
      `"${l.toName}"`,
      l.trackDeg,
      formatCalc(l.legDistNm, roundOff),
      formatCalc(l.coveredDistNm, roundOff),
      formatCalc(l.toGoDistNm, roundOff),
      formatCalc(l.timeTakenMin, roundOff),
      l.eta,
      l.gsEstKt,
      formatCalc(l.fuelEstLiters, roundOff),
      formatCalc(l.fuelRemainingLiters, roundOff),
      showMagneticHeading ? l.magHeadingEst : l.trueHeadingEst,
      l.windDir,
      l.windSpd,
    ]);

    const altRow = navLogSummary.alternateLeg
      ? `\n"ALTERNATE (FROM ${navLogSummary.alternateLeg.fromRole}: ${navLogSummary.alternateLeg.fromName})","${navLogSummary.alternateLeg.toName}",${
          navLogSummary.alternateLeg.trackDeg
        },${formatCalc(navLogSummary.alternateLeg.distanceNm, roundOff)},"","",${formatCalc(
          navLogSummary.alternateLeg.timeEstMin,
          roundOff
        )},${navLogSummary.alternateLeg.eta},${
          navLogSummary.alternateLeg.gsEstKt
        },${formatCalc(navLogSummary.fuelPlan.alternateFuelLiters, roundOff)},${formatCalc(
          navLogSummary.alternateLeg.fuelRemainingAtAltLiters,
          roundOff
        )},${
          showMagneticHeading
            ? navLogSummary.alternateLeg.magHeadingEst
            : navLogSummary.alternateLeg.trueHeadingEst
        },${navLogSummary.alternateLeg.windDir},${navLogSummary.alternateLeg.windSpd}`
      : '';

    const fp = navLogSummary.fuelPlan;
    const fuelSummaryRows = [
      `\n"FUEL BREAKDOWN","Taxi Fuel (L)",,,,,,,,${formatCalc(fp.taxiFuelLiters, roundOff)},,,,`,
      `"FUEL BREAKDOWN","Trip Fuel (L)",,,,,,,,${formatCalc(fp.tripFuelLiters, roundOff)},,,,`,
      `"FUEL BREAKDOWN","Contingency (${fp.contingencyPercent}%)",,,,,,,,${formatCalc(fp.contingencyFuelLiters, roundOff)},,,,`,
      `"FUEL BREAKDOWN","Alternate Fuel (L)",,,,,,,,${formatCalc(fp.alternateFuelLiters, roundOff)},,,,`,
      `"FUEL BREAKDOWN","Holding Fuel (${fp.holdingTimeMin} min)",,,,,,,,${formatCalc(fp.holdingFuelLiters, roundOff)},,,,`,
      `"FUEL BREAKDOWN","Total Block Fuel Required (L)",,,,,,,,${formatCalc(fp.totalBlockFuelRequiredLiters, roundOff)},,,,`,
    ].join('\n');

    const csvContent =
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n') +
      `\n"TOTALS","${navLogSummary.legs.length} Legs","",${formatCalc(
        navLogSummary.totalDistanceNm,
        roundOff
      )},${formatCalc(navLogSummary.totalDistanceNm, roundOff)},${formatCalc(0, roundOff)},${formatCalc(
        navLogSummary.totalTimeMin,
        roundOff
      )},${navLogSummary.finalEta},${formatCalc(
        navLogSummary.averageGsKt,
        roundOff
      )},${formatCalc(navLogSummary.totalFuelRequiredLiters, roundOff)},${formatCalc(
        navLogSummary.finalFuelRemainingLiters,
        roundOff
      )},"","",""` +
      altRow +
      fuelSummaryRows;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flight-navlog-${waypoints[0]?.name || 'route'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Google Maps Platform Quota Exceeded Banner (Required Tier 1/2 Defense) */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Navigation Bar (Strict 3-Zone Contract + Mobile Section Jump Strip) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3 no-print shadow-2xs">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 sm:gap-8">
          {/* Zone 1: Brand wordmark + vibecoded credit */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
            <a
              href="#top"
              className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              AeroLog VFR
            </a>
            <span className="text-[10px] sm:text-[11px] font-mono font-medium text-slate-500 whitespace-nowrap">
              vibecoded by{' '}
              <a
                href="https://x.com/amartya320"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 hover:text-sky-900 font-semibold underline decoration-sky-300 underline-offset-2"
              >
                @amartya320
              </a>
            </span>
          </div>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav
            aria-label="Primary Section Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <a
              href="#flight-parameters"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Flight Parameters
            </a>
            <a
              href="#map-waypoints"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Map & Waypoints
            </a>
            <a
              href="#alternate-planner"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Alternate & Fuel Plan
            </a>
            <a
              href="#navlog-sheet"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              NavLog Sheet
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                Export <span className="hidden sm:inline">NavLog </span>CSV
              </span>
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
            className="px-1 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-center truncate"
          >
            1. Params
          </a>
          <a
            href="#map-waypoints"
            className="px-1 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-center truncate"
          >
            2. Map/Wx
          </a>
          <a
            href="#wind-triangle"
            className="px-1 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-center truncate"
          >
            3. Wpts/E6B
          </a>
          <a
            href="#alternate-planner"
            className="px-1 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-center truncate"
          >
            4. Alt/Fuel
          </a>
          <a
            href="#navlog-sheet"
            className="px-1 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-center truncate"
          >
            5. NavLog
          </a>
        </nav>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-3.5 sm:py-5 space-y-4 sm:space-y-5">
        {/* Section 1: Departure Date/Time, Aircraft Performance & Fuel Reserves Ribbon */}
        <section
          id="flight-parameters"
          className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4 space-y-3.5 sm:space-y-4 no-print"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900">
                Flight Navigation Log & Upper-Air Wind Calculator
              </h1>
              <p className="text-xs text-slate-500">
                Set Estimated Departure Date & Time (IST), Cruise Altitude, and Free Upper-Air Weather Model (ECMWF IFS, NOAA GFS, or DWD ICON) to compute leg winds, headings, ground speeds, and fuel.
              </p>
            </div>

            {/* Preset Route Selector, Round Off Values Toggle & Clear Flight Plan Button */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <button
                id="toggle-round-off-btn"
                type="button"
                onClick={() =>
                  updateConfig({ roundOffValues: !config.roundOffValues })
                }
                title="Toggle rounding off decimal values to whole integers across all distance, time, and fuel calculations"
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold border rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  config.roundOffValues
                    ? 'bg-amber-100 border-amber-500 text-amber-950'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
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
                className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 sm:order-3"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Flight Plan
              </button>

              <div className="flex items-center gap-1.5 w-full sm:w-auto sm:flex-1 lg:flex-initial min-w-0 sm:order-2">
                <label
                  htmlFor="preset-route-select"
                  className="text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
                >
                  Sample Flight Plan:
                </label>
                <select
                  id="preset-route-select"
                  value={activePresetId}
                  onChange={(e) => handleLoadPreset(e.target.value)}
                  className="flex-1 sm:w-auto sm:max-w-[260px] lg:max-w-xs min-w-0 truncate text-xs font-medium bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-sky-600"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2.5 sm:gap-3 items-end">
            {/* 1. Estimated Departure Date (IST) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-2 lg:col-span-2">
              <label
                htmlFor="input-departure-date"
                className="block text-[11px] font-semibold text-sky-900 mb-1 flex items-center gap-1 truncate"
              >
                <Calendar className="w-3 h-3 text-sky-700 shrink-0" />
                <span className="truncate">Est. Departure Date (IST)</span>
              </label>
              <input
                id="input-departure-date"
                type="date"
                value={config.departureDate}
                onChange={(e) => handleDepartureDateChange(e.target.value)}
                className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-sky-50/60 border border-sky-300 rounded text-slate-900 focus:bg-white focus:border-sky-600 focus:outline-none"
              />
            </div>

            {/* 2. Estimated Departure Time (IST) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-airborne-time"
                className="block text-[11px] font-semibold text-sky-900 mb-1 flex items-center gap-1 truncate"
              >
                <Clock className="w-3 h-3 text-sky-700 shrink-0" />
                <span className="truncate">Est. Dep Time (IST)</span>
              </label>
              <input
                id="input-airborne-time"
                type="time"
                value={config.airborneTime}
                onChange={(e) => handleDepartureTimeChange(e.target.value)}
                className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-sky-50/60 border border-sky-300 rounded text-slate-900 focus:bg-white focus:border-sky-600 focus:outline-none"
              />
            </div>

            {/* 3. Cruising Altitude (Pressure Level) */}
            <div className="col-span-2 sm:col-span-1 md:col-span-3 lg:col-span-2">
              <label
                htmlFor="select-altitude-ft"
                className="block text-[11px] font-semibold text-slate-600 mb-1 truncate"
              >
                Cruise Altitude (Pressure Level)
              </label>
              <select
                id="select-altitude-ft"
                value={config.selectedAltitudeFt}
                onChange={(e) => handleAltitudeChange(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-300 rounded text-slate-900 focus:bg-white focus:border-sky-600 focus:outline-none"
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
                className="block text-[11px] font-semibold text-emerald-900 mb-1 truncate"
                title="Open-Meteo provides 100% free, unshuffled upper-air pressure-level wind forecasts from ECMWF IFS (Windy's default model), NOAA GFS, and DWD ICON"
              >
                Upper-Air Wind Model (Free)
              </label>
              <select
                id="select-wind-model"
                value={config.windModel || 'ecmwf_ifs025'}
                onChange={(e) => handleWindModelChange(e.target.value as WindModelId)}
                className="w-full px-2 py-1.5 text-xs font-mono font-semibold bg-emerald-50/70 border border-emerald-300 rounded text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
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
                className="block text-[11px] font-semibold text-slate-600 mb-1 truncate"
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
                className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded text-slate-900 focus:bg-white focus:border-sky-600 focus:outline-none"
              />
            </div>

            {/* 6. Fuel Flow (L/hr) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-fuel-flow"
                className="block text-[11px] font-semibold text-slate-600 mb-1 truncate"
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
                className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded text-slate-900 focus:bg-white focus:border-sky-600 focus:outline-none"
              />
            </div>

            {/* 7. Initial Block Fuel On Board (L) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-initial-fuel"
                className="block text-[11px] font-semibold text-slate-600 mb-1 truncate"
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
                className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded text-slate-900 focus:bg-white focus:border-sky-600 focus:outline-none"
              />
            </div>

            {/* 8. Taxi Fuel (L) */}
            <div className="col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-1">
              <label
                htmlFor="input-taxi-fuel"
                className="block text-[11px] font-semibold text-slate-600 mb-1 truncate"
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
                className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded text-slate-900 focus:bg-white focus:border-sky-600 focus:outline-none"
              />
            </div>

            {/* 9. Whole-Flight Fixed Track Override (Optional) */}
            <div className="col-span-2 sm:col-span-2 md:col-span-6 lg:col-span-1">
              <label
                htmlFor="input-global-track"
                className="block text-[11px] font-semibold text-slate-600 mb-1 truncate"
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
                className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Flight Summary KPI Strip */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-slate-700 font-mono">
              <span className="flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                Total Dist:{' '}
                <strong>
                  {formatCalc(navLogSummary.totalDistanceNm, config.roundOffValues)} NM
                </strong>
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-slate-300">·</span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                Trip Time:{' '}
                <strong>
                  {formatCalc(navLogSummary.totalTimeMin, config.roundOffValues)} min (ETA{' '}
                  {navLogSummary.finalEta})
                </strong>
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-slate-300">·</span>
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                Avg G/S:{' '}
                <strong>
                  {formatCalc(navLogSummary.averageGsKt, config.roundOffValues)} kt
                </strong>
              </span>
              <span aria-hidden="true" className="hidden lg:inline text-slate-300">·</span>
              <span className="w-full lg:w-auto pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs">
                <Fuel className="w-3.5 h-3.5 text-sky-700 shrink-0" />
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
                <strong className="text-slate-950">
                  {formatCalc(
                    navLogSummary.fuelPlan.totalBlockFuelRequiredLiters,
                    config.roundOffValues
                  )}{' '}
                  L
                </strong>
              </span>
            </div>

            <div className="text-[11px] text-slate-500 font-mono truncate">{windSyncStatus}</div>
          </div>
        </section>

        {/* Section 2: Interactive Google Maps / Earth + Waypoint Manager & E6B Wind Triangle */}
        <section id="map-waypoints" className="space-y-4 no-print">
          <RouteMap
            waypoints={waypoints}
            legs={navLogSummary.legs}
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
            onAddWaypointFromMap={handleAddWaypointFromMap}
            onUpdateWaypointCoord={handleUpdateWaypointCoord}
            onUpdateAlternateCoord={handleUpdateAlternateCoord}
            onRemoveWaypoint={handleRemoveWaypoint}
            onSyncAllWinds={() =>
              fetchUpperAirWinds(
                waypoints,
                config.selectedAltitudeFt,
                config.departureDate,
                config.airborneTime,
                config.alternate,
                config.windModel || 'ecmwf_ifs025'
              )
            }
            isSyncingWinds={isSyncingWinds}
          />

          <div
            id="wind-triangle"
            className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch"
          >
            <div className="lg:col-span-6 flex flex-col">
              <WaypointManager
                waypoints={waypoints}
                selectedAltitudeFt={config.selectedAltitudeFt}
                onAddWaypoint={(name, lat, lng) =>
                  handleAddWaypointFromMap(lat, lng, name)
                }
                onUpdateWaypoint={handleUpdateWaypoint}
                onMoveWaypoint={handleMoveWaypoint}
                onRemoveWaypoint={handleRemoveWaypoint}
                onReverseRoute={handleReverseRoute}
                onClearAllWaypoints={handleClearFlightPlan}
                onImportWaypoints={(imported) => {
                  setWaypoints(imported);
                  setOverrides({});
                  setSelectedLegIndex(0);
                  setConfig((prev) => ({ ...prev, alternate: null }));
                  fetchUpperAirWinds(
                    imported,
                    config.selectedAltitudeFt,
                    config.departureDate,
                    config.airborneTime,
                    null,
                    config.windModel || 'ecmwf_ifs025'
                  );
                }}
              />
            </div>

            <div className="lg:col-span-6 flex flex-col">
              <WindTriangleInspector
                leg={navLogSummary.legs[safeSelectedLegIndex]}
                config={config}
                legsCount={navLogSummary.legs.length}
                onSelectLeg={setSelectedLegIndex}
              />
            </div>
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
        <section id="navlog-sheet" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 no-print">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Flight Navigation Log Sheet (Pre-Flight Estimated Values)
              </h2>
              <p className="text-xs text-slate-500">
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
                className={`px-2.5 py-1.5 text-xs font-semibold border rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  config.roundOffValues
                    ? 'bg-amber-100 border-amber-500 text-amber-950'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                {config.roundOffValues ? 'Rounded (Whole)' : 'Round Off Values'}
              </button>

              {/* True vs Magnetic Heading Switch */}
              <div className="flex items-center gap-1 p-0.5 bg-slate-200 rounded-md">
                <button
                  type="button"
                  onClick={() => setShowMagneticHeading(false)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
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
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
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
                className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Blank Rows: {paperBlankRowsCount}
              </button>

              {/* Print Kneeboard Sheet */}
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
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
      <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 py-3 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            AeroLog VFR Navigation Log Calculator · E6B Wind Triangle & Fuel Planner
          </span>
          <span className="text-slate-300">•</span>
          <span className="font-mono text-slate-700 font-medium">
            vibecoded by{' '}
            <a
              href="https://x.com/amartya320"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 hover:text-sky-900 font-semibold underline decoration-sky-300 underline-offset-2"
            >
              @amartya320
            </a>
          </span>
        </div>
        <span>
          Upper-Air Wind & Weather Map: Open-Meteo Free Pressure-Level API · IMD INSAT-3DR/3DS
        </span>
      </footer>
    </div>
  );
}
