import {
  WIND_MODEL_OPTIONS,
  WindModelId,
  WeatherGridNode,
  getClosestAltitudeLevel,
  normalizeDegrees,
  roundWindDirectionDeg,
  getImdChannelById,
  formatImdScanTimestamps,
  ImdSatelliteChannelId,
  Waypoint,
  AlternateAerodrome,
} from './navlogMath';

export interface WindPointRequest {
  id: string;
  lat: number;
  lng: number;
}

export interface WindPointResponse {
  id: string;
  lat: number;
  lng: number;
  altitudeFt: number;
  pressureHpa: number;
  windyLevel: string;
  windDir: number; // Degrees True (0-359)
  windSpd: number; // Knots
  source: string;
  departureDate: string;
  departureTime: string;
}

export interface ParsedTargetDateTime {
  safeDate: string;
  formattedTime: string;
  hour: number;
  minute: number;
  roundedHour: number;
  isoHourPrefix: string;
  hourSuffix: string;
  targetTimestampMs: number;
  dayOfYear: number;
}

/**
 * Map any pressure level (including 950, 900, 800 hPa) to a pressure level
 * universally supported across all Open-Meteo NWP models (including ecmwf_ifs025).
 */
export function getOpenMeteoQueryHpa(pressureHpa: number): number {
  const supported = [1000, 925, 850, 700, 600, 500];
  let best = supported[0];
  let minDiff = Math.abs(pressureHpa - best);
  for (const h of supported) {
    const d = Math.abs(pressureHpa - h);
    if (d < minDiff) {
      minDiff = d;
      best = h;
    }
  }
  return best;
}

/**
 * Parse YYYY-MM-DD and HH:MM in Indian Standard Time (IST, UTC+05:30)
 */
export function parseTargetDateTime(
  departureDate?: string,
  departureTime?: string
): ParsedTargetDateTime {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const defaultIstDate = istNow.toISOString().slice(0, 10);
  const defaultIstTime = istNow.toISOString().slice(11, 16);

  const safeDate =
    departureDate && /^\d{4}-\d{2}-\d{2}$/.test(departureDate.trim())
      ? departureDate.trim()
      : defaultIstDate;

  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(
    (departureTime || defaultIstTime).trim()
  );
  const hour = timeMatch ? Math.min(23, Math.max(0, parseInt(timeMatch[1], 10))) : 6;
  const minute = timeMatch ? Math.min(59, Math.max(0, parseInt(timeMatch[2], 10))) : 30;
  const roundedHour = minute >= 30 ? (hour + 1) % 24 : hour;

  const paddedHour = String(hour).padStart(2, '0');
  const paddedMin = String(minute).padStart(2, '0');
  const formattedTime = `${paddedHour}:${paddedMin}`;
  const hourSuffix = `T${String(roundedHour).padStart(2, '0')}:00`;
  const isoHourPrefix = `${safeDate}${hourSuffix}`;

  const parsedMs = Date.parse(`${safeDate}T${formattedTime}:00+05:30`);
  const targetTimestampMs = isNaN(parsedMs) ? Date.now() : parsedMs;

  const [yr, mo, dy] = safeDate.split('-').map(Number);
  const dayOfYear = Math.floor(
    (Date.UTC(yr, (mo || 1) - 1, dy || 1) - Date.UTC(yr, 0, 0)) / 86400000
  );

  return {
    safeDate,
    formattedTime,
    hour,
    minute,
    roundedHour,
    isoHourPrefix,
    hourSuffix,
    targetTimestampMs,
    dayOfYear,
  };
}

/**
 * Find the best matching hourly index in Open-Meteo's `hourly.time` array.
 * Prefers exact YYYY-MM-DDTHH:00 match; if the date is outside Open-Meteo's forecast window,
 * picks the current/middle forecast day at the same IST hour (`THH:00`).
 */
export function resolveHourlyTimeIndex(
  timeArr: string[] | undefined,
  dt: ParsedTargetDateTime
): { index: number; isDateFallback: boolean } {
  if (!Array.isArray(timeArr) || timeArr.length === 0) {
    return { index: dt.roundedHour, isDateFallback: true };
  }
  const exactIdx = timeArr.findIndex((t) => t.startsWith(dt.isoHourPrefix));
  if (exactIdx >= 0) {
    return { index: exactIdx, isDateFallback: false };
  }
  // Find all indices matching the target hour-of-day (e.g. "T06:00")
  const sameHourIndices: number[] = [];
  for (let i = 0; i < timeArr.length; i++) {
    if (timeArr[i].endsWith(dt.hourSuffix)) {
      sameHourIndices.push(i);
    }
  }
  if (sameHourIndices.length > 0) {
    // Pick index closest to today (index ~2 when past_days=2)
    const preferred = sameHourIndices[Math.min(2, sameHourIndices.length - 1)];
    return { index: preferred, isDateFallback: true };
  }
  return {
    index: Math.min(dt.roundedHour, timeArr.length - 1),
    isDateFallback: true,
  };
}

