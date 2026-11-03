import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceNm,
  calculateTrueTrackDeg,
  solveWindTriangle,
  addMinutesToTime,
  getCurrentIstDateTime,
  computeNavLog,
  computeAlternateLeg,
  computeFuelPlanBreakdown,
  parseKmlWaypoints,
  roundWindDirToTenDeg,
  interpolateWeatherAtCoord,
  FlightConfig,
  Waypoint,
} from './navlogMath';

test('getCurrentIstDateTime converts UTC timestamp to Indian Standard Time (UTC+05:30)', () => {
  // 2026-10-31T19:42:00Z + 05:30 = 2026-11-01 01:12 IST
  const sampleUtc = new Date('2026-10-31T19:42:00Z');
  const ist = getCurrentIstDateTime(sampleUtc);
  assert.equal(ist.date, '2026-11-01');
  assert.equal(ist.time, '01:12');
});

test('calculateDistanceNm and calculateTrueTrackDeg return accurate nautical miles and bearings', () => {
  // 1 degree of latitude along a meridian is ~60 NM
  const dist = calculateDistanceNm(10.0, 76.0, 11.0, 76.0);
  assert.ok(dist > 59.8 && dist < 60.2, `Expected ~60 NM, got ${dist}`);

  const trackNorth = calculateTrueTrackDeg(10.0, 76.0, 11.0, 76.0);
  assert.equal(trackNorth, 0);

  const trackEast = calculateTrueTrackDeg(0.0, 76.0, 0.0, 77.0);
  assert.equal(trackEast, 90);

  const trackSouth = calculateTrueTrackDeg(11.0, 76.0, 10.0, 76.0);
  assert.equal(trackSouth, 180);
});

test('solveWindTriangle handles pure headwind, tailwind, and right crosswind accurately', () => {
  // Direct headwind: Track 090, TAS 100 kt, Wind 090 @ 20 kt -> GS = 80 kt, WCA = 0, HDG = 090
  const hw = solveWindTriangle(90, 100, 90, 20, 0);
  assert.equal(hw.wcaDeg, 0);
  assert.equal(hw.trueHeadingDeg, 90);
  assert.equal(hw.groundSpeedKt, 80);

  // Direct tailwind: Track 090, TAS 100 kt, Wind 270 @ 20 kt -> GS = 120 kt, WCA = 0, HDG = 090
  const tw = solveWindTriangle(90, 100, 270, 20, 0);
  assert.equal(tw.wcaDeg, 0);
  assert.equal(tw.trueHeadingDeg, 90);
  assert.equal(tw.groundSpeedKt, 120);

  // Right 90-degree crosswind: Track 360 (0), TAS 100 kt, Wind 090 @ 20 kt
  // sin(WCA) = 20 / 100 = 0.2 -> WCA = +11.5 deg -> True Heading = 012 deg, GS = 100 * cos(11.54) = 98.0 kt
  const xw = solveWindTriangle(0, 100, 90, 20, 0);
  assert.equal(xw.wcaDeg, 11.5);
  assert.equal(xw.trueHeadingDeg, 12);
  assert.equal(xw.groundSpeedKt, 98);
});

test('addMinutesToTime wraps around 24-hour clock accurately', () => {
  assert.equal(addMinutesToTime('08:30', 45), '09:15');
  assert.equal(addMinutesToTime('23:50', 25), '00:15');
});

