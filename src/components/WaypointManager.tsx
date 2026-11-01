import React, { useState, useRef } from 'react';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  Download,
  ArrowUpDown,
  Wind,
} from 'lucide-react';
import { Waypoint, parseKmlWaypoints } from '../utils/navlogMath';
import { exportWaypointsToKml } from '../utils/presetRoutes';

interface WaypointManagerProps {
  waypoints: Waypoint[];
  selectedAltitudeFt: number;
  onAddWaypoint: (name: string, lat: number, lng: number) => void;
  onUpdateWaypoint: (id: string, partial: Partial<Waypoint>) => void;
  onMoveWaypoint: (index: number, direction: 'up' | 'down') => void;
  onRemoveWaypoint: (id: string) => void;
  onReverseRoute: () => void;
  onClearAllWaypoints: () => void;
  onImportWaypoints: (newWaypoints: Waypoint[]) => void;
}

export const WaypointManager: React.FC<WaypointManagerProps> = ({
  waypoints,
  selectedAltitudeFt,
  onAddWaypoint,
  onUpdateWaypoint,
  onMoveWaypoint,
  onRemoveWaypoint,
  onReverseRoute,
  onClearAllWaypoints,
  onImportWaypoints,
}) => {
  const [newName, setNewName] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim().toUpperCase();
    const latNum = parseFloat(newLat);
    const lngNum = parseFloat(newLng);

    if (!trimmedName) {
      setFormError('Enter a waypoint identifier or name.');
      return;
    }
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setFormError('Latitude must be between -90° and +90°.');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setFormError('Longitude must be between -180° and +180°.');
      return;
    }

    setFormError(null);
    onAddWaypoint(
      trimmedName,
      Math.round(latNum * 10000) / 10000,
      Math.round(lngNum * 10000) / 10000
    );
    setNewName('');
    setNewLat('');
    setNewLng('');
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Route Waypoints & Google Earth KML ({waypoints.length})
          </h3>
          <p className="text-xs text-slate-500">
            Departure to destination fixes with upper-air wind at {selectedAltitudeFt.toLocaleString()} ft
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {waypoints.length > 0 && (
            <button
              type="button"
              onClick={onClearAllWaypoints}
              className="px-2.5 py-1 text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3 h-3" />
              Clear Waypoints
            </button>
          )}

          <button
            type="button"
            disabled={waypoints.length < 2}
            onClick={onReverseRoute}
            className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowUpDown className="w-3 h-3" />
            Reverse
          </button>

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
            className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3 h-3" />
            Import KML
          </button>

          <button
            type="button"
            disabled={waypoints.length === 0}
            onClick={handleExportKml}
            className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" />
            Export KML
          </button>
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

      {/* Waypoint Sequence List */}
      <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto pr-1 flex-1">
        {waypoints.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">No waypoints in current flight plan</p>
            <p>
              Click anywhere on the Google Map above, search for an airport/fix, import a Google Earth KML file, or enter coordinates below.
            </p>
          </div>
        ) : (
          waypoints.map((wp, idx) => {
            const roleLabel =
              idx === 0
                ? 'DEP'
                : idx === waypoints.length - 1 && waypoints.length > 1
                ? 'DEST'
                : `WPT ${idx}`;

            return (
              <div
                key={wp.id}
                className="py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={`font-mono text-[10px] font-bold w-11 text-center py-0.5 rounded shrink-0 ${
                      idx === 0
                        ? 'bg-emerald-100 text-emerald-900'
                        : idx === waypoints.length - 1 && waypoints.length > 1
                        ? 'bg-rose-100 text-rose-900'
                        : 'bg-slate-100 text-slate-700'
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
                    className="font-mono font-semibold text-slate-900 bg-slate-50 border border-slate-200 focus:border-sky-600 focus:bg-white rounded px-2 py-1 min-w-0 flex-1 sm:flex-initial sm:w-36 focus:outline-none"
                  />

                  <span className="font-mono text-[11px] text-slate-500 hidden md:inline whitespace-nowrap">
                    {wp.lat.toFixed(4)}°, {wp.lng.toFixed(4)}°
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
                  <span className="font-mono text-[10px] text-slate-500 md:hidden">
                    {wp.lat.toFixed(3)}°, {wp.lng.toFixed(3)}°
                  </span>

                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    {/* Waypoint Wind badge / inline editor */}
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 font-mono text-[11px]">
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

      {/* Add Waypoint by Coordinates Form */}
      <form
        onSubmit={handleManualAdd}
        className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2"
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Waypoint Name (e.g. OOTY)"
          aria-label="New Waypoint Name"
          className="col-span-2 sm:flex-1 sm:min-w-[130px] px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-sky-600"
        />
        <input
          type="number"
          step="any"
          value={newLat}
          onChange={(e) => setNewLat(e.target.value)}
          placeholder="Lat (e.g. 11.4102)"
          aria-label="New Waypoint Latitude"
          className="col-span-1 sm:w-28 px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-sky-600"
        />
        <input
          type="number"
          step="any"
          value={newLng}
          onChange={(e) => setNewLng(e.target.value)}
          placeholder="Lng (e.g. 76.6950)"
          aria-label="New Waypoint Longitude"
          className="col-span-1 sm:w-28 px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-sky-600"
        />
        <button
          type="submit"
          className="col-span-2 sm:w-auto px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Waypoint
        </button>
      </form>
      {formError && (
        <p className="text-xs text-rose-600 font-medium" role="alert">
          {formError}
        </p>
      )}
    </div>
  );
};
