import { generateAtlasCountries, type AtlasOwnership } from '../../model/atlas/countries';
import { generateAtlasWorld, type AtlasWorld } from '../../model/atlas/world';
import type { ResolvedGeographyControls } from '../../model/world-map';

export interface AtlasScene { world: AtlasWorld; ownership: AtlasOwnership }

/** Previews do not persist geometry; a three-entry LRU keeps rerenders cheap. */
const scenes = new Map<string, AtlasScene>();
const MAX_SCENES = 3;

export function getAtlasScene(
  seed: number, controls: ResolvedGeographyControls, countryCount: number,
): AtlasScene {
  const key = JSON.stringify([seed, controls.landFraction, controls.islandCount,
    controls.lakeCount, controls.minCountrySpacing, countryCount]);
  const cached = scenes.get(key);
  if (cached) {
    scenes.delete(key);
    scenes.set(key, cached);
    return cached;
  }
  const world = generateAtlasWorld(seed, controls);
  const ownership = generateAtlasCountries(world, countryCount, controls.minCountrySpacing);
  const scene = { world, ownership };
  scenes.set(key, scene);
  if (scenes.size > MAX_SCENES) scenes.delete(scenes.keys().next().value!);
  return scene;
}
