import type * as Y from 'yjs';
import { validMapId } from './world-map-id';
import {
  COUNTRY_BIOMES, readMapTextureRecords,
  type CountryBiome, type MapTextureOverride, type MapTextureSlot,
} from './world-map-textures';
export { COUNTRY_BIOMES } from './world-map-textures';
export type { CountryBiome } from './world-map-textures';
export { validMapId } from './world-map-id';

/** Coordinates are fractions of the export frame, never pixel or filesystem positions. */
export interface GeographyControls {
  landFraction: number;
  islandCount: number;
  lakeCount?: number;
  minCountrySpacing?: number;
}
export type ResolvedGeographyControls = GeographyControls & {
  lakeCount: number;
  minCountrySpacing: number;
};
export interface MapMarker { id: string; worldId: string; locationId: string | null; x: number; y: number; label: string }
export interface MapLabel { id: string; worldId: string; x: number; y: number; text: string }
export interface MapOverlay {
  id: string; worldId: string; assetId: string; x: number; y: number;
  scale: number; rotation: number; visible: boolean; order: number;
}
export interface MapCountry {
  id: string; worldId: string; name: string; biome: CountryBiome; note: string; color: string | null;
  biomeOverride?: CountryBiome | null;
}
export interface CountryConfig { count: number; appearance: 'color' | 'texture'; texturePack: 'atlas-v1' }
export interface MapDraft { seed: number; controls: GeographyControls; countryCount: number; engineVersion?: 2 }
export interface WorldMap {
  worldId: string;
  engineVersion?: 1 | 2;
  locked?: boolean;
  seed: number;
  controls: ResolvedGeographyControls;
  markers: MapMarker[];
  labels: MapLabel[];
  overlays: MapOverlay[];
  countryConfig: CountryConfig;
  countries: MapCountry[];
  textureOverrides: Partial<Record<MapTextureSlot, MapTextureOverride>>;
  invalidTextureSlots: MapTextureSlot[];
}
export type MapSettings = Pick<WorldMap, 'seed' | 'controls'>;

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  seed: 1,
  controls: { landFraction: 0.44, islandCount: 4, lakeCount: 0, minCountrySpacing: 0 },
};
export const DEFAULT_COUNTRY_CONFIG: CountryConfig = { count: 8, appearance: 'color', texturePack: 'atlas-v1' };

const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

/** Asset keys may have an extension, but are never treated as a path. */
const assetIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(value) &&
  !value.includes('..') && value !== '.';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const between = (value: unknown, low: number, high: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;

export function markerKey(worldId: string, id: string): string { return `${worldId}/marker/${id}`; }
export function labelKey(worldId: string, id: string): string { return `${worldId}/label/${id}`; }
export function overlayKey(worldId: string, id: string): string { return `${worldId}/overlay/${id}`; }
export function settingsKey(worldId: string): string { return `${worldId}/settings`; }
export function countryKey(worldId: string, id: string): string { return `${worldId}/country/${id}`; }
export function countryConfigKey(worldId: string): string { return `${worldId}/country-config`; }

export function defaultMapCountry(worldId: string, id: string): MapCountry {
  return { id, worldId, name: '', biome: 'plain', note: '', color: null };
}

export function parseCountryConfig(value: unknown): CountryConfig | null {
  if (!record(value) || !Number.isInteger(value.count) || !between(value.count, 2, 16) ||
      (value.appearance !== 'color' && value.appearance !== 'texture') || value.texturePack !== 'atlas-v1') return null;
  return { count: value.count, appearance: value.appearance, texturePack: 'atlas-v1' };
}

export function parseMapCountry(value: unknown, worldId: string, id: string): MapCountry | null {
  if (!record(value) || !validMapId(worldId) || !/^country-(?:[1-9]|1[0-6])$/.test(id) ||
      value.id !== id || value.worldId !== worldId ||
      typeof value.name !== 'string' || value.name.length > 120 ||
      !COUNTRY_BIOMES.includes(value.biome as CountryBiome) ||
      typeof value.note !== 'string' || value.note.length > 500 ||
      !(value.color === null || (typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color))) ||
      !(value.biomeOverride === undefined || value.biomeOverride === null ||
        COUNTRY_BIOMES.includes(value.biomeOverride as CountryBiome))) return null;
  return {
    id, worldId, name: value.name, biome: value.biome as CountryBiome, note: value.note, color: value.color,
    ...(value.biomeOverride !== undefined ? { biomeOverride: value.biomeOverride as CountryBiome | null } : {}),
  };
}

