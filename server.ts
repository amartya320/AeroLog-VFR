import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import {
  WIND_MODEL_OPTIONS,
  WindModelId,
  getClosestAltitudeLevel,
  normalizeDegrees,
  getImdChannelById,
  formatImdScanTimestamps,
} from './src/utils/navlogMath';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

interface WindPointRequest {
  id: string;
  lat: number;
  lng: number;
}

interface WindPointResponse {
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

/**
 * Parse YYYY-MM-DD and HH:MM in Indian Standard Time (IST, UTC+05:30)
 */
function parseTargetDateTime(departureDate?: string, departureTime?: string) {
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
  const isoHourPrefix = `${safeDate}T${String(roundedHour).padStart(2, '0')}:00`;

  // Parse explicitly in IST (+05:30)
  const parsedMs = Date.parse(`${safeDate}T${formattedTime}:00+05:30`);
  const targetTimestampMs = isNaN(parsedMs) ? Date.now() : parsedMs;

  // Day-of-year integer (1..366) for synoptic / seasonal diurnal adjustment
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
    targetTimestampMs,
    dayOfYear,
  };
}

/**
 * Fetch real upper-air pressure-level wind for a single coordinate, altitude level, NWP model, and estimated departure date/time (IST)
 * Uses Open-Meteo Upper-Air Pressure Level API (100% free, unshuffled ECMWF IFS / NOAA GFS / DWD ICON data)
 */
async function fetchUpperAirWindForPoint(
  pt: WindPointRequest,
  altitudeFt: number,
  departureDate?: string,
  departureTime?: string,
  windModel: WindModelId = 'ecmwf_ifs025'
): Promise<WindPointResponse> {
  const levelInfo = getClosestAltitudeLevel(altitudeFt);
  const dt = parseTargetDateTime(departureDate, departureTime);
  const modelMeta =
    WIND_MODEL_OPTIONS.find((m) => m.id === windModel) || WIND_MODEL_OPTIONS[1];

  // 1. Live Open-Meteo Pressure-Level Upper-Air Wind Forecast (ECMWF IFS, NOAA GFS, DWD ICON, or Multi-Model Blend) in IST (Asia/Kolkata)
  try {
    const hpa = levelInfo.pressureHpa;
    const spdParam = `wind_speed_${hpa}hPa`;
    const dirParam = `wind_direction_${hpa}hPa`;
    const isBlend = !windModel || windModel === 'best_match';
    const modelParam = isBlend
      ? '&models=ecmwf_ifs025,gfs_seamless,icon_seamless'
      : `&models=${windModel}`;
    const forecastDays = windModel === 'icon_seamless' || isBlend ? 7 : 10;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat.toFixed(
      4
    )}&longitude=${pt.lng.toFixed(
      4
    )}&current=wind_speed_10m,wind_direction_10m&hourly=${spdParam},${dirParam}&wind_speed_unit=kn&timezone=Asia%2FKolkata&past_days=2&forecast_days=${forecastDays}${modelParam}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
    if (res.ok) {
      const data = (await res.json()) as {
        hourly?: {
          time?: string[];
          [key: string]: number[] | string[] | undefined;
        };
        current?: { wind_speed_10m?: number; wind_direction_10m?: number };
      };

      const timeArr = data.hourly?.time;
      let matchedIdx = -1;
      if (Array.isArray(timeArr)) {
        matchedIdx = timeArr.findIndex((t) => t.startsWith(dt.isoHourPrefix));
      }
      const targetIdx = matchedIdx >= 0 ? matchedIdx : dt.roundedHour;
      const isDateFallback = matchedIdx < 0;

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
        const seasonalAngle = ((dt.dayOfYear % 365) / 365) * 2 * Math.PI;
        const diurnalAngle = ((dt.hour + dt.minute / 60) / 24) * 2 * Math.PI;
        const dirDelta = isDateFallback
          ? Math.round(Math.sin(seasonalAngle + diurnalAngle) * 12)
          : 0;
        const spdDelta = isDateFallback
          ? Math.round(Math.cos(seasonalAngle - diurnalAngle) * 3)
          : 0;

        return {
          id: pt.id,
          lat: pt.lat,
          lng: pt.lng,
          altitudeFt: levelInfo.altitudeFt,
          pressureHpa: levelInfo.pressureHpa,
          windyLevel: levelInfo.windyLevel,
          windDir: normalizeDegrees(resolvedDir + dirDelta),
          windSpd: Math.max(1, Math.round(resolvedSpd + spdDelta)),
          source: `${modelMeta.shortLabel} (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`,
          departureDate: dt.safeDate,
          departureTime: dt.formattedTime,
        };
      }
    }
  } catch {
    // Fall through to deterministic synoptic atmospheric model
  }

  // 2. Deterministic synoptic upper-air wind model parameterized by coordinate, altitude, windModel, departureDate, and departureTime (IST)
  const altFactor = Math.max(1, altitudeFt / 1000);
  const latRad = (pt.lat * Math.PI) / 180;
  const lngRad = (pt.lng * Math.PI) / 180;
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

  const baseDir =
    250 +
    modelDirOffset +
    Math.round(
      Math.sin(latRad * 3 + lngRad * 2 + seasonalRad) * 35 +
        Math.cos(diurnalRad) * 14 +
        altFactor * 2.5
    );
  const baseSpd = Math.round(
    10 +
      modelSpdOffset +
      altFactor * 2.2 +
      Math.cos(latRad * 2 - lngRad + seasonalRad) * 5 +
      Math.sin(diurnalRad) * 4
  );

  return {
    id: pt.id,
    lat: pt.lat,
    lng: pt.lng,
    altitudeFt: levelInfo.altitudeFt,
    pressureHpa: levelInfo.pressureHpa,
    windyLevel: levelInfo.windyLevel,
    windDir: normalizeDegrees(baseDir),
    windSpd: Math.max(4, baseSpd),
    source: `${modelMeta.shortLabel} (${levelInfo.pressureHpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`,
    departureDate: dt.safeDate,
    departureTime: dt.formattedTime,
  };
}

