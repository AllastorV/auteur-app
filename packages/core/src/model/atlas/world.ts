import type { MapPoint } from '../world-map-generator';
import type { ResolvedGeographyControls } from '../world-map';
import { classifyAtlasBiomes } from './biomes';
import { deriveAtlasDrainage, placeAtlasLakes } from './hydrology';
import { generateAtlasTerrain } from './terrain';
import type { AtlasTerrain } from './types';

export interface AtlasWorld extends AtlasTerrain {
  lakes: Uint8Array;
  biome: Uint8Array;
  moisture: Float32Array;
  rivers: MapPoint[][];
  /** Topological drainage fields also let tests and inspectors explain each river. */
  flowTo: Int32Array;
  drainHeight: Float32Array;
  accumulation: Float32Array;
  riverCells: number[][];
}

export function generateAtlasWorld(seed: number, controls: ResolvedGeographyControls): AtlasWorld {
  const terrain = generateAtlasTerrain(seed, controls);
  const lakes = placeAtlasLakes(terrain);
  const climate = classifyAtlasBiomes(terrain, lakes);
  const drainage = deriveAtlasDrainage(terrain, lakes, climate.moisture);
  return { ...terrain, lakes, ...climate, ...drainage };
}

/** Hit-test normalized [0,1] map coordinates; inland lakes are water. */
export function isAtlasLand(world: AtlasWorld, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return false;
  const col = Math.floor(x * world.width) % world.width;
  const row = Math.min(world.height - 1, Math.floor(y * world.height));
  const index = row * world.width + col;
  return world.land[index] !== 0 && world.lakes[index] === 0;
}