test('computeNavLog calculates legs, alternate diversion leg, and complete fuel plan breakdown', () => {
  const waypoints: Waypoint[] = [
    { id: 'w1', name: 'VOCL', lat: 11.1368, lng: 75.9553, windDir: 270, windSpd: 15 },
    { id: 'w2', name: 'NILAMBUR', lat: 11.2789, lng: 76.2255, windDir: 280, windSpd: 18 },
    { id: 'w3', name: 'VOMY', lat: 12.23, lng: 76.6558, windDir: 260, windSpd: 20 },
  ];

  const config: FlightConfig = {
    cruiseTasKt: 110,
    fuelFlowLph: 32,
    initialFuelLiters: 140,
    taxiFuelLiters: 4,
    contingencyPercent: 5,
    holdingFuelLiters: 24,
    reserveFuelLiters: 24,
    departureDate: '2026-10-31',
    airborneTime: '06:00',
    selectedAltitudeFt: 5000,
    magneticVariationDeg: -2,
    globalTrackOverrideDeg: null,
    alternate: {
      name: 'VOBG (HAL Bengaluru)',
      lat: 12.9499,
      lng: 77.6682,
      windDir: 270,
      windSpd: 14,
    },
  };

  const summary = computeNavLog(waypoints, config, {});
  assert.equal(summary.legs.length, 2);
  assert.equal(summary.legs[0].fromName, 'VOCL');
  assert.equal(summary.legs[0].toName, 'NILAMBUR');
  assert.equal(summary.legs[1].toGoDistNm, 0);
  assert.equal(
    Math.round((summary.legs[0].legDistNm + summary.legs[1].legDistNm) * 10) / 10,
    summary.totalDistanceNm
  );
  assert.ok(summary.totalFuelRequiredLiters > 0);

  // Verify takeoff fuel minus trip fuel equals final fuel remaining
  assert.equal(
    Math.round((config.initialFuelLiters - config.taxiFuelLiters - summary.totalFuelRequiredLiters) * 10) / 10,
    summary.finalFuelRemainingLiters
  );

  // Verify alternate leg calculation from VOMY to VOBG
  assert.ok(summary.alternateLeg !== null);
  assert.equal(summary.alternateLeg?.fromName, 'VOMY');
  assert.equal(summary.alternateLeg?.toName, 'VOBG (HAL Bengaluru)');
  assert.ok((summary.alternateLeg?.distanceNm || 0) > 65);
  assert.ok((summary.alternateLeg?.fuelEstLiters || 0) > 15);

  // Verify Fuel Plan Breakdown (Taxi + Trip + Contingency 5% + Alternate + Holding)
  const fp = summary.fuelPlan;
  assert.equal(fp.taxiFuelLiters, 4);
  assert.equal(fp.contingencyPercent, 5);
  assert.equal(
    fp.contingencyFuelLiters,
    Math.round(fp.tripFuelLiters * 0.05 * 10) / 10
  );
  assert.equal(fp.holdingFuelLiters, 24);
  assert.equal(
    fp.totalBlockFuelRequiredLiters,
    Math.round(
      (fp.taxiFuelLiters +
        fp.tripFuelLiters +
        fp.contingencyFuelLiters +
        fp.alternateFuelLiters +
        fp.holdingFuelLiters) *
        10
    ) / 10
  );
});

test('computeFuelPlanBreakdown computes exact contingency percentage and holding time', () => {
  const config: FlightConfig = {
    cruiseTasKt: 120,
    fuelFlowLph: 30,
    initialFuelLiters: 150,
    taxiFuelLiters: 5,
    contingencyPercent: 10,
    holdingFuelLiters: 22.5, // 45 mins at 30 L/hr
    reserveFuelLiters: 22.5,
    departureDate: '2026-10-31',
    airborneTime: '08:00',
    selectedAltitudeFt: 5000,
    magneticVariationDeg: 0,
    globalTrackOverrideDeg: null,
    alternate: null,
  };

  const breakdown = computeFuelPlanBreakdown(50, 20, config);
  assert.equal(breakdown.taxiFuelLiters, 5);
  assert.equal(breakdown.tripFuelLiters, 50);
  assert.equal(breakdown.contingencyFuelLiters, 5); // 10% of 50 L
  assert.equal(breakdown.alternateFuelLiters, 20);
  assert.equal(breakdown.holdingFuelLiters, 22.5);
  assert.equal(breakdown.holdingTimeMin, 45);
  assert.equal(breakdown.totalTakeoffFuelRequiredLiters, 97.5); // 50 + 5 + 20 + 22.5
  assert.equal(breakdown.totalBlockFuelRequiredLiters, 102.5); // 5 + 97.5
  assert.equal(breakdown.extraFuelMarginLiters, 47.5); // 150 - 102.5
  assert.equal(breakdown.isBlockFuelSufficient, true);
});