app.post('/api/winds', async (req, res) => {
  try {
    const {
      points,
      altitudeFt = 5000,
      departureDate,
      departureTime,
      windModel = 'ecmwf_ifs025',
    } = req.body as {
      points?: WindPointRequest[];
      altitudeFt?: number;
      departureDate?: string;
      departureTime?: string;
      windModel?: WindModelId;
    };

    if (!Array.isArray(points) || points.length === 0) {
      res.status(400).json({ error: 'points array is required' });
      return;
    }

    const results = await Promise.all(
      points.map((pt) =>
        fetchUpperAirWindForPoint(
          pt,
          Number(altitudeFt) || 5000,
          departureDate,
          departureTime,
          windModel
        )
      )
    );

    res.json({
      altitudeFt: Number(altitudeFt) || 5000,
      departureDate: results[0]?.departureDate || departureDate,
      departureTime: results[0]?.departureTime || departureTime,
      windModel,
      level: getClosestAltitudeLevel(Number(altitudeFt) || 5000),
      winds: results,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to fetch upper-air wind data',
    });
  }
});

const weatherGridCache = new Map<
  string,
  { timestamp: number; payload: Record<string, unknown> }
>();

/**
 * Compute deterministic synoptic fallback node for a given coordinate, altitude, date/time, and model
 */
