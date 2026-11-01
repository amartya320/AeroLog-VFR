import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Satellite,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Clock,
  Info,
  Sliders,
  Compass,
} from 'lucide-react';
import {
  Waypoint,
  AlternateAerodrome,
  IMD_SATELLITE_CHANNELS,
  ImdSatelliteChannelId,
  getImdChannelById,
} from '../utils/navlogMath';

interface ImdSatelliteMetaResponse {
  channelId: ImdSatelliteChannelId;
  label: string;
  shortLabel: string;
  sector: string;
  wavelength: string;
  upstreamUrl: string;
  aviationSummary: string;
  bestFor: string;
  lastModifiedRaw: string | null;
  scanTimeUtc: string;
  scanTimeIst: string;
  ageMinutes: number;
  contentLengthBytes: number;
  status: string;
}

interface ImdSatelliteViewProps {
  waypoints: Waypoint[];
  alternate: AlternateAerodrome | null;
  selectedAltitudeFt: number;
  departureDate: string;
  departureTime: string;
}

export const ImdSatelliteView: React.FC<ImdSatelliteViewProps> = ({
  waypoints,
  alternate,
  selectedAltitudeFt,
  departureDate,
  departureTime,
}) => {
  const [selectedChannelId, setSelectedChannelId] =
    useState<ImdSatelliteChannelId>('asia_ir1');
  const [meta, setMeta] = useState<ImdSatelliteMetaResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [refreshNonce, setRefreshNonce] = useState<number>(1);
  const [forceFlag, setForceFlag] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [isExpandedModal, setIsExpandedModal] = useState<boolean>(false);

  const activeChannel = useMemo(
    () => getImdChannelById(selectedChannelId),
    [selectedChannelId]
  );

  const routeCorridorSummary = useMemo(() => {
    if (waypoints.length === 0) return 'India FIR Sector';
    const dep = waypoints[0];
    const dest = waypoints[waypoints.length - 1];
    if (waypoints.length === 1) {
      return `${dep.name} (${dep.lat.toFixed(2)}°N, ${dep.lng.toFixed(2)}°E)`;
    }
    return `${dep.name} (${dep.lat.toFixed(2)}°N, ${dep.lng.toFixed(2)}°E) → ${dest.name} (${dest.lat.toFixed(2)}°N, ${dest.lng.toFixed(2)}°E)`;
  }, [waypoints]);

  const fetchSatelliteMetadata = useCallback(
    async (channelId: ImdSatelliteChannelId, force: boolean) => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/imd-satellite/meta?channel=${encodeURIComponent(channelId)}${
            force ? '&force=1' : ''
          }`
        );
        if (res.ok) {
          const data = (await res.json()) as ImdSatelliteMetaResponse;
          setMeta(data);
        }
      } catch {
        // Keep previous or channel defaults
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setImageLoaded(false);
    fetchSatelliteMetadata(selectedChannelId, forceFlag);
  }, [selectedChannelId, refreshNonce, forceFlag, fetchSatelliteMetadata]);

  const handleSelectChannel = (channelId: ImdSatelliteChannelId) => {
    setSelectedChannelId(channelId);
    setForceFlag(false);
  };

  const handleForceRefresh = () => {
    setForceFlag(true);
    setRefreshNonce((n) => n + 1);
  };

  const handleZoomIn = () => {
    setZoom((z) => Math.min(3.5, Number((z + 0.5).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const next = Math.max(1, Number((z - 0.5).toFixed(2)));
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || zoom <= 1) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const imageUrl = `/api/imd-satellite/image?channel=${encodeURIComponent(
    selectedChannelId
  )}&r=${refreshNonce}${forceFlag ? '&force=1' : ''}`;

  const renderViewerBody = (isModal: boolean) => (
    <div
      className={`relative w-full ${
        isModal ? 'h-[calc(100vh-120px)]' : 'h-full'
      } bg-slate-950 overflow-hidden flex flex-col select-none`}
    >
      {/* Top Sub-Toolbar inside Satellite View */}
      <div className="px-2.5 sm:px-3 py-2 bg-slate-900/95 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2 z-20">
        {/* Channel Selector Buttons */}
        <div
          className="flex items-center gap-1 overflow-x-auto pb-0.5 lg:pb-0 max-w-full"
          role="group"
          aria-label="IMD INSAT Satellite Channels"
        >
          {IMD_SATELLITE_CHANNELS.map((ch) => {
            const isSelected = ch.id === selectedChannelId;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSelectChannel(ch.id)}
                className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-mono font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {ch.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Zoom, Contrast & Refresh Controls */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5">
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              aria-label="Zoom out satellite image"
              className="p-1 text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 sm:px-2 text-[10px] sm:text-[11px] font-mono font-semibold text-sky-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 3.5}
              aria-label="Zoom in satellite image"
              className="p-1 text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={handleResetView}
                aria-label="Reset satellite zoom"
                className="p-1 text-amber-300 hover:text-amber-200 border-l border-slate-700 ml-0.5"
                title="Reset Zoom (100%)"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setHighContrast((c) => !c)}
              className={`px-2 py-1 text-[10px] sm:text-[11px] font-mono font-medium rounded border transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                highContrast
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Enhance IR cloud-top contrast"
            >
              <Sliders className="w-3 h-3" />
              IR Enhance
            </button>

            <button
              type="button"
              onClick={handleForceRefresh}
              disabled={isLoading}
              className="px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-mono font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              title="Fetch latest scan from mausam.imd.gov.in"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh IMD
            </button>

            <button
              type="button"
              onClick={() => setIsExpandedModal((m) => !m)}
              aria-label={isModal ? 'Close full screen satellite view' : 'Expand full screen satellite view'}
              className="px-2 py-1 text-[10px] sm:text-[11px] font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              title={isModal ? 'Exit Full View' : 'Expand Full Bulletin'}
            >
              {isModal ? (
                <>
                  <Minimize2 className="w-3 h-3 text-sky-400" />
                  Exit Full
                </>
              ) : (
                <>
                  <Maximize2 className="w-3 h-3 text-sky-400" />
                  Full View
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Static / Desktop Floating Live IMD Telemetry & Scan Timestamp */}
      <div className="sm:hidden bg-slate-900 border-b border-slate-800 px-2.5 py-1.5 text-[10px] font-mono text-slate-300 flex flex-wrap items-center justify-between gap-1.5 z-10">
        <span className="font-bold text-sky-400 truncate">{activeChannel.shortLabel}</span>
        <span className="text-emerald-400 font-semibold">
          {meta?.scanTimeIst || 'Live IST Scan'}
          {meta ? ` (${meta.ageMinutes <= 1 ? 'Now' : `${meta.ageMinutes}m ago`})` : ''}
        </span>
      </div>

      {/* Main Satellite Image Canvas / Pan-Zoom Stage */}
      <div
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-slate-950 ${
          zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        {(!imageLoaded || isLoading) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 z-10 pointer-events-none px-4 text-center">
            <RefreshCw className="w-6 h-6 text-sky-400 animate-spin mb-2" />
            <span className="text-xs font-mono text-slate-300">
              Loading {activeChannel.label} from IMD Mausam...
            </span>
          </div>
        )}

        <img
          src={imageUrl}
          alt={activeChannel.label}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          className={`max-h-full max-w-full object-contain transition-transform duration-75 ${
            highContrast ? 'contrast-125 brightness-110 saturate-125' : ''
          }`}
        />

        {/* Top-Left Live IMD Telemetry & Scan Timestamp Overlay (Tablet & Desktop) */}
        <div className="hidden sm:block absolute top-3 left-3 max-w-md z-10 bg-slate-950/88 backdrop-blur-xs border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 shadow-lg pointer-events-none space-y-1">
          <div className="flex items-center gap-1.5 font-mono font-bold text-sky-400 text-xs">
            <Satellite className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{activeChannel.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono text-slate-300">
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <Clock className="w-3 h-3" />
              {meta?.scanTimeIst || 'Live IST Scan'}
            </span>
            <span className="text-slate-400">({meta?.scanTimeUtc || 'UTC'})</span>
            {meta && (
              <span className="px-1.5 py-0.2 bg-slate-800 text-amber-300 rounded text-[10px]">
                {meta.ageMinutes <= 1 ? 'Just updated' : `${meta.ageMinutes}m ago`}
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 pt-0.5 border-t border-slate-800/80">
            <Compass className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate">
              Corridor: {routeCorridorSummary}
              {alternate ? ` · ALT: ${alternate.name}` : ''}
            </span>
          </div>
        </div>

        {/* Top-Right Aviation Interpretation & Best-Use Card */}
        <div className="hidden lg:block absolute top-3 right-3 z-10 w-80 bg-slate-950/90 border border-slate-800 rounded-md px-3 py-2 text-[11px] text-slate-300 shadow-lg pointer-events-none space-y-1">
          <div className="flex items-center justify-between font-mono font-semibold text-amber-300">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-amber-400" />
              {activeChannel.bestFor}
            </span>
            <span className="text-[10px] text-slate-400">{activeChannel.wavelength}</span>
          </div>
          <p className="text-[11px] leading-snug text-slate-300">
            {activeChannel.aviationSummary}
          </p>
          <div className="text-[10px] font-mono text-slate-400 pt-0.5 border-t border-slate-800/80 flex items-center justify-between">
            <span>Source: mausam.imd.gov.in (INSAT-3DR/3DS)</span>
            <span>
              {zoom > 1 ? 'Drag image to pan' : 'Use + / Full View to inspect'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="w-full h-full" data-testid="imd-satellite-view">
        {renderViewerBody(false)}
      </div>

      {/* Optional Full-Viewport Modal for inspecting high-res IMD INSAT chart & temperature legend */}
      {isExpandedModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xs flex flex-col p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded IMD INSAT Satellite Weather Bulletin"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 sm:pb-3 mb-2 border-b border-slate-800 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <Satellite className="w-5 h-5 text-sky-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold font-mono truncate">
                  IMD Official INSAT-3DR/3DS Satellite Weather Bulletin — Full View
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 font-mono truncate">
                  {activeChannel.label} · Planned ETD: {departureDate} {departureTime} IST · Cruise: {selectedAltitudeFt} ft
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsExpandedModal(false)}
              className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-700 shrink-0"
            >
              Close Full View
            </button>
          </div>
          <div className="flex-1 rounded-lg overflow-hidden border border-slate-800">
            {renderViewerBody(true)}
          </div>
        </div>
      )}
    </>
  );
};
