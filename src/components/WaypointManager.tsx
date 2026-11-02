import React, { useState, useRef, useMemo } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  Download,
  ArrowUpDown,
  Wind,
  RefreshCw,
  GitCommitHorizontal,
  Waypoints,
  MapPin,
  Sparkles,
} from 'lucide-react';
import {
  RouteTrackMode,
  Waypoint,
  calculateDistanceNm,
  calculateTrueTrackDeg,
  parseKmlWaypoints,
  projectPointOntoStraightLine,
} from '../utils/navlogMath';
import { exportWaypointsToKml } from '../utils/presetRoutes';

interface WaypointManagerProps {
  waypoints: Waypoint[];
  selectedAltitudeFt: number;
  routeTrackMode: RouteTrackMode;
  onChangeRouteTrackMode: (mode: RouteTrackMode) => void;
  onSetEndpointWaypoint?: (
    role: 'DEP' | 'DEST',
    name: string,
    lat: number,
    lng: number,
    elevationFt?: number
  ) => void;
  onAddWaypoint?: (
    name: string,
    lat: number,
    lng: number,
    explicitFraction?: number
  ) => void;
  onGenerateEvenWaypoints: (count: number) => void;
  onUpdateWaypoint: (id: string, partial: Partial<Waypoint>) => void;
  onUpdateWaypointCoord: (id: string, lat: number, lng: number) => void;
  onMoveWaypoint: (index: number, direction: 'up' | 'down') => void;
  onRemoveWaypoint: (id: string) => void;
  onReverseRoute: () => void;
  onClearAllWaypoints: () => void;
  onImportWaypoints: (newWaypoints: Waypoint[]) => void;
  onSyncAllWinds?: () => void;
  isSyncingWinds?: boolean;
}

