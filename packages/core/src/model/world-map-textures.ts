import type * as Y from 'yjs';
import { validMapId } from './world-map-id';

/** One biome vocabulary drives both country metadata and custom texture slots. */
export const COUNTRY_BIOMES = ['plain', 'forest', 'desert', 'mountain', 'swamp', 'tundra', 'volcanic'] as const;
export type CountryBiome = typeof COUNTRY_BIOMES[number];
export const MAP_TEXTURE_SLOTS = ['sea', ...COUNTRY_BIOMES] as const;
export type MapTextureSlot = typeof MAP_TEXTURE_SLOTS[number];

export interface MapTextureOverride {
  worldId: string;
  slot: MapTextureSlot;
  assetId: string;
  fileName: string;
}


export function validTextureSlot(slot: unknown): slot is MapTextureSlot {
  return typeof slot === 'string' && MAP_TEXTURE_SLOTS.includes(slot as MapTextureSlot);
}

export function textureKey(worldId: string, slot: MapTextureSlot): string {
  return `${worldId}/texture/${slot}`;
}

export function isDedicatedMapTextureAsset(id: string): boolean {
  return /^maptex_[a-z0-9]{10}\.(?:png|jpg)$/.test(id);
}

export function parseMapTextureOverride(
  value: unknown, worldId: string, slot: MapTextureSlot,
): MapTextureOverride | null {
  if (!validMapId(worldId) || !validTextureSlot(slot) ||
      typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.worldId !== worldId || item.slot !== slot ||
      typeof item.assetId !== 'string' || !isDedicatedMapTextureAsset(item.assetId) ||
      typeof item.fileName !== 'string' || item.fileName.length < 1 || item.fileName.length > 80 ||
      /[\\/\x00-\x1f\x7f]/.test(item.fileName)) return null;
  return { worldId, slot, assetId: item.assetId, fileName: item.fileName };
}

export function readMapTextureRecords(root: Y.Map<unknown>, worldId: string): {
  textureOverrides: Partial<Record<MapTextureSlot, MapTextureOverride>>;
  invalidTextureSlots: MapTextureSlot[];
} {
  const textureOverrides: Partial<Record<MapTextureSlot, MapTextureOverride>> = {};
  const invalidTextureSlots: MapTextureSlot[] = [];
  for (const slot of MAP_TEXTURE_SLOTS) {
    const key = textureKey(worldId, slot);
    if (!root.has(key)) continue;
    const parsed = parseMapTextureOverride(root.get(key), worldId, slot);
    if (parsed) textureOverrides[slot] = parsed;
    else invalidTextureSlots.push(slot);
  }
  return { textureOverrides, invalidTextureSlots };
}

/** Packaging keeps only dedicated bytes reachable from a valid per-slot record. */
export function referencedMapTextureAssetIds(worldMaps: unknown): Set<string> {
  const referenced = new Set<string>();
  if (typeof worldMaps !== 'object' || worldMaps === null || Array.isArray(worldMaps)) return referenced;
  for (const [key, value] of Object.entries(worldMaps)) {
    const match = /^(@project|[A-Za-z0-9_-]{1,100})\/texture\/([a-z]+)$/.exec(key);
    if (!match || !validTextureSlot(match[2])) continue;
    const record = parseMapTextureOverride(value, match[1], match[2]);
    if (record) referenced.add(record.assetId);
  }
  return referenced;
}