/**
 * Deterministic synoptic upper-air wind and weather node parameterized by
 * coordinate, altitude, windModel, departureDate, and departureTime (IST).
 */
export function buildSynopticGridNode(
  lat: number,
  lng: number,
  altitudeFt: number,
  dt: ParsedTargetDateTime,
  windModel: WindModelId = 'ecmwf_ifs025'
): WeatherGridNode {
  const altFactor = Math.max(1, altitudeFt / 1000);
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const seasonalRad = ((dt.dayOfYear % 365) / 365) * 2 * Math.PI;
  const diurnalRad = ((dt.hour + dt.minute / 60) / 24) * 2 * Math.PI;

  const modelDirOffset =
    windModel === 'gfs_seamless'
      ? -12
      : windModel === 'icon_seamless'
      ? 9
      : windModel === 'best_match'
      ? -4
      : 0;
  const modelSpdOffset =
    windModel === 'gfs_seamless'
      ? -2
      : windModel === 'icon_seamless'
      ? 3
      : windModel === 'best_match'
      ? 1
      : 0;

  const windDir = roundWindDirectionDeg(
    250 +
      modelDirOffset +
      Math.round(
        Math.sin(latRad * 3 + lngRad * 2 + seasonalRad) * 35 +
          Math.cos(diurnalRad) * 14 +
          altFactor * 2.5
      )
  );
  const windSpd = Math.max(
    4,
    Math.round(
      10 +
        modelSpdOffset +
        altFactor * 2.2 +
        Math.cos(latRad * 2 - lngRad + seasonalRad) * 5 +
        Math.sin(diurnalRad) * 4
    )
  );

  const isaBaseTemp = 26 - altFactor * 1.98;
  const tempC =
    Math.round(
      (isaBaseTemp +
        Math.sin(latRad * 2 + diurnalRad) * 2.2 +
        modelSpdOffset * 0.4) *
        10
    ) / 10;

  const cloudCoverPct = Math.min(
    100,
    Math.max(
      5,
      Math.round(
        42 +
          Math.sin(latRad * 4 - lngRad * 3 + diurnalRad) * 32 +
          Math.cos(seasonalRad) * 12
      )
    )
  );
  const precipMm =
    cloudCoverPct > 68
      ? Math.round((cloudCoverPct - 65) * 0.14 * 10) / 10
      : 0;

  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    windDir,
    windSpd,
    tempC,
    cloudCoverPct,
    precipMm,
  };
}

/**
 * Fetch upper-air winds for a single point directly from Open-Meteo HTTPS API (works on Vercel & browser)
 */
