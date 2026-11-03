import { AlternateAerodrome, FlightConfig, Waypoint, getCurrentIstDateTime } from './navlogMath';

const initialIst = getCurrentIstDateTime();

export interface PresetFlightRoute {
  id: string;
  title: string;
  region: string;
  aircraftLabel: string;
  config: FlightConfig;
  waypoints: Waypoint[];
}

export const KNOWN_AERODROMES: AlternateAerodrome[] = [
  {
    name: 'VOGB (Kalaburagi / Gulbarga)',
    lat: 17.3056,
    lng: 76.9531,
    elevationFt: 1473,
    windDir: 270,
    windSpd: 14,
  },
  {
    name: 'VASL (Solapur Airport)',
    lat: 17.628,
    lng: 75.9348,
    elevationFt: 1585,
    windDir: 280,
    windSpd: 15,
  },
  {
    name: 'VOBG (HAL Bengaluru)',
    lat: 12.9499,
    lng: 77.6682,
    elevationFt: 2912,
    windDir: 270,
    windSpd: 14,
  },
  {
    name: 'VOBL (Kempegowda Intl Bengaluru)',
    lat: 13.1986,
    lng: 77.7066,
    elevationFt: 3000,
    windDir: 270,
    windSpd: 16,
  },
  {
    name: 'VOCL (Calicut Intl)',
    lat: 11.1368,
    lng: 75.9553,
    elevationFt: 342,
    windDir: 280,
    windSpd: 14,
  },
  {
    name: 'VOCI (Cochin Intl)',
    lat: 10.1518,
    lng: 76.4019,
    elevationFt: 30,
    windDir: 260,
    windSpd: 12,
  },
  {
    name: 'VOCB (Coimbatore Intl)',
    lat: 11.03,
    lng: 77.0434,
    elevationFt: 1324,
    windDir: 250,
    windSpd: 16,
  },
  {
    name: 'VOMY (Mysore Airport)',
    lat: 12.23,
    lng: 76.6558,
    elevationFt: 2346,
    windDir: 270,
    windSpd: 15,
  },
  {
    name: 'VOTV (Trivandrum Intl)',
    lat: 8.4821,
    lng: 76.9201,
    elevationFt: 15,
    windDir: 280,
    windSpd: 14,
  },
  {
    name: 'VOML (Mangalore Intl)',
    lat: 12.9613,
    lng: 74.8901,
    elevationFt: 337,
    windDir: 290,
    windSpd: 13,
  },
  {
    name: 'VOMD (Madurai Airport)',
    lat: 9.8345,
    lng: 78.0934,
    elevationFt: 459,
    windDir: 260,
    windSpd: 15,
  },
  {
    name: 'VOTR (Tiruchirappalli Intl)',
    lat: 10.7654,
    lng: 78.7097,
    elevationFt: 288,
    windDir: 260,
    windSpd: 17,
  },
];

export const PRESET_ROUTES: PresetFlightRoute[] = [
  {
    id: 'vogb-vasl-xc',
    title: 'Kalaburagi (VOGB) to Solapur (VASL) VFR Cross-Country',
    region: 'Deccan Plateau · Karnataka–Maharashtra',
    aircraftLabel: 'Trainer VFR · 85 KTAS · 15 L/hr',
    config: {
      cruiseTasKt: 85,
      fuelFlowLph: 15,
      initialFuelLiters: 120,
      taxiFuelLiters: 5,
      contingencyPercent: 5,
      holdingFuelLiters: 11.3,
      reserveFuelLiters: 11.3,
      departureDate: initialIst.date,
      airborneTime: initialIst.time,
      selectedAltitudeFt: 5000,
      windModel: 'ecmwf_ifs025',
      magneticVariationDeg: -1.0,
      globalTrackOverrideDeg: null,
      customAlternateFuelLiters: null,
      roundOffValues: false,
      alternate: null,
      alternateFrom: 'DEST',
    },
    waypoints: [
      {
        id: 'wp-vogb',
        name: 'VOGB (KALABURAGI)',
        lat: 17.3056,
        lng: 76.9531,
        elevationFt: 1473,
        windDir: 280,
        windSpd: 14,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Departure Aerodrome · RWY 09/27',
      },
      {
        id: 'wp-savalgi',
        name: 'SAVALGI',
        lat: 17.3701,
        lng: 76.7494,
        freeformLat: 17.382,
        freeformLng: 76.745,
        elevationFt: 1540,
        windDir: 280,
        windSpd: 15,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'SH-10 Visual Reporting Point',
      },
      {
        id: 'wp-aland',
        name: 'ALAND',
        lat: 17.4346,
        lng: 76.5458,
        freeformLat: 17.5642,
        freeformLng: 76.5686,
        elevationFt: 1610,
        windDir: 290,
        windSpd: 16,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Aland / Bori River VFR Fix',
      },
      {
        id: 'wp-dudhani',
        name: 'DUDHANI',
        lat: 17.499,
        lng: 76.3421,
        freeformLat: 17.4965,
        freeformLng: 76.364,
        elevationFt: 1560,
        windDir: 280,
        windSpd: 16,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Dudhani Railway Junction Checkpoint',
      },
      {
        id: 'wp-akkalkot',
        name: 'AKKALKOT',
        lat: 17.5635,
        lng: 76.1385,
        freeformLat: 17.5244,
        freeformLng: 76.205,
        elevationFt: 1530,
        windDir: 280,
        windSpd: 15,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Akkalkot Town & Kurnur Reservoir Fix',
      },
      {
        id: 'wp-vasl',
        name: 'VASL (SOLAPUR)',
        lat: 17.628,
        lng: 75.9348,
        elevationFt: 1585,
        windDir: 270,
        windSpd: 14,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Destination Aerodrome · RWY 15/33',
      },
    ],
  },
];

export function exportWaypointsToKml(waypoints: Waypoint[], routeTitle: string): string {
  const placemarks = waypoints
    .map(
      (wp) => `    <Placemark>
      <name>${wp.name}</name>
      <description>Wind: ${wp.windDir ?? 0}° @ ${wp.windSpd ?? 0} kt (${wp.windSource || 'N/A'})</description>
      <Point>
        <coordinates>${wp.lng},${wp.lat},${Math.round((wp.elevationFt || 0) * 0.3048)}</coordinates>
      </Point>
    </Placemark>`
    )
    .join('\n');

  const lineCoords = waypoints
    .map((wp) => `${wp.lng},${wp.lat},${Math.round((wp.elevationFt || 0) * 0.3048)}`)
    .join(' ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${routeTitle}</name>
    <Placemark>
      <name>Flight Route Path</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${lineCoords}</coordinates>
      </LineString>
    </Placemark>
${placemarks}
  </Document>
</kml>`;
}

