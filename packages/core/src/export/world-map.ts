import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as Y from 'yjs';
import { MapArtwork, type MapLayerVisibility } from '../components/map/MapArtwork';
import { getAtlasScene } from '../components/map/atlas-cache';
import { ATLAS_BIOMES } from '../model/atlas/biomes';
import { verifyMapTextures, type VerifiedTextures } from '../components/map/map-texture-source';
import { MAP_PALETTE } from '../components/map/MapGeography';
import { textureForBiome } from '../components/map/texture-pack';
import { setAsset, addMapOverlay, LOCAL_ORIGIN } from '../doc/mutations';
import { assetsMap, metaMap } from '../doc/schema';
import type { Lokasyon } from '../model/lokasyon';
import { readWorldMap, parseMapOverlay, validMapId, type CountryBiome, type MapOverlay, type WorldMap } from '../model/world-map';
import { MAP_HEIGHT, MAP_WIDTH } from '../model/world-map-generator';
import { uid } from '../util/id';
import { bytesToDataUrl } from '../util/assets';
import { worldMapsMap } from '../doc/schema';
import {
  isDedicatedMapTextureAsset, parseMapTextureOverride, textureKey, validTextureSlot,
  type MapTextureOverride, type MapTextureSlot,
} from '../model/world-map-textures';

export const MAX_MAP_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_MAP_IMAGE_SIDE = 8192;
export const MAX_MAP_IMAGE_PIXELS = 32 * 1024 * 1024;
export const MAX_MAP_TEXTURE_BYTES = 4 * 1024 * 1024;
export const MAX_MAP_TEXTURE_SIDE = 2048;

export type MapImageErrorCode = 'unsupported' | 'oversized' | 'corrupt' | 'aborted' | 'invalid';
export class MapImageError extends Error {
  constructor(public readonly code: MapImageErrorCode) { super(`Map image ${code}`); }
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new MapImageError('aborted');
}

function readBytes(file: File, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const onAbort = () => { reader.abort(); reject(new MapImageError('aborted')); };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    reader.onload = () => { cleanup(); resolve(new Uint8Array(reader.result as ArrayBuffer)); };
    reader.onerror = () => { cleanup(); reject(new MapImageError('corrupt')); };
    reader.onabort = () => { cleanup(); reject(new MapImageError('aborted')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try { aborted(signal); reader.readAsArrayBuffer(file); }
    catch (error) { cleanup(); reject(error); }
  });
}

async function validateImageFile(
  file: File, limits: { bytes: number; side: number; pixels: number }, signal?: AbortSignal,
): Promise<{
  bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; width: number; height: number;
}> {
  aborted(signal);
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw new MapImageError('unsupported');
  if (file.size < 1 || file.size > limits.bytes) throw new MapImageError('oversized');
  const bytes = await readBytes(file, signal);
  aborted(signal);
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((file.type === 'image/png' && !png) || (file.type === 'image/jpeg' && !jpeg)) throw new MapImageError('corrupt');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new MapImageError('corrupt'); }
  try {
    aborted(signal);
    if (!bitmap.width || !bitmap.height || bitmap.width > limits.side ||
        bitmap.height > limits.side || bitmap.width * bitmap.height > limits.pixels) {
      throw new MapImageError('oversized');
    }
    return { bytes, mime: file.type, width: bitmap.width, height: bitmap.height };
  } finally { bitmap.close(); }
}

export function validateMapImage(file: File, signal?: AbortSignal) {
  return validateImageFile(file, {
    bytes: MAX_MAP_IMAGE_BYTES, side: MAX_MAP_IMAGE_SIDE, pixels: MAX_MAP_IMAGE_PIXELS,
  }, signal);
}

export function validateMapTexture(file: File, signal?: AbortSignal) {
  return validateImageFile(file, {
    bytes: MAX_MAP_TEXTURE_BYTES, side: MAX_MAP_TEXTURE_SIDE,
    pixels: MAX_MAP_TEXTURE_SIDE * MAX_MAP_TEXTURE_SIDE,
  }, signal);
}

