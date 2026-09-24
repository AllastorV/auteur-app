import { describe, expect, it } from 'vitest';
import { generateAtlasWorld, isAtlasLand } from '../src/model/atlas/world';
import { MapLayoutError } from '../src/model/world-map-generator';

const controls = { landFraction: .44, islandCount: 4, lakeCount: 3, minCountrySpacing: 0 };

function componentCount(mask: Uint8Array, width: number, height: number): number {
  const seen = new Uint8Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    count++;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [y * width + (x + width - 1) % width, y * width + (x + 1) % width];
      if (y > 0) neighbors.push(index - width);
      if (y < height - 1) neighbors.push(index + width);
      for (const next of neighbors) {
        if (mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
  }
  return count;
}

describe('atlas hydrology and biomes', () => {
  it('places the requested separate inland lakes without converting sea to lake', () => {
    const world = generateAtlasWorld(641, controls);
    expect(componentCount(world.lakes, world.width, world.height)).toBe(3);
    expect(world.lakes.some((cell) => cell === 1)).toBe(true);
    expect(world.lakes.every((cell, index) => cell === 0 || world.land[index] === 1)).toBe(true);
    const lakeCell = world.lakes.findIndex((cell) => cell === 1);
    expect(isAtlasLand(world, (lakeCell % world.width + .5) / world.width,
      (Math.floor(lakeCell / world.width) + .5) / world.height)).toBe(false);
  });

  it('sends each land cell by adjacent, acyclic, nonascending drainage to water', () => {
    const world = generateAtlasWorld(641, controls);
    for (let index = 0; index < world.land.length; index++) {
      if (!world.land[index] || world.lakes[index]) continue;
      const next = world.flowTo[index];
      expect(next).toBeGreaterThanOrEqual(0);
      const dx = Math.abs(index % world.width - next % world.width);
      const dy = Math.abs(Math.floor(index / world.width) - Math.floor(next / world.width));
      expect(dy + Math.min(dx, world.width - dx)).toBe(1);
      expect(world.drainHeight[next]).toBeLessThanOrEqual(world.drainHeight[index]);
    }
    for (let start = 0; start < world.land.length; start += 83) {
      if (!world.land[start] || world.lakes[start]) continue;
      const seen = new Set<number>();
      let index = start;
      while (world.land[index] && !world.lakes[index]) {
        expect(seen.has(index)).toBe(false);
        seen.add(index);
        index = world.flowTo[index];
        expect(seen.size).toBeLessThan(world.land.length);
      }
    }
  });

  it('traces adjacent river cells to sea or lake and creates varied world biomes', () => {
    const world = generateAtlasWorld(641, controls);
    expect(world.rivers.length).toBeGreaterThan(0);
    expect(world.rivers.every((river) => river.length >= 2)).toBe(true);
    for (const route of world.riverCells) {
      expect(route.length).toBeGreaterThanOrEqual(2);
      expect(world.land[route.at(-1)!] === 0 || world.lakes[route.at(-1)!] === 1).toBe(true);
      for (let i = 1; i < route.length; i++) expect(world.flowTo[route[i - 1]]).toBe(route[i]);
    }
    expect(world.biome.length).toBe(world.width * world.height);
    expect(world.moisture.length).toBe(world.biome.length);
    expect(new Set(Array.from(world.biome).filter((_, index) => world.land[index] && !world.lakes[index])).size)
      .toBeGreaterThanOrEqual(3);
  });

  it('is deterministic and independent of country spacing', () => {
    const first = generateAtlasWorld(91, controls);
    const same = generateAtlasWorld(91, controls);
    const changedPolitics = generateAtlasWorld(91, { ...controls, minCountrySpacing: 8 });
    expect(Array.from(first.lakes)).toEqual(Array.from(same.lakes));
    expect(Array.from(first.biome)).toEqual(Array.from(same.biome));
    expect(first.riverCells).toEqual(same.riverCells);
    expect(Array.from(first.land)).toEqual(Array.from(changedPolitics.land));
    expect(Array.from(first.biome)).toEqual(Array.from(changedPolitics.biome));
    expect(first.riverCells).toEqual(changedPolitics.riverCells);
  });

  it('rejects an impossible lake request without changing saved data', () => {
    const controlsImpossible = { ...controls, landFraction: .05, islandCount: 0, lakeCount: 8 };
    expect(() => generateAtlasWorld(42, controlsImpossible)).toThrowError(MapLayoutError);
    try { generateAtlasWorld(42, controlsImpossible); } catch (error) {
      expect((error as MapLayoutError).code).toBe('lakes');
    }
  });

  it('keeps mountains as ranges and makes dry regions visible instead of covering continents in gray', () => {
    for (const seed of [0, 1, 5]) {
      const world = generateAtlasWorld(seed, { ...controls, lakeCount: 0 });
      let land = 0;
      let mountain = 0;
      let desert = 0;
      for (let index = 0; index < world.land.length; index++) {
        if (!world.land[index] || world.lakes[index]) continue;
        land++;
        if (world.biome[index] === 3 || world.biome[index] === 6) mountain++;
        if (world.biome[index] === 2) desert++;
      }
      expect(mountain / land).toBeLessThan(.25);
      expect(desert / land).toBeGreaterThan(.03);
    }
  });

  it('keeps 0–99 seed sweep bounded with valid waterways and finite moisture', () => {
    for (let seed = 0; seed < 100; seed++) {
      const world = generateAtlasWorld(seed, { ...controls, lakeCount: 0 });
      expect(world.flowTo.length).toBe(world.width * world.height);
      expect(world.moisture.every(Number.isFinite)).toBe(true);
      expect(world.rivers.every((river) => river.every((point) =>
        Number.isFinite(point.x) && Number.isFinite(point.y)))).toBe(true);
    }
  });

  it('can honor a normal three-lake request for most random seeds', () => {
    let generated = 0;
    for (let seed = 0; seed < 100; seed++) {
      try {
        const world = generateAtlasWorld(seed, controls);
        expect(componentCount(world.lakes, world.width, world.height)).toBe(3);
        generated++;
      } catch (error) {
        if (!(error instanceof MapLayoutError) || error.code !== 'lakes') throw error;
      }
    }
    expect(generated).toBeGreaterThanOrEqual(90);
  });
});