export function parseMapSettings(value: unknown): MapSettings | null {
  if (!record(value) || !record(value.controls)) return null;
  const { seed, controls } = value;
  const lakeCount = controls.lakeCount === undefined ? 0 : controls.lakeCount;
  const minCountrySpacing = controls.minCountrySpacing === undefined ? 0 : controls.minCountrySpacing;
  if (!between(seed, 0, 0xffffffff) || !Number.isInteger(seed) ||
      !between(controls.landFraction, 0.05, 0.9) ||
      !between(controls.islandCount, 0, 20) || !Number.isInteger(controls.islandCount) ||
      !between(lakeCount, 0, 8) || !Number.isInteger(lakeCount) ||
      !between(minCountrySpacing, 0, 8) || !Number.isInteger(minCountrySpacing)) return null;
  return { seed, controls: {
    landFraction: controls.landFraction, islandCount: controls.islandCount,
    lakeCount, minCountrySpacing,
  } };
}

export function parseMapMarker(value: unknown, worldId: string, id: string): MapMarker | null {
  if (!record(value) || !validMapId(worldId) || !identifier(id) ||
      value.worldId !== worldId || value.id !== id ||
      !(value.locationId === null || identifier(value.locationId)) ||
      !between(value.x, 0, 1) || !between(value.y, 0, 1) ||
      typeof value.label !== 'string' || value.label.length > 120) return null;
  return { id, worldId, locationId: value.locationId, x: value.x, y: value.y, label: value.label };
}

export function parseMapLabel(value: unknown, worldId: string, id: string): MapLabel | null {
  if (!record(value) || !validMapId(worldId) || !identifier(id) ||
      value.worldId !== worldId || value.id !== id ||
      !between(value.x, 0, 1) || !between(value.y, 0, 1) ||
      typeof value.text !== 'string' || value.text.length > 120) return null;
  return { id, worldId, x: value.x, y: value.y, text: value.text };
}

export function parseMapOverlay(value: unknown, worldId: string, id: string): MapOverlay | null {
  if (!record(value) || !validMapId(worldId) || !identifier(id) ||
      value.worldId !== worldId || value.id !== id || !assetIdentifier(value.assetId) ||
      !between(value.x, 0, 1) || !between(value.y, 0, 1) ||
      !between(value.scale, 0.05, 8) || !between(value.rotation, -360, 360) ||
      typeof value.visible !== 'boolean' ||
      !between(value.order, -10000, 10000)) return null;
  return {
    id, worldId, assetId: value.assetId, x: value.x, y: value.y,
    scale: value.scale, rotation: value.rotation, visible: value.visible, order: value.order,
  };
}

/** Read only one World. Malformed external entries are dropped, never repaired in-place. */
export function readWorldMap(root: Y.Map<unknown>, worldId: string): WorldMap {
  if (!validMapId(worldId)) throw new Error('Invalid world map ID');
  const settings = parseMapSettings(root.get(settingsKey(worldId))) ?? DEFAULT_MAP_SETTINGS;
  const countryConfig = parseCountryConfig(root.get(countryConfigKey(worldId))) ?? DEFAULT_COUNTRY_CONFIG;
  const countries = Array.from({ length: countryConfig.count }, (_, index) => {
    const id = `country-${index + 1}`;
    return parseMapCountry(root.get(countryKey(worldId, id)), worldId, id) ?? defaultMapCountry(worldId, id);
  });
  const markers: MapMarker[] = [];
  const labels: MapLabel[] = [];
  const overlays: MapOverlay[] = [];
  for (const [key, value] of root.entries()) {
    const prefix = `${worldId}/`;
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash < 1 || slash === rest.length - 1 || rest.indexOf('/', slash + 1) !== -1) continue;
    const kind = rest.slice(0, slash);
    const id = rest.slice(slash + 1);
    if (kind === 'marker') {
      const marker = parseMapMarker(value, worldId, id);
      if (marker) markers.push(marker);
    } else if (kind === 'label') {
      const label = parseMapLabel(value, worldId, id);
      if (label) labels.push(label);
    } else if (kind === 'overlay') {
      const overlay = parseMapOverlay(value, worldId, id);
      if (overlay) overlays.push(overlay);
    }
  }
  markers.sort((a, b) => a.id.localeCompare(b.id));
  labels.sort((a, b) => a.id.localeCompare(b.id));
  overlays.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return {
    worldId, seed: settings.seed, controls: { ...settings.controls }, markers, labels, overlays,
    countryConfig: { ...countryConfig }, countries,
    ...readMapTextureRecords(root, worldId),
  };
}