/** Conservative reachability: even an imported record can keep its asset alive. */
function isReferencedMapAsset(root: Y.Map<unknown>, assetId: string): boolean {
  for (const value of root.values()) {
    if (typeof value === 'object' && value !== null &&
        (value as { assetId?: unknown }).assetId === assetId) return true;
  }
  return false;
}

function textureFileName(name: string, mime: 'image/png' | 'image/jpeg'): string {
  return name.replace(/[\\/\x00-\x1f\x7f]/g, '').trim().slice(0, 80) ||
    (mime === 'image/png' ? 'texture.png' : 'texture.jpg');
}

/** One LOCAL_ORIGIN transaction keeps the slot record and verified asset bytes together. */
export async function placeMapTexture(
  doc: Y.Doc, worldId: string, slot: MapTextureSlot, file: File, signal?: AbortSignal,
): Promise<MapTextureOverride> {
  if (!validMapId(worldId) || !validTextureSlot(slot)) throw new MapImageError('invalid');
  const image = await validateMapTexture(file, signal);
  aborted(signal);
  const assetId = `${uid('maptex')}.${image.mime === 'image/png' ? 'png' : 'jpg'}`;
  const assets = assetsMap(doc);
  if (assets.has(assetId)) throw new MapImageError('invalid');
  const override: MapTextureOverride = {
    worldId, slot, assetId, fileName: textureFileName(file.name, image.mime),
  };
  const root = worldMapsMap(doc);
  doc.transact(() => {
    const prior = parseMapTextureOverride(root.get(textureKey(worldId, slot)), worldId, slot);
    assets.set(assetId, bytesToDataUrl(assetId, image.bytes));
    root.set(textureKey(worldId, slot), override);
    if (prior && isDedicatedMapTextureAsset(prior.assetId) &&
        !isReferencedMapAsset(root, prior.assetId)) assets.delete(prior.assetId);
    metaMap(doc).set('updatedAt', Date.now());
  }, LOCAL_ORIGIN);
  return override;
}

/** Reset also removes malformed records, without deleting unrelated assets. */
export function resetMapTexture(doc: Y.Doc, worldId: string, slot: MapTextureSlot): void {
  if (!validMapId(worldId) || !validTextureSlot(slot)) throw new MapImageError('invalid');
  const root = worldMapsMap(doc);
  const key = textureKey(worldId, slot);
  if (!root.has(key)) return;
  const assets = assetsMap(doc);
  doc.transact(() => {
    const prior = parseMapTextureOverride(root.get(key), worldId, slot);
    root.delete(key);
    if (prior && isDedicatedMapTextureAsset(prior.assetId) &&
        !isReferencedMapAsset(root, prior.assetId)) assets.delete(prior.assetId);
    metaMap(doc).set('updatedAt', Date.now());
  }, LOCAL_ORIGIN);
}

/** No Yjs write happens until MIME, bytes, decode, dimensions and placement all pass. */
export async function placeMapImage(
  doc: Y.Doc, worldId: string, file: File,
  placement: { x: number; y: number; scale?: number; rotation?: number },
  signal?: AbortSignal,
): Promise<MapOverlay> {
  if (!validMapId(worldId)) throw new MapImageError('invalid');
  const image = await validateMapImage(file, signal);
  aborted(signal);
  const assetId = `${uid('mapimg')}.${image.mime === 'image/png' ? 'png' : 'jpg'}`;
  const id = uid('mo');
  const current = readWorldMap(worldMapsMap(doc), worldId);
  const order = current.overlays.reduce((max, item) => Math.max(max, item.order), -1) + 1;
  const candidate = parseMapOverlay({
    id, worldId, assetId, x: placement.x, y: placement.y,
    scale: placement.scale ?? 1, rotation: placement.rotation ?? 0,
    order, visible: true,
  }, worldId, id);
  if (!candidate || assetsMap(doc).has(assetId)) throw new MapImageError('invalid');
  aborted(signal);
  doc.transact(() => {
    setAsset(doc, assetId, bytesToDataUrl(assetId, image.bytes));
    addMapOverlay(doc, worldId, candidate);
  }, LOCAL_ORIGIN);
  return candidate;
}

