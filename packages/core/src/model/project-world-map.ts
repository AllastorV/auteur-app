import * as Y from 'yjs';
import { dunyalarMap, metaMap, worldMapsMap } from '../doc/schema';
import { LOCAL_ORIGIN } from '../doc/mutations';
import {
  countryConfigKey, countryKey, DEFAULT_COUNTRY_CONFIG, DEFAULT_MAP_SETTINGS,
  labelKey, markerKey, overlayKey, parseCountryConfig, parseMapCountry,
  parseMapSettings, readWorldMap, settingsKey, type CountryConfig, type MapDraft, type WorldMap,
} from './world-map';
import { PROJECT_MAP_ID } from './world-map-id';
import { MapLayoutError } from './world-map-generator';
import { generateAtlasWorld } from './atlas/world';
import { generateAtlasCountries } from './atlas/countries';
import {
  MAP_TEXTURE_SLOTS, parseMapTextureOverride, textureKey,
} from './world-map-textures';

export { PROJECT_MAP_ID } from './world-map-id';

export interface ProjectMapMeta { engineVersion: 1 | 2; locked: boolean }

export const projectMapMetaKey = `${PROJECT_MAP_ID}/meta`;

function parseMeta(value: unknown): ProjectMapMeta | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if ((item.engineVersion !== 1 && item.engineVersion !== 2) || typeof item.locked !== 'boolean') return null;
  return { engineVersion: item.engineVersion, locked: item.locked };
}

/** No settings means no project map; reads never create a default map. */
export function readProjectMap(doc: Y.Doc): WorldMap | null {
  const root = worldMapsMap(doc);
  const raw = root.get(settingsKey(PROJECT_MAP_ID));
  if (!parseMapSettings(raw)) return null;
  const meta = root.has(projectMapMetaKey) ? parseMeta(root.get(projectMapMetaKey)) : { engineVersion: 1 as const, locked: false };
  if (!meta) return null;
  const map = readWorldMap(root, PROJECT_MAP_ID);
  return {
    ...map,
    engineVersion: meta.engineVersion,
    locked: meta.locked,
    countries: meta.engineVersion === 2
      ? map.countries.map((country) => root.has(countryKey(PROJECT_MAP_ID, country.id))
        ? country : { ...country, biomeOverride: null })
      : map.countries,
  };
}

/** Legacy records remain in place even after one is explicitly adopted. */
export function legacyMapSources(doc: Y.Doc): { worldId: string; name: string }[] {
  const root = worldMapsMap(doc);
  const candidates = new Set<string>();
  for (const key of root.keys()) {
    const match = /^([A-Za-z0-9_-]{1,100})\//.exec(key);
    if (match) candidates.add(match[1]);
  }
  const sources: { worldId: string; name: string }[] = [];
  for (const worldId of candidates) {
    const map = readWorldMap(root, worldId);
    const authored = Boolean(parseMapSettings(root.get(settingsKey(worldId))) ||
      parseCountryConfig(root.get(countryConfigKey(worldId)))) ||
      map.markers.length > 0 || map.labels.length > 0 || map.overlays.length > 0 ||
      Object.keys(map.textureOverrides).length > 0 ||
      map.countries.some((country) => Boolean(parseMapCountry(root.get(countryKey(worldId, country.id)), worldId, country.id)));
    if (!authored) continue;
    sources.push({ worldId, name: dunyalarMap(doc).get(worldId)?.ad ?? worldId });
  }
  return sources.sort((a, b) => a.worldId.localeCompare(b.worldId));
}

