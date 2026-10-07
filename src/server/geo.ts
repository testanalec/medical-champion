import { sql } from './db';

export interface Place {
  name: string;
  type: 'hospital' | 'locality';
  lat: number;
  lng: number;
  address: string;
}

// Built-in gazetteer so the product keeps working if the maps provider is unavailable (FRD §46).
export const GAZETTEER: Place[] = [
  { name: 'Medanta – The Medicity', type: 'hospital', lat: 28.4394, lng: 77.0406, address: 'CH Baktawar Singh Rd, Sector 38, Gurugram' },
  { name: 'Artemis Hospital', type: 'hospital', lat: 28.4311, lng: 77.0726, address: 'Sector 51, Gurugram' },
  { name: 'Fortis Memorial Research Institute', type: 'hospital', lat: 28.457, lng: 77.0726, address: 'Sector 44, Gurugram' },
  { name: 'Max Hospital Gurugram', type: 'hospital', lat: 28.464, lng: 77.071, address: 'Sushant Lok 1, Sector 43, Gurugram' },
  { name: 'Paras Hospital', type: 'hospital', lat: 28.4598, lng: 77.076, address: 'Sushant Lok 1, Sector 43, Gurugram' },
  { name: 'W Pratiksha Hospital', type: 'hospital', lat: 28.4203, lng: 77.1007, address: 'Golf Course Extension Rd, Sector 56, Gurugram' },
  { name: 'CK Birla Hospital', type: 'hospital', lat: 28.4296, lng: 77.0685, address: 'Sector 51, Gurugram' },
  { name: 'Park Hospital', type: 'hospital', lat: 28.42, lng: 77.0452, address: 'Sector 47, Gurugram' },
  { name: 'Civil Hospital Gurugram', type: 'hospital', lat: 28.4696, lng: 77.0266, address: 'Sector 10, Gurugram' },
  { name: 'Manipal Hospital Gurugram', type: 'hospital', lat: 28.5096, lng: 77.046, address: 'Palam Vihar, Gurugram' },
  { name: 'Sanar International Hospital', type: 'hospital', lat: 28.4425, lng: 77.0985, address: 'Golf Course Rd, Sector 53, Gurugram' },
  { name: 'Signature Hospital', type: 'hospital', lat: 28.431, lng: 76.9915, address: 'Sector 37D, Gurugram' },
  { name: 'DLF Phase 1', type: 'locality', lat: 28.4722, lng: 77.093, address: 'DLF Phase 1, Gurugram' },
  { name: 'DLF Phase 2', type: 'locality', lat: 28.489, lng: 77.088, address: 'DLF Phase 2, Gurugram' },
  { name: 'DLF Phase 3', type: 'locality', lat: 28.493, lng: 77.096, address: 'DLF Phase 3, Gurugram' },
  { name: 'DLF Phase 4', type: 'locality', lat: 28.466, lng: 77.082, address: 'DLF Phase 4, Gurugram' },
  { name: 'DLF Phase 5', type: 'locality', lat: 28.45, lng: 77.1, address: 'DLF Phase 5, Gurugram' },
  { name: 'Sushant Lok 1', type: 'locality', lat: 28.465, lng: 77.073, address: 'Sushant Lok 1, Gurugram' },
  { name: 'Sohna Road', type: 'locality', lat: 28.41, lng: 77.045, address: 'Sohna Road, Gurugram' },
  { name: 'Golf Course Road', type: 'locality', lat: 28.45, lng: 77.098, address: 'Golf Course Road, Gurugram' },
  { name: 'Golf Course Extension Road', type: 'locality', lat: 28.405, lng: 77.095, address: 'Golf Course Extension Road, Gurugram' },
  { name: 'Sector 56', type: 'locality', lat: 28.423, lng: 77.103, address: 'Sector 56, Gurugram' },
  { name: 'Sector 57', type: 'locality', lat: 28.422, lng: 77.085, address: 'Sector 57, Gurugram' },
  { name: 'South City 1', type: 'locality', lat: 28.458, lng: 77.062, address: 'South City 1, Gurugram' },
  { name: 'South City 2', type: 'locality', lat: 28.428, lng: 77.056, address: 'South City 2, Gurugram' },
  { name: 'Nirvana Country', type: 'locality', lat: 28.413, lng: 77.063, address: 'Nirvana Country, Sector 50, Gurugram' },
  { name: 'Palam Vihar', type: 'locality', lat: 28.51, lng: 77.04, address: 'Palam Vihar, Gurugram' },
  { name: 'Sector 14', type: 'locality', lat: 28.475, lng: 77.045, address: 'Sector 14, Gurugram' },
  { name: 'Sector 15', type: 'locality', lat: 28.458, lng: 77.04, address: 'Sector 15, Gurugram' },
  { name: 'Cyber City', type: 'locality', lat: 28.495, lng: 77.089, address: 'DLF Cyber City, Gurugram' },
  { name: 'MG Road', type: 'locality', lat: 28.48, lng: 77.08, address: 'MG Road, Gurugram' },
  { name: 'Udyog Vihar', type: 'locality', lat: 28.5, lng: 77.08, address: 'Udyog Vihar, Gurugram' },
  { name: 'Sector 82', type: 'locality', lat: 28.39, lng: 76.965, address: 'Sector 82, Gurugram' },
  { name: 'Manesar', type: 'locality', lat: 28.354, lng: 76.94, address: 'Manesar, Gurugram' },
  { name: 'Faridabad Sector 15', type: 'locality', lat: 28.3955, lng: 77.3268, address: 'Sector 15, Faridabad' },
  { name: 'Dwarka Sector 10', type: 'locality', lat: 28.5823, lng: 77.0591, address: 'Dwarka Sector 10, New Delhi' },
];

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Rough urban ETA: 22 km/h average + 8 min buffer. */
export const etaMinutes = (km: number) => Math.round((km / 22) * 60 + 8);

