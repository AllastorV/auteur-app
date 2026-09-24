import { createNoise4D } from 'simplex-noise';
import type { CountryBiome } from '../world-map-textures';
import { distanceFromWater } from './hydrology';
import type { AtlasTerrain } from './types';

export const ATLAS_BIOMES: readonly CountryBiome[] = [
  'plain', 'forest', 'desert', 'mountain', 'swamp', 'tundra', 'volcanic',
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Biomes belong to cells, not countries, and can cross any future border. */
export function classifyAtlasBiomes(terrain: AtlasTerrain, lakes: Uint8Array): {
  biome: Uint8Array; moisture: Float32Array;
} {
  const { width, height, land, elevation, seed } = terrain;
  const distance = distanceFromWater(terrain, lakes);
  const climateNoise = createNoise4D(seededRandom(seed ^ 0x62696f6d));
  const mountainNoise = createNoise4D(seededRandom(seed ^ 0x72696467));
  const volcanicNoise = createNoise4D(seededRandom(seed ^ 0x766f6c63));
  const moisture = new Float32Array(land.length);
  const biome = new Uint8Array(land.length);
  let coastLevel = Infinity;
  for (let index = 0; index < land.length; index++) {
    if (land[index] && elevation[index] < coastLevel) coastLevel = elevation[index];
  }
  for (let index = 0; index < land.length; index++) {
    const x = (index % width + .5) / width;
    const y = (Math.floor(index / width) + .5) / height;
    const theta = x * Math.PI * 2;
    const co = Math.cos(theta);
    const si = Math.sin(theta);
    const latitude = Math.abs(y - .5) * 2;
    const climate = climateNoise(co * 1.35, si * 1.35, y * 2.2, 5) * .75 +
      climateNoise(co * 3.2, si * 3.2, y * 5, 17) * .25;
    const wetness = clamp01(.43 + .42 * climate + .12 * Math.exp(-distance[index] / 12) +
      .08 * (1 - latitude));
    moisture[index] = wetness;
    if (!land[index] || lakes[index]) continue;
    const rise = elevation[index] - coastLevel;
    const ridge = 1 - Math.abs(mountainNoise(co * 3.1, si * 3.1, y * 5.7, 29));
    const volcanic = volcanicNoise(co * 4.2, si * 4.2, y * 7, 37);
    if (rise > .55 && volcanic > .72) biome[index] = 6;
    else if (rise > .27 && ridge > .91) biome[index] = 3;
    else if (latitude > .76) biome[index] = 5;
    else if (distance[index] < 7 && rise < .13 && wetness > .67) biome[index] = 4;
    else if (wetness < .39) biome[index] = 2;
    else if (wetness > .57) biome[index] = 1;
    else biome[index] = 0;
  }
  return { biome, moisture };
}
