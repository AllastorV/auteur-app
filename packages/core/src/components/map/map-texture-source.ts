import { useEffect, useState } from 'react';
import type { WorldMap } from '../../model/world-map';
import { MAP_TEXTURE_SLOTS, type MapTextureSlot } from '../../model/world-map-textures';
import { decodeBase64 } from '../../util/assets';
import { textureForBiome } from './texture-pack';

export type TextureState =
  | { kind: 'bundled'; url: string }
  | { kind: 'custom'; url: string; fileName: string }
  | { kind: 'loading' }
  | { kind: 'broken' };
export type VerifiedTextures = Record<MapTextureSlot, TextureState>;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 2048;

function bundled(slot: MapTextureSlot): TextureState {
  return { kind: 'bundled', url: slot === 'sea' ? '' : textureForBiome(slot) };
}

/** A synchronous guard also protects static SVG callers that supply forged resolution state. */
export function safeTextureState(
  map: WorldMap, slot: MapTextureSlot, assets: Readonly<Record<string, string>>,
  textures?: Partial<VerifiedTextures>,
): TextureState {
  if (map.invalidTextureSlots.includes(slot)) return { kind: 'broken' };
  const override = map.textureOverrides[slot];
  if (!override) return bundled(slot);
  const state = textures?.[slot];
  if (state?.kind !== 'custom') return state?.kind === 'broken' ? state : { kind: 'loading' };
  if (state.fileName !== override.fileName || state.url !== assets[override.assetId] ||
      !validTextureDataUrl(override.assetId, state.url)) return { kind: 'broken' };
  return state;
}

export function validTextureDataUrl(assetId: string, url: unknown): url is string {
  if (typeof url !== 'string' || url.length > MAX_BYTES * 4 / 3 + 128) return false;
  const mime = assetId.endsWith('.png') ? 'png' : assetId.endsWith('.jpg') ? 'jpeg' : null;
  if (!mime) return false;
  const prefix = `data:image/${mime};base64,`;
  if (!url.startsWith(prefix)) return false;
  const encoded = url.slice(prefix.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  try {
    const bytes = decodeBase64(encoded);
    if (!bytes.length || bytes.length > MAX_BYTES) return false;
    if (mime === 'png') {
      if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return false;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      return width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE;
    }
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  } catch { return false; }
}

function decodeImage(url: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    let done = false;
    const finish = (valid: boolean) => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
      resolve(valid);
    };
    const onAbort = () => { image.src = ''; finish(false); };
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 &&
      image.naturalWidth <= MAX_SIDE && image.naturalHeight <= MAX_SIDE);
    image.onerror = () => finish(false);
    if (signal?.aborted) { finish(false); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    image.src = url;
  });
}

export function initialTextureStates(map: WorldMap): VerifiedTextures {
  return Object.fromEntries(MAP_TEXTURE_SLOTS.map((slot) => [slot,
    map.invalidTextureSlots.includes(slot) ? { kind: 'broken' } :
      map.textureOverrides[slot] ? { kind: 'loading' } : bundled(slot),
  ])) as VerifiedTextures;
}

export async function verifyMapTextures(
  map: WorldMap, assets: Readonly<Record<string, string>>,
  slots: readonly MapTextureSlot[] = MAP_TEXTURE_SLOTS, signal?: AbortSignal,
): Promise<VerifiedTextures> {
  const states = initialTextureStates(map);
  await Promise.all(slots.map(async (slot) => {
    const override = map.textureOverrides[slot];
    if (!override || map.invalidTextureSlots.includes(slot)) return;
    const url = assets[override.assetId];
    if (!validTextureDataUrl(override.assetId, url) || !(await decodeImage(url, signal))) {
      states[slot] = { kind: 'broken' };
      return;
    }
    states[slot] = { kind: 'custom', url, fileName: override.fileName };
  }));
  return states;
}

export function useMapTextureSources(
  map: WorldMap | null, assets: Readonly<Record<string, string>>,
): VerifiedTextures | null {
  const [resolved, setResolved] = useState<VerifiedTextures | null>(null);
  const fingerprint = map ? MAP_TEXTURE_SLOTS.map((slot) => {
    const item = map.textureOverrides[slot];
    return item ? `${slot}:${item.assetId}:${item.fileName}:${assets[item.assetId] ?? ''}` :
      map.invalidTextureSlots.includes(slot) ? `${slot}:invalid` : `${slot}:bundled`;
  }).join('|') : '';
  useEffect(() => {
    if (!map) { setResolved(null); return; }
    let active = true;
    setResolved(initialTextureStates(map));
    void verifyMapTextures(map, assets).then((states) => {
      if (active) setResolved(states);
    });
    return () => { active = false; };
  // fingerprint tracks the map's texture entries and their exact asset bytes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.worldId, fingerprint]);
  return map ? resolved ?? initialTextureStates(map) : null;
}