export async function fetchUpperAirWindForPointClient(
  pt: WindPointRequest,
  altitudeFt: number,
  departureDate?: string,
  departureTime?: string,
  windModel: WindModelId = 'ecmwf_ifs025'
): Promise<WindPointResponse> {
  const levelInfo = getClosestAltitudeLevel(altitudeFt);
  const queryHpa = getOpenMeteoQueryHpa(levelInfo.pressureHpa);
  const dt = parseTargetDateTime(departureDate, departureTime);
  const modelMeta =
    WIND_MODEL_OPTIONS.find((m) => m.id === windModel) || WIND_MODEL_OPTIONS[1];

  try {
    const spdParam = `wind_speed_${queryHpa}hPa`;
    const dirParam = `wind_direction_${queryHpa}hPa`;
    const isBlend = !windModel || windModel === 'best_match';
    const modelParam = isBlend
      ? '&models=ecmwf_ifs025,gfs_seamless,icon_seamless'
      : `&models=${windModel}`;
    const forecastDays = windModel === 'icon_seamless' || isBlend ? 7 : 10;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat.toFixed(
      4
    )}&longitude=${pt.lng.toFixed(
      4
    )}&hourly=${spdParam},${dirParam}&wind_speed_unit=kn&timezone=Asia%2FKolkata&past_days=2&forecast_days=${forecastDays}${modelParam}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
    if (res.ok) {
      const data = (await res.json()) as {
        hourly?: {
          time?: string[];
          [key: string]: number[] | string[] | undefined;
        };
      };

      const { index: targetIdx } = resolveHourlyTimeIndex(
        data.hourly?.time,
        dt
      );

      let resolvedSpd: number | undefined;
      let resolvedDir: number | undefined;

      if (isBlend && data.hourly) {
        const subModels = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'];
        const speeds: number[] = [];
        let sinSum = 0;
        let cosSum = 0;
        for (const sm of subModels) {
          const sArr = data.hourly[`${spdParam}_${sm}`] as number[] | undefined;
          const dArr = data.hourly[`${dirParam}_${sm}`] as number[] | undefined;
          const sVal = Array.isArray(sArr) ? sArr[targetIdx] : undefined;
          const dVal = Array.isArray(dArr) ? dArr[targetIdx] : undefined;
          if (typeof sVal === 'number' && typeof dVal === 'number') {
            speeds.push(sVal);
            const rad = (dVal * Math.PI) / 180;
            sinSum += Math.sin(rad);
            cosSum += Math.cos(rad);
          }
        }
        if (speeds.length > 0) {
          resolvedSpd = speeds.reduce((a, b) => a + b, 0) / speeds.length;
          resolvedDir = normalizeDegrees((Math.atan2(sinSum, cosSum) * 180) / Math.PI);
        }
      } else if (data.hourly) {
        const spdArr = (data.hourly[spdParam] ??
          data.hourly[`${spdParam}_${windModel}`]) as number[] | undefined;
        const dirArr = (data.hourly[dirParam] ??
          data.hourly[`${dirParam}_${windModel}`]) as number[] | undefined;
        if (
          Array.isArray(spdArr) &&
          Array.isArray(dirArr) &&
          typeof spdArr[targetIdx] === 'number' &&
          typeof dirArr[targetIdx] === 'number'
        ) {
          resolvedSpd = spdArr[targetIdx];
          resolvedDir = dirArr[targetIdx];
        }
      }

      if (typeof resolvedSpd === 'number' && typeof resolvedDir === 'number') {
        return {
          id: pt.id,
          lat: pt.lat,
          lng: pt.lng,
          altitudeFt: levelInfo.altitudeFt,
          pressureHpa: levelInfo.pressureHpa,
          windyLevel: levelInfo.windyLevel,
          windDir: roundWindDirectionDeg(resolvedDir),
          windSpd: Math.max(0, Math.round(resolvedSpd)),
          source: `${modelMeta.shortLabel} (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`,
          departureDate: dt.safeDate,
          departureTime: dt.formattedTime,
        };
      }
    }
  } catch {
    // Fall through to deterministic synoptic profile
  }

  const synoptic = buildSynopticGridNode(
    pt.lat,
    pt.lng,
    altitudeFt,
    dt,
    windModel
  );
  return {
    id: pt.id,
    lat: pt.lat,
    lng: pt.lng,
    altitudeFt: levelInfo.altitudeFt,
    pressureHpa: levelInfo.pressureHpa,
    windyLevel: levelInfo.windyLevel,
    windDir: synoptic.windDir,
    windSpd: synoptic.windSpd,
    source: `${modelMeta.shortLabel} (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`,
    departureDate: dt.safeDate,
    departureTime: dt.formattedTime,
  };
}

const clientWindPointCache = new Map<
  string,
  { timestamp: number; windDir: number; windSpd: number; source: string }
>();

/**
 * Fetch upper-air winds for all waypoints directly in the browser using a single batched
 * Open-Meteo request (plus caching) so multiple waypoints never trigger HTTP 429.
 */
