import { describe, expect, it } from 'vitest';
import { countryAt, generateAtlasCountries } from '../src/model/atlas/countries';
import { generateAtlasWorld } from '../src/model/atlas/world';
import { MAP_HEIGHT, MAP_WIDTH, MapLayoutError } from '../src/model/world-map-generator';

const controls = { landFraction: .44, islandCount: 4, lakeCount: 2, minCountrySpacing: 0 };

describe('terrain-aware atlas countries', () => {
  it('grows 2–16 countries on land only and leaves genuine unclaimed terrain', () => {
    const world = generateAtlasWorld(91, controls);
    for (const count of [2, 4, 8, 16]) {
      const ownership = generateAtlasCountries(world, count, 0);
      expect(ownership.sites).toHaveLength(count);
      expect(ownership.fillPaths).toHaveLength(count);
      const seen = new Set<number>();
      let available = 0;
      let unclaimed = 0;
      ownership.owners.forEach((owner, index) => {
        expect(owner).toBeGreaterThanOrEqual(0);
        expect(owner).toBeLessThanOrEqual(count);
        if (!world.land[index] || world.lakes[index]) expect(owner).toBe(0);
        else {
          available++;
          if (owner === 0) unclaimed++;
        }
        if (owner) seen.add(owner);
      });
      expect(seen.size).toBe(count);
      expect(unclaimed / available).toBeGreaterThan(.09);
      expect(unclaimed / available).toBeLessThan(count >= 8 ? .35 : .70);
      expect(ownership.borderPaths.every((path) => path.startsWith('M '))).toBe(true);
    }
  });

  it('keeps every seeded country connected to its site, with no sea ownership', () => {
    const world = generateAtlasWorld(91, controls);
    const ownership = generateAtlasCountries(world, 8, 0);
    for (let owner = 1; owner <= 8; owner++) {
      const site = ownership.sites[owner - 1];
      const x = Math.floor(site.x / MAP_WIDTH * world.width) % world.width;
      const y = Math.floor(site.y / MAP_HEIGHT * world.height);
      const start = y * world.width + x;
      expect(ownership.owners[start]).toBe(owner);
      const reached = new Set<number>([start]);
      const queue = [start];
      while (queue.length) {
        const index = queue.pop()!;
        const col = index % world.width;
        const row = Math.floor(index / world.width);
        const neighbors = [row * world.width + (col + world.width - 1) % world.width,
          row * world.width + (col + 1) % world.width];
        if (row > 0) neighbors.push(index - world.width);
        if (row < world.height - 1) neighbors.push(index + world.width);
        for (const next of neighbors) {
          if (ownership.owners[next] !== owner || reached.has(next)) continue;
          reached.add(next);
          queue.push(next);
        }
      }
      expect(reached.size).toBe(ownership.owners.filter((value) => value === owner).length);
    }
  });

  it('changes borders when country count changes without changing any coast, lake or biome', () => {
    const world = generateAtlasWorld(91, controls);
    const coastBefore = world.coastPaths;
    const two = generateAtlasCountries(world, 2, 0);
    const sixteen = generateAtlasCountries(world, 16, 0);
    expect(two.borderPaths).not.toEqual(sixteen.borderPaths);
    expect(world.coastPaths).toEqual(coastBefore);
    expect(world.coastPaths).toEqual(generateAtlasWorld(91, controls).coastPaths);
    expect(sixteen.borderPaths.some((path) => path.includes(' Q '))).toBe(true);
  });

  it('hit-tests country, unclaimed terrain, sea and inland lake separately', () => {
    const world = generateAtlasWorld(91, controls);
    const ownership = generateAtlasCountries(world, 8, 0);
    const hit = (index: number) => countryAt(ownership, world,
      ((index % world.width) + .5) / world.width,
      (Math.floor(index / world.width) + .5) / world.height);
    const claimed = ownership.owners.findIndex((owner) => owner > 0);
    const unclaimed = ownership.owners.findIndex((owner, index) =>
      owner === 0 && world.land[index] === 1 && world.lakes[index] === 0);
    const lake = world.lakes.findIndex((cell) => cell === 1);
    const sea = world.land.findIndex((cell) => cell === 0);
    expect(hit(claimed)).toBeGreaterThan(0);
    expect(hit(unclaimed)).toBeNull();
    expect(hit(lake)).toBeNull();
    expect(hit(sea)).toBeNull();
  });

  it('rejects impossible country separation without mutating the generated world', () => {
    const generated = generateAtlasWorld(42, { landFraction: .05, islandCount: 0,
      lakeCount: 0, minCountrySpacing: 8 });
    // Force a tiny valid land component. Whether a random 5% world can fit
    // 16 sites depends on coast topology, not on the rejection contract.
    const land = new Uint8Array(generated.land.length);
    const component: number[] = [];
    for (let y = 70; y < 74; y++) for (let x = 100; x < 104; x++) {
      const cell = y * generated.width + x;
      land[cell] = 1;
      component.push(cell);
    }
    const world = { ...generated, land, landComponents: [component] };
    const before = new Uint8Array(world.land);
    expect(() => generateAtlasCountries(world, 16, 8)).toThrowError(MapLayoutError);
    try { generateAtlasCountries(world, 16, 8); } catch (error) {
      expect((error as MapLayoutError).code).toBe('spacing');
    }
    expect(world.land).toEqual(before);
  });

  it('produces deterministic ownership for seeds 0–99 without invalid layouts', () => {
    for (let seed = 0; seed < 100; seed++) {
      const world = generateAtlasWorld(seed, { ...controls, lakeCount: 0 });
      const a = generateAtlasCountries(world, 8, 0);
      const b = generateAtlasCountries(world, 8, 0);
      expect(a.owners).toEqual(b.owners);
      expect(a.sites).toEqual(b.sites);
      expect(a.owners.every((owner, index) => owner === 0 ||
        (world.land[index] === 1 && world.lakes[index] === 0))).toBe(true);
    }
  });
});
