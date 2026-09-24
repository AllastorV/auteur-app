/// <reference types="vite/client" />
import type { CountryBiome } from '../../model/world-map';
import plain from './textures/atlas-v1/plain.png?inline';
import forest from './textures/atlas-v1/forest.png?inline';
import desert from './textures/atlas-v1/desert.png?inline';
import mountain from './textures/atlas-v1/mountain.png?inline';
import swamp from './textures/atlas-v1/swamp.png?inline';
import tundra from './textures/atlas-v1/tundra.png?inline';
import volcanic from './textures/atlas-v1/volcanic.png?inline';

/** Immutable, fully offline artwork. Projects store only the pack version and biome keys. */
export const TEXTURE_PACK_V1: Readonly<Record<CountryBiome, string>> = {
  plain, forest, desert, mountain, swamp, tundra, volcanic,
};

export function textureForBiome(biome: CountryBiome): string {
  const texture = TEXTURE_PACK_V1[biome];
  if (!texture?.startsWith('data:image/png;base64,')) throw new Error(`Missing map texture: ${biome}`);
  return texture;
}
