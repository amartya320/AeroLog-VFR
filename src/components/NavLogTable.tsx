import React from 'react';
import { RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  FlightConfig,
  LegOverride,
  NavLogSummary,
  formatCalc,
} from '../utils/navlogMath';
import { EditableNumberInput } from './EditableNumberInput';

interface NavLogTableProps {
  summary: NavLogSummary;
  config: FlightConfig;
  overrides: Record<string, LegOverride>;
  selectedLegIndex: number;
  showMagneticHeading: boolean;
  paperBlankRowsCount: number;
  onSelectLeg: (index: number) => void;
  onUpdateLegOverride: (legId: string, partial: Partial<LegOverride>) => void;
  onResetLegOverride: (legId: string) => void;
}

export const NavLogTable: React.FC<NavLogTableProps> = ({
  summary,
  config,
  overrides,
  selectedLegIndex,
  showMagneticHeading,
  paperBlankRowsCount,
  onSelectLeg,
  onUpdateLegOverride,
  onResetLegOverride,
}) => {
  const { legs } = summary;
  const roundOff = Boolean(config.roundOffValues);

  return (
    <div className="aerolog-card bg-white border border-slate-300 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.03),0_10px_30px_-5px_rgba(15,23,42,0.04)] overflow-hidden print-break-inside-avoid">
      {/* Mobile / Tablet Horizontal Scroll Hint */}
      <div className="xl:hidden bg-slate-100/90 border-b border-slate-200 px-3.5 py-1.5 text-[11px] text-slate-600 flex items-center justify-between no-print">
        <span>Tap any Track, Leg Dist, or Wind cell to edit</span>
        <span className="font-mono font-semibold text-sky-700">Swipe table ↔</span>
      </div>
      {/* Main NavLog Grid (Estimated Pre-Flight Columns Only) */}
      <div className="overflow-x-auto overscroll-x-contain">
        <table
          className="w-full min-w-[820px] border-collapse text-xs font-mono tabular-nums"
          aria-label="Flight Navigation Log Table"
        >
          <thead>
            {/* Group Header Row */}
            <tr className="bg-slate-100/95 text-slate-900 border-b border-slate-300">
              <th
                rowSpan={2}
                className="border-r border-slate-300 px-3 py-2.5 text-left font-display font-bold text-xs w-32"
              >
                From
              </th>
              <th
                rowSpan={2}
                className="border-r-2 border-slate-400 px-3 py-2.5 text-left font-display font-bold text-xs w-32"
              >
                To
              </th>
              <th
                colSpan={4}
                className="border-r-2 border-slate-400 px-2 py-2 text-center font-display font-bold text-xs"
              >
                Distance (NM)
              </th>
              <th
                colSpan={2}
                className="border-r-2 border-slate-400 px-2 py-2 text-center font-display font-bold text-xs"
              >
                <div className="flex items-center justify-around text-[11px]">
                  <span className="font-mono font-semibold text-sky-800">ETD: {config.airborneTime} IST</span>
                  <span className="font-display font-bold text-xs">Time</span>
                  <span className="font-mono text-slate-600">{config.departureDate}</span>
                </div>
              </th>
              <th
                colSpan={1}
                className="border-r-2 border-slate-400 px-2 py-2 text-center font-display font-bold text-xs"
              >
                G/S (kt)
              </th>
              <th
                colSpan={2}
                className="border-r-2 border-slate-400 px-2 py-2 text-center font-display font-bold text-xs"
              >
                FUEL (L)
              </th>
              <th
                colSpan={1}
                className="border-r-2 border-slate-400 px-2 py-2 text-center font-display font-bold text-xs"
              >
                HEADING ({showMagneticHeading ? '°M' : '°T'})
              </th>
              <th
                colSpan={2}
                className="px-2 py-2 text-center font-display font-bold text-xs"
              >
                WINDS
              </th>
            </tr>

            {/* Sub-Column Header Row */}
            <tr className="bg-slate-50 text-slate-700 border-b-2 border-slate-400 text-[11px] font-sans font-semibold">
              {/* Distance (NM) */}
              <th className="border-r border-slate-300 px-2 py-1.5 text-center">Track</th>
              <th className="border-r border-slate-300 px-2 py-1.5 text-center">Leg</th>
              <th className="border-r border-slate-300 px-2 py-1.5 text-center">Covered</th>
              <th className="border-r-2 border-slate-400 px-2 py-1.5 text-center">To go</th>

              {/* Time */}
              <th className="border-r border-slate-300 px-2 py-1.5 text-center">Taken</th>
              <th className="border-r-2 border-slate-400 px-2 py-1.5 text-center">ETA</th>

              {/* G/S */}
              <th className="border-r-2 border-slate-400 px-2 py-1.5 text-center">EST</th>

              {/* FUEL */}
              <th className="border-r border-slate-300 px-2 py-1.5 text-center">EST</th>
              <th className="border-r-2 border-slate-400 px-2 py-1.5 text-center">Remaining</th>

              {/* HEADING */}
              <th className="border-r-2 border-slate-400 px-2 py-1.5 text-center">EST</th>

              {/* WINDS */}
              <th className="border-r border-slate-300 px-2 py-1.5 text-center">DIR</th>
              <th className="px-2 py-1.5 text-center">SPD</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {legs.length === 0 && (
              <tr className="bg-slate-50/70">
                <td
                  colSpan={14}
                  className="px-4 py-5 text-center font-sans text-xs text-slate-500"
                >
                  Flight plan is empty — add at least 2 waypoints (Departure and Destination) via the Google Map or Route Waypoints panel above to compute leg tracks, distances, winds, headings, ground speeds, times, and fuel.
                </td>
              </tr>
            )}
            {legs.map((leg, idx) => {
              const isSelected = selectedLegIndex === idx;
              const ov = overrides[leg.legId] || {};
              const hasOverride =
                ov.trackDeg !== undefined ||
                ov.distanceNm !== undefined ||
                ov.windDir !== undefined ||
                ov.windSpd !== undefined;

              const displayedHeadingEst = showMagneticHeading
                ? leg.magHeadingEst
                : leg.trueHeadingEst;

              const [etaHh, etaMm] = (leg.eta || '--:--').split(':');

              return (
                <tr
                  key={leg.legId}
                  onClick={() => onSelectLeg(idx)}
                  className={`transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50/90 hover:bg-sky-100/70'
                      : idx % 2 === 0
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-slate-50/50 hover:bg-slate-100/60'
                  }`}
                >
                  {/* From */}
                  <td className="border-r border-slate-200 px-3 py-2 font-sans font-semibold text-slate-900 whitespace-nowrap">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate max-w-[130px]" title={leg.fromName}>
                        {leg.fromName}
                      </span>
                      {hasOverride && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onResetLegOverride(leg.legId);
                          }}
                          title="Reset manual leg overrides to map/wind values"
                          aria-label={`Reset overrides for leg ${leg.fromName} to ${leg.toName}`}
                          className="text-amber-700 hover:text-amber-900 p-0.5 rounded no-print"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* To */}
                  <td className="border-r-2 border-slate-300 px-3 py-2 font-sans font-semibold text-slate-900 whitespace-nowrap">
                    <span className="truncate max-w-[130px] block" title={leg.toName}>
                      {leg.toName}
                    </span>
                  </td>

                  {/* Distance: Track (editable override) */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5 text-center whitespace-nowrap">
                    <div className="inline-flex items-center justify-center">
                      <EditableNumberInput
                        min={0}
                        max={359}
                        fallbackOnEmptyBlur={leg.trackDeg}
                        ariaLabel={`Track degrees for leg ${leg.index}`}
                        value={leg.trackDeg}
                        onChange={(val) =>
                          onUpdateLegOverride(leg.legId, { trackDeg: val })
                        }
                        className="w-10 text-right font-mono font-semibold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-sky-500 rounded-md px-0.5 py-0.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[11px] text-slate-500">°</span>
                    </div>
                  </td>

                  {/* Distance: Leg NM (editable override) */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5 text-center">
                    <EditableNumberInput
                      min={0}
                      step={roundOff ? '1' : '0.1'}
                      fallbackOnEmptyBlur={leg.legDistNm}
                      ariaLabel={`Leg distance NM for leg ${leg.index}`}
                      value={leg.legDistNm}
                      onChange={(val) =>
                        onUpdateLegOverride(leg.legId, { distanceNm: val })
                      }
                      className="w-14 text-right font-mono font-semibold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-sky-500 rounded-md px-1 py-0.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>

                  {/* Distance: Covered NM */}
                  <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-medium text-slate-700">
                    {formatCalc(leg.coveredDistNm, roundOff)}
                  </td>

                  {/* Distance: To go NM */}
                  <td className="border-r-2 border-slate-300 px-2.5 py-1.5 text-right font-medium text-slate-700">
                    {formatCalc(leg.toGoDistNm, roundOff)}
                  </td>

                  {/* Time: Taken (min) */}
                  <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-bold text-slate-900">
                    <div>{formatCalc(leg.timeTakenMin, roundOff)}m</div>
                    {!roundOff && (
                      <div className="text-[10px] font-normal text-slate-500">
                        ({leg.timeTakenRoundedMin} min)
                      </div>
                    )}
                  </td>

                  {/* Time: ETA (split HH | MM just like the paper logbook) */}
                  <td className="border-r-2 border-slate-300 p-0 text-center">
                    <div className="grid grid-cols-2 divide-x divide-slate-200 h-full items-center">
                      <span className="py-2 px-1.5 font-semibold text-slate-900">
                        {etaHh || '--'}
                      </span>
                      <span className="py-2 px-1.5 font-semibold text-slate-900">
                        {etaMm || '--'}
                      </span>
                    </div>
                  </td>

                  {/* G/S: EST */}
                  <td className="border-r-2 border-slate-300 px-2.5 py-1.5 text-right font-bold text-slate-900">
                    {leg.gsEstKt}
                  </td>

                  {/* FUEL: EST (Leg Fuel in L) */}
                  <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-bold text-slate-900">
                    {formatCalc(leg.fuelEstLiters, roundOff)}
                  </td>

                  {/* FUEL: Remaining */}
                  <td
                    className={`border-r-2 border-slate-300 px-2.5 py-1.5 text-right font-bold ${
                      leg.fuelRemainingLiters < config.reserveFuelLiters
                        ? 'text-rose-700 bg-rose-50'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatCalc(leg.fuelRemainingLiters, roundOff)}
                  </td>

                  {/* HEADING: EST */}
                  <td className="border-r-2 border-slate-300 px-2.5 py-1.5 text-center font-bold text-slate-900">
                    <div>{String(displayedHeadingEst).padStart(3, '0')}°</div>
                    <div className="text-[10px] font-normal text-slate-500">
                      WCA {leg.wcaDeg > 0 ? `+${formatCalc(leg.wcaDeg, roundOff)}°` : `${formatCalc(leg.wcaDeg, roundOff)}°`}
                    </div>
                  </td>

                  {/* WINDS: DIR */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5 text-center whitespace-nowrap">
                    <div className="inline-flex items-center justify-center">
                      <EditableNumberInput
                        min={0}
                        max={360}
                        fallbackOnEmptyBlur={leg.windDir}
                        ariaLabel={`Wind direction degrees for leg ${leg.index}`}
                        value={leg.windDir}
                        onChange={(val) =>
                          onUpdateLegOverride(leg.legId, { windDir: val })
                        }
                        className="w-10 text-right font-mono font-semibold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-sky-500 rounded-md px-0.5 py-0.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[11px] text-slate-500">°</span>
                    </div>
                  </td>

                  {/* WINDS: SPD */}
                  <td className="px-1.5 py-1.5 text-center">
                    <EditableNumberInput
                      min={0}
                      max={200}
                      fallbackOnEmptyBlur={leg.windSpd}
                      ariaLabel={`Wind speed knots for leg ${leg.index}`}
                      value={leg.windSpd}
                      onChange={(val) =>
                        onUpdateLegOverride(leg.legId, { windSpd: val })
                      }
                      className="w-11 text-center font-mono font-semibold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-sky-500 rounded-md px-0.5 py-0.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                </tr>
              );
            })}

            {/* Alternate Diversion Row (shown only when user has selected an Alternate Aerodrome) */}
            {summary.alternateLeg && (
              <tr
                data-testid="navlog-alternate-row"
                className="bg-indigo-50/80 border-t-2 border-indigo-200 text-indigo-950 font-mono"
              >
                {/* From (DEP or DEST) */}
                <td className="border-r border-slate-200 px-3 py-2 font-sans font-bold text-indigo-950 whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono uppercase tracking-tight text-indigo-700">
                      ALTN FROM {summary.alternateLeg.fromRole}
                    </span>
                    <span
                      className="truncate max-w-[130px]"
                      title={summary.alternateLeg.fromName}
                    >
                      {summary.alternateLeg.fromName}
                    </span>
                  </div>
                </td>

                {/* To (Alternate Aerodrome) */}
                <td className="border-r-2 border-slate-300 px-3 py-2 font-sans font-bold text-indigo-950 whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono uppercase tracking-tight text-indigo-700">
                      ALTERNATE
                    </span>
                    <span
                      className="truncate max-w-[130px]"
                      title={summary.alternateLeg.toName}
                    >
                      {summary.alternateLeg.toName}
                    </span>
                  </div>
                </td>

                {/* Track */}
                <td className="border-r border-slate-200 px-1.5 py-1.5 text-center font-semibold">
                  {String(summary.alternateLeg.trackDeg).padStart(3, '0')}°
                </td>

                {/* Leg Distance */}
                <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-bold">
                  {formatCalc(summary.alternateLeg.distanceNm, roundOff)}
                </td>

                {/* Covered */}
                <td className="border-r border-slate-200 px-2.5 py-1.5 text-center text-slate-400">
                  —
                </td>

                {/* To go */}
                <td className="border-r-2 border-slate-300 px-2.5 py-1.5 text-center text-slate-400">
                  —
                </td>

                {/* Time Taken */}
                <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-bold">
                  <div>{formatCalc(summary.alternateLeg.timeEstMin, roundOff)}m</div>
                </td>

                {/* ETA */}
                <td className="border-r-2 border-slate-300 p-0 text-center">
                  <div className="grid grid-cols-2 divide-x divide-slate-200 h-full items-center">
                    <span className="py-2 px-1.5 font-semibold">
                      {(summary.alternateLeg.eta || '--:--').split(':')[0] || '--'}
                    </span>
                    <span className="py-2 px-1.5 font-semibold">
                      {(summary.alternateLeg.eta || '--:--').split(':')[1] || '--'}
                    </span>
                  </div>
                </td>

                {/* G/S EST */}
                <td className="border-r-2 border-slate-300 px-2.5 py-1.5 text-right font-bold">
                  {summary.alternateLeg.gsEstKt}
                </td>

                {/* FUEL EST */}
                <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-bold">
                  {formatCalc(summary.fuelPlan.alternateFuelLiters, roundOff)}
                </td>

                {/* FUEL Remaining */}
                <td className="border-r-2 border-slate-300 px-2.5 py-1.5 text-right font-bold">
                  {formatCalc(summary.alternateLeg.fuelRemainingAtAltLiters, roundOff)}
                </td>

                {/* HEADING EST */}
                <td className="border-r-2 border-slate-300 px-2.5 py-1.5 text-center font-bold">
                  <div>
                    {String(
                      showMagneticHeading
                        ? summary.alternateLeg.magHeadingEst
                        : summary.alternateLeg.trueHeadingEst
                    ).padStart(3, '0')}
                    °
                  </div>
                  <div className="text-[10px] font-normal text-indigo-700">
                    WCA{' '}
                    {summary.alternateLeg.wcaDeg > 0
                      ? `+${formatCalc(summary.alternateLeg.wcaDeg, roundOff)}°`
                      : `${formatCalc(summary.alternateLeg.wcaDeg, roundOff)}°`}
                  </div>
                </td>

                {/* WINDS DIR */}
                <td className="border-r border-slate-200 px-1.5 py-1.5 text-center font-semibold">
                  {String(summary.alternateLeg.windDir).padStart(3, '0')}°
                </td>

                {/* WINDS SPD */}
                <td className="px-1.5 py-1.5 text-center font-semibold">
                  {summary.alternateLeg.windSpd}
                </td>
              </tr>
            )}

            {/* Optional Paper-Style Ruled Blank Rows for Printed Kneeboard Sheet */}
            {Array.from({ length: paperBlankRowsCount }).map((_, idx) => (
              <tr key={`blank-row-${idx}`} className="h-7 bg-white">
                <td className="border-r border-slate-200 px-2" />
                <td className="border-r-2 border-slate-300 px-2" />
                <td className="border-r border-slate-200 px-1" />
                <td className="border-r border-slate-200 px-1" />
                <td className="border-r border-slate-200 px-1" />
                <td className="border-r-2 border-slate-300 px-1" />
                <td className="border-r border-slate-200 px-1" />
                <td className="border-r-2 border-slate-300 p-0">
                  <div className="grid grid-cols-2 divide-x divide-slate-200 h-7">
                    <span />
                    <span />
                  </div>
                </td>
                <td className="border-r-2 border-slate-300 px-1" />
                <td className="border-r border-slate-200 px-1" />
                <td className="border-r-2 border-slate-300 px-1" />
                <td className="border-r-2 border-slate-300 px-1" />
                <td className="border-r border-slate-200 px-1" />
                <td className="px-1" />
              </tr>
            ))}
          </tbody>

          {/* Totals & Complete Fuel Verification Footer */}
          <tfoot>
            <tr className="bg-slate-900 text-white border-t-2 border-slate-800 font-mono text-xs">
              <td colSpan={2} className="px-3.5 py-3 font-display font-bold uppercase tracking-wider">
                Flight Totals ({legs.length} Legs)
              </td>
              <td className="px-2 py-3 text-center text-slate-400">—</td>
              <td className="px-2 py-3 text-center font-bold text-amber-300">
                {formatCalc(summary.totalDistanceNm, roundOff)} NM
              </td>
              <td className="px-2.5 py-3 text-right text-slate-300">
                {formatCalc(summary.totalDistanceNm, roundOff)}
              </td>
              <td className="border-r border-slate-700 px-2.5 py-3 text-right text-slate-300">
                {formatCalc(0, roundOff)}
              </td>
              <td className="px-2.5 py-3 text-right font-bold text-amber-300">
                {formatCalc(summary.totalTimeMin, roundOff)}m
              </td>
              <td className="border-r border-slate-700 px-2 py-3 text-center font-bold text-emerald-300">
                {summary.finalEta}
              </td>
              <td className="border-r border-slate-700 px-2.5 py-3 text-right font-bold text-sky-300">
                {formatCalc(summary.averageGsKt, roundOff)} AVG
              </td>
              <td className="px-2.5 py-3 text-right font-bold text-amber-300">
                {formatCalc(summary.totalFuelRequiredLiters, roundOff)} L
              </td>
              <td
                className={`border-r border-slate-700 px-2.5 py-3 text-right font-bold ${
                  summary.isFuelSufficient ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {formatCalc(summary.finalFuelRemainingLiters, roundOff)} L
              </td>
              <td colSpan={3} className="px-3.5 py-3 text-right font-sans text-[11px]">
                {summary.fuelPlan.isBlockFuelSufficient ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Req Block: {formatCalc(summary.fuelPlan.totalBlockFuelRequiredLiters, roundOff)} L (+{formatCalc(summary.fuelPlan.extraFuelMarginLiters, roundOff)} L Margin)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-300 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Req Block: {formatCalc(summary.fuelPlan.totalBlockFuelRequiredLiters, roundOff)} L &gt; {formatCalc(summary.fuelPlan.initialBlockFuelLiters, roundOff)} L
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};