export function searchGazetteer(q: string, limit = 8, type?: string | null): Place[] {
  const s = q.toLowerCase().trim();
  const pool = GAZETTEER.filter((p) => !type || p.type === type);
  if (!s) return type ? pool.slice(0, limit) : [];
  return pool.filter((p) => p.name.toLowerCase().includes(s) || p.address.toLowerCase().includes(s)).slice(0, limit);
}

export async function geocode(q: string): Promise<{ lat: number; lng: number; address: string; source: string } | null> {
  const local = searchGazetteer(q, 1)[0];
  if (local) return { lat: local.lat, lng: local.lng, address: `${local.name}, ${local.address}`, source: 'gazetteer' };
  // Try substring matching of known localities inside a longer typed address
  const lower = q.toLowerCase();
  const inText = GAZETTEER.filter((p) => lower.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  if (inText) return { lat: inText.lat, lng: inText.lng, address: q, source: 'gazetteer' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`,
      { headers: { 'user-agent': 'ChampOnCall/1.0 (ops@champoncall.com)' }, signal: ctrl.signal },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: data[0].display_name, source: 'nominatim' };
  } catch {
    return null; // maps unavailable → retain typed address, manual ops handling
  }
}

export async function reverseLabel(lat: number, lng: number): Promise<string> {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of GAZETTEER) {
    const d = haversineKm(lat, lng, p.lat, p.lng);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best && bestD < 2.5) return `Near ${best.name}, ${best.address}`;
  return `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

export interface AreaCheck {
  inArea: boolean | null; // null = unknown
  areaId: string | null;
  areaName: string | null;
  distanceKm: number | null;
}

export async function checkServiceArea(lat: number | null, lng: number | null, address: string | null): Promise<AreaCheck> {
  const areas = await sql`SELECT * FROM service_areas WHERE active`;
  if (lat != null && lng != null) {
    for (const a of areas) {
      const d = haversineKm(lat, lng, a.center_lat, a.center_lng);
      if (d <= a.radius_km) return { inArea: true, areaId: a.id, areaName: a.name, distanceKm: d };
    }
    return { inArea: false, areaId: null, areaName: null, distanceKm: null };
  }
  if (address) {
    const low = address.toLowerCase();
    for (const a of areas) {
      if ((a.keywords as string[]).some((k) => low.includes(k.toLowerCase()))) return { inArea: true, areaId: a.id, areaName: a.name, distanceKm: null };
    }
  }
  return { inArea: null, areaId: null, areaName: null, distanceKm: null };
}

export async function createLocation(tx: any, loc: { address?: string | null; place_name?: string | null; lat?: number | null; lng?: number | null; source: string }) {
  const rows = await tx`INSERT INTO locations (address, place_name, lat, lng, source)
    VALUES (${loc.address ?? null}, ${loc.place_name ?? null}, ${loc.lat ?? null}, ${loc.lng ?? null}, ${loc.source}) RETURNING id`;
  return rows[0].id as string;
}

export const mapsLink = (lat?: number | null, lng?: number | null, address?: string | null) =>
  lat != null && lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || '')}`;