/** React escapes user labels and data URLs; one scene powers preview and export. */
export function renderWorldMapSvg(
  map: WorldMap, assets: Readonly<Record<string, string>>,
  options: { showSea?: boolean; locations?: Readonly<Record<string, Lokasyon>>; textures?: Partial<VerifiedTextures>; layers?: MapLayerVisibility } = {},
): string {
  return renderToStaticMarkup(React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: MAP_WIDTH, height: MAP_HEIGHT,
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
  }, React.createElement(MapArtwork, {
    map, assets, textures: options.textures, locations: options.locations, showSea: options.showSea ?? true,
    layers: options.layers,
  })));
}

function imageFromUrl(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    const onAbort = () => { image.src = ''; finish(new MapImageError('aborted')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    image.onload = () => finish();
    image.onerror = () => finish(new MapImageError('corrupt'));
    try { aborted(signal); image.src = url; }
    catch (error) { finish(error instanceof Error ? error : new MapImageError('corrupt')); }
  });
}

export async function renderWorldMapToDataURL(
  map: WorldMap, assets: Readonly<Record<string, string>>,
  type: 'image/png' | 'image/jpeg',
  locations?: Readonly<Record<string, Lokasyon>>,
  signal?: AbortSignal,
  layers?: MapLayerVisibility,
): Promise<string> {
  aborted(signal);
  let textures: VerifiedTextures | undefined;
  let customWater = false;
  if (map.countryConfig.appearance === 'texture') {
    const biomes = new Set<CountryBiome>();
    if (map.engineVersion === 2) {
      const { world } = getAtlasScene(map.seed, map.controls, map.countryConfig.count);
      for (let index = 0; index < world.land.length; index++) {
        if (world.land[index] && !world.lakes[index]) biomes.add(ATLAS_BIOMES[world.biome[index]]);
      }
      for (const country of map.countries) {
        const override = country.biomeOverride === undefined
          ? country.biome !== 'plain' ? country.biome : null
          : country.biomeOverride;
        if (override) biomes.add(override);
      }
    } else {
      for (let index = 0; index < map.countryConfig.count; index++)
        biomes.add(map.countries[index]?.biome ?? 'plain');
    }
    textures = await verifyMapTextures(map, assets, ['sea', ...biomes], signal);
    aborted(signal);
    if (textures.sea.kind === 'broken' || textures.sea.kind === 'loading') throw new MapImageError('corrupt');
    customWater = textures.sea.kind === 'custom';
    for (const biome of biomes) {
      const source = textures[biome];
      if (source.kind === 'broken' || source.kind === 'loading') throw new MapImageError('corrupt');
      if (source.kind === 'bundled') {
        const texture = textureForBiome(biome);
        if (!texture || !/^data:image\/png;base64,/.test(texture)) throw new MapImageError('corrupt');
        await imageFromUrl(texture, signal);
      }
    }
  }
  for (const overlay of map.overlays.filter((item) => item.visible)) {
    const url = assets[overlay.assetId];
    if (!url || !/^data:image\/(png|jpeg);base64,/.test(url)) throw new MapImageError('corrupt');
    await imageFromUrl(url, signal);
  }
  const svg = renderWorldMapSvg(map, assets, {
    showSea: type === 'image/jpeg' || customWater, locations, textures, layers,
  });
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  let image: HTMLImageElement;
  try { image = await imageFromUrl(svgUrl, signal); }
  finally { URL.revokeObjectURL(svgUrl); }
  aborted(signal);
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new MapImageError('corrupt');
  if (type === 'image/jpeg') {
    context.fillStyle = MAP_PALETTE.sea;
    context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  }
  context.drawImage(image, 0, 0, MAP_WIDTH, MAP_HEIGHT);
  try { return canvas.toDataURL(type, type === 'image/jpeg' ? 0.92 : undefined); }
  catch { throw new MapImageError('corrupt'); }
}