test('parseKmlWaypoints extracts Placemarks from Google Earth KML XML and ignores LineString when Point Placemarks exist', () => {
  const exportedKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>VFR Flight Plan Route</name>
    <Placemark>
      <name>Flight Route Path</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>75.9553,11.1368,0 76.2255,11.2789,0 76.6558,12.23,0</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>VOCL (Calicut)</name>
      <Point><coordinates>75.9553,11.1368,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>NILAMBUR</name>
      <Point><coordinates>76.2255,11.2789,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>VOMY (Mysuru)</name>
      <Point><coordinates>76.6558,12.23,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
  const parsed = parseKmlWaypoints(exportedKml);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, 'VOCL (CALICUT)');
  assert.equal(parsed[1].name, 'NILAMBUR');
  assert.equal(parsed[2].name, 'VOMY (MYSURU)');
});

test('customAlternateFuelLiters and roundOffValues work accurately in computeNavLog', () => {
  const waypoints: Waypoint[] = [
    { id: 'w1', name: 'VOCL', lat: 11.1368, lng: 75.9553, windDir: 270, windSpd: 15 },
    { id: 'w2', name: 'VOMY', lat: 12.23, lng: 76.6558, windDir: 260, windSpd: 20 },
  ];

  const config: FlightConfig = {
    cruiseTasKt: 85,
    fuelFlowLph: 15,
    initialFuelLiters: 120,
    taxiFuelLiters: 5,
    contingencyPercent: 5,
    holdingFuelLiters: 11.3,
    reserveFuelLiters: 11.3,
    customAlternateFuelLiters: 18.6,
    roundOffValues: true,
    departureDate: '2026-10-31',
    airborneTime: '06:00',
    selectedAltitudeFt: 4500,
    magneticVariationDeg: -2,
    globalTrackOverrideDeg: null,
    alternate: {
      name: 'VOBG',
      lat: 12.9499,
      lng: 77.6682,
      windDir: 270,
      windSpd: 14,
    },
  };

  const summary = computeNavLog(waypoints, config, {});
  assert.equal(Number.isInteger(summary.legs[0].legDistNm), true);
  assert.equal(Number.isInteger(summary.legs[0].timeTakenMin), true);
  assert.equal(Number.isInteger(summary.legs[0].fuelEstLiters), true);
  assert.equal(summary.fuelPlan.isCustomAlternateFuel, true);
  assert.equal(summary.fuelPlan.alternateFuelLiters, 19); // 18.6 rounded
  assert.equal(Number.isInteger(summary.fuelPlan.totalBlockFuelRequiredLiters), true);
});