export async function fetchUpperAirWindsBatchClient(params: {
  points: WindPointRequest[];
  altitudeFt: number;
  departureDate?: string;
  departureTime?: string;
  windModel?: WindModelId;
}): Promise<{
  altitudeFt: number;
  departureDate: string;
  departureTime: string;
  windModel: WindModelId;
  level: ReturnType<typeof getClosestAltitudeLevel>;
  winds: WindPointResponse[];
}> {
  const safeAlt = Number(params.altitudeFt) || 5000;
  const safeModel: WindModelId = params.windModel || 'ecmwf_ifs025';
  const levelInfo = getClosestAltitudeLevel(safeAlt);
  const queryHpa = getOpenMeteoQueryHpa(levelInfo.pressureHpa);
  const dt = parseTargetDateTime(params.departureDate, params.departureTime);
  const modelMeta =
    WIND_MODEL_OPTIONS.find((m) => m.id === safeModel) || WIND_MODEL_OPTIONS[1];

  if (params.points.length === 0) {
    return {
      altitudeFt: safeAlt,
      departureDate: dt.safeDate,
      departureTime: dt.formattedTime,
      windModel: safeModel,
      level: levelInfo,
      winds: [],
    };
  }

  const makePointKey = (pt: WindPointRequest) =>
    `${pt.lat.toFixed(3)}|${pt.lng.toFixed(3)}|${levelInfo.pressureHpa}|${dt.safeDate}|${dt.roundedHour}|${safeModel}`;

  const uncachedPoints = params.points.filter((pt) => {
    const cached = clientWindPointCache.get(makePointKey(pt));
    return !cached || Date.now() - cached.timestamp >= 5 * 60 * 1000;
  });

  if (uncachedPoints.length > 0) {
    try {
      const spdParam = `wind_speed_${queryHpa}hPa`;
      const dirParam = `wind_direction_${queryHpa}hPa`;
      const isBlend = !safeModel || safeModel === 'best_match';
      const modelParam = isBlend
        ? '&models=ecmwf_ifs025,gfs_seamless,icon_seamless'
        : `&models=${safeModel}`;
      const forecastDays = safeModel === 'icon_seamless' || isBlend ? 7 : 10;

      const latList = uncachedPoints.map((p) => p.lat.toFixed(4)).join(',');
      const lngList = uncachedPoints.map((p) => p.lng.toFixed(4)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latList}&longitude=${lngList}&hourly=${spdParam},${dirParam}&wind_speed_unit=kn&timezone=Asia%2FKolkata&past_days=2&forecast_days=${forecastDays}${modelParam}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
      if (res.ok) {
        const rawJson = await res.json();
        const items = Array.isArray(rawJson) ? rawJson : [rawJson];
        if (items.length === uncachedPoints.length) {
          for (let i = 0; i < uncachedPoints.length; i++) {
            const pt = uncachedPoints[i];
            const data = items[i] as {
              hourly?: {
                time?: string[];
                [key: string]: number[] | string[] | undefined;
              };
            };
            const { index: targetIdx } = resolveHourlyTimeIndex(
              data?.hourly?.time,
              dt
            );
            let resolvedSpd: number | undefined;
            let resolvedDir: number | undefined;

            if (isBlend && data?.hourly) {
              const subModels = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'];
              const speeds: number[] = [];
              let sinSum = 0;
              let cosSum = 0;
              for (const sm of subModels) {
                const sArr = data.hourly[`${spdParam}_${sm}`] as number[] | undefined;
                const dArr = data.hourly[`${dirParam}_${sm}`] as number[] | undefined;
                const sVal = Array.isArray(sArr) ? sArr[targetIdx] : undefined;
                const dVal = Array.isArray(dArr) ? dArr[targetIdx] : undefined;
                if (typeof sVal === 'number' && typeof dVal === 'number') {
                  speeds.push(sVal);
                  const rad = (dVal * Math.PI) / 180;
                  sinSum += Math.sin(rad);
                  cosSum += Math.cos(rad);
                }
              }
              if (speeds.length > 0) {
                resolvedSpd = speeds.reduce((a, b) => a + b, 0) / speeds.length;
                resolvedDir = normalizeDegrees((Math.atan2(sinSum, cosSum) * 180) / Math.PI);
              }
            } else if (data?.hourly) {
              const spdArr = (data.hourly[spdParam] ??
                data.hourly[`${spdParam}_${safeModel}`]) as number[] | undefined;
              const dirArr = (data.hourly[dirParam] ??
                data.hourly[`${dirParam}_${safeModel}`]) as number[] | undefined;
              if (
                Array.isArray(spdArr) &&
                Array.isArray(dirArr) &&
                typeof spdArr[targetIdx] === 'number' &&
                typeof dirArr[targetIdx] === 'number'
              ) {
                resolvedSpd = spdArr[targetIdx];
                resolvedDir = dirArr[targetIdx];
              }
            }

            if (typeof resolvedSpd === 'number' && typeof resolvedDir === 'number') {
              clientWindPointCache.set(makePointKey(pt), {
                timestamp: Date.now(),
                windDir: roundWindDirectionDeg(resolvedDir),
                windSpd: Math.max(0, Math.round(resolvedSpd)),
                source: `${modelMeta.shortLabel} (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`,
              });
            }
          }
        }
      }
    } catch {
      // Fall back to synoptic per-point calculation below
    }
  }

  const winds: WindPointResponse[] = params.points.map((pt) => {
    const cached = clientWindPointCache.get(makePointKey(pt));
    if (cached) {
      return {
        id: pt.id,
        lat: pt.lat,
        lng: pt.lng,
        altitudeFt: levelInfo.altitudeFt,
        pressureHpa: levelInfo.pressureHpa,
        windyLevel: levelInfo.windyLevel,
        windDir: roundWindDirectionDeg(cached.windDir),
        windSpd: cached.windSpd,
        source: cached.source,
        departureDate: dt.safeDate,
        departureTime: dt.formattedTime,
      };
    }

    const synoptic = buildSynopticGridNode(
      pt.lat,
      pt.lng,
      safeAlt,
      dt,
      safeModel
    );
    return {
      id: pt.id,
      lat: pt.lat,
      lng: pt.lng,
      altitudeFt: levelInfo.altitudeFt,
      pressureHpa: levelInfo.pressureHpa,
      windyLevel: levelInfo.windyLevel,
      windDir: roundWindDirectionDeg(synoptic.windDir),
      windSpd: synoptic.windSpd,
      source: `${modelMeta.shortLabel} (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`,
      departureDate: dt.safeDate,
      departureTime: dt.formattedTime,
    };
  });

  return {
    altitudeFt: safeAlt,
    departureDate: dt.safeDate,
    departureTime: dt.formattedTime,
    windModel: safeModel,
    level: levelInfo,
    winds,
  };
}