/** Copies validated records into the canonical map in one undoable transaction. */
export function adoptLegacyMap(doc: Y.Doc, sourceWorldId: string): void {
  const root = worldMapsMap(doc);
  if (root.has(settingsKey(PROJECT_MAP_ID))) throw new Error('Project map already exists');
  const source = legacyMapSources(doc).find((item) => item.worldId === sourceWorldId);
  if (!source) throw new Error('Legacy map not found');
  const settings = parseMapSettings(root.get(settingsKey(sourceWorldId))) ?? DEFAULT_MAP_SETTINGS;
  const config = parseCountryConfig(root.get(countryConfigKey(sourceWorldId))) ?? DEFAULT_COUNTRY_CONFIG;
  const map = readWorldMap(root, sourceWorldId);
  const countryRecords = Array.from({ length: 16 }, (_, index) => {
    const id = `country-${index + 1}`;
    return parseMapCountry(root.get(countryKey(sourceWorldId, id)), sourceWorldId, id);
  }).filter((country) => country !== null);
  const textureRecords = MAP_TEXTURE_SLOTS.map((slot) =>
    parseMapTextureOverride(root.get(textureKey(sourceWorldId, slot)), sourceWorldId, slot));

  doc.transact(() => {
    root.set(settingsKey(PROJECT_MAP_ID), settings);
    root.set(countryConfigKey(PROJECT_MAP_ID), config);
    root.set(projectMapMetaKey, { engineVersion: 1, locked: false } satisfies ProjectMapMeta);
    for (const country of countryRecords) {
      root.set(countryKey(PROJECT_MAP_ID, country.id), { ...country, worldId: PROJECT_MAP_ID });
    }
    for (const marker of map.markers) {
      root.set(markerKey(PROJECT_MAP_ID, marker.id), { ...marker, worldId: PROJECT_MAP_ID });
    }
    for (const label of map.labels) {
      root.set(labelKey(PROJECT_MAP_ID, label.id), { ...label, worldId: PROJECT_MAP_ID });
    }
    for (const overlay of map.overlays) {
      root.set(overlayKey(PROJECT_MAP_ID, overlay.id), { ...overlay, worldId: PROJECT_MAP_ID });
    }
    for (const texture of textureRecords) {
      if (texture) root.set(textureKey(PROJECT_MAP_ID, texture.slot), { ...texture, worldId: PROJECT_MAP_ID });
    }
    metaMap(doc).set('updatedAt', Date.now());
  }, LOCAL_ORIGIN);
}

export function createProjectMap(doc: Y.Doc, seed: number): void {
  const root = worldMapsMap(doc);
  if (root.has(settingsKey(PROJECT_MAP_ID))) throw new Error('Project map already exists');
  const settings = parseMapSettings({ ...DEFAULT_MAP_SETTINGS, seed });
  if (!settings) throw new Error('Invalid map seed');
  doc.transact(() => {
    root.set(settingsKey(PROJECT_MAP_ID), settings);
    root.set(countryConfigKey(PROJECT_MAP_ID), { ...DEFAULT_COUNTRY_CONFIG });
    root.set(projectMapMetaKey, { engineVersion: 2, locked: false } satisfies ProjectMapMeta);
    metaMap(doc).set('updatedAt', Date.now());
  }, LOCAL_ORIGIN);
}

export function setProjectMapLock(doc: Y.Doc, locked: boolean): void {
  if (typeof locked !== 'boolean') throw new Error('Invalid map lock state');
  const root = worldMapsMap(doc);
  if (!readProjectMap(doc)) throw new Error('Project map not found');
  const meta = root.has(projectMapMetaKey) ? parseMeta(root.get(projectMapMetaKey)) : { engineVersion: 1 as const, locked: false };
  if (!meta) throw new Error('Invalid project map metadata');
  doc.transact(() => {
    root.set(projectMapMetaKey, { ...meta, locked });
    metaMap(doc).set('updatedAt', Date.now());
  }, LOCAL_ORIGIN);
}

/** Validate before any Yjs write; previews use this exact v2 pipeline. */
export function validateProjectMapDraft(draft: MapDraft & { engineVersion: 2 }, current: CountryConfig) {
  if (draft.engineVersion !== 2) throw new MapLayoutError('invalid');
  const settings = parseMapSettings({ seed: draft.seed, controls: draft.controls });
  const config = parseCountryConfig({ ...current, count: draft.countryCount });
  if (!settings || !config) throw new MapLayoutError('invalid');
  const world = generateAtlasWorld(settings.seed, settings.controls);
  generateAtlasCountries(world, config.count, settings.controls.minCountrySpacing);
  return { settings, config };
}

/** A confirmation flag is valid only for this call; authored map records are untouched. */
export function applyProjectMapDraft(
  doc: Y.Doc, draft: MapDraft & { engineVersion: 2 }, options: { confirmedLocked: boolean },
): void {
  const current = readProjectMap(doc);
  if (!current) throw new MapLayoutError('invalid');
  if (current.locked && !options.confirmedLocked) throw new MapLayoutError('locked');
  const { settings, config } = validateProjectMapDraft(draft, current.countryConfig);
  const root = worldMapsMap(doc);
  doc.transact(() => {
    root.set(settingsKey(PROJECT_MAP_ID), settings);
    root.set(countryConfigKey(PROJECT_MAP_ID), config);
    root.set(projectMapMetaKey, { engineVersion: 2, locked: current.locked ?? false } satisfies ProjectMapMeta);
    metaMap(doc).set('updatedAt', Date.now());
  }, LOCAL_ORIGIN);
}
