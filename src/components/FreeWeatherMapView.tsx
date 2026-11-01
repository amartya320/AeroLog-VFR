import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Wind,
  Thermometer,
  CloudRain,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
} from 'lucide-react';
import {
  Waypoint,
  ComputedLeg,
  AlternateAerodrome,
  AlternateOriginMode,
  ComputedAlternate,
  WindModelId,
  WeatherGridNode,
  computeRouteWeatherBounds,
  interpolateWeatherAtCoord,
  getClosestAltitudeLevel,
  solveWindTriangle,
} from '../utils/navlogMath';
import {
  fetchWeatherGridClient,
  generateInitialSynopticGrid,
} from '../utils/weatherClient';

export type WeatherMapLayerId = 'wind-streamlines' | 'temp-isa' | 'clouds-precip';

interface FreeWeatherMapViewProps {
  waypoints: Waypoint[];
  legs: ComputedLeg[];
  alternate: AlternateAerodrome | null;
  alternateFrom: AlternateOriginMode;
  computedAlternate: ComputedAlternate | null;
  selectedAltitudeFt: number;
  windModel: WindModelId;
  departureDate: string;
  departureTime: string;
  selectedLegIndex: number;
  onSelectLeg: (idx: number) => void;
}

interface StreamParticle {
  lat: number;
  lng: number;
  age: number;
  maxAge: number;
  prevLat: number;
  prevLng: number;
}

function getWindSpeedColor(spdKt: number, alpha = 0.42): string {
  if (spdKt < 8) return `rgba(14, 165, 233, ${alpha})`; // Calm/light sky blue
  if (spdKt < 15) return `rgba(16, 185, 129, ${alpha})`; // Moderate emerald
  if (spdKt < 22) return `rgba(234, 179, 8, ${alpha})`; // Fresh amber/yellow
  if (spdKt < 30) return `rgba(249, 115, 22, ${alpha})`; // Strong orange
  return `rgba(225, 29, 72, ${alpha})`; // Gale/jet rose-red
}

function getTempColor(tempC: number, alpha = 0.42): string {
  if (tempC <= -5) return `rgba(56, 189, 248, ${alpha})`; // Freezing cyan
  if (tempC <= 5) return `rgba(59, 130, 246, ${alpha})`; // Cold blue
  if (tempC <= 15) return `rgba(16, 185, 129, ${alpha})`; // Temperate green
  if (tempC <= 24) return `rgba(245, 158, 11, ${alpha})`; // Warm amber
  return `rgba(239, 68, 68, ${alpha})`; // Hot red
}

function getCloudColor(cloudPct: number, precipMm: number, alpha = 0.42): string {
  if (precipMm >= 1.5) return `rgba(99, 102, 241, ${alpha + 0.15})`; // Heavy precip indigo
  if (precipMm >= 0.2) return `rgba(14, 165, 233, ${alpha + 0.1})`; // Light rain sky
  if (cloudPct >= 75) return `rgba(148, 163, 184, ${alpha + 0.08})`; // Overcast slate
  if (cloudPct >= 35) return `rgba(100, 116, 139, ${alpha * 0.8})`; // Scattered
  return `rgba(15, 23, 42, ${alpha * 0.25})`; // Clear VFR
}

/**
 * Draw standard aviation WMO wind barb + direction shaft at (x, y)
 * Wind direction is FROM which wind blows (degrees True)
 */
function drawAviationWindBarb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  windDirDeg: number,
  windSpdKt: number,
  color = '#f8fafc'
) {
  ctx.save();
  ctx.translate(x, y);
  // Rotate so 0° points straight up (North), wind shaft extends toward the FROM direction
  const rad = ((windDirDeg - 90) * Math.PI) / 180;
  ctx.rotate(rad);

  const shaftLen = 22;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;

  // Center station circle
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();

  if (windSpdKt < 3) {
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Shaft pointing toward wind source
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(shaftLen, 0);
  ctx.stroke();

  // Small arrowhead at origin showing flow direction (blowing TOWARD origin)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(5, -2.5);
  ctx.lineTo(5, 2.5);
  ctx.closePath();
  ctx.fill();

  // Barbs at the tip of the shaft (50kt pennants, 10kt long barbs, 5kt short barbs)
  let rem = Math.round(windSpdKt / 5) * 5;
  let pos = shaftLen;
  const barbSpacing = 4.2;

  while (rem >= 50) {
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos - 4, -8);
    ctx.lineTo(pos - 8, 0);
    ctx.closePath();
    ctx.fill();
    pos -= 8.5;
    rem -= 50;
  }
  while (rem >= 10) {
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos + 2.5, -8);
    ctx.stroke();
    pos -= barbSpacing;
    rem -= 10;
  }
  if (rem >= 5) {
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos + 1.5, -4.5);
    ctx.stroke();
  }

  ctx.restore();
}

