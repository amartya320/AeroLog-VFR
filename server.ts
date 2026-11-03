import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import {
  WIND_MODEL_OPTIONS,
  WindModelId,
  getClosestAltitudeLevel,
  getImdChannelById,
  formatImdScanTimestamps,
} from './src/utils/navlogMath';
import {
  WindPointRequest,
  fetchUpperAirWindsBatchClient,
  fetchWeatherGridClient,
  parseTargetDateTime,
} from './src/utils/weatherClient';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

app.post('/api/winds', async (req, res) => {
  try {
    const {
      points,
      altitudeFt = 5000,
      departureDate,
      departureTime,
      windModel = 'ecmwf_ifs025',
      forceRefresh = false,
    } = req.body as {
      points?: WindPointRequest[];
      altitudeFt?: number;
      departureDate?: string;
      departureTime?: string;
      windModel?: WindModelId;
      forceRefresh?: boolean;
    };

    if (!Array.isArray(points) || points.length === 0) {
      res.status(400).json({ error: 'points array is required' });
      return;
    }

    const result = await fetchUpperAirWindsBatchClient({
      points,
      altitudeFt: Number(altitudeFt) || 5000,
      departureDate,
      departureTime,
      windModel,
      forceRefresh: Boolean(forceRefresh),
      skipServerFallback: true,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to fetch upper-air wind data',
    });
  }
});

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

    const gridResult = await fetchWeatherGridClient({
      minLat,
      maxLat,
      minLng,
      maxLng,
      rows: safeRows,
      cols: safeCols,
      altitudeFt: levelInfo.altitudeFt,
      departureDate: dt.safeDate,
      departureTime: dt.formattedTime,
      windModel,
    });

    res.json({
      altitudeFt: levelInfo.altitudeFt,
      pressureHpa: levelInfo.pressureHpa,
      windModel,
      modelLabel: modelMeta.shortLabel,
      departureDate: dt.safeDate,
      departureTime: dt.formattedTime,
      source: gridResult.source,
      rows: safeRows,
      cols: safeCols,
      bounds: { minLat, maxLat, minLng, maxLng },
      nodes: gridResult.nodes,
    });
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