test('computeNavLog calculates alternate leg from DEP or DEST based on alternateFrom choice, and does not take auto alternate when alternate is null', async () => {
  const { PRESET_ROUTES } = await import('./presetRoutes');
  for (const preset of PRESET_ROUTES) {
    assert.equal(
      preset.config.alternate,
      null,
      `Preset ${preset.id} should not auto-populate an alternate aerodrome`
    );
  }

  const waypoints: Waypoint[] = [
    { id: 'w1', name: 'VOCL (CALICUT)', lat: 11.1368, lng: 75.9553, windDir: 270, windSpd: 14 },
    { id: 'w2', name: 'NILAMBUR', lat: 11.2789, lng: 76.2255, windDir: 280, windSpd: 16 },
    { id: 'w3', name: 'VOMY (MYSORE)', lat: 12.23, lng: 76.6558, windDir: 265, windSpd: 15 },
  ];

  const baseConfig: FlightConfig = {
    cruiseTasKt: 85,
    fuelFlowLph: 15,
    initialFuelLiters: 120,
    taxiFuelLiters: 5,
    contingencyPercent: 5,
    holdingFuelLiters: 11.3,
    reserveFuelLiters: 11.3,
    departureDate: '2026-10-31',
    airborneTime: '06:00',
    selectedAltitudeFt: 5000,
    magneticVariationDeg: -1.5,
    globalTrackOverrideDeg: null,
    alternate: null,
    alternateFrom: 'DEST',
  };

  // 1. When alternate is null, no alternate leg or alternate fuel is calculated
  const noAltSummary = computeNavLog(waypoints, baseConfig, {});
  assert.equal(noAltSummary.alternateLeg, null);
  assert.equal(noAltSummary.fuelPlan.alternateFuelLiters, 0);

  const selectedAlternate = {
    name: 'VOBG (HAL Bengaluru)',
    lat: 12.9499,
    lng: 77.6682,
    windDir: 270,
    windSpd: 14,
  };

  // 2. Calculate Alternate Data from DEST (VOMY -> VOBG)
  const fromDestSummary = computeNavLog(
    waypoints,
    { ...baseConfig, alternate: selectedAlternate, alternateFrom: 'DEST' },
    {}
  );
  assert.ok(fromDestSummary.alternateLeg !== null);
  assert.equal(fromDestSummary.alternateLeg?.fromRole, 'DEST');
  assert.equal(fromDestSummary.alternateLeg?.fromName, 'VOMY (MYSORE)');
  assert.equal(fromDestSummary.alternateLeg?.toName, 'VOBG (HAL Bengaluru)');

  // 3. Calculate Alternate Data from DEP (VOCL -> VOBG)
  const fromDepSummary = computeNavLog(
    waypoints,
    { ...baseConfig, alternate: selectedAlternate, alternateFrom: 'DEP' },
    {}
  );
  assert.ok(fromDepSummary.alternateLeg !== null);
  assert.equal(fromDepSummary.alternateLeg?.fromRole, 'DEP');
  assert.equal(fromDepSummary.alternateLeg?.fromName, 'VOCL (CALICUT)');
  assert.equal(fromDepSummary.alternateLeg?.toName, 'VOBG (HAL Bengaluru)');

  // VOCL -> VOBG (~147.8 NM) is significantly longer than VOMY -> VOBG (~72.4 NM)
  assert.ok(
    (fromDepSummary.alternateLeg?.distanceNm || 0) >
      (fromDestSummary.alternateLeg?.distanceNm || 0) + 50
  );
  assert.ok(
    fromDepSummary.fuelPlan.alternateFuelLiters >
      fromDestSummary.fuelPlan.alternateFuelLiters
  );
});

test('computeRouteWeatherBounds and interpolateWeatherAtCoord compute free weather map grid bounds and interpolate upper-air vectors accurately', async () => {
  const { computeRouteWeatherBounds, interpolateWeatherAtCoord } = await import(
    './navlogMath'
  );
  const bounds = computeRouteWeatherBounds(
    [
      { lat: 11.1368, lng: 75.9553 },
      { lat: 12.23, lng: 76.6558 },
    ],
    { lat: 12.9499, lng: 77.6682 }
  );
  assert.ok(bounds.minLat < 11.1368);
  assert.ok(bounds.maxLat > 12.9499);
  assert.ok(bounds.minLng < 75.9553);
  assert.ok(bounds.maxLng > 77.6682);

  const sampleGrid = [
    {
      lat: 11.0,
      lng: 76.0,
      windDir: 270,
      windSpd: 14,
      tempC: 12.0,
      cloudCoverPct: 30,
      precipMm: 0,
    },
    {
      lat: 12.0,
      lng: 77.0,
      windDir: 290,
      windSpd: 22,
      tempC: 8.0,
      cloudCoverPct: 70,
      precipMm: 1.2,
    },
  ];

  // Exact node match
  const exact = interpolateWeatherAtCoord(sampleGrid, 11.0, 76.0);
  assert.equal(exact.windDir, 270);
  assert.equal(exact.windSpd, 14);
  assert.equal(exact.tempC, 12.0);

  // Midpoint interpolation
  const mid = interpolateWeatherAtCoord(sampleGrid, 11.5, 76.5);
  assert.ok(mid.windDir >= 278 && mid.windDir <= 284);
  assert.equal(mid.windSpd, 18);
  assert.equal(mid.tempC, 10.0);
  assert.equal(mid.cloudCoverPct, 50);
});

