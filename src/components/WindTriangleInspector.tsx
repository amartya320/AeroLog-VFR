import React from 'react';
import { ComputedLeg, FlightConfig, formatCalc } from '../utils/navlogMath';

interface WindTriangleInspectorProps {
  leg: ComputedLeg | undefined;
  config: FlightConfig;
  legsCount: number;
  onSelectLeg: (index: number) => void;
}

export const WindTriangleInspector: React.FC<WindTriangleInspectorProps> = ({
  leg,
  config,
  legsCount,
  onSelectLeg,
}) => {
  if (!leg) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-5 text-xs text-slate-500">
        Add at least two waypoints to inspect leg E6B wind triangle and fuel/time equations.
      </div>
    );
  }

  const roundOff = Boolean(config.roundOffValues);

  // SVG Compass Rose & Wind Triangle Geometry
  const size = 230;
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = 82;

  const maxSpeed = Math.max(config.cruiseTasKt, leg.gsEstKt, leg.windSpd, 60) * 1.15;
  const scale = maxRadius / maxSpeed;

  const degToSvgRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

  // Heading / TAS vector from center
  const hdgRad = degToSvgRad(leg.trueHeadingEst);
  const hdgEndX = cx + Math.cos(hdgRad) * (config.cruiseTasKt * scale);
  const hdgEndY = cy + Math.sin(hdgRad) * (config.cruiseTasKt * scale);

  // Track / Ground Speed vector from center
  const trkRad = degToSvgRad(leg.trackDeg);
  const trkEndX = cx + Math.cos(trkRad) * (leg.gsEstKt * scale);
  const trkEndY = cy + Math.sin(trkRad) * (leg.gsEstKt * scale);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Leg {leg.index} E6B Wind Triangle & Equations
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            {leg.fromName} → {leg.toName} ({formatCalc(leg.legDistNm, roundOff)} NM)
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={leg.index <= 1}
            onClick={() => onSelectLeg(leg.index - 2)}
            aria-label="Inspect previous leg"
            className="px-2 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded text-slate-700"
          >
            Prev
          </button>
          <span className="text-xs font-mono px-1.5 text-slate-600">
            {leg.index}/{legsCount}
          </span>
          <button
            type="button"
            disabled={leg.index >= legsCount}
            onClick={() => onSelectLeg(leg.index)}
            aria-label="Inspect next leg"
            className="px-2 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded text-slate-700"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
        {/* Vector Compass SVG */}
        <div className="sm:col-span-5 flex flex-col items-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="bg-slate-950 rounded-lg border border-slate-800"
            role="img"
            aria-label={`E6B Wind Triangle vector diagram for leg ${leg.fromName} to ${leg.toName}`}
          >
            <defs>
              <marker
                id="arrow-tas"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#38bdf8" />
              </marker>
              <marker
                id="arrow-gs"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
              </marker>
              <marker
                id="arrow-wind"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#f43f5e" />
              </marker>
            </defs>

            {/* Compass Rings */}
            <circle
              cx={cx}
              cy={cy}
              r={maxRadius}
              fill="none"
              stroke="#334155"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={cx}
              cy={cy}
              r={maxRadius * 0.55}
              fill="none"
              stroke="#1e293b"
              strokeWidth="1"
            />
            <line x1={cx} y1={14} x2={cx} y2={size - 14} stroke="#1e293b" strokeWidth="1" />
            <line x1={14} y1={cy} x2={size - 14} y2={cy} stroke="#1e293b" strokeWidth="1" />

            {/* Cardinal Labels */}
            <text x={cx} y={12} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">
              N 000°
            </text>
            <text x={size - 10} y={cy + 3} textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="monospace">
              E
            </text>
            <text x={cx} y={size - 5} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">
              S
            </text>
            <text x={10} y={cy + 3} textAnchor="start" fill="#94a3b8" fontSize="10" fontFamily="monospace">
              W
            </text>

            {/* Heading / TAS Vector (Sky Blue) */}
            <line
              x1={cx}
              y1={cy}
              x2={hdgEndX}
              y2={hdgEndY}
              stroke="#38bdf8"
              strokeWidth="2.5"
              markerEnd="url(#arrow-tas)"
            />

            {/* Track / Ground Speed Vector (Amber) */}
            <line
              x1={cx}
              y1={cy}
              x2={trkEndX}
              y2={trkEndY}
              stroke="#f59e0b"
              strokeWidth="2.5"
              markerEnd="url(#arrow-gs)"
            />

            {/* Wind Vector connecting Heading Tip to Track Tip (Crimson) */}
            <line
              x1={hdgEndX}
              y1={hdgEndY}
              x2={trkEndX}
              y2={trkEndY}
              stroke="#f43f5e"
              strokeWidth="2"
              strokeDasharray="3 2"
              markerEnd="url(#arrow-wind)"
            />

            <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
          </svg>

          <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-slate-600">
            <span className="text-amber-600 font-semibold">― Track/GS</span>
            <span className="text-sky-600 font-semibold">― HDG/TAS</span>
            <span className="text-rose-600 font-semibold">-- Wind</span>
          </div>
        </div>

        {/* Formula & Computed Breakdown */}
        <div className="sm:col-span-7 space-y-2.5 text-xs font-mono">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[10px] font-sans text-slate-500">True Track & Distance</div>
              <div className="text-sm font-bold text-slate-900">
                {String(leg.trackDeg).padStart(3, '0')}°T · {formatCalc(leg.legDistNm, roundOff)} NM
              </div>
              <div className="text-[11px] text-slate-500">
                Covered: {formatCalc(leg.coveredDistNm, roundOff)} · To go: {formatCalc(leg.toGoDistNm, roundOff)}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[10px] font-sans text-slate-500">Upper-Air Wind ({config.selectedAltitudeFt} ft)</div>
              <div className="text-sm font-bold text-slate-900">
                {String(leg.windDir).padStart(3, '0')}° @ {leg.windSpd} kt
              </div>
              <div className="text-[11px] text-slate-500 truncate" title={leg.windSource}>
                {leg.headwindKt >= 0
                  ? `${formatCalc(leg.headwindKt, roundOff)} kt Headwind`
                  : `${formatCalc(Math.abs(leg.headwindKt), roundOff)} kt Tailwind`}{' '}
                · XW {formatCalc(Math.abs(leg.crosswindKt), roundOff)} kt
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[10px] font-sans text-slate-500">Heading & WCA (TAS {config.cruiseTasKt} kt)</div>
              <div className="text-sm font-bold text-slate-900">
                {String(leg.trueHeadingEst).padStart(3, '0')}°T / {String(leg.magHeadingEst).padStart(3, '0')}°M
              </div>
              <div className="text-[11px] text-slate-500">
                WCA: {leg.wcaDeg > 0 ? `+${formatCalc(leg.wcaDeg, roundOff)}° (Right)` : `${formatCalc(leg.wcaDeg, roundOff)}° (Left)`}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[10px] font-sans text-slate-500">Ground Speed & Leg Time</div>
              <div className="text-sm font-bold text-slate-900">
                {leg.gsEstKt} kt · {formatCalc(leg.timeTakenMin, roundOff)} min
              </div>
              <div className="text-[11px] text-slate-500">
                ETA {leg.eta} · Running {formatCalc(leg.runningTimeMin, roundOff)}m
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Fuel Required ({config.fuelFlowLph} L/hr):</span>
              <span className="font-bold text-amber-300">
                ({formatCalc(leg.timeTakenMin, roundOff)} / 60) × {config.fuelFlowLph} = {formatCalc(leg.fuelEstLiters, roundOff)} L
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Fuel Remaining at {leg.toName}:</span>
              <span className="font-bold text-emerald-300">
                {formatCalc(config.initialFuelLiters - config.taxiFuelLiters, roundOff)} − {formatCalc(leg.cumulativeFuelEstLiters, roundOff)} = {formatCalc(leg.fuelRemainingLiters, roundOff)} L
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
