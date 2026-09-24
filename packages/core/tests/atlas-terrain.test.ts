import { describe, expect, it } from 'vitest';
import { generateAtlasTerrain } from '../src/model/atlas/terrain';
import { coastlinePaths, maskPaths } from '../src/model/atlas/contours';
import { MAP_HEIGHT, MAP_WIDTH } from '../src/model/world-map-generator';

const controls = {
  landFraction: .44, islandCount: 4, lakeCount: 0, minCountrySpacing: 0,
};

describe('world-first atlas terrain', () => {
  it('is byte-stable for a seed and visibly changes for a different seed', () => {
    const a = generateAtlasTerrain(42, controls);
    const b = generateAtlasTerrain(42, controls);
    const c = generateAtlasTerrain(43, controls);
    expect(Array.from(a.elevation)).toEqual(Array.from(b.elevation));
    expect(Array.from(a.land)).toEqual(Array.from(b.land));
    expect(a.coastPaths).toEqual(b.coastPaths);
    expect(Array.from(a.land)).not.toEqual(Array.from(c.land));
    expect(a.width).toBe(256);
    expect(a.height).toBe(160);
  });

  it('realizes single, fragmented and multi-continent archetypes across seeds 0–59', () => {
    const examples = new Map<string, number>();
    for (let seed = 0; seed < 60; seed++) {
      const world = generateAtlasTerrain(seed, controls);
      const major = world.landComponents.filter((component) => component.length > world.land.length * .035).length;
      if (world.archetype === 'single' && major === 1) examples.set('single', seed);
      if (world.archetype === 'fragmented' && major >= 3) examples.set('fragmented', seed);
      if (world.archetype === 'multi' && major >= 3 && major <= 5) examples.set('multi', seed);
      if (examples.size === 3) break;
    }
    expect(Object.fromEntries(examples)).toMatchObject({
      single: expect.any(Number), fragmented: expect.any(Number), multi: expect.any(Number),
    });
  });

  it('respects low and high land controls without NaN or coordinates outside the export frame', () => {
    for (const fraction of [.05, .44, .9]) {
      const world = generateAtlasTerrain(91, { ...controls, landFraction: fraction, islandCount: 20 });
      const actual = world.land.reduce((sum, cell) => sum + cell, 0) / world.land.length;
      expect(actual).toBeCloseTo(fraction, 2);
      expect(Array.from(world.elevation).every(Number.isFinite)).toBe(true);
      expect(world.coastPaths.length).toBeGreaterThan(0);
      expect(world.coastPaths.every((path) => path.startsWith('M ') && !/NaN|Infinity/.test(path))).toBe(true);
      for (const path of world.coastPaths) {
        const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          expect(numbers[index]).toBeGreaterThanOrEqual(0);
          expect(numbers[index]).toBeLessThanOrEqual(MAP_WIDTH);
          expect(numbers[index + 1]).toBeGreaterThanOrEqual(0);
          expect(numbers[index + 1]).toBeLessThanOrEqual(MAP_HEIGHT);
        }
      }
    }
  });

  it('keeps elevation continuous at the east/west seam and draws no cross-frame segment', () => {
    const world = generateAtlasTerrain(28, controls);
    let seamDelta = 0;
    for (let y = 0; y < world.height; y++) {
      seamDelta += Math.abs(world.elevation[y * world.width] - world.elevation[y * world.width + world.width - 1]);
    }
    expect(seamDelta / world.height).toBeLessThan(.08);
    const mask = new Uint8Array(8 * 4);
    mask[8] = 1;
    mask[15] = 1;
    const paths = maskPaths(mask, 8, 4, true);
    const strokes = coastlinePaths(mask, 8, 4, true);
    expect(paths.every((path) => path.endsWith(' Z'))).toBe(true);
    expect(paths.every((path) => !path.includes(' Q '))).toBe(true);
    expect(strokes).toHaveLength(2);
    expect(strokes.every((path) => !path.endsWith(' Z'))).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.startsWith('M '))).toBe(true);
    expect(paths.every((path) => !/NaN|Infinity/.test(path))).toBe(true);
  });

  it('draws irregular continental coastlines rather than broad ellipse silhouettes', () => {
    for (const seed of [0, 7]) {
      const world = generateAtlasTerrain(seed, controls);
      expect(world.archetype).toBe('single');
      const major = world.landComponents[0];
      const occupied = new Set(major);
      let perimeter = 0;
      for (const cell of major) {
        const x = cell % world.width;
        const y = Math.floor(cell / world.width);
        const neighbors = [
          y * world.width + (x + world.width - 1) % world.width,
          y * world.width + (x + 1) % world.width,
          y > 0 ? cell - world.width : -1,
          y < world.height - 1 ? cell + world.width : -1,
        ];
        perimeter += neighbors.filter((neighbor) => !occupied.has(neighbor)).length;
      }
      expect(perimeter / Math.sqrt(major.length)).toBeGreaterThan(5.6);
    }
  });

  it('rejects invalid controls before allocating a terrain grid', () => {
    expect(() => generateAtlasTerrain(-1, controls)).toThrow();
    expect(() => generateAtlasTerrain(1, { ...controls, landFraction: 0 })).toThrow();
    expect(() => generateAtlasTerrain(1, { ...controls, islandCount: 21 })).toThrow();
  });

  it('stays bounded and produces all realized families over seeds 0–99', () => {
    const realized = { single: 0, fragmented: 0, multi: 0 };
    for (let seed = 0; seed < 100; seed++) {
      const world = generateAtlasTerrain(seed, controls);
      const actual = world.land.reduce((sum, cell) => sum + cell, 0) / world.land.length;
      expect(Math.abs(actual - controls.landFraction)).toBeLessThan(.01);
      expect(world.coastPaths.length).toBeGreaterThan(0);
      expect(Array.from(world.elevation).every(Number.isFinite)).toBe(true);
      const major = world.landComponents.filter((group) => group.length > world.land.length * .035).length;
      if (world.archetype === 'single' && major === 1) realized.single++;
      if (world.archetype === 'fragmented' && major >= 3) realized.fragmented++;
      if (world.archetype === 'multi' && major >= 3 && major <= 5) realized.multi++;
    }
    expect(realized.single).toBeGreaterThanOrEqual(12);
    expect(realized.fragmented).toBeGreaterThanOrEqual(12);
    expect(realized.multi).toBeGreaterThanOrEqual(12);
  });
});
