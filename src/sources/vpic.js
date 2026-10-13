// NHTSA Product Information Catalog (vPIC) VIN decoder. Free, no key.
// https://vpic.nhtsa.dot.gov/api/
import { getJson } from '../http.js';

const BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

const FIELDS = {
  make: 'Make', model: 'Model', year: 'ModelYear', trim: 'Trim', series: 'Series',
  manufacturer: 'Manufacturer', vehicleType: 'VehicleType', bodyClass: 'BodyClass',
  doors: 'Doors', driveType: 'DriveType', transmission: 'TransmissionStyle',
  engineCylinders: 'EngineCylinders', displacementL: 'DisplacementL',
  engineHp: 'EngineHP', fuelType: 'FuelTypePrimary', electrification: 'ElectrificationLevel',
  plantCity: 'PlantCity', plantState: 'PlantState', plantCountry: 'PlantCountry',
  gvwr: 'GVWR', airbagsFront: 'AirBagLocFront', abs: 'ABS', esc: 'ESC',
};

export function parseDecode(json) {
  const r = json?.Results?.[0];
  if (!r) return null;
  const out = {};
  for (const [key, src] of Object.entries(FIELDS)) {
    const v = r[src];
    if (v !== undefined && v !== null && String(v).trim() !== '' && v !== 'Not Applicable') out[key] = String(v).trim();
  }
  if (out.year) out.year = Number(out.year);
  // ErrorCode is a comma list; "0" means clean decode.
  const codes = String(r.ErrorCode ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  out.decodeWarnings = codes.some((c) => c !== '0') ? String(r.ErrorText ?? '').split(';').map((s) => s.trim()).filter(Boolean) : [];
  return out;
}

export async function decodeVin(vin, opts) {
  const json = await getJson(`${BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, opts);
  return parseDecode(json);
}