test('getImdChannelById and formatImdScanTimestamps resolve IMD INSAT channels and format UTC/IST timestamps', async () => {
  const { IMD_SATELLITE_CHANNELS, getImdChannelById, formatImdScanTimestamps } =
    await import('./navlogMath');

  assert.ok(IMD_SATELLITE_CHANNELS.length >= 7);

  const ctbt = getImdChannelById('asia_ctbt');
  assert.equal(ctbt.id, 'asia_ctbt');
  assert.equal(
    ctbt.upstreamUrl,
    'https://mausam.imd.gov.in/Satellite/3Dasiasec_ctbt.jpg'
  );

  const fallback = getImdChannelById('unknown_channel');
  assert.equal(fallback.id, 'asia_ir1');

  // Verify HTTP Last-Modified formatting into both UTC and IST (UTC+05:30)
  const lastModHeader = 'Sat, 31 Oct 2026 22:00:00 GMT';
  const refNow = new Date('2026-10-31T22:25:00Z');
  const formatted = formatImdScanTimestamps(lastModHeader, refNow);

  assert.equal(formatted.utcString, '2026-10-31 22:00 UTC');
  assert.equal(formatted.istString, '2026-11-01 03:30 IST');
  assert.equal(formatted.ageMinutes, 25);
});

test('weatherClient helpers resolve Open-Meteo pressure levels, hourly timestamps, synoptic grids, and IMD multi-CDN candidate URLs for Vercel static builds', async () => {
  const {
    getOpenMeteoQueryHpa,
    parseTargetDateTime,
    resolveHourlyTimeIndex,
    generateInitialSynopticGrid,
    buildImdCandidateUrls,
  } = await import('./weatherClient');

  // Verify intermediate pressure levels (950, 900, 800 hPa) map cleanly to supported ECMWF/GFS levels
  assert.equal(getOpenMeteoQueryHpa(1000), 1000);
  assert.equal(getOpenMeteoQueryHpa(950), 925);
  assert.equal(getOpenMeteoQueryHpa(925), 925);
  assert.equal(getOpenMeteoQueryHpa(850), 850);
  assert.equal(getOpenMeteoQueryHpa(700), 700);
  assert.equal(getOpenMeteoQueryHpa(500), 500);

  // Verify hourly time index matching when exact date is outside forecast window
  const dt = parseTargetDateTime('2026-11-01', '06:15');
  assert.equal(dt.roundedHour, 6);
  const sampleTimes = [
    '2025-05-10T05:00',
    '2025-05-10T06:00',
    '2025-05-11T06:00',
    '2025-05-12T06:00',
  ];
  const resolved = resolveHourlyTimeIndex(sampleTimes, dt);
  assert.equal(sampleTimes[resolved.index].endsWith('T06:00'), true);
  assert.equal(resolved.isDateFallback, true);

  // Verify initial 5x5 synoptic grid generation
  const grid = generateInitialSynopticGrid({
    minLat: 10.5,
    maxLat: 12.5,
    minLng: 75.5,
    maxLng: 77.5,
    rows: 5,
    cols: 5,
    altitudeFt: 5000,
    departureDate: '2026-11-01',
    departureTime: '06:00',
    windModel: 'ecmwf_ifs025',
  });
  assert.equal(grid.nodes.length, 25);
  assert.ok(grid.nodes[0].windSpd > 0);

  // Verify IMD candidate URLs include wsrv.nl SSL/CORS proxy, direct mausam.imd.gov.in URL, and SVG data URI fallback
  const urls = buildImdCandidateUrls('asia_ir1', 2, [
    { id: 'w1', name: 'VOCL', lat: 11.1368, lng: 75.9553 },
  ]);
  assert.ok(urls.length >= 4);
  assert.ok(urls[0].startsWith('https://wsrv.nl/?url='));
  assert.ok(urls[1].startsWith('https://mausam.imd.gov.in/Satellite/3Dasiasec_ir1.jpg'));
  assert.ok(urls[urls.length - 1].startsWith('data:image/svg+xml;utf8,'));
});