const clientWeatherGridCache = new Map<
  string,
  { timestamp: number; source: string; nodes: WeatherGridNode[] }
>();

/**
 * Generate initial deterministic synoptic 5x5 weather grid nodes synchronously so the Weather Map
 * renders streamlines, wind barbs, and heatmaps immediately even before network completes.
 */
export function generateInitialSynopticGrid(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  rows?: number;
  cols?: number;
  altitudeFt: number;
  departureDate?: string;
  departureTime?: string;
  windModel?: WindModelId;
}): { source: string; nodes: WeatherGridNode[] } {
  const safeRows = Math.min(6, Math.max(3, Number(params.rows) || 5));
  const safeCols = Math.min(6, Math.max(3, Number(params.cols) || 5));
  const levelInfo = getClosestAltitudeLevel(Number(params.altitudeFt) || 5000);
  const dt = parseTargetDateTime(params.departureDate, params.departureTime);
  const windModel = params.windModel || 'ecmwf_ifs025';
  const modelMeta =
    WIND_MODEL_OPTIONS.find((m) => m.id === windModel) || WIND_MODEL_OPTIONS[1];

  const nodes: WeatherGridNode[] = [];
  for (let r = 0; r < safeRows; r++) {
    const lat =
      safeRows === 1
        ? (params.minLat + params.maxLat) / 2
        : params.minLat + ((params.maxLat - params.minLat) * r) / (safeRows - 1);
    for (let c = 0; c < safeCols; c++) {
      const lng =
        safeCols === 1
          ? (params.minLng + params.maxLng) / 2
          : params.minLng + ((params.maxLng - params.minLng) * c) / (safeCols - 1);
      nodes.push(
        buildSynopticGridNode(
          Number(lat.toFixed(4)),
          Number(lng.toFixed(4)),
          levelInfo.altitudeFt,
          dt,
          windModel
        )
      );
    }
  }

  return {
    source: `${modelMeta.shortLabel} Upper-Air Grid (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`,
    nodes,
  };
}

/**
 * Fetch 5x5 Open-Meteo upper-air weather grid directly from browser over HTTPS (works on Vercel & localhost)
 */