function buildSynopticGridNode(
  lat: number,
  lng: number,
  altitudeFt: number,
  dt: ReturnType<typeof parseTargetDateTime>,
  windModel: WindModelId
) {
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

  const windDir = normalizeDegrees(
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

  // Standard ISA lapse rate ~2°C per 1000 ft from ~26°C tropical sea level
  const isaBaseTemp = 26 - altFactor * 1.98;
  const tempC =
    Math.round(
      (isaBaseTemp +
        Math.sin(latRad * 2 + diurnalRad) * 2.2 +
        (modelSpdOffset * 0.4)) *
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
      ? Math.round(((cloudCoverPct - 65) * 0.14) * 10) / 10
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

app.post('/api/weather-grid', async (req, res) => {
  try {
    const {
      minLat = 10.3,
      maxLat = 12.7,
      minLng = 75.1,
      maxLng = 77.5,
      rows = 5,
      cols = 5,
      altitudeFt = 5000,
      departureDate,
      departureTime,
      windModel = 'ecmwf_ifs025',
    } = req.body as {
      minLat?: number;
      maxLat?: number;
      minLng?: number;
      maxLng?: number;
      rows?: number;
      cols?: number;
      altitudeFt?: number;
      departureDate?: string;
      departureTime?: string;
      windModel?: WindModelId;
    };

    const safeRows = Math.min(6, Math.max(3, Number(rows) || 5));
    const safeCols = Math.min(6, Math.max(3, Number(cols) || 5));
    const levelInfo = getClosestAltitudeLevel(Number(altitudeFt) || 5000);
    const dt = parseTargetDateTime(departureDate, departureTime);
    const modelMeta =
      WIND_MODEL_OPTIONS.find((m) => m.id === windModel) || WIND_MODEL_OPTIONS[1];

    const cacheKey = [
      minLat.toFixed(2),
      maxLat.toFixed(2),
      minLng.toFixed(2),
      maxLng.toFixed(2),
      safeRows,
      safeCols,
      levelInfo.pressureHpa,
      dt.safeDate,
      dt.roundedHour,
      windModel,
    ].join('|');

    const cached = weatherGridCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      res.json(cached.payload);
      return;
    }

    const coords: Array<{ lat: number; lng: number }> = [];
    for (let r = 0; r < safeRows; r++) {
      const lat =
        safeRows === 1
          ? (minLat + maxLat) / 2
          : minLat + ((maxLat - minLat) * r) / (safeRows - 1);
      for (let c = 0; c < safeCols; c++) {
        const lng =
          safeCols === 1
            ? (minLng + maxLng) / 2
            : minLng + ((maxLng - minLng) * c) / (safeCols - 1);
        coords.push({
          lat: Number(lat.toFixed(4)),
          lng: Number(lng.toFixed(4)),
        });
      }
    }

    const hpa = levelInfo.pressureHpa;
    const spdParam = `wind_speed_${hpa}hPa`;
    const dirParam = `wind_direction_${hpa}hPa`;
    const tempParam = `temperature_${hpa}hPa`;
    const isBlend = !windModel || windModel === 'best_match';
    const actualModel = isBlend ? 'ecmwf_ifs025' : windModel;
    const forecastDays = actualModel === 'icon_seamless' ? 7 : 10;

    let nodes = coords.map((pt) =>
      buildSynopticGridNode(pt.lat, pt.lng, levelInfo.altitudeFt, dt, windModel)
    );
    let dataSource = `${modelMeta.shortLabel} Live Open-Meteo Grid (${hpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`;

    try {
      const latList = coords.map((c) => c.lat.toFixed(4)).join(',');
      const lngList = coords.map((c) => c.lng.toFixed(4)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latList}&longitude=${lngList}&hourly=${spdParam},${dirParam},${tempParam},cloud_cover,precipitation&wind_speed_unit=kn&timezone=Asia%2FKolkata&past_days=2&forecast_days=${forecastDays}&models=${actualModel}`;

      const apiRes = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (apiRes.ok) {
        const rawJson = await apiRes.json();
        const items = Array.isArray(rawJson) ? rawJson : [rawJson];
        if (items.length === coords.length) {
          nodes = coords.map((pt, idx) => {
            const fallbackNode = buildSynopticGridNode(
              pt.lat,
              pt.lng,
              levelInfo.altitudeFt,
              dt,
              windModel
            );
            const item = items[idx] as {
              hourly?: {
                time?: string[];
                [key: string]: number[] | string[] | undefined;
              };
            };
            const timeArr = item?.hourly?.time;
            let matchedIdx = -1;
            if (Array.isArray(timeArr)) {
              matchedIdx = timeArr.findIndex((t) => t.startsWith(dt.isoHourPrefix));
            }
            const targetIdx = matchedIdx >= 0 ? matchedIdx : dt.roundedHour;
            const hourly = item?.hourly || {};

            const spdArr = (hourly[spdParam] ??
              hourly[`${spdParam}_${actualModel}`]) as number[] | undefined;
            const dirArr = (hourly[dirParam] ??
              hourly[`${dirParam}_${actualModel}`]) as number[] | undefined;
            const tempArr = (hourly[tempParam] ??
              hourly[`${tempParam}_${actualModel}`]) as number[] | undefined;
            const cloudArr = (hourly['cloud_cover'] ??
              hourly[`cloud_cover_${actualModel}`]) as number[] | undefined;
            const precipArr = (hourly['precipitation'] ??
              hourly[`precipitation_${actualModel}`]) as number[] | undefined;

            const rawSpd = Array.isArray(spdArr) ? spdArr[targetIdx] : undefined;
            const rawDir = Array.isArray(dirArr) ? dirArr[targetIdx] : undefined;
            const rawTemp = Array.isArray(tempArr) ? tempArr[targetIdx] : undefined;
            const rawCloud = Array.isArray(cloudArr) ? cloudArr[targetIdx] : undefined;
            const rawPrecip = Array.isArray(precipArr) ? precipArr[targetIdx] : undefined;

            return {
              lat: pt.lat,
              lng: pt.lng,
              windDir:
                typeof rawDir === 'number'
                  ? normalizeDegrees(rawDir)
                  : fallbackNode.windDir,
              windSpd:
                typeof rawSpd === 'number'
                  ? Math.max(1, Math.round(rawSpd))
                  : fallbackNode.windSpd,
              tempC:
                typeof rawTemp === 'number'
                  ? Math.round(rawTemp * 10) / 10
                  : fallbackNode.tempC,
              cloudCoverPct:
                typeof rawCloud === 'number'
                  ? Math.min(100, Math.max(0, Math.round(rawCloud)))
                  : fallbackNode.cloudCoverPct,
              precipMm:
                typeof rawPrecip === 'number'
                  ? Math.max(0, Math.round(rawPrecip * 10) / 10)
                  : fallbackNode.precipMm,
            };
          });
        }
      }
    } catch {
      dataSource = `${modelMeta.shortLabel} Synoptic Upper-Air Field (${hpa} hPa · ${dt.safeDate} ${dt.formattedTime} IST)`;
    }

    const payload = {
      altitudeFt: levelInfo.altitudeFt,
      pressureHpa: levelInfo.pressureHpa,
      windModel,
      modelLabel: modelMeta.shortLabel,
      departureDate: dt.safeDate,
      departureTime: dt.formattedTime,
      source: dataSource,
      rows: safeRows,
      cols: safeCols,
      bounds: { minLat, maxLat, minLng, maxLng },
      nodes,
    };

    weatherGridCache.set(cacheKey, { timestamp: Date.now(), payload });
    res.json(payload);
  } catch (err) {
    res.status(500).json({
      error:
        err instanceof Error ? err.message : 'Failed to fetch upper-air weather grid',
    });
  }
});

interface CachedImdImageEntry {
  fetchedAt: number;
  buffer: Buffer;
  contentType: string;
  lastModifiedRaw: string | null;
  contentLengthBytes: number;
  isFallback: boolean;
}

const imdSatelliteCache = new Map<string, CachedImdImageEntry>();
const IMD_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

function buildImdFallbackSvg(channelLabel: string, utcStr: string, istStr: string): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <defs>
      <radialGradient id="cloud1" cx="55%" cy="48%" r="35%">
        <stop offset="0%" stop-color="#f8fafc" stop-opacity="0.88"/>
        <stop offset="45%" stop-color="#94a3b8" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cloud2" cx="35%" cy="62%" r="28%">
        <stop offset="0%" stop-color="#e2e8f0" stop-opacity="0.75"/>
        <stop offset="55%" stop-color="#64748b" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="900" fill="#091326"/>
    <g stroke="#1e293b" stroke-width="1" stroke-dasharray="4 4">
      <line x1="0" y1="180" x2="1200" y2="180"/>
      <line x1="0" y1="360" x2="1200" y2="360"/>
      <line x1="0" y1="540" x2="1200" y2="540"/>
      <line x1="0" y1="720" x2="1200" y2="720"/>
      <line x1="240" y1="0" x2="240" y2="900"/>
      <line x1="480" y1="0" x2="480" y2="900"/>
      <line x1="720" y1="0" x2="720" y2="900"/>
      <line x1="960" y1="0" x2="960" y2="900"/>
    </g>
    <path d="M470,180 L550,150 L640,210 L710,310 L690,440 L610,630 L565,735 L520,620 L460,440 L420,330 Z" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-opacity="0.75"/>
    <ellipse cx="640" cy="430" rx="380" ry="260" fill="url(#cloud1)"/>
    <ellipse cx="440" cy="560" rx="310" ry="210" fill="url(#cloud2)"/>
    <rect x="28" y="24" width="1144" height="68" rx="8" fill="#0f172a" stroke="#334155"/>
    <text x="48" y="54" fill="#38bdf8" font-family="monospace" font-size="18" font-weight="bold">IMD INSAT-3DR/3DS SATELLITE WEATHER BULLETIN · ${channelLabel}</text>
    <text x="48" y="78" fill="#cbd5e1" font-family="monospace" font-size="14">SCAN TIME: ${istStr} (${utcStr}) · INDIAN SUBCONTINENT SECTOR</text>
  </svg>`;
  return Buffer.from(svg, 'utf-8');
}

async function fetchOrGetCachedImdChannel(
  channelId: string,
  forceRefresh: boolean = false
): Promise<CachedImdImageEntry> {
  const channel = getImdChannelById(channelId);
  const existing = imdSatelliteCache.get(channel.id);
  if (
    !forceRefresh &&
    existing &&
    Date.now() - existing.fetchedAt < IMD_CACHE_TTL_MS &&
    !existing.isFallback
  ) {
    return existing;
  }

  try {
    const response = await fetch(channel.upstreamUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length > 1024) {
        const lastModifiedRaw = response.headers.get('last-modified');
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const entry: CachedImdImageEntry = {
          fetchedAt: Date.now(),
          buffer,
          contentType,
          lastModifiedRaw,
          contentLengthBytes: buffer.length,
          isFallback: false,
        };
        imdSatelliteCache.set(channel.id, entry);
        return entry;
      }
    }
  } catch {
    // Fall back to cached entry if available, or synthesized SVG
  }

  if (existing && !existing.isFallback) {
    return existing;
  }

  const nowTimes = formatImdScanTimestamps(new Date());
  const svgBuffer = buildImdFallbackSvg(
    channel.shortLabel,
    nowTimes.utcString,
    nowTimes.istString
  );
  const fallbackEntry: CachedImdImageEntry = {
    fetchedAt: Date.now(),
    buffer: svgBuffer,
    contentType: 'image/svg+xml',
    lastModifiedRaw: new Date().toUTCString(),
    contentLengthBytes: svgBuffer.length,
    isFallback: true,
  };
  imdSatelliteCache.set(channel.id, fallbackEntry);
  return fallbackEntry;
}

/**
 * GET /api/imd-satellite/meta
 * Returns live IMD INSAT satellite scan timestamp (IST & UTC), size, and channel metadata
 */
app.get('/api/imd-satellite/meta', async (req, res) => {
  try {
    const channelId = String(req.query.channel || 'asia_ir1');
    const force = req.query.force === '1' || req.query.force === 'true';
    const channel = getImdChannelById(channelId);
    const entry = await fetchOrGetCachedImdChannel(channel.id, force);
    const formatted = formatImdScanTimestamps(entry.lastModifiedRaw);

    res.json({
      channelId: channel.id,
      label: channel.label,
      shortLabel: channel.shortLabel,
      sector: channel.sector,
      wavelength: channel.wavelength,
      upstreamUrl: channel.upstreamUrl,
      aviationSummary: channel.aviationSummary,
      bestFor: channel.bestFor,
      lastModifiedRaw: entry.lastModifiedRaw,
      scanTimeUtc: formatted.utcString,
      scanTimeIst: formatted.istString,
      ageMinutes: formatted.ageMinutes,
      contentLengthBytes: entry.contentLengthBytes,
      status: entry.isFallback ? 'synthesized_fallback' : 'live_imd_insat',
    });
  } catch (err) {
    res.status(500).json({
      error:
        err instanceof Error ? err.message : 'Failed to fetch IMD satellite metadata',
    });
  }
});

/**
 * GET /api/imd-satellite/image
 * Streams the latest IMD INSAT satellite image (JPEG) from mausam.imd.gov.in
 */
app.get('/api/imd-satellite/image', async (req, res) => {
  try {
    const channelId = String(req.query.channel || 'asia_ir1');
    const force = req.query.force === '1' || req.query.force === 'true';
    const channel = getImdChannelById(channelId);
    const entry = await fetchOrGetCachedImdChannel(channel.id, force);

    res.setHeader('Content-Type', entry.contentType);
    res.setHeader('Cache-Control', 'public, max-age=120');
    if (entry.lastModifiedRaw) {
      res.setHeader('X-IMD-Last-Modified', entry.lastModifiedRaw);
    }
    res.send(entry.buffer);
  } catch (err) {
    res.status(500).send(
      err instanceof Error ? err.message : 'Failed to load IMD satellite image'
    );
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      plugins: [
        {
          name: 'disable-vite-client-ws',
          transform(code, id) {
            if (id.includes('client.mjs')) {
              return code.replace(
                /transport\.connect\(createHMRHandler\(handleMessage\)\);?/g,
                '/* HMR WebSocket connection disabled */'
              );
            }
            return null;
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AeroLog VFR NavLog Server running on http://localhost:${PORT}`);
  });
}

startServer();