test('aviationMapUtils projects Web Mercator coordinates reversibly and searches Indian aerodromes', async () => {
  const {
    latLngToWorldPixel,
    worldPixelToLatLng,
    computeBestFitZoomAndCenter,
    filterLocalAerodromes,
  } = await import('./aviationMapUtils');

  const px = latLngToWorldPixel(11.1368, 75.9553, 9);
  const back = worldPixelToLatLng(px.x, px.y, 9);
  assert.ok(Math.abs(back.lat - 11.1368) < 0.002);
  assert.ok(Math.abs(back.lng - 75.9553) < 0.002);

  const fit = computeBestFitZoomAndCenter([
    { lat: 11.1368, lng: 75.9553 },
    { lat: 12.23, lng: 76.6558 },
  ]);
  assert.ok(fit.zoom >= 6 && fit.zoom <= 11);

  const matches = filterLocalAerodromes('VOCL');
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].code, 'VOCL');
});

test('straight-line track mode snaps intermediate waypoints onto the DEP-DEST line, orders them from DEP to DEST, and keepsfreeform mode off-track', async () => {
  const {
    interpolatePointAlongLine,
    projectPointOntoStraightLine,
    snapWaypointsToStraightLine,
    restoreFreeformWaypoints,
    insertEnRouteWaypoint,
    updateEndpointWaypoint,
    generateWaypointsAlongStraightLine,
  } = await import('./navlogMath');

  const dep: Waypoint = {
    id: 'dep',
    name: 'VOCL (CALICUT)',
    lat: 11.0,
    lng: 76.0,
    windDir: 270,
    windSpd: 14,
  };
  const dest: Waypoint = {
    id: 'dest',
    name: 'VOMY (MYSORE)',
    lat: 12.0,
    lng: 77.0,
    windDir: 265,
    windSpd: 15,
  };

  // 1. Midpoint interpolation (50%)
  const mid = interpolatePointAlongLine(dep, dest, 0.5);
  assert.equal(mid.lat, 11.5);
  assert.equal(mid.lng, 76.5);
  assert.equal(mid.t, 0.5);

  // 2. Project an off-track point onto the diagonal line (lat = 11 + t, lng = 76 + t)
  const offTrack = projectPointOntoStraightLine(dep, dest, 11.3, 76.9);
  assert.ok(Math.abs(offTrack.lat - 11.0 - (offTrack.lng - 76.0)) < 0.001);
  assert.ok(offTrack.crossTrackDistanceNm > 10);

  // 3. Insert multiple waypoints in Straight-Line mode out of geographical order:
  // Add a point at ~75% first, then a point at ~25%
  let route: Waypoint[] = [dep, dest];
  route = insertEnRouteWaypoint(
    route,
    { id: 'w-75', name: 'GUNDLUPET', lat: 11.8, lng: 76.65 },
    'straight'
  );
  route = insertEnRouteWaypoint(
    route,
    { id: 'w-25', name: 'NILAMBUR', lat: 11.2, lng: 76.35 },
    'straight'
  );

  assert.equal(route.length, 4);
  assert.equal(route[0].name, 'VOCL (CALICUT)');
  // Because w-25 is closer to DEP than w-75, straight-line snapping sorts w-25 before w-75
  assert.equal(route[1].name, 'NILAMBUR');
  assert.equal(route[2].name, 'GUNDLUPET');
  assert.equal(route[3].name, 'VOMY (MYSORE)');

  // Both intermediate waypoints must lie on the straight line y = x (lat - 11 === lng - 76)
  for (const wp of route.slice(1, 3)) {
    const dLat = wp.lat - dep.lat;
    const dLng = wp.lng - dep.lng;
    assert.ok(
      Math.abs(dLat - dLng) < 0.0005,
      `Waypoint ${wp.name} (${wp.lat}, ${wp.lng}) should stick to straight line`
    );
  }

  // 4. Restore freeform coordinates restores original off-track positions
  const restored = restoreFreeformWaypoints(route);
  const nilamburRestored = restored.find((w) => w.name === 'NILAMBUR')!;
  assert.equal(nilamburRestored.lat, 11.2);
  assert.equal(nilamburRestored.lng, 76.35);

  // 5. Updating Destination in Straight-Line mode re-sticks intermediate waypoints to the new line
  const newDest: Waypoint = {
    id: 'dest-2',
    name: 'VOBG (BENGALURU)',
    lat: 13.0,
    lng: 78.0,
  };
  const updatedLine = updateEndpointWaypoint(route, 'DEST', newDest, 'straight');
  assert.equal(updatedLine[updatedLine.length - 1].name, 'VOBG (BENGALURU)');
  for (const wp of updatedLine.slice(1, 3)) {
    const ratioLat = (wp.lat - dep.lat) / (newDest.lat - dep.lat);
    const ratioLng = (wp.lng - dep.lng) / (newDest.lng - dep.lng);
    assert.ok(Math.abs(ratioLat - ratioLng) < 0.001);
  }

  // 6. Generate 3 evenly spaced waypoints along the straight line (25%, 50%, 75%)
  const generated = generateWaypointsAlongStraightLine(dep, dest, 3);
  assert.equal(generated.length, 5); // DEP + 3 WPTs + DEST
  assert.equal(generated[1].lat, 11.25);
  assert.equal(generated[2].lat, 11.5);
  assert.equal(generated[3].lat, 11.75);
});