export const WaypointManager: React.FC<WaypointManagerProps> = ({
  waypoints,
  selectedAltitudeFt,
  routeTrackMode,
  onChangeRouteTrackMode,
  onGenerateEvenWaypoints,
  onUpdateWaypoint,
  onUpdateWaypointCoord,
  onMoveWaypoint,
  onRemoveWaypoint,
  onReverseRoute,
  onClearAllWaypoints,
  onImportWaypoints,
  onSyncAllWinds,
  isSyncingWinds = false,
}) => {
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const depWp = waypoints.length >= 1 ? waypoints[0] : null;
  const destWp = waypoints.length >= 2 ? waypoints[waypoints.length - 1] : null;
  const intermediateCount = Math.max(0, waypoints.length - 2);

  // Direct DEP -> DEST straight-line geometry summary
  const straightLineSummary = useMemo(() => {
    if (!depWp || !destWp) return null;
    const totalDistNm = calculateDistanceNm(
      depWp.lat,
      depWp.lng,
      destWp.lat,
      destWp.lng
    );
    const trackDeg = calculateTrueTrackDeg(
      depWp.lat,
      depWp.lng,
      destWp.lat,
      destWp.lng
    );
    return {
      totalDistNm: Math.round(totalDistNm * 10) / 10,
      trackDeg,
    };
  }, [depWp, destWp]);

  const handleKmlFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseKmlWaypoints(text);
      if (parsed.length >= 1) {
        onImportWaypoints(parsed);
        setImportMessage(`Imported ${parsed.length} waypoints from ${file.name}`);
      } else {
        setImportMessage('KML file must contain at least 1 Placemark coordinate.');
      }
    } catch {
      setImportMessage('Could not parse KML file.');
    }
    e.target.value = '';
  };

  const handleExportKml = () => {
    const kmlContent = exportWaypointsToKml(waypoints, 'AeroLog VFR Flight Plan');
    const blob = new Blob([kmlContent], {
      type: 'application/vnd.google-earth.kml+xml',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aerolog-flight-plan.kml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4 flex flex-col gap-3 flex-1">
      {/* Header & Track Mode Selector */}
      <div className="flex flex-col gap-2.5 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Route Waypoints & Track Mode ({waypoints.length})
            </h3>
            <p className="text-xs text-slate-500">
              Tap/click directly on the map (or track line) to set DEP, DEST, and en-route waypoints
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={waypoints.length < 2}
              onClick={onReverseRoute}
              className="px-3 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-md shadow-2xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Reverse Route (DEP ↔ DEST)
            </button>

            {onSyncAllWinds && (
              <button
                type="button"
                onClick={onSyncAllWinds}
                disabled={isSyncingWinds || waypoints.length === 0}
                className="px-2.5 py-1.5 text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isSyncingWinds ? 'animate-spin' : ''}`}
                />
                <span>
                  {isSyncingWinds
                    ? 'Syncing Winds...'
                    : `Sync Winds (${selectedAltitudeFt.toLocaleString()} ft)`}
                </span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".kml,.xml"
              onChange={handleKmlFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Waypoints
            </button>

            <button
              type="button"
              disabled={waypoints.length === 0}
              onClick={handleExportKml}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 border border-slate-200 rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export Waypoints
            </button>

            {waypoints.length > 0 && (
              <button
                type="button"
                onClick={onClearAllWaypoints}
                className="px-2.5 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Track Mode Toggle Bar: Straight-Line Track vs Freeform Track */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md p-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap shrink-0">
              Track Mode:
            </span>
            <div
              role="group"
              aria-label="Route Track Mode"
              className="inline-flex bg-slate-200/80 p-0.5 rounded-md shrink-0"
            >
              <button
                type="button"
                aria-pressed={routeTrackMode === 'straight'}
                onClick={() => onChangeRouteTrackMode('straight')}
                className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  routeTrackMode === 'straight'
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <GitCommitHorizontal className="w-3.5 h-3.5 shrink-0" />
                Straight-Line Track
              </button>
              <button
                type="button"
                aria-pressed={routeTrackMode === 'freeform'}
                onClick={() => onChangeRouteTrackMode('freeform')}
                className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  routeTrackMode === 'freeform'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Waypoints className="w-3.5 h-3.5 shrink-0" />
                Freeform
              </button>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-600">
            {routeTrackMode === 'straight' ? (
              <span className="text-sky-800 font-medium">
                Waypoints stick to straight DEP→DEST line
                {straightLineSummary
                  ? ` (${String(straightLineSummary.trackDeg).padStart(3, '0')}°T · ${straightLineSummary.totalDistNm} NM)`
                  : ''}
              </span>
            ) : (
              <span className="text-amber-800 font-medium">
                Freeform multi-leg dogleg routing enabled
              </span>
            )}
          </div>
        </div>

        {/* Map-First Guidance & Quick Split Line Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 border border-slate-200 rounded-md px-2.5 py-1.5 text-[11px]">
          <span className="text-slate-600 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            {waypoints.length === 0 ? (
              <span>
                <strong>Step 1:</strong> Tap/click on the map to set{' '}
                <strong>Departure (DEP)</strong>
              </span>
            ) : waypoints.length === 1 ? (
              <span>
                <strong>Step 2:</strong> Tap/click on the map to set{' '}
                <strong>Destination (DEST)</strong>
              </span>
            ) : (
              <span>
                Tap/click directly on the{' '}
                <strong>
                  {routeTrackMode === 'straight' ? 'straight-line track' : 'map'}
                </strong>{' '}
                to add waypoints ({intermediateCount} en-route)
              </span>
            )}
          </span>

          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium text-slate-500 flex items-center gap-1 mr-0.5">
              <Sparkles className="w-3 h-3 text-sky-700" />
              Split Line:
            </span>
            {[
              { count: 1, label: '1 Midpoint (50%)' },
              { count: 2, label: '2 WPTs' },
              { count: 3, label: '3 WPTs' },
              { count: 4, label: '4 WPTs' },
            ].map((preset) => (
              <button
                key={preset.count}
                type="button"
                disabled={!depWp || !destWp}
                onClick={() => onGenerateEvenWaypoints(preset.count)}
                className="px-2 py-0.5 text-[11px] font-semibold bg-white hover:bg-sky-50 text-sky-900 border border-slate-300 hover:border-sky-400 rounded transition-colors disabled:opacity-40"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {importMessage && (
        <div className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded px-3 py-1.5 flex items-center justify-between">
          <span>{importMessage}</span>
          <button
            type="button"
            onClick={() => setImportMessage(null)}
            className="text-sky-600 hover:text-sky-900 font-semibold ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Ordered Route Sequence (DEP -> WPT 1..N -> DEST) */}
      <div className="divide-y divide-slate-100 max-h-[290px] overflow-y-auto pr-1 flex-1">
        {waypoints.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">
              No waypoints in current flight plan
            </p>
            <p>
              Tap or click on the map above (1st tap = Departure, 2nd tap = Destination, 3rd+ tap = En-route Waypoint).
            </p>
          </div>
        ) : (
          waypoints.map((wp, idx) => {
            const isDep = idx === 0;
            const isDest = idx === waypoints.length - 1 && waypoints.length > 1;
            const roleLabel = isDep ? 'DEP' : isDest ? 'DEST' : `WPT ${idx}`;

            const lineProj =
              !isDep && !isDest && depWp && destWp
                ? projectPointOntoStraightLine(depWp, destWp, wp.lat, wp.lng, 0.01, 0.99)
                : null;

            return (
              <div
                key={wp.id}
                className="py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={`font-mono text-[10px] font-bold w-11 text-center py-0.5 rounded shrink-0 ${
                      isDep
                        ? 'bg-sky-100 text-sky-900'
                        : isDest
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {roleLabel}
                  </span>

                  <input
                    type="text"
                    value={wp.name}
                    aria-label={`Waypoint ${idx + 1} name`}
                    onChange={(e) =>
                      onUpdateWaypoint(wp.id, { name: e.target.value.toUpperCase() })
                    }
                    className="font-mono font-semibold text-slate-900 bg-slate-50 border border-slate-200 focus:border-sky-600 focus:bg-white rounded px-2 py-1 min-w-0 flex-1 sm:flex-initial sm:w-32 focus:outline-none"
                  />

                  <div className="hidden md:flex items-center gap-1 font-mono text-[11px] text-slate-500">
                    <input
                      type="number"
                      step="any"
                      aria-label={`Waypoint ${idx + 1} latitude`}
                      value={wp.lat}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= -90 && val <= 90) {
                          onUpdateWaypointCoord(wp.id, val, wp.lng);
                        }
                      }}
                      className="w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-800 focus:border-sky-600 focus:bg-white focus:outline-none"
                    />
                    <input
                      type="number"
                      step="any"
                      aria-label={`Waypoint ${idx + 1} longitude`}
                      value={wp.lng}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= -180 && val <= 180) {
                          onUpdateWaypointCoord(wp.id, wp.lat, val);
                        }
                      }}
                      className="w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-800 focus:border-sky-600 focus:bg-white focus:outline-none"
                    />
                  </div>

                  {lineProj && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap hidden xl:inline ${
                        routeTrackMode === 'straight'
                          ? 'bg-sky-50 text-sky-800 border border-sky-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {routeTrackMode === 'straight'
                        ? `On Line · ${Math.round(lineProj.t * 100)}% (${lineProj.distanceFromDepNm} NM)`
                        : `${lineProj.distanceFromDepNm} NM`}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
                  <span className="font-mono text-[10px] text-slate-500 md:hidden">
                    {wp.lat.toFixed(3)}°, {wp.lng.toFixed(3)}°
                  </span>

                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    {/* Waypoint Wind badge / inline editor */}
                    <div
                      title={`Upper-air wind at ${selectedAltitudeFt.toLocaleString()} ft`}
                      className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      <Wind className="w-3 h-3 text-sky-700" />
                      <input
                        type="number"
                        min={0}
                        max={360}
                        aria-label={`Wind direction for ${wp.name}`}
                        value={wp.windDir ?? 0}
                        onChange={(e) =>
                          onUpdateWaypoint(wp.id, {
                            windDir: parseFloat(e.target.value) || 0,
                            windSource: 'Manual',
                          })
                        }
                        className="w-10 text-center bg-transparent focus:bg-white rounded font-semibold text-slate-900 focus:outline-none"
                      />
                      <span>°/</span>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        aria-label={`Wind speed for ${wp.name}`}
                        value={wp.windSpd ?? 0}
                        onChange={(e) =>
                          onUpdateWaypoint(wp.id, {
                            windSpd: parseFloat(e.target.value) || 0,
                            windSource: 'Manual',
                          })
                        }
                        className="w-9 text-center bg-transparent focus:bg-white rounded font-semibold text-slate-900 focus:outline-none"
                      />
                      <span className="text-slate-500">kt</span>
                    </div>

                    <div className="flex items-center gap-0.5">
                      {routeTrackMode === 'freeform' && (
                        <>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => onMoveWaypoint(idx, 'up')}
                            aria-label={`Move ${wp.name} up`}
                            className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded hover:bg-slate-100"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === waypoints.length - 1}
                            onClick={() => onMoveWaypoint(idx, 'down')}
                            aria-label={`Move ${wp.name} down`}
                            className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded hover:bg-slate-100"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveWaypoint(wp.id)}
                        aria-label={`Delete waypoint ${wp.name}`}
                        className="p-1 text-rose-600 hover:text-rose-800 rounded hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