export async function fetchWeatherGridClient(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  rows?: number;
  cols?: number;
  altitudeFt: number;
  departureDate?: string;
  departureTime?: string;
  windModel?: WindModelId;
}): Promise<{ source: string; nodes: WeatherGridNode[] }> {
  const safeRows = Math.min(6, Math.max(3, Number(params.rows) || 5));
  const safeCols = Math.min(6, Math.max(3, Number(params.cols) || 5));
  const levelInfo = getClosestAltitudeLevel(Number(params.altitudeFt) || 5000);
  const queryHpa = getOpenMeteoQueryHpa(levelInfo.pressureHpa);
  const dt = parseTargetDateTime(params.departureDate, params.departureTime);
  const windModel = params.windModel || 'ecmwf_ifs025';
  const modelMeta =
    WIND_MODEL_OPTIONS.find((m) => m.id === windModel) || WIND_MODEL_OPTIONS[1];

  const cacheKey = [
    params.minLat.toFixed(2),
    params.maxLat.toFixed(2),
    params.minLng.toFixed(2),
    params.maxLng.toFixed(2),
    safeRows,
    safeCols,
    levelInfo.pressureHpa,
    dt.safeDate,
    dt.roundedHour,
    windModel,
  ].join('|');

  const cached = clientWeatherGridCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return { source: cached.source, nodes: cached.nodes };
  }

  const initial = generateInitialSynopticGrid(params);
  const coords = initial.nodes.map((n) => ({ lat: n.lat, lng: n.lng }));

  const spdParam = `wind_speed_${queryHpa}hPa`;
  const dirParam = `wind_direction_${queryHpa}hPa`;
  const tempParam = `temperature_${queryHpa}hPa`;
  const isBlend = !windModel || windModel === 'best_match';
  const actualModel = isBlend ? 'gfs_seamless' : windModel;
  const forecastDays = actualModel === 'icon_seamless' ? 7 : 10;

  try {
    const latList = coords.map((c) => c.lat.toFixed(4)).join(',');
    const lngList = coords.map((c) => c.lng.toFixed(4)).join(',');
    // Note: ecmwf_ifs025 does not include `precipitation` in some Open-Meteo endpoints, so we query upper-air + cloud_cover cleanly
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latList}&longitude=${lngList}&hourly=${spdParam},${dirParam},${tempParam},cloud_cover&wind_speed_unit=kn&timezone=Asia%2FKolkata&past_days=2&forecast_days=${forecastDays}&models=${actualModel}`;

    const apiRes = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (apiRes.ok) {
      const rawJson = await apiRes.json();
      const items = Array.isArray(rawJson) ? rawJson : [rawJson];
      if (items.length === coords.length) {
        const hpaDiff = queryHpa - levelInfo.pressureHpa;
        const levelTempDelta = -(hpaDiff * 0.06);

        const liveNodes = coords.map((pt, idx) => {
          const fallbackNode = initial.nodes[idx];
          const item = items[idx] as {
            hourly?: {
              time?: string[];
              [key: string]: number[] | string[] | undefined;
            };
          };
          const { index: targetIdx } = resolveHourlyTimeIndex(
            item?.hourly?.time,
            dt
          );
          const hourly = item?.hourly || {};

          const spdArr = (hourly[spdParam] ??
            hourly[`${spdParam}_${actualModel}`]) as number[] | undefined;
          const dirArr = (hourly[dirParam] ??
            hourly[`${dirParam}_${actualModel}`]) as number[] | undefined;
          const tempArr = (hourly[tempParam] ??
            hourly[`${tempParam}_${actualModel}`]) as number[] | undefined;
          const cloudArr = (hourly['cloud_cover'] ??
            hourly[`cloud_cover_${actualModel}`]) as number[] | undefined;

          const rawSpd = Array.isArray(spdArr) ? spdArr[targetIdx] : undefined;
          const rawDir = Array.isArray(dirArr) ? dirArr[targetIdx] : undefined;
          const rawTemp = Array.isArray(tempArr) ? tempArr[targetIdx] : undefined;
          const rawCloud = Array.isArray(cloudArr) ? cloudArr[targetIdx] : undefined;

          const cloudPct =
            typeof rawCloud === 'number'
              ? Math.min(100, Math.max(0, Math.round(rawCloud)))
              : fallbackNode.cloudCoverPct;

          return {
            lat: pt.lat,
            lng: pt.lng,
            windDir:
              typeof rawDir === 'number'
                ? roundWindDirectionDeg(rawDir)
                : fallbackNode.windDir,
            windSpd:
              typeof rawSpd === 'number'
                ? Math.max(0, Math.round(rawSpd))
                : fallbackNode.windSpd,
            tempC:
              typeof rawTemp === 'number'
                ? Math.round((rawTemp + levelTempDelta) * 10) / 10
                : fallbackNode.tempC,
            cloudCoverPct: cloudPct,
            precipMm:
              cloudPct > 70
                ? Math.round((cloudPct - 65) * 0.12 * 10) / 10
                : fallbackNode.precipMm,
          };
        });

        const liveSource = `${modelMeta.shortLabel} Live Open-Meteo Grid (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`;
        clientWeatherGridCache.set(cacheKey, {
          timestamp: Date.now(),
          source: liveSource,
          nodes: liveNodes,
        });
        return { source: liveSource, nodes: liveNodes };
      }
    }
  } catch {
    // Use initial synoptic nodes on network timeout/offline
  }

  clientWeatherGridCache.set(cacheKey, {
    timestamp: Date.now(),
    source: initial.source,
    nodes: initial.nodes,
  });
  return initial;
}

/**
 * Build ordered candidate image URLs for an IMD INSAT-3DR/3DS satellite channel
 * so that static deployments on Vercel/GitHub Pages load live mausam.imd.gov.in imagery
 * without needing a local Express server, and gracefully fall back if IMD's server is slow/offline.
 */
export function buildImdCandidateUrls(
  channelId: ImdSatelliteChannelId,
  refreshNonce: number = 1,
  waypoints: Waypoint[] = [],
  alternate: AlternateAerodrome | null = null
): string[] {
  const channel = getImdChannelById(channelId);
  // 5-minute cache bucket plus user refreshNonce so clicking "Refresh IMD" fetches fresh scan
  const cacheBucket = `${Math.floor(Date.now() / (5 * 60 * 1000))}_${refreshNonce}`;
  const rawImdWithBust = `${channel.upstreamUrl}?t=${cacheBucket}`;

  // 1. Global SSL/CORS Image CDN Proxy (wsrv.nl) - works on Vercel HTTPS, fixes IMD SSL chain & hotlink blocks
  const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(rawImdWithBust)}&output=jpg`;

  // 2. Direct official IMD Mausam HTTPS URL
  const directImdUrl = rawImdWithBust;

  // 3. Secondary global image CDN mirror (images.weserv.nl)
  const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(channel.upstreamUrl)}&t=${cacheBucket}`;

  // 4. Local/Serverless API proxy (/api/imd-satellite/image) if running locally or with Vercel serverless function
  const apiProxyUrl = `/api/imd-satellite/image?channel=${encodeURIComponent(
    channel.id
  )}&r=${refreshNonce}`;

  // 5. High-definition client-generated SVG Data URI fallback with live route overlay
  const fallbackDataUri = buildClientImdFallbackDataUri(
    channel.id,
    waypoints,
    alternate
  );

  return [wsrvUrl, directImdUrl, weservUrl, apiProxyUrl, fallbackDataUri];
}

/**
 * Build a high-resolution SVG Data URI representing the INSAT-3DR/3DS India Sector satellite chart
 * with the active route corridor plotted on top, used if mausam.imd.gov.in is unreachable.
 */
export function buildClientImdFallbackDataUri(
  channelId: ImdSatelliteChannelId,
  waypoints: Waypoint[] = [],
  alternate: AlternateAerodrome | null = null
): string {
  const channel = getImdChannelById(channelId);
  const nowTimes = formatImdScanTimestamps(new Date());

  const isCtbt = channelId.includes('ctbt');
  const isWv = channelId.includes('wv');
  const isVis = channelId.includes('vis');

  const bgFill = isVis ? '#0a1829' : isWv ? '#0c1629' : '#060e1e';
  const cloudPrimary = isCtbt
    ? '#ef4444'
    : isWv
    ? '#38bdf8'
    : '#f8fafc';
  const cloudSecondary = isCtbt
    ? '#f59e0b'
    : isWv
    ? '#818cf8'
    : '#94a3b8';

  // Project India sector (Lat 5°N..36°N, Lng 64°E..98°E) onto 1200x900 SVG
  const projectIndia = (lat: number, lng: number) => {
    const x = ((lng - 62) / (100 - 62)) * 1120;
    const y = ((37 - lat) / (37 - 4)) * 860 + 20;
    return {
      x: Math.round(Math.min(1100, Math.max(40, x))),
      y: Math.round(Math.min(850, Math.max(60, y))),
    };
  };

  let routeOverlaySvg = '';
  if (waypoints.length >= 2) {
    const pts = waypoints
      .map((w) => {
        const p = projectIndia(w.lat, w.lng);
        return `${p.x},${p.y}`;
      })
      .join(' ');
    routeOverlaySvg += `<polyline points="${pts}" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" />`;
  }
  waypoints.forEach((w, idx) => {
    const p = projectIndia(w.lat, w.lng);
    const color =
      idx === 0 ? '#10b981' : idx === waypoints.length - 1 ? '#f43f5e' : '#38bdf8';
    routeOverlaySvg += `<circle cx="${p.x}" cy="${p.y}" r="6" fill="${color}" stroke="#ffffff" stroke-width="2" />`;
    if (idx === 0 || idx === waypoints.length - 1) {
      const yOffset = idx === 0 ? 18 : -10;
      routeOverlaySvg += `<text x="${p.x + 10}" y="${p.y + yOffset}" fill="#fde047" font-family="monospace" font-size="13" font-weight="bold">${w.name}</text>`;
    }
  });
  if (alternate) {
    const p = projectIndia(alternate.lat, alternate.lng);
    routeOverlaySvg += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#6366f1" stroke="#ffffff" stroke-width="2" />`;
    routeOverlaySvg += `<text x="${p.x + 10}" y="${p.y - 8}" fill="#a5b4fc" font-family="monospace" font-size="12" font-weight="bold">ALT: ${alternate.name}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <defs>
      <radialGradient id="c1" cx="52%" cy="58%" r="32%">
        <stop offset="0%" stop-color="${cloudPrimary}" stop-opacity="0.86"/>
        <stop offset="42%" stop-color="${cloudSecondary}" stop-opacity="0.48"/>
        <stop offset="100%" stop-color="${bgFill}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="c2" cx="44%" cy="70%" r="26%">
        <stop offset="0%" stop-color="${cloudPrimary}" stop-opacity="0.78"/>
        <stop offset="52%" stop-color="${cloudSecondary}" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="${bgFill}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="c3" cx="68%" cy="46%" r="28%">
        <stop offset="0%" stop-color="${cloudSecondary}" stop-opacity="0.68"/>
        <stop offset="100%" stop-color="${bgFill}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tempScale" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ef4444"/>
        <stop offset="22%" stop-color="#f59e0b"/>
        <stop offset="45%" stop-color="#10b981"/>
        <stop offset="70%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="900" fill="${bgFill}"/>
    <!-- Graticule Grid -->
    <g stroke="#1e293b" stroke-width="1" stroke-dasharray="4 4">
      <line x1="0" y1="180" x2="1120" y2="180"/>
      <line x1="0" y1="360" x2="1120" y2="360"/>
      <line x1="0" y1="540" x2="1120" y2="540"/>
      <line x1="0" y1="720" x2="1120" y2="720"/>
      <line x1="224" y1="0" x2="224" y2="900"/>
      <line x1="448" y1="0" x2="448" y2="900"/>
      <line x1="672" y1="0" x2="672" y2="900"/>
      <line x1="896" y1="0" x2="896" y2="900"/>
    </g>
    <g fill="#475569" font-family="monospace" font-size="11">
      <text x="12" y="174">30°N</text>
      <text x="12" y="354">23°N</text>
      <text x="12" y="534">16°N</text>
      <text x="12" y="714">09°N</text>
      <text x="230" y="885">70°E</text>
      <text x="454" y="885">77°E</text>
      <text x="678" y="885">85°E</text>
      <text x="902" y="885">92°E</text>
    </g>
    <!-- India Subcontinent Coastline & FIR Outline -->
    <path d="M330,390 L415,265 L495,155 L605,190 L685,295 L785,320 L830,395 L735,460 L640,550 L580,685 L540,785 L515,775 L475,675 L435,540 L390,440 Z" fill="#0d213a" fill-opacity="0.65" stroke="#fbbf24" stroke-width="2.2" stroke-opacity="0.85"/>
    <!-- Sri Lanka -->
    <ellipse cx="568" cy="812" rx="19" ry="30" fill="#0d213a" stroke="#fbbf24" stroke-width="1.8" stroke-opacity="0.8"/>
    <!-- Region Labels -->
    <g fill="#64748b" font-family="monospace" font-size="12" font-weight="bold">
      <text x="240" y="620">ARABIAN SEA</text>
      <text x="720" y="620">BAY OF BENGAL</text>
      <text x="485" y="460">MUMBAI / CHENNAI FIR</text>
    </g>
    <!-- Synoptic Cloud Decks -->
    <ellipse cx="620" cy="520" rx="350" ry="230" fill="url(#c1)"/>
    <ellipse cx="475" cy="655" rx="275" ry="185" fill="url(#c2)"/>
    <ellipse cx="765" cy="400" rx="250" ry="175" fill="url(#c3)"/>
    ${routeOverlaySvg}
    <!-- Right-Side Brightness Temperature Legend Bar (Kelvin / °C) -->
    <rect x="1132" y="130" width="18" height="640" rx="4" fill="url(#tempScale)" stroke="#475569"/>
    <g fill="#cbd5e1" font-family="monospace" font-size="10">
      <text x="1155" y="142">-80°C</text>
      <text x="1155" y="295">-50°C</text>
      <text x="1155" y="450">-20°C</text>
      <text x="1155" y="605">+05°C</text>
      <text x="1155" y="765">+30°C</text>
    </g>
    <!-- Bottom Telemetry Footer inside Image -->
    <rect x="20" y="842" width="1090" height="34" rx="6" fill="#0f172a" fill-opacity="0.92" stroke="#334155"/>
    <text x="34" y="864" fill="#38bdf8" font-family="monospace" font-size="13" font-weight="bold">IMD MAUSAM INSAT-3DR/3DS · ${channel.shortLabel} (${channel.wavelength}) · SCAN: ${nowTimes.istString} (${nowTimes.utcString})</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

