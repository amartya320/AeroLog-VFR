import React, { useEffect } from 'react';
import {
  X,
  Compass,
  MapPin,
  GitCommitHorizontal,
  Wind,
  Navigation,
  Fuel,
  Printer,
  ArrowUpDown,
  CheckCircle2,
} from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      id="tutorial-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto no-print"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="tutorial-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900 truncate"
              >
                Welcome to AeroLog VFR · Quick-Start Pilot Guide
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                Pre-flight VFR Navigation Log, Upper-Air Winds & Complete Fuel Planner
              </p>
            </div>
          </div>

          <button
            id="close-tutorial-modal-x"
            type="button"
            onClick={onClose}
            aria-label="Close tutorial popup"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Step-by-Step Guide */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Step 1: Map-First Route & Waypoint Selection */}
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-sky-600 text-white">
                  STEP 1
                </span>
                <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Select Route Waypoints on the Map</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Click or tap directly on the map (or search in the top-left map search bar):
              </p>
              <ul className="space-y-1 text-slate-700 font-medium pl-1">
                <li>
                  • <strong>1st Tap / Search:</strong> Sets <strong>Departure (DEP)</strong> — Blue Pin <code>D</code>
                </li>
                <li>
                  • <strong>2nd Tap / Search:</strong> Sets <strong>Destination (DEST)</strong> — Green Pin <code>A</code>
                </li>
                <li>
                  • <strong>3rd+ Tap on Track / Map:</strong> Inserts <strong>En-Route Waypoints</strong> (Orange Pins <code>1..N</code>) between DEP and DEST. Drag any pin to reposition or click an en-route pin to remove it.
                </li>
              </ul>
            </div>

            {/* Step 2: Straight-Line vs Freeform Track Mode */}
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-sky-600 text-white">
                  STEP 2
                </span>
                <GitCommitHorizontal className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>Straight-Line vs. Freeform Track</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Switch between two routing modes in the Map Toolbar or Route Waypoints panel:
              </p>
              <ul className="space-y-1 text-slate-700 font-medium pl-1">
                <li>
                  • <strong>Straight-Line Track:</strong> Intermediate waypoints stick directly to the straight line drawn between <strong>DEP → DEST</strong>. Click right on the track line or use <strong>Split Line</strong> to divide legs evenly.
                </li>
                <li>
                  • <strong>Freeform Mode:</strong> Place and drag waypoints anywhere off-track for dogleg VFR routing.
                </li>
                <li className="flex items-center gap-1 pt-0.5">
                  <ArrowUpDown className="w-3 h-3 text-sky-600 shrink-0" />
                  <span>
                    Use <strong>Reverse Route (DEP ↔ DEST)</strong> to flip your flight plan in one click.
                  </span>
                </li>
              </ul>
            </div>

            {/* Step 3: Flight Parameters & Live Upper-Air Winds */}
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-emerald-600 text-white">
                  STEP 3
                </span>
                <Wind className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Departure Time, Altitude & Weather</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Configure your aircraft and atmospheric forecast at the top of the page:
              </p>
              <ul className="space-y-1 text-slate-700 font-medium pl-1">
                <li>
                  • Set <strong>Est. Departure Date & Time (IST)</strong> and <strong>Cruise Altitude</strong> (2,000 ft to 18,000 ft pressure levels).
                </li>
                <li>
                  • Pick your free upper-air forecast model (<strong>ECMWF IFS 9km</strong>, <strong>NOAA GFS</strong>, or <strong>DWD ICON</strong>) and click <strong>Sync Winds</strong>.
                </li>
                <li>
                  • Explore the <strong>Free Weather Map</strong> (wind streamlines & WMO barbs) and <strong>IMD Sat Weather (INSAT)</strong> tabs on the map.
                </li>
              </ul>
            </div>

            {/* Step 4: Alternate Aerodrome, Fuel Reserves & Printable NavLog */}
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-purple-600 text-white">
                  STEP 4
                </span>
                <Fuel className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Alternate, Fuel Plan & Kneeboard Print</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Complete your fuel verification and print your cockpit kneeboard log:
              </p>
              <ul className="space-y-1 text-slate-700 font-medium pl-1">
                <li className="flex items-start gap-1">
                  <Navigation className="w-3 h-3 text-purple-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Alternate Aerodrome:</strong> Choose origin (<strong>From DEP</strong> or <strong>From DEST</strong>), then search an airport or use <strong>Set Alternate</strong> on the map.
                  </span>
                </li>
                <li>
                  • <strong>Interactive NavLog Sheet:</strong> Click any <strong>Track</strong>, <strong>Leg Dist</strong>, or <strong>Wind</strong> cell in the table to override values, or toggle <strong>Round Off Values</strong> for whole numbers.
                </li>
                <li className="flex items-center gap-1 pt-0.5">
                  <Printer className="w-3 h-3 text-slate-700 shrink-0" />
                  <span>
                    Click <strong>Print Sheet</strong> for a clean, paper-ready cockpit kneeboard log.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Tip: Toggle <strong>AMOLED Dark Mode</strong> or reopen this <strong>Tutorial</strong> anytime from the top bar.
          </span>

          <button
            id="close-tutorial-modal-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-md shadow-xs flex items-center gap-1.5 transition-colors ml-auto"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Got It · Start Flight Planning
          </button>
        </div>
      </div>
    </div>
  );
};
