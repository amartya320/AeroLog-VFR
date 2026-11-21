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
  BookmarkPlus,
  FolderOpen,
  RotateCcw,
  Check,
  Navigation,
  Ruler,
  Plus,
  X,
  Calendar,
  Clock,
} from 'lucide-react';
import {
  ComputedLeg,
  DistanceWaypointInputMode,
  DistanceWaypointSpec,
  RouteTrackMode,
  Waypoint,
  calculateDistanceNm,
  calculateTrueTrackDeg,
  projectPointOntoStraightLine,
} from '../utils/navlogMath';
import {
  ImportedRoutePayload,
  SavedFlightRoute,
  computeSavedRouteTotalNm,
  countModifiedWaypointLegs,
  parseImportedRouteText,
  suggestRouteName,
} from '../utils/savedRoutes';
import { exportWaypointsToKml } from '../utils/presetRoutes';
import { EditableNumberInput } from './EditableNumberInput';

interface WaypointManagerProps {
  waypoints: Waypoint[];
  legs: ComputedLeg[];
  selectedAltitudeFt: number;
  departureDate: string;
  airborneTime: string;
  onDepartureDateChange: (date: string) => void;
  onDepartureTimeChange: (time: string) => void;
  routeTrackMode: RouteTrackMode;
  globalTrackOverrideDeg: number | null;
  onChangeGlobalTrackOverride: (trackDeg: number | null) => void;
  roundOffValues?: boolean;
  savedRoutes: SavedFlightRoute[];
  activeSavedRouteId: string | null;
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
  onApplyWaypointsByDistance: (
    specs: DistanceWaypointSpec[],
    inputMode: DistanceWaypointInputMode,
    applyMode: 'replace' | 'insert'
  ) => void;
  onUpdateWaypoint: (id: string, partial: Partial<Waypoint>) => void;
  onUpdateWaypointCoord: (id: string, lat: number, lng: number) => void;
  onAdjustWaypointLeg: (
    legIndex: number,
    edit: { distanceNm?: number; trackDeg?: number }
  ) => void;
  onResetWaypointLeg: (waypointId: string) => void;
  onMoveWaypoint: (index: number, direction: 'up' | 'down') => void;
  onRemoveWaypoint: (id: string) => void;
  onReverseRoute: () => void;
  onClearAllWaypoints: () => void;
  onImportRoutePayload: (payload: ImportedRoutePayload) => void;
  onSaveCurrentRoute: (routeName: string, overwriteId?: string) => void;
  onLoadSavedRoute: (route: SavedFlightRoute) => void;
  onDeleteSavedRoute: (routeId: string) => void;
  onSyncAllWinds?: () => void;
  isSyncingWinds?: boolean;
  windSyncSuccess?: boolean;
}