export const FreeWeatherMapView: React.FC<FreeWeatherMapViewProps> = ({
  waypoints,
  legs,
  alternate,
  alternateFrom,
  computedAlternate,
  selectedAltitudeFt,
  windModel,
  departureDate,
  departureTime,
  selectedLegIndex,
  onSelectLeg,
}) => {
  const [activeLayer, setActiveLayer] = useState<WeatherMapLayerId>('wind-streamlines');
  const [animateStreamlines, setAnimateStreamlines] = useState<boolean>(true);
  const [showWindBarbs, setShowWindBarbs] = useState<boolean>(true);
  const initialBounds = useMemo(
    () => computeRouteWeatherBounds(waypoints, alternate),
    [waypoints, alternate]
  );

  // Viewport state in lat/lng center + span so pilot can pan and zoom smoothly
  const [viewCenter, setViewCenter] = useState<{ lat: number; lng: number }>({
    lat: initialBounds.centerLat,
    lng: initialBounds.centerLng,
  });
  const [viewSpan, setViewSpan] = useState<{ lat: number; lng: number }>({
    lat: Math.max(1.2, initialBounds.maxLat - initialBounds.minLat),
    lng: Math.max(1.6, initialBounds.maxLng - initialBounds.minLng),
  });

  const initialSynoptic = useMemo(
    () =>
      generateInitialSynopticGrid({
        minLat: initialBounds.centerLat - Math.max(1.2, initialBounds.maxLat - initialBounds.minLat) * 0.65,
        maxLat: initialBounds.centerLat + Math.max(1.2, initialBounds.maxLat - initialBounds.minLat) * 0.65,
        minLng: initialBounds.centerLng - Math.max(1.6, initialBounds.maxLng - initialBounds.minLng) * 0.65,
        maxLng: initialBounds.centerLng + Math.max(1.6, initialBounds.maxLng - initialBounds.minLng) * 0.65,
        rows: 5,
        cols: 5,
        altitudeFt: selectedAltitudeFt,
        departureDate,
        departureTime,
        windModel,
      }),
    []
  );

  const [gridNodes, setGridNodes] = useState<WeatherGridNode[]>(initialSynoptic.nodes);
  const [gridSource, setGridSource] = useState<string>(initialSynoptic.source);
  const [isLoadingGrid, setIsLoadingGrid] = useState<boolean>(false);

  // Sync camera bounds when route changes
  useEffect(() => {
    setViewCenter({
      lat: initialBounds.centerLat,
      lng: initialBounds.centerLng,
    });
    setViewSpan({
      lat: Math.max(1.2, initialBounds.maxLat - initialBounds.minLat),
      lng: Math.max(1.6, initialBounds.maxLng - initialBounds.minLng),
    });
  }, [
    initialBounds.centerLat,
    initialBounds.centerLng,
    initialBounds.maxLat,
    initialBounds.minLat,
    initialBounds.maxLng,
    initialBounds.minLng,
  ]);

  const [probeCoord, setProbeCoord] = useState<{ lat: number; lng: number }>(() => ({
    lat: initialBounds.centerLat,
    lng: initialBounds.centerLng,
  }));

  const levelInfo = useMemo(
    () => getClosestAltitudeLevel(selectedAltitudeFt),
    [selectedAltitudeFt]
  );

  // Fetch 5x5 Open-Meteo upper-air weather grid directly in browser whenever route bounds, altitude, date/time, or windModel changes
  useEffect(() => {
    let cancelled = false;
    const gridParams = {
      minLat: viewCenter.lat - viewSpan.lat * 0.65,
      maxLat: viewCenter.lat + viewSpan.lat * 0.65,
      minLng: viewCenter.lng - viewSpan.lng * 0.65,
      maxLng: viewCenter.lng + viewSpan.lng * 0.65,
      rows: 5,
      cols: 5,
      altitudeFt: selectedAltitudeFt,
      departureDate,
      departureTime,
      windModel,
    };

    const fetchGrid = async () => {
      setIsLoadingGrid(true);
      try {
        const data = await fetchWeatherGridClient(gridParams);
        if (!cancelled && Array.isArray(data.nodes) && data.nodes.length > 0) {
          setGridNodes(data.nodes);
          setGridSource(data.source || 'Open-Meteo Free Upper-Air Grid');
        }
      } catch {
        const fallback = generateInitialSynopticGrid(gridParams);
        if (!cancelled) {
          setGridNodes(fallback.nodes);
          setGridSource(fallback.source);
        }
      } finally {
        if (!cancelled) setIsLoadingGrid(false);
      }
    };
    fetchGrid();
    return () => {
      cancelled = true;
    };
  }, [
    viewCenter.lat,
    viewCenter.lng,
    viewSpan.lat,
    viewSpan.lng,
    selectedAltitudeFt,
    departureDate,
    departureTime,
    windModel,
  ]);

  const probedWeather = useMemo(
    () => interpolateWeatherAtCoord(gridNodes, probeCoord.lat, probeCoord.lng),
    [gridNodes, probeCoord.lat, probeCoord.lng]
  );

  const selectedLeg = legs[selectedLegIndex] || legs[0] || null;
  const probedLegWindEffect = useMemo(() => {
    if (!selectedLeg) return null;
    return solveWindTriangle(
      selectedLeg.trackDeg,
      85,
      probedWeather.windDir,
      probedWeather.windSpd,
      0
    );
  }, [selectedLeg, probedWeather.windDir, probedWeather.windSpd]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; lat: number; lng: number }>({
    x: 0,
    y: 0,
    lat: 0,
    lng: 0,
  });

  // Store latest render state in a ref so the canvas loop never recreates or triggers React re-renders
  const renderStateRef = useRef({
    waypoints,
    legs,
    alternate,
    alternateFrom,
    computedAlternate,
    selectedLegIndex,
    activeLayer,
    animateStreamlines,
    showWindBarbs,
    gridNodes,
    viewCenter,
    viewSpan,
    probeCoord,
    levelInfo,
  });
  renderStateRef.current = {
    waypoints,
    legs,
    alternate,
    alternateFrom,
    computedAlternate,
    selectedLegIndex,
    activeLayer,
    animateStreamlines,
    showWindBarbs,
    gridNodes,
    viewCenter,
    viewSpan,
    probeCoord,
    levelInfo,
  };

  // Convert lat/lng to canvas (x, y)
  const projectCoord = useCallback(
    (
      lat: number,
      lng: number,
      width: number,
      height: number,
      center: { lat: number; lng: number },
      span: { lat: number; lng: number }
    ) => {
      const minLat = center.lat - span.lat / 2;
      const maxLat = center.lat + span.lat / 2;
      const minLng = center.lng - span.lng / 2;
      const maxLng = center.lng + span.lng / 2;
      const x = ((lng - minLng) / (maxLng - minLng)) * width;
      const y = ((maxLat - lat) / (maxLat - minLat)) * height;
      return { x, y };
    },
    []
  );

  const unprojectPixel = useCallback(
    (
      x: number,
      y: number,
      width: number,
      height: number,
      center: { lat: number; lng: number },
      span: { lat: number; lng: number }
    ) => {
      const minLat = center.lat - span.lat / 2;
      const maxLat = center.lat + span.lat / 2;
      const minLng = center.lng - span.lng / 2;
      const maxLng = center.lng + span.lng / 2;
      const lng = minLng + (x / Math.max(1, width)) * (maxLng - minLng);
      const lat = maxLat - (y / Math.max(1, height)) * (maxLat - minLat);
      return {
        lat: Number(lat.toFixed(4)),
        lng: Number(lng.toFixed(4)),
      };
    },
    []
  );

  // Canvas rendering & streamline particle simulation (mounted once)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const PARTICLE_COUNT = 85;
    const particles: StreamParticle[] = [];

    const resetParticle = (
      p: StreamParticle,
      center: { lat: number; lng: number },
      span: { lat: number; lng: number }
    ) => {
      const lat = center.lat + (Math.random() - 0.5) * span.lat;
      const lng = center.lng + (Math.random() - 0.5) * span.lng;
      p.lat = lat;
      p.lng = lng;
      p.prevLat = lat;
      p.prevLng = lng;
      p.age = Math.floor(Math.random() * 40);
      p.maxAge = 55 + Math.floor(Math.random() * 45);
    };

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p: StreamParticle = {
        lat: 0,
        lng: 0,
        prevLat: 0,
        prevLng: 0,
        age: 0,
        maxAge: 70,
      };
      resetParticle(
        p,
        renderStateRef.current.viewCenter,
        renderStateRef.current.viewSpan
      );
      particles.push(p);
    }

    let animId = 0;
    let lastFrameTime = 0;

    const renderFrame = (now: number) => {
      animId = requestAnimationFrame(renderFrame);
      // Throttle to ~24 FPS so CPU usage stays tiny in software rendering
      if (now - lastFrameTime < 42) return;
      lastFrameTime = now;

      const state = renderStateRef.current;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(300, Math.floor(rect.width));
      const height = Math.max(240, Math.floor(rect.height));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // 1. Deep Aviation Chart Background
      ctx.fillStyle = '#09111e';
      ctx.fillRect(0, 0, width, height);

      // 2. Interpolated Weather Heatmap Cells (18 x 12 cell grid)
      const cellCols = 20;
      const cellRows = 12;
      const cellW = width / cellCols;
      const cellH = height / cellRows;

      if (state.gridNodes.length > 0) {
        for (let r = 0; r < cellRows; r++) {
          for (let c = 0; c < cellCols; c++) {
            const cx = (c + 0.5) * cellW;
            const cy = (r + 0.5) * cellH;
            const coord = unprojectPixel(
              cx,
              cy,
              width,
              height,
              state.viewCenter,
              state.viewSpan
            );
            const wx = interpolateWeatherAtCoord(
              state.gridNodes,
              coord.lat,
              coord.lng
            );
            if (state.activeLayer === 'wind-streamlines') {
              ctx.fillStyle = getWindSpeedColor(wx.windSpd, 0.34);
            } else if (state.activeLayer === 'temp-isa') {
              ctx.fillStyle = getTempColor(wx.tempC, 0.36);
            } else {
              ctx.fillStyle = getCloudColor(wx.cloudCoverPct, wx.precipMm, 0.42);
            }
            ctx.fillRect(
              Math.floor(c * cellW),
              Math.floor(r * cellH),
              Math.ceil(cellW),
              Math.ceil(cellH)
            );
          }
        }
      }

      // 3. Aviation Lat/Lon Graticule Grid & Compass Rose Rings
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';

      const latStep = state.viewSpan.lat > 3 ? 1.0 : state.viewSpan.lat > 1.4 ? 0.5 : 0.25;
      const lngStep = state.viewSpan.lng > 3 ? 1.0 : state.viewSpan.lng > 1.4 ? 0.5 : 0.25;

      const minLat = state.viewCenter.lat - state.viewSpan.lat / 2;
      const maxLat = state.viewCenter.lat + state.viewSpan.lat / 2;
      const minLng = state.viewCenter.lng - state.viewSpan.lng / 2;
      const maxLng = state.viewCenter.lng + state.viewSpan.lng / 2;

      const firstLat = Math.ceil(minLat / latStep) * latStep;
      for (let lat = firstLat; lat <= maxLat; lat += latStep) {
        const { y } = projectCoord(
          lat,
          state.viewCenter.lng,
          width,
          height,
          state.viewCenter,
          state.viewSpan
        );
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillText(`${lat.toFixed(2)}°N`, 8, y - 4);
      }

      const firstLng = Math.ceil(minLng / lngStep) * lngStep;
      for (let lng = firstLng; lng <= maxLng; lng += lngStep) {
        const { x } = projectCoord(
          state.viewCenter.lat,
          lng,
          width,
          height,
          state.viewCenter,
          state.viewSpan
        );
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillText(`${lng.toFixed(2)}°E`, x + 4, height - 30);
      }

      // 4. Animated Upper-Air Wind Streamlines
      if (state.gridNodes.length > 0 && state.animateStreamlines) {
        ctx.lineWidth = 1.7;
        for (const p of particles) {
          const wx = interpolateWeatherAtCoord(state.gridNodes, p.lat, p.lng);
          // Wind blows FROM wx.windDir, so streamline moves toward (wx.windDir + 180)
          const flowToRad = (((wx.windDir + 180) % 360) * Math.PI) / 180;
          const speedScale =
            (Math.max(4, wx.windSpd) / 600) *
            Math.min(state.viewSpan.lat, state.viewSpan.lng);

          p.prevLat = p.lat;
          p.prevLng = p.lng;
          p.lat += Math.cos(flowToRad) * speedScale;
          p.lng += Math.sin(flowToRad) * speedScale;
          p.age += 1;

          const p1 = projectCoord(
            p.prevLat,
            p.prevLng,
            width,
            height,
            state.viewCenter,
            state.viewSpan
          );
          const p2 = projectCoord(
            p.lat,
            p.lng,
            width,
            height,
            state.viewCenter,
            state.viewSpan
          );

          const alpha = Math.sin((p.age / p.maxAge) * Math.PI) * 0.85;
          ctx.strokeStyle = `rgba(224, 242, 254, ${Math.max(0.15, alpha).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          // Small streamline head dot
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.2, alpha).toFixed(2)})`;
          ctx.fillRect(p2.x - 1, p2.y - 1, 2, 2);

          if (
            p.age >= p.maxAge ||
            p.lat < minLat ||
            p.lat > maxLat ||
            p.lng < minLng ||
            p.lng > maxLng
          ) {
            resetParticle(p, state.viewCenter, state.viewSpan);
          }
        }
      }

      // 5. Grid Node Wind Barbs & Value Callouts
      if (state.showWindBarbs && state.gridNodes.length > 0) {
        for (const node of state.gridNodes) {
          const { x, y } = projectCoord(
            node.lat,
            node.lng,
            width,
            height,
            state.viewCenter,
            state.viewSpan
          );
          if (x < 24 || x > width - 24 || y < 24 || y > height - 24) continue;

          drawAviationWindBarb(
            ctx,
            x,
            y,
            node.windDir,
            node.windSpd,
            'rgba(241, 245, 249, 0.88)'
          );

          ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
          if (state.activeLayer === 'wind-streamlines') {
            ctx.fillText(
              `${String(node.windDir).padStart(3, '0')}°/${node.windSpd}kt`,
              x + 7,
              y + 13
            );
          } else if (state.activeLayer === 'temp-isa') {
            ctx.fillText(
              `${node.tempC > 0 ? '+' : ''}${node.tempC}°C`,
              x + 7,
              y + 13
            );
          } else {
            ctx.fillText(
              `${node.cloudCoverPct}%${node.precipMm > 0 ? ` · ${node.precipMm}mm` : ''}`,
              x + 7,
              y + 13
            );
          }
        }
      }

      // 6. Plot Alternate Diversion Leg (from DEP or DEST)
      if (state.alternate && state.waypoints.length > 0) {
        const originWp =
          state.alternateFrom === 'DEP'
            ? state.waypoints[0]
            : state.waypoints[state.waypoints.length - 1];
        const pOrig = projectCoord(
          originWp.lat,
          originWp.lng,
          width,
          height,
          state.viewCenter,
          state.viewSpan
        );
        const pAlt = projectCoord(
          state.alternate.lat,
          state.alternate.lng,
          width,
          height,
          state.viewCenter,
          state.viewSpan
        );

        ctx.save();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pOrig.x, pOrig.y);
        ctx.lineTo(pAlt.x, pAlt.y);
        ctx.stroke();
        ctx.restore();

        // Alternate Marker
        ctx.fillStyle = '#4f46e5';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pAlt.x, pAlt.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const altLabel = `ALT (${state.alternateFrom}): ${state.alternate.name}`;
        ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        const tw = ctx.measureText(altLabel).width;
        ctx.fillStyle = 'rgba(49, 46, 129, 0.92)';
        ctx.fillRect(pAlt.x - tw / 2 - 6, pAlt.y - 26, tw + 12, 16);
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(pAlt.x - tw / 2 - 6, pAlt.y - 26, tw + 12, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(altLabel, pAlt.x - tw / 2, pAlt.y - 14);
      }

      // 7. Plot Main Flight Route Polyline & Waypoints
      if (state.waypoints.length >= 2) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        state.waypoints.forEach((wp, idx) => {
          const pt = projectCoord(
            wp.lat,
            wp.lng,
            width,
            height,
            state.viewCenter,
            state.viewSpan
          );
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }

      state.waypoints.forEach((wp, idx) => {
        const pt = projectCoord(
          wp.lat,
          wp.lng,
          width,
          height,
          state.viewCenter,
          state.viewSpan
        );
        const isDep = idx === 0;
        const isDest = idx === state.waypoints.length - 1 && state.waypoints.length > 1;

        ctx.fillStyle = isDep ? '#10b981' : isDest ? '#f43f5e' : '#0ea5e9';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const windTag =
          wp.windSpd !== undefined
            ? ` ${String(wp.windDir ?? 0).padStart(3, '0')}°/${wp.windSpd}kt`
            : '';
        const label = `${idx + 1}. ${wp.name}${windTag}`;
        ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        const textW = ctx.measureText(label).width;
        const boxX = pt.x - textW / 2 - 6;
        const boxY = pt.y - 27;

        ctx.fillStyle = isDep
          ? 'rgba(6, 95, 70, 0.94)'
          : isDest
          ? 'rgba(136, 19, 55, 0.94)'
          : 'rgba(12, 74, 110, 0.94)';
        ctx.fillRect(boxX, boxY, textW + 12, 17);
        ctx.strokeStyle = isDep ? '#34d399' : isDest ? '#fb7185' : '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, textW + 12, 17);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, pt.x - textW / 2, boxY + 12);
      });

      // 8. Plot Probe Crosshair
      const probePt = projectCoord(
        state.probeCoord.lat,
        state.probeCoord.lng,
        width,
        height,
        state.viewCenter,
        state.viewSpan
      );
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(probePt.x, probePt.y, 7, 0, Math.PI * 2);
      ctx.moveTo(probePt.x - 11, probePt.y);
      ctx.lineTo(probePt.x + 11, probePt.y);
      ctx.moveTo(probePt.x, probePt.y - 11);
      ctx.lineTo(probePt.x, probePt.y + 11);
      ctx.stroke();
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [projectCoord, unprojectPixel]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      lat: viewCenter.lat,
      lng: viewCenter.lng,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const dLng = (dx / Math.max(1, rect.width)) * viewSpan.lng;
      const dLat = (dy / Math.max(1, rect.height)) * viewSpan.lat;
      setViewCenter({
        lat: Number((dragStartRef.current.lat + dLat).toFixed(4)),
        lng: Number((dragStartRef.current.lng - dLng).toFixed(4)),
      });
    } else {
      const coord = unprojectPixel(
        x,
        y,
        rect.width,
        rect.height,
        viewCenter,
        viewSpan
      );
      setProbeCoord(coord);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleZoom = (factor: number) => {
    setViewSpan((prev) => ({
      lat: Math.min(18, Math.max(0.35, Number((prev.lat * factor).toFixed(4)))),
      lng: Math.min(24, Math.max(0.45, Number((prev.lng * factor).toFixed(4)))),
    }));
  };

  const handleFitRoute = () => {
    setViewCenter({
      lat: initialBounds.centerLat,
      lng: initialBounds.centerLng,
    });
    setViewSpan({
      lat: Math.max(1.2, initialBounds.maxLat - initialBounds.minLat),
      lng: Math.max(1.6, initialBounds.maxLng - initialBounds.minLng),
    });
    setProbeCoord({
      lat: initialBounds.centerLat,
      lng: initialBounds.centerLng,
    });
  };

  return (
    <div
      className="relative w-full h-full bg-slate-950 flex flex-col select-none overflow-hidden"
      data-testid="free-weather-map"
    >
      {/* Top Floating Layer & Streamline Controls */}
      <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 z-20 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 pointer-events-none">
        {/* Layer Mode Buttons */}
        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-xs border border-slate-700 rounded-md p-1 pointer-events-auto shadow-lg overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveLayer('wind-streamlines')}
            className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold rounded flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeLayer === 'wind-streamlines'
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Wind className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            Wind Isotachs & Barbs (kt)
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer('temp-isa')}
            className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold rounded flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeLayer === 'temp-isa'
                ? 'bg-amber-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Thermometer className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            Upper-Air Temp ({levelInfo.pressureHpa} hPa)
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer('clouds-precip')}
            className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold rounded flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeLayer === 'clouds-precip'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <CloudRain className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            Clouds & Precip (%)
          </button>
        </div>

        {/* Streamline & Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-xs border border-slate-700 rounded-md p-1 pointer-events-auto shadow-lg overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setAnimateStreamlines((v) => !v)}
            className={`px-2 py-1 text-[10px] sm:text-[11px] font-medium rounded flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
              animateStreamlines
                ? 'bg-emerald-700/80 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="Toggle animated wind flow streamlines"
          >
            {animateStreamlines ? (
              <Pause className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Streamlines
          </button>
          <button
            type="button"
            onClick={() => setShowWindBarbs((v) => !v)}
            className={`px-2 py-1 text-[10px] sm:text-[11px] font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
              showWindBarbs
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            WMO Barbs
          </button>
          <button
            type="button"
            onClick={() => handleZoom(0.75)}
            aria-label="Zoom In Weather Map"
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded shrink-0"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.35)}
            aria-label="Zoom Out Weather Map"
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded shrink-0"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFitRoute}
            className="px-2 py-1 text-[10px] sm:text-[11px] font-medium text-slate-200 hover:bg-slate-800 rounded flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3 h-3" />
            Fit Route
          </button>
        </div>
      </div>

      {/* Interactive Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full cursor-crosshair block"
      />

      {/* Right-Side Spot Weather Probe Inspector */}
      <div className="absolute bottom-10 sm:bottom-6 left-2.5 right-2.5 sm:left-auto sm:right-3 z-20 bg-slate-900/92 backdrop-blur-xs border border-slate-700 text-slate-100 rounded-md p-2 sm:p-2.5 shadow-xl sm:max-w-xs text-[10px] sm:text-[11px] font-mono space-y-1 sm:space-y-1.5 pointer-events-auto">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1">
          <span className="font-bold text-sky-400 flex items-center gap-1 truncate">
            <Crosshair className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            Spot Probe ({levelInfo.pressureHpa} hPa)
          </span>
          <span className="text-[10px] text-slate-400 shrink-0">
            {probeCoord.lat.toFixed(2)}°N, {probeCoord.lng.toFixed(2)}°E
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
          <div className="bg-slate-800/90 rounded px-1.5 sm:px-2 py-1">
            <div className="text-[9px] text-slate-400 uppercase">Wind</div>
            <div className="font-bold text-white">
              {String(probedWeather.windDir).padStart(3, '0')}°/{probedWeather.windSpd}kt
            </div>
          </div>
          <div className="bg-slate-800/90 rounded px-1.5 sm:px-2 py-1">
            <div className="text-[9px] text-slate-400 uppercase">Temp</div>
            <div className="font-bold text-amber-300">
              {probedWeather.tempC > 0 ? '+' : ''}
              {probedWeather.tempC}°C
            </div>
          </div>
          <div className="bg-slate-800/90 rounded px-1.5 sm:px-2 py-1">
            <div className="text-[9px] text-slate-400 uppercase">Clouds</div>
            <div className="font-bold text-sky-300">{probedWeather.cloudCoverPct}%</div>
          </div>
        </div>

        {selectedLeg && probedLegWindEffect && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800 text-[10px] text-slate-300">
            <span>
              Leg {selectedLeg.index} ({String(selectedLeg.trackDeg).padStart(3, '0')}°T):
            </span>
            <span className="font-semibold text-emerald-300">
              {probedLegWindEffect.headwindKt >= 0
                ? `HW ${Math.round(probedLegWindEffect.headwindKt)}kt`
                : `TW ${Math.abs(Math.round(probedLegWindEffect.headwindKt))}kt`}{' '}
              · XW {Math.abs(Math.round(probedLegWindEffect.crosswindKt))}kt
            </span>
          </div>
        )}

        {legs.length > 1 && (
          <div className="flex items-center gap-1 pt-0.5 overflow-x-auto">
            <span className="text-[10px] text-slate-400 shrink-0">Inspect Leg:</span>
            {legs.map((l, idx) => (
              <button
                key={l.legId}
                type="button"
                onClick={() => onSelectLeg(idx)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  selectedLegIndex === idx
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                L{l.index}
              </button>
            ))}
          </div>
        )}

        <div className="hidden sm:block text-[9px] text-slate-400 truncate pt-0.5">
          {isLoadingGrid ? 'Syncing Open-Meteo grid...' : gridSource}
        </div>
      </div>
    </div>
  );
};