test('roundWindDirToTenDeg rounds all received and interpolated wind directions to nearest 10th degree', async () => {
  assert.equal(roundWindDirToTenDeg(77), 80);
  assert.equal(roundWindDirToTenDeg(73), 70);
  assert.equal(roundWindDirToTenDeg(65), 70);
  assert.equal(roundWindDirToTenDeg(268), 270);
  assert.equal(roundWindDirToTenDeg(354), 350);
  assert.equal(roundWindDirToTenDeg(355), 0);
  assert.equal(roundWindDirToTenDeg(359), 0);
  assert.equal(roundWindDirToTenDeg(4), 0);
  assert.equal(roundWindDirToTenDeg(-8), 350);

  // Weather grid interpolation also rounds to nearest 10th degree
  const interp = interpolateWeatherAtCoord(
    [
      { lat: 15.0, lng: 76.0, windDir: 77, windSpd: 14, tempC: 16, cloudCoverPct: 30, precipMm: 0 },
      { lat: 16.0, lng: 77.0, windDir: 83, windSpd: 16, tempC: 15, cloudCoverPct: 40, precipMm: 0 },
    ],
    15.5,
    76.5
  );
  assert.ok(interp);
  assert.equal(interp.windDir % 10, 0);
  assert.equal(interp.windDir, 80);

  // Synoptic fallback node in weatherClient also produces a multiple of 10 degrees
  const { buildSynopticGridNode, parseTargetDateTime } = await import('./weatherClient');
  const dt = parseTargetDateTime('2026-11-02', '09:30');
  const synopticNode = buildSynopticGridNode(17.3056, 76.9531, 5000, dt, 'ecmwf_ifs025');
  assert.equal(synopticNode.windDir % 10, 0);
});