export const WaypointManager: React.FC<WaypointManagerProps> = ({
  waypoints,
  legs,
  selectedAltitudeFt,
  departureDate,
  airborneTime,
  onDepartureDateChange,
  onDepartureTimeChange,
  routeTrackMode,
  globalTrackOverrideDeg,
  onChangeGlobalTrackOverride,
  roundOffValues = true,
  savedRoutes,
  activeSavedRouteId,
  onChangeRouteTrackMode,
  onGenerateEvenWaypoints,
  onApplyWaypointsByDistance,
  onUpdateWaypoint,
  onUpdateWaypointCoord,
  onAdjustWaypointLeg,
  onResetWaypointLeg,
  onMoveWaypoint,
  onRemoveWaypoint,
  onReverseRoute,
  onClearAllWaypoints,
  onImportRoutePayload,
  onSaveCurrentRoute,
  onLoadSavedRoute,
  onDeleteSavedRoute,
  onSyncAllWinds,
  isSyncingWinds = false,
  windSyncSuccess = false,
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showSavePanel, setShowSavePanel] = useState<boolean>(false);
  const [saveRouteName, setSaveRouteName] = useState<string>('');
  const [showSavedDrawer, setShowSavedDrawer] = useState<boolean>(true);
  const [showDistanceBuilder, setShowDistanceBuilder] = useState<boolean>(false);
  const [distanceInputMode, setDistanceInputMode] =
    useState<DistanceWaypointInputMode>('leg');
  const [distanceRows, setDistanceRows] = useState<
    Array<{ id: string; name: string; distanceText: string }>
  >([
    { id: 'dist-row-1', name: '', distanceText: '' },
    { id: 'dist-row-2', name: '', distanceText: '' },
  ]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const depWp = waypoints.length >= 1 ? waypoints[0] : null;
  const destWp = waypoints.length >= 2 ? waypoints[waypoints.length - 1] : null;
  const intermediateCount = Math.max(0, waypoints.length - 2);
  const modifiedLegsCount = useMemo(
    () => countModifiedWaypointLegs(waypoints),
    [waypoints]
  );
  const activeRouteTotalNm = useMemo(
    () => computeSavedRouteTotalNm(waypoints),
    [waypoints]
  );
  const activeSavedRoute = useMemo(
    () => savedRoutes.find((r) => r.id === activeSavedRouteId) || null,
    [savedRoutes, activeSavedRouteId]
  );

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

  // Live computed preview for the Add Waypoints by Distance builder
  const distanceBuilderPreview = useMemo(() => {
    const parsedRows = distanceRows.map((row) => {
      const parsed = parseFloat(row.distanceText);
      const valid = isFinite(parsed) && parsed > 0;
      return { ...row, distNum: valid ? Math.round(parsed * 10) / 10 : null };
    });

    let runningCum = 0;
    const rowsWithMeta = parsedRows.map((r) => {
      if (r.distNum === null) {
        return { ...r, cumNm: null as number | null, legNm: null as number | null };
      }
      if (distanceInputMode === 'leg') {
        runningCum = Math.round((runningCum + r.distNum) * 10) / 10;
        return { ...r, cumNm: runningCum, legNm: r.distNum };
      }
      const prevCum = runningCum;
      runningCum = Math.max(runningCum, r.distNum);
      return {
        ...r,
        cumNm: r.distNum,
        legNm: Math.round(Math.max(0.1, r.distNum - prevCum) * 10) / 10,
      };
    });

    const validSpecs: DistanceWaypointSpec[] = parsedRows
      .filter((r) => r.distNum !== null)
      .map((r) => ({ name: r.name.trim(), distanceNm: r.distNum as number }));

    const maxEnteredCum =
      distanceInputMode === 'leg'
        ? validSpecs.reduce((sum, s) => Math.round((sum + s.distanceNm) * 10) / 10, 0)
        : validSpecs.reduce((max, s) => Math.max(max, s.distanceNm), 0);

    const directTotalNm = straightLineSummary?.totalDistNm ?? 0;
    const remainingToDestNm = Math.round((directTotalNm - maxEnteredCum) * 10) / 10;

    return {
      rowsWithMeta,
      validSpecs,
      maxEnteredCum,
      directTotalNm,
      remainingToDestNm,
    };
  }, [distanceRows, distanceInputMode, straightLineSummary]);

  const handleOpenDistanceBuilder = () => {
    setShowDistanceBuilder((prev) => {
      const next = !prev;
      if (next && distanceRows.every((r) => r.distanceText === '' && r.name === '')) {
        setDistanceRows([
          { id: `dist-row-${Date.now()}-1`, name: '', distanceText: '' },
          { id: `dist-row-${Date.now()}-2`, name: '', distanceText: '' },
        ]);
      }
      return next;
    });
  };

  const handleAddDistanceRow = () => {
    setDistanceRows((prev) => [
      ...prev,
      { id: `dist-row-${Date.now()}-${prev.length + 1}`, name: '', distanceText: '' },
    ]);
  };

  const handleUpdateDistanceRow = (
    rowId: string,
    field: 'name' | 'distanceText',
    value: string
  ) => {
    setDistanceRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: field === 'name' ? value.toUpperCase() : value,
            }
          : row
      )
    );
  };

  const handleRemoveDistanceRow = (rowId: string) => {
    setDistanceRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((row) => row.id !== rowId)
    );
  };

  const handleSubmitDistanceWaypoints = (applyMode: 'replace' | 'insert') => {
    if (!depWp || !destWp || distanceBuilderPreview.validSpecs.length === 0) return;
    const count = distanceBuilderPreview.validSpecs.length;
    onApplyWaypointsByDistance(
      distanceBuilderPreview.validSpecs,
      distanceInputMode,
      applyMode
    );
    setShowDistanceBuilder(false);
    setDistanceRows([
      { id: `dist-row-${Date.now()}-1`, name: '', distanceText: '' },
      { id: `dist-row-${Date.now()}-2`, name: '', distanceText: '' },
    ]);
    setStatusMessage(
      applyMode === 'replace'
        ? `Placed ${count} waypoint${count > 1 ? 's' : ''} between ${depWp.name} and ${destWp.name} by ${
            distanceInputMode === 'leg' ? 'leg distance' : 'distance from DEP'
          }.`
        : `Inserted ${count} waypoint${count > 1 ? 's' : ''} along ${depWp.name} → ${destWp.name} by ${
            distanceInputMode === 'leg' ? 'leg distance' : 'distance from DEP'
          }.`
    );
  };

  const handleOpenSavePanel = () => {
    const defaultName =
      activeSavedRoute?.name || suggestRouteName(waypoints);
    setSaveRouteName(defaultName);
    setShowSavePanel((prev) => !prev);
  };

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (waypoints.length === 0) return;
    const finalName = saveRouteName.trim() || suggestRouteName(waypoints);
    const overwriteId =
      activeSavedRoute &&
      activeSavedRoute.name.trim().toLowerCase() === finalName.toLowerCase()
        ? activeSavedRoute.id
        : undefined;
    onSaveCurrentRoute(finalName, overwriteId);
    setShowSavePanel(false);
    setShowSavedDrawer(true);
    setStatusMessage(
      `Saved "${finalName}" (${waypoints.length} waypoints${
        modifiedLegsCount > 0
          ? `, ${modifiedLegsCount} modified track/distance leg${modifiedLegsCount > 1 ? 's' : ''}`
          : ''
      }).`
    );
  };

  const handleRouteFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = parseImportedRouteText(text);
      if (payload.waypoints.length >= 1) {
        onImportRoutePayload(payload);
        const modCount = countModifiedWaypointLegs(payload.waypoints);
        setStatusMessage(
          `Imported ${payload.waypoints.length} waypoints from ${file.name}${
            modCount > 0 ? ` (restored ${modCount} modified track/distance leg${modCount > 1 ? 's' : ''})` : ''
          }.`
        );
      } else {
        setStatusMessage('File must contain at least 1 valid waypoint coordinate.');
      }
    } catch {
      setStatusMessage('Could not parse waypoint file.');
    }
    e.target.value = '';
  };

  const handleExportKml = () => {
    const routeTitle = activeSavedRoute?.name || suggestRouteName(waypoints);
    const kmlContent = exportWaypointsToKml(waypoints, routeTitle, {
      routeTrackMode,
      globalTrackOverrideDeg,
    });
    const blob = new Blob([kmlContent], {
      type: 'application/vnd.google-earth.kml+xml',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = routeTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    a.download = `${slug || 'aerolog-flight-plan'}.kml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="aerolog-card bg-white border border-slate-200/85 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 flex-1 shadow-[0_1px_3px_rgba(15,23,42,0.03),0_10px_30px_-5px_rgba(15,23,42,0.04)]">
      {/* Header & Track Mode Selector */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-display font-bold text-slate-900">
                Route Waypoints &amp; Track Mode ({waypoints.length})
              </h3>
              {modifiedLegsCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300/90 rounded-lg">
                  {modifiedLegsCount} Modified Track/Dist
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Edit leg Track (°T) or Distance (NM) to adjust waypoints along the track and save custom routes
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <button
              id="save-route-btn"
              type="button"
              disabled={waypoints.length === 0}
              onClick={handleOpenSavePanel}
              className="flex-1 sm:flex-initial justify-center px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl shadow-xs flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Save Waypoints</span>
            </button>

            <button
              type="button"
              disabled={waypoints.length < 2}
              onClick={onReverseRoute}
              className="group flex-1 sm:flex-initial justify-center px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded-xl shadow-xs flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
            >
              <ArrowUpDown className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180 shrink-0" />
              <span className="hidden sm:inline">Reverse Route (DEP ↔ DEST)</span>
              <span className="sm:hidden">Reverse</span>
            </button>

            {onSyncAllWinds && (
              <button
                id="sync-route-winds-btn"
                type="button"
                onClick={onSyncAllWinds}
                disabled={isSyncingWinds || waypoints.length === 0}
                className={`flex-1 sm:flex-initial justify-center px-3 py-1.5 text-xs font-semibold border rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-40 whitespace-nowrap shrink-0 shadow-2xs ${
                  windSyncSuccess
                    ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-400 animate-sync-glow'
                    : 'bg-sky-50/90 hover:bg-sky-100 text-sky-900 border-sky-200/90'
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isSyncingWinds ? 'animate-spin' : ''}`}
                />
                <span>
                  {isSyncingWinds
                    ? 'Syncing...'
                    : windSyncSuccess
                    ? `✓ Synced (${selectedAltitudeFt.toLocaleString()} ft)`
                    : `Sync Winds (${selectedAltitudeFt.toLocaleString()} ft)`}
                </span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".kml,.xml,.json"
              onChange={handleRouteFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-initial justify-center px-2.5 sm:px-3 py-1.5 text-xs font-semibold bg-slate-50/90 hover:bg-slate-100 text-slate-800 border border-slate-200/90 rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Import KML/JSON</span>
              <span className="sm:hidden">Import</span>
            </button>

            <button
              type="button"
              disabled={waypoints.length === 0}
              onClick={handleExportKml}
              className="flex-1 sm:flex-initial justify-center px-2.5 sm:px-3 py-1.5 text-xs font-semibold bg-slate-50/90 hover:bg-slate-100 disabled:opacity-40 text-slate-800 border border-slate-200/90 rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Export KML</span>
              <span className="sm:hidden">Export</span>
            </button>

            {waypoints.length > 0 && (
              <button
                type="button"
                onClick={onClearAllWaypoints}
                className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold bg-rose-50/90 hover:bg-rose-100 text-rose-700 border border-rose-200/90 rounded-xl flex items-center justify-center gap-1 transition-all whitespace-nowrap shrink-0 shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Inline Save Waypoints Panel */}
        {showSavePanel && (
          <form
            id="save-route-form"
            onSubmit={handleConfirmSave}
            className="aerolog-subcard animate-slide-down bg-emerald-50/75 border border-emerald-200/90 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
          >
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2">
              <label
                htmlFor="save-route-name-input"
                className="text-xs font-bold text-emerald-950 whitespace-nowrap shrink-0"
              >
                Route Name:
              </label>
              <input
                id="save-route-name-input"
                type="text"
                value={saveRouteName}
                onChange={(e) => setSaveRouteName(e.target.value)}
                placeholder="e.g. VOGB → VASL (Aircraft Track 290°)"
                className="flex-1 min-w-0 px-3 py-1.5 text-xs font-semibold bg-white border border-emerald-300 rounded-lg text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                autoFocus
              />
              <span className="text-[11px] font-mono text-emerald-800 whitespace-nowrap shrink-0">
                {waypoints.length} WPTs · {activeRouteTotalNm} NM
                {modifiedLegsCount > 0 ? ` · ${modifiedLegsCount} modified` : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="confirm-save-route-btn"
                type="submit"
                className="flex-1 sm:flex-initial justify-center px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5 transition-all shadow-2xs"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                Save Route
              </button>
              <button
                type="button"
                onClick={() => setShowSavePanel(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Saved Routes Library Strip */}
        {savedRoutes.length > 0 && (
          <div
            id="saved-routes-section"
            className="aerolog-subcard bg-slate-50/90 border border-slate-200/85 rounded-xl p-2.5 space-y-2"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setShowSavedDrawer((prev) => !prev)}
                aria-expanded={showSavedDrawer}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:text-slate-950 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Saved Routes &amp; Waypoints ({savedRoutes.length})</span>
              </button>
              <span className="text-[10px] font-mono text-slate-500">
                Includes modified aircraft track &amp; distances
              </span>
            </div>

            {showSavedDrawer && (
              <div
                id="saved-routes-list"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
              >
                {savedRoutes.map((route) => {
                  const isActive = route.id === activeSavedRouteId;
                  const modLegs = countModifiedWaypointLegs(route.waypoints);
                  const totalNm = computeSavedRouteTotalNm(route.waypoints);
                  return (
                    <div
                      key={route.id}
                      data-testid={`saved-route-card-${route.id}`}
                      className={`rounded-xl border px-2.5 py-2 flex items-center justify-between gap-2 transition-all ${
                        isActive
                          ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                          : 'bg-white border-slate-200/85 hover:border-sky-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="text-xs font-bold text-slate-900 truncate"
                            title={route.name}
                          >
                            {route.name}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                          <span>{route.waypoints.length} WPTs</span>
                          <span>·</span>
                          <span>{totalNm} NM</span>
                          <span>·</span>
                          <span className="capitalize">{route.routeTrackMode}</span>
                          {modLegs > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-amber-700 font-semibold">
                                {modLegs} mod
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadSavedRoute(route);
                            setStatusMessage(`Loaded saved route "${route.name}".`);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-lg transition-colors"
                        >
                          Load
                        </button>
                        {isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              onSaveCurrentRoute(route.name, route.id);
                              setStatusMessage(`Updated saved route "${route.name}".`);
                            }}
                            title="Overwrite saved route with current waypoints and modified track/distance"
                            className="px-2 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg transition-colors"
                          >
                            Update
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteSavedRoute(route.id)}
                          aria-label={`Delete saved route ${route.name}`}
                          title="Delete saved route"
                          className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Track Mode, Fixed Track & Departure Date/Time Bar */}
        <div className="aerolog-subcard flex flex-col gap-2 bg-slate-50/90 border border-slate-200/80 rounded-xl p-2.5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 w-full xl:w-auto">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto sm:shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap shrink-0">
                  Track Mode:
                </span>
                <div
                  role="group"
                  aria-label="Route Track Mode"
                  className="aerolog-segmented grid grid-cols-2 sm:inline-flex w-full sm:w-auto bg-slate-200/70 p-1 rounded-xl gap-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={routeTrackMode === 'straight'}
                    onClick={() => onChangeRouteTrackMode('straight')}
                    className={`justify-center px-2.5 sm:px-3 py-1.5 sm:py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      routeTrackMode === 'straight'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <GitCommitHorizontal className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">Straight-Line</span>
                    <span className="hidden sm:inline">Straight-Line Track</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={routeTrackMode === 'freeform'}
                    onClick={() => onChangeRouteTrackMode('freeform')}
                    className={`justify-center px-2.5 sm:px-3 py-1.5 sm:py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      routeTrackMode === 'freeform'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <Waypoints className="w-3.5 h-3.5 shrink-0" />
                    Freeform
                  </button>
                </div>
              </div>

              <div className="hidden sm:block w-px h-6 bg-slate-200/90 shrink-0" />

              {/* Whole-Flight Fixed Track Override (Optional) */}
              <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/70">
                <label
                  htmlFor="input-global-track"
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="Leave blank to auto-calculate track between each map waypoint, or enter a fixed track (0-359°) for the whole flight"
                >
                  <Navigation className="w-3 h-3 text-sky-600 shrink-0" />
                  <span>Fixed Track (°T):</span>
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className={`flex items-center rounded-lg border px-2 py-1 transition-all ${
                      globalTrackOverrideDeg !== null
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-white border-slate-200/90 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/15'
                    }`}
                  >
                    <input
                      id="input-global-track"
                      type="number"
                      min={0}
                      max={359}
                      placeholder="Auto Map"
                      value={
                        globalTrackOverrideDeg !== null ? globalTrackOverrideDeg : ''
                      }
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        onChangeGlobalTrackOverride(
                          val === '' ? null : Math.max(0, Math.min(359, Number(val)))
                        );
                      }}
                      className="w-20 text-xs font-mono font-bold bg-transparent text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none text-right"
                    />
                    <span className="text-[11px] font-mono text-slate-400 ml-1 select-none">
                      °T
                    </span>
                  </div>
                  {globalTrackOverrideDeg !== null && (
                    <button
                      type="button"
                      onClick={() => onChangeGlobalTrackOverride(null)}
                      title="Clear Fixed Track and return to Auto Map track"
                      aria-label="Clear Fixed Track"
                      className="p-1 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded-lg border border-amber-200/90 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Estimated Departure Date & Time (IST) */}
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full xl:w-auto pt-1.5 xl:pt-0 border-t xl:border-t-0 border-slate-200/70 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 min-w-0">
                <label
                  htmlFor="input-departure-date"
                  className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-900 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Calendar className="w-3 h-3 text-sky-600 shrink-0" />
                  <span>Dep Date (IST)</span>
                </label>
                <input
                  id="input-departure-date"
                  type="date"
                  value={departureDate}
                  onChange={(e) => onDepartureDateChange(e.target.value)}
                  className="w-full sm:w-auto px-2 py-1 text-xs font-mono font-bold bg-sky-50/75 border border-sky-200/90 rounded-lg text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 min-w-0">
                <label
                  htmlFor="input-airborne-time"
                  className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-900 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Clock className="w-3 h-3 text-sky-600 shrink-0" />
                  <span>Dep Time (IST)</span>
                </label>
                <input
                  id="input-airborne-time"
                  type="time"
                  value={airborneTime}
                  onChange={(e) => onDepartureTimeChange(e.target.value)}
                  className="w-full sm:w-auto px-2 py-1 text-xs font-mono font-bold bg-sky-50/75 border border-sky-200/90 rounded-lg text-slate-900 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-600 border-t border-slate-200/60 pt-1.5">
            {globalTrackOverrideDeg !== null ? (
              <span className="text-amber-800 font-semibold">
                Fixed Track active ({String(globalTrackOverrideDeg).padStart(3, '0')}°T across all unmodified legs)
              </span>
            ) : routeTrackMode === 'straight' ? (
              <span className="text-sky-800 font-semibold">
                Waypoints stick to straight DEP→DEST line
                {straightLineSummary
                  ? ` (${String(straightLineSummary.trackDeg).padStart(3, '0')}°T · ${straightLineSummary.totalDistNm} NM)`
                  : ''}
              </span>
            ) : (
              <span className="text-amber-800 font-semibold">
                Freeform multi-leg routing — editing Track/Dist repositions waypoints
              </span>
            )}
          </div>
        </div>

        {/* Map-First Guidance & Quick Split Line Strip */}
        <div className="aerolog-subcard flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 border border-slate-200/80 rounded-xl px-3 py-2 text-[11px]">
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
                to add waypoints ({intermediateCount} en-route) · Enter leg <strong>TRK</strong> &amp; <strong>DIST</strong> to adjust on track
              </span>
            )}
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-500 flex items-center gap-1 mr-0.5">
              <Sparkles className="w-3 h-3 text-sky-600" />
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
                className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-sky-50 text-sky-900 border border-slate-200/90 hover:border-sky-400 rounded-lg transition-all disabled:opacity-40 shadow-2xs"
              >
                {preset.label}
              </button>
            ))}

            <button
              id="toggle-distance-builder-btn"
              type="button"
              disabled={!depWp || !destWp}
              aria-expanded={showDistanceBuilder}
              onClick={handleOpenDistanceBuilder}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border flex items-center gap-1 transition-all disabled:opacity-40 shadow-2xs ${
                showDistanceBuilder
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-300/90'
              }`}
            >
              <Ruler className="w-3 h-3 shrink-0" />
              <span>+ By Distance</span>
            </button>
          </div>
        </div>

        {/* Collapsible Add Waypoints by Distance Builder */}
        {showDistanceBuilder && depWp && destWp && (
          <div
            id="add-by-distance-panel"
            className="aerolog-subcard animate-slide-down bg-sky-50/75 border border-sky-200/90 rounded-xl p-3 space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-200/70 pb-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    Add Waypoints by Distance (DEP → DEST)
                  </span>
                  {straightLineSummary && (
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white/90 border border-sky-200 text-sky-800">
                      {straightLineSummary.totalDistNm} NM · {String(straightLineSummary.trackDeg).padStart(3, '0')}°T
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Enter distances between <strong>{depWp.name}</strong> and{' '}
                  <strong>{destWp.name}</strong> to place waypoints directly along the track.
                </p>
              </div>

              <div
                role="group"
                aria-label="Distance Reference Mode"
                className="aerolog-segmented grid grid-cols-2 sm:inline-flex w-full sm:w-auto bg-white/90 border border-sky-200/80 p-0.5 rounded-lg gap-0.5 shrink-0"
              >
                <button
                  type="button"
                  aria-pressed={distanceInputMode === 'leg'}
                  onClick={() => setDistanceInputMode('leg')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${
                    distanceInputMode === 'leg'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Leg Dist (from prev)
                </button>
                <button
                  type="button"
                  aria-pressed={distanceInputMode === 'cumulative'}
                  onClick={() => setDistanceInputMode('cumulative')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${
                    distanceInputMode === 'cumulative'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Dist from DEP
                </button>
              </div>
            </div>

            {/* Dynamic Waypoint Distance Rows */}
            <div className="space-y-1.5">
              {distanceBuilderPreview.rowsWithMeta.map((row, idx) => (
                <div
                  key={row.id}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 bg-white/90 border border-sky-200/70 rounded-lg px-2 py-1.5"
                >
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200/80 shrink-0">
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={row.name}
                    aria-label={`Distance waypoint ${idx + 1} name`}
                    onChange={(e) =>
                      handleUpdateDistanceRow(row.id, 'name', e.target.value)
                    }
                    placeholder={`WPT ${idx + 1} name`}
                    className="flex-1 min-w-0 px-2 sm:px-2.5 py-1 text-xs font-mono font-semibold bg-slate-50/80 border border-slate-200 rounded-md text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:border-sky-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0.1}
                      step="0.1"
                      value={row.distanceText}
                      aria-label={`Distance waypoint ${idx + 1} distance NM`}
                      onChange={(e) =>
                        handleUpdateDistanceRow(row.id, 'distanceText', e.target.value)
                      }
                      placeholder={
                        distanceInputMode === 'leg' ? 'Leg NM' : 'From DEP'
                      }
                      className="w-18 sm:w-24 px-1.5 sm:px-2 py-1 text-xs font-mono font-bold text-right bg-slate-50/80 border border-slate-200 rounded-md text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:border-sky-500 focus:outline-none"
                    />
                    <span className="text-[11px] font-mono text-slate-500 select-none">
                      NM
                    </span>
                  </div>
                  {row.cumNm !== null && (
                    <span className="text-[10px] font-mono text-sky-800 bg-sky-50 border border-sky-200/80 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                      {distanceInputMode === 'leg'
                        ? `Cum ${row.cumNm} NM`
                        : `Leg ${row.legNm} NM`}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={distanceRows.length <= 1}
                    onClick={() => handleRemoveDistanceRow(row.id)}
                    aria-label={`Remove distance waypoint row ${idx + 1}`}
                    title="Remove row"
                    className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer: Add Row + Live Summary + Apply Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="add-distance-row-btn"
                  type="button"
                  onClick={handleAddDistanceRow}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-sky-50 text-sky-900 border border-sky-200/90 rounded-lg flex items-center gap-1 transition-all shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  Add Waypoint Row
                </button>

                {distanceBuilderPreview.validSpecs.length > 0 && (
                  <span
                    className={`text-[11px] font-mono ${
                      distanceBuilderPreview.remainingToDestNm > 0
                        ? 'text-sky-900'
                        : 'text-amber-800 font-semibold'
                    }`}
                  >
                    {distanceBuilderPreview.remainingToDestNm > 0
                      ? `Final leg to ${destWp.name}: ${distanceBuilderPreview.remainingToDestNm} NM`
                      : `Total ${distanceBuilderPreview.maxEnteredCum} NM exceeds direct ${distanceBuilderPreview.directTotalNm} NM — spaced along track with exact NM`}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto shrink-0">
                <button
                  id="apply-distance-replace-btn"
                  type="button"
                  disabled={distanceBuilderPreview.validSpecs.length === 0}
                  onClick={() => handleSubmitDistanceWaypoints('replace')}
                  className="flex-1 sm:flex-initial justify-center px-3 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  {intermediateCount > 0
                    ? `Replace (${distanceBuilderPreview.validSpecs.length})`
                    : `Add ${distanceBuilderPreview.validSpecs.length || ''} WPT${
                        distanceBuilderPreview.validSpecs.length === 1 ? '' : 's'
                      }`}
                </button>

                {intermediateCount > 0 && (
                  <button
                    id="apply-distance-insert-btn"
                    type="button"
                    disabled={distanceBuilderPreview.validSpecs.length === 0}
                    onClick={() => handleSubmitDistanceWaypoints('insert')}
                    className="flex-1 sm:flex-initial justify-center px-3 py-1.5 text-xs font-semibold bg-white hover:bg-sky-50 disabled:opacity-40 text-sky-900 border border-sky-300 rounded-lg transition-all whitespace-nowrap shadow-2xs"
                  >
                    Insert
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowDistanceBuilder(false)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-all whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {statusMessage && (
        <div
          role="status"
          className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3.5 py-2 flex items-center justify-between"
        >
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-sky-600 hover:text-sky-900 font-semibold ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Ordered Route Sequence (DEP -> WPT 1..N -> DEST) */}
      <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto pr-1 flex-1">
        {waypoints.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 space-y-1 animate-fade-up">
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
            const arrivingLeg = idx > 0 ? legs[idx - 1] : null;
            const hasCustomLeg =
              wp.customTrackDeg !== undefined || wp.customDistanceNm !== undefined;

            const lineProj =
              !isDep && !isDest && depWp && destWp
                ? projectPointOntoStraightLine(depWp, destWp, wp.lat, wp.lng, 0.01, 0.99)
                : null;

            return (
              <div
                key={wp.id}
                className="animate-row-enter py-2.5 px-1.5 hover:bg-slate-50/70 rounded-xl transition-all duration-200 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={`font-mono text-[10px] font-bold w-12 text-center py-1 rounded-lg shrink-0 border ${
                      isDep
                        ? 'bg-sky-50 text-sky-900 border-sky-200/80'
                        : isDest
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200/80'
                        : 'bg-amber-50 text-amber-900 border-amber-200/80'
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
                    className="font-mono font-semibold text-slate-900 bg-slate-50/90 border border-slate-200/90 focus:border-sky-500 focus:bg-white rounded-lg px-2.5 py-1 min-w-0 flex-1 sm:flex-initial sm:w-36 focus:outline-none transition-all"
                  />

                  <div className="hidden xl:flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
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
                      className="w-20 px-2 py-1 bg-slate-50/90 border border-slate-200/90 rounded-lg text-slate-800 focus:border-sky-500 focus:bg-white focus:outline-none transition-all"
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
                      className="w-20 px-2 py-1 bg-slate-50/90 border border-slate-200/90 rounded-lg text-slate-800 focus:border-sky-500 focus:bg-white focus:outline-none transition-all"
                    />
                  </div>

                  {lineProj && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-md whitespace-nowrap hidden 2xl:inline ${
                        routeTrackMode === 'straight'
                          ? 'bg-sky-50 text-sky-800 border border-sky-200/80'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {routeTrackMode === 'straight'
                        ? `On Line · ${Math.round(lineProj.t * 100)}% (${lineProj.distanceFromDepNm} NM)`
                        : `${lineProj.distanceFromDepNm} NM`}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto shrink-0">
                  <span className="font-mono text-[10px] text-slate-500 xl:hidden">
                    {wp.lat.toFixed(3)}°, {wp.lng.toFixed(3)}°
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5 ml-auto sm:ml-0">
                    {/* Inline Leg Track (°T) & Distance (NM) Editor (adjusts waypoint along track) */}
                    {arrivingLeg && (
                      <div
                        title="Edit aircraft Track (°T) or Leg Distance (NM) — automatically repositions waypoint along the track and saves with route"
                        className={`flex items-center gap-1 border rounded-lg px-2 py-1 font-mono text-[11px] transition-all ${
                          hasCustomLeg
                            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                            : 'bg-slate-50/90 border-slate-200/90 text-slate-700'
                        }`}
                      >
                        <Navigation
                          className={`w-3 h-3 shrink-0 ${
                            wp.customTrackDeg !== undefined
                              ? 'text-amber-600'
                              : 'text-sky-600'
                          }`}
                        />
                        <EditableNumberInput
                          min={0}
                          max={359}
                          fallbackOnEmptyBlur={arrivingLeg.trackDeg}
                          ariaLabel={`Leg ${idx} track degrees to ${wp.name}`}
                          value={arrivingLeg.trackDeg}
                          onChange={(val) =>
                            onAdjustWaypointLeg(idx - 1, { trackDeg: val })
                          }
                          className="w-9 text-center bg-transparent focus:bg-white rounded font-semibold text-slate-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-slate-500">°</span>
                        <span className="text-slate-300 mx-0.5">|</span>
                        <Ruler
                          className={`w-3 h-3 shrink-0 ${
                            wp.customDistanceNm !== undefined
                              ? 'text-amber-600'
                              : 'text-sky-600'
                          }`}
                        />
                        <EditableNumberInput
                          min={0}
                          step={roundOffValues ? '1' : '0.1'}
                          fallbackOnEmptyBlur={arrivingLeg.legDistNm}
                          ariaLabel={`Leg ${idx} distance NM to ${wp.name}`}
                          value={arrivingLeg.legDistNm}
                          onChange={(val) =>
                            onAdjustWaypointLeg(idx - 1, { distanceNm: val })
                          }
                          className="w-11 text-right bg-transparent focus:bg-white rounded font-semibold text-slate-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-slate-500">NM</span>
                        {hasCustomLeg && (
                          <button
                            type="button"
                            onClick={() => onResetWaypointLeg(wp.id)}
                            title="Reset modified track/distance to GPS map geometry"
                            aria-label={`Reset track and distance for ${wp.name}`}
                            className="ml-0.5 p-0.5 text-amber-700 hover:text-amber-950 rounded transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Waypoint Wind badge / inline editor */}
                    <div
                      title={
                        wp.windSource
                          ? `Wind source: ${wp.windSource}`
                          : `Upper-air wind at ${selectedAltitudeFt.toLocaleString()} ft`
                      }
                      className={`flex items-center gap-1 border rounded-lg px-2 py-1 font-mono text-[11px] transition-all ${
                        windSyncSuccess
                          ? 'bg-emerald-50 border-emerald-300'
                          : wp.windSource === 'Manual'
                          ? 'bg-amber-50/70 border-amber-300'
                          : 'bg-slate-50/90 border-slate-200/90'
                      }`}
                    >
                      <Wind
                        className={`w-3 h-3 ${
                          windSyncSuccess
                            ? 'text-emerald-700'
                            : wp.windSource === 'Manual'
                            ? 'text-amber-700'
                            : 'text-sky-600'
                        }`}
                      />
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
                            className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === waypoints.length - 1}
                            onClick={() => onMoveWaypoint(idx, 'down')}
                            aria-label={`Move ${wp.name} down`}
                            className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveWaypoint(wp.id)}
                        aria-label={`Delete waypoint ${wp.name}`}
                        className="p-1 text-rose-600 hover:text-rose-800 rounded-lg hover:bg-rose-50 transition-colors"
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
