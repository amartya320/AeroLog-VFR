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
    windDir: 265,
    windSpd: 16,
  },
  {
    name: 'VOCL (Calicut Intl)',
    lat: 11.1368,
    lng: 75.9553,
    elevationFt: 342,
    windDir: 275,
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
    windDir: 245,
    windSpd: 16,
  },
  {
    name: 'VOMY (Mysore Airport)',
    lat: 12.23,
    lng: 76.6558,
    elevationFt: 2346,
    windDir: 265,
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
    windDir: 285,
    windSpd: 13,
  },
  {
    name: 'VOMD (Madurai Airport)',
    lat: 9.8345,
    lng: 78.0934,
    elevationFt: 459,
    windDir: 255,
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
  {
    name: 'KSNS (Salinas Municipal)',
    lat: 36.6628,
    lng: -121.6064,
    elevationFt: 85,
    windDir: 295,
    windSpd: 14,
  },
  {
    name: 'KSJC (San Jose Mineta Intl)',
    lat: 37.3639,
    lng: -121.9289,
    elevationFt: 62,
    windDir: 310,
    windSpd: 15,
  },
  {
    name: 'KMRY (Monterey Regional)',
    lat: 36.587,
    lng: -121.843,
    elevationFt: 257,
    windDir: 290,
    windSpd: 14,
  },
  {
    name: 'KWVI (Watsonville Municipal)',
    lat: 36.9358,
    lng: -121.7897,
    elevationFt: 163,
    windDir: 295,
    windSpd: 15,
  },
];

export const PRESET_ROUTES: PresetFlightRoute[] = [
  {
    id: 'kerala-mysore-xc',
    title: 'Calicut (VOCL) to Mysore (VOMY) VFR Cross-Country',
    region: 'Southern India · Western Ghats',
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
      magneticVariationDeg: -1.5,
      globalTrackOverrideDeg: null,
      customAlternateFuelLiters: null,
      roundOffValues: false,
      alternate: null,
      alternateFrom: 'DEST',
    },
    waypoints: [
      {
        id: 'wp-vocl',
        name: 'VOCL (CALICUT)',
        lat: 11.1368,
        lng: 75.9553,
        elevationFt: 342,
        windDir: 275,
        windSpd: 14,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Departure Aerodrome · RWY 28/10',
      },
      {
        id: 'wp-nilambur',
        name: 'NILAMBUR',
        lat: 11.2789,
        lng: 76.2255,
        elevationFt: 185,
        windDir: 280,
        windSpd: 16,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Chaliyar River Valley VFR Check Point',
      },
      {
        id: 'wp-gudalur',
        name: 'GUDALUR PASS',
        lat: 11.503,
        lng: 76.4917,
        elevationFt: 3500,
        windDir: 290,
        windSpd: 21,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Nilgiri Saddle Reporting Point',
      },
      {
        id: 'wp-gundlupet',
        name: 'GUNDLUPET',
        lat: 11.8087,
        lng: 76.6914,
        elevationFt: 2620,
        windDir: 270,
        windSpd: 18,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Highway Junction Visual Fix',
      },
      {
        id: 'wp-vomy',
        name: 'VOMY (MYSORE)',
        lat: 12.23,
        lng: 76.6558,
        elevationFt: 2346,
        windDir: 265,
        windSpd: 15,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
        notes: 'Destination Aerodrome · RWY 09/27',
      },
    ],
  },
  {
    id: 'cochin-coimbatore-xc',
    title: 'Cochin (VOCI) to Coimbatore (VOCB) Palakkad Gap',
    region: 'Southern India · Palakkad Gap',
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
      selectedAltitudeFt: 3500,
      windModel: 'ecmwf_ifs025',
      magneticVariationDeg: -1.5,
      globalTrackOverrideDeg: null,
      customAlternateFuelLiters: null,
      roundOffValues: false,
      alternate: null,
      alternateFrom: 'DEST',
    },
    waypoints: [
      {
        id: 'wp-voci',
        name: 'VOCI (COCHIN)',
        lat: 10.1518,
        lng: 76.4019,
        elevationFt: 30,
        windDir: 260,
        windSpd: 12,
        windSource: 'ECMWF IFS (900 hPa / 3500 ft)',
        notes: 'Departure Aerodrome · RWY 27',
      },
      {
        id: 'wp-thrissur',
        name: 'THRISSUR',
        lat: 10.5276,
        lng: 76.2144,
        elevationFt: 95,
        windDir: 265,
        windSpd: 14,
        windSource: 'ECMWF IFS (900 hPa / 3500 ft)',
        notes: 'Town Reservoir Visual Fix',
      },
      {
        id: 'wp-vadakkenchery',
        name: 'VADAKKENCHERY',
        lat: 10.5892,
        lng: 76.489,
        elevationFt: 230,
        windDir: 270,
        windSpd: 19,
        windSource: 'ECMWF IFS (900 hPa / 3500 ft)',
        notes: 'NH544 Gap Entry Reporting Point',
      },
      {
        id: 'wp-palakkad',
        name: 'PALAKKAD GAP',
        lat: 10.7867,
        lng: 76.6548,
        elevationFt: 318,
        windDir: 255,
        windSpd: 22,
        windSource: 'ECMWF IFS (900 hPa / 3500 ft)',
        notes: 'Malampuzha Dam Visual Fix',
      },
      {
        id: 'wp-vocb',
        name: 'VOCB (COIMBATORE)',
        lat: 11.03,
        lng: 77.0434,
        elevationFt: 1324,
        windDir: 245,
        windSpd: 16,
        windSource: 'ECMWF IFS (900 hPa / 3500 ft)',
        notes: 'Destination Aerodrome · RWY 23/05',
      },
    ],
  },
  {
    id: 'norcal-coastal-xc',
    title: 'San Carlos (KSQL) to Monterey (KMRY) Coastal VFR',
    region: 'California · Bay Area Coastal',
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
      magneticVariationDeg: 13,
      globalTrackOverrideDeg: null,
      customAlternateFuelLiters: null,
      roundOffValues: false,
      alternate: null,
      alternateFrom: 'DEST',
    },
    waypoints: [
      {
        id: 'wp-ksql',
        name: 'KSQL (SAN CARLOS)',
        lat: 37.5119,
        lng: -122.2494,
        elevationFt: 5,
        windDir: 310,
        windSpd: 16,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
      },
      {
        id: 'wp-khaf',
        name: 'KHAF (HALF MOON)',
        lat: 37.5134,
        lng: -122.5012,
        elevationFt: 66,
        windDir: 320,
        windSpd: 20,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
      },
      {
        id: 'wp-pigeon',
        name: 'PIGEON POINT',
        lat: 37.1817,
        lng: -122.3939,
        elevationFt: 45,
        windDir: 315,
        windSpd: 22,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
      },
      {
        id: 'wp-kwvi',
        name: 'KWVI (WATSONVILLE)',
        lat: 36.9358,
        lng: -121.7897,
        elevationFt: 163,
        windDir: 295,
        windSpd: 15,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
      },
      {
        id: 'wp-kmry',
        name: 'KMRY (MONTEREY)',
        lat: 36.587,
        lng: -121.843,
        elevationFt: 257,
        windDir: 290,
        windSpd: 14,
        windSource: 'ECMWF IFS (850 hPa / 5000 ft)',
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

