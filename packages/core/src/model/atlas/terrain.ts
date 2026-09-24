import { createNoise4D } from 'simplex-noise';
import { parseMapSettings, type ResolvedGeographyControls } from '../world-map';
import { coastlinePaths } from './contours';
import type { AtlasArchetype, AtlasTerrain } from './types';

export type { AtlasArchetype, AtlasTerrain } from './types';

const WIDTH = 256 as const;
const HEIGHT = 160 as const;
const TAU = Math.PI * 2;

interface Landform {
  x: number; y: number; rx: number; ry: number;
  angle: number; ca: number; sa: number; strength: number; group: number;
}

/** A seed-local Mulberry32 stream; simplex permutation never touches global randomness. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

const wrapDx = (a: number, b: number) => {
  let delta = a - b;
  if (delta > .5) delta -= 1;
  if (delta < -.5) delta += 1;
  return delta;
};

function landforms(archetype: AtlasArchetype, random: () => number): Landform[] {
  const forms: Landform[] = [];
  let nextGroup = 0;
  const push = (group: number, x: number, y: number, rx: number, ry: number,
    angle: number, strength: number) => {
    forms.push({ group, x, y, rx, ry, angle, ca: Math.cos(angle), sa: Math.sin(angle), strength });
  };
  const add = (x: number, y: number, rx: number, ry: number, lobes: number, spread = 1) => {
    const group = nextGroup++;
    const angle = random() * TAU;
    push(group, (x + 1) % 1, y, rx, ry, angle, .98);
    for (let i = 0; i < lobes; i++) {
      // Long, unequally spaced spurs make headlands and peninsulas, not petals
      // packed inside one ellipse. A slight turn gives each plate its own axis.
      const theta = angle + (i / Math.max(1, lobes - 1) - .5) * 4.4 +
        (random() - .5) * .95;
      const offset = (.68 + random() * .75) * spread;
      push(group, (x + Math.cos(theta) * rx * offset + 1) % 1,
        Math.max(.07, Math.min(.93, y + Math.sin(theta) * ry * offset)),
        rx * (.42 + random() * .32), ry * (.36 + random() * .36),
        angle + (random() - .5) * 1.3, .83 + random() * .14);
    }
  };
  if (archetype === 'single') {
    add(.44 + (random() - .5) * .16, .49 + (random() - .5) * .12,
      .27 + random() * .04, .27 + random() * .05, 7);
  } else if (archetype === 'multi') {
    const four = random() > .5;
    const centers = four
      ? [[.17, .24], [.68, .34], [.31, .73], [.83, .69]]
      : [[.18, .25], [.71, .40], [.45, .76]];
    for (const [x, y] of centers) {
      const size = .72 + random() * .65;
      add(x + (random() - .5) * .21, y + (random() - .5) * .17,
        ((four ? .125 : .15) + random() * .03) * size,
        ((four ? .15 : .18) + random() * .04) * size,
        3 + Math.floor(random() * 3), 1.1);
    }
  } else {
    const centers: { x: number; y: number }[] = [];
    const target = 5 + Math.floor(random() * 2);
    for (let attempt = 0; attempt < 160 && centers.length < target; attempt++) {
      const x = random();
      const y = .13 + random() * .74;
      if (centers.some((other) => Math.hypot(wrapDx(x, other.x), (y - other.y) * .9) < .25)) continue;
      centers.push({ x, y });
    }
    for (const { x, y } of centers) {
      add(x, y, .095 + random() * .055, .12 + random() * .065, 2 + Math.floor(random() * 2), .95);
    }
  }
  return forms;
}

function components(mask: Uint8Array): number[][] {
  const visited = new Uint8Array(mask.length);
  const result: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    const group: number[] = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      group.push(index);
      const x = index % WIDTH;
      const y = (index / WIDTH) | 0;
      const neighbors = [y * WIDTH + (x + WIDTH - 1) % WIDTH,
        y * WIDTH + (x + 1) % WIDTH];
      if (y > 0) neighbors.push(index - WIDTH);
      if (y < HEIGHT - 1) neighbors.push(index + WIDTH);
      for (const next of neighbors) {
        if (mask[next] && !visited[next]) { visited[next] = 1; stack.push(next); }
      }
    }
    result.push(group);
  }
  return result.sort((a, b) => b.length - a.length);
}

/** Generate a whole world first; no country count or authored metadata enters this function. */
export function generateAtlasTerrain(seed: number, controls: ResolvedGeographyControls): AtlasTerrain {
  const resolved = parseMapSettings({ seed, controls })?.controls;
  if (!resolved) throw new Error('Invalid atlas geography controls');
  const random = seededRandom(seed);
  const archetype: AtlasArchetype = (['single', 'fragmented', 'multi'] as const)[Math.floor(random() * 3)];
  const forms = landforms(archetype, random);
  const islands: Landform[] = [];
  for (let index = 0; index < resolved.islandCount; index++) {
    const angle = random() * TAU;
    islands.push({ x: random(), y: .08 + random() * .84,
      rx: .018 + random() * .016, ry: .018 + random() * .026,
      angle, ca: Math.cos(angle), sa: Math.sin(angle), strength: .17, group: -1 });
  }
  const noise = createNoise4D(random);
  const warp = createNoise4D(random);
  const elevation = new Float32Array(WIDTH * HEIGHT);
  const groupScores = new Float32Array(Math.max(...forms.map((form) => form.group)) + 1);
  for (let y = 0; y < HEIGHT; y++) {
    const latitude = (y + .5) / HEIGHT;
    for (let x = 0; x < WIDTH; x++) {
      const longitude = (x + .5) / WIDTH;
      const theta = longitude * TAU;
      const co = Math.cos(theta);
      const si = Math.sin(theta);
      const wx = longitude + .055 * warp(co * 1.25, si * 1.25, latitude * 2.2, 7);
      const wy = latitude + .045 * warp(co * 1.5, si * 1.5, latitude * 2.1, 19);
      groupScores.fill(-2);
      for (const form of forms) {
        const dx = wrapDx(wx, form.x);
        const dy = wy - form.y;
        const u = (dx * form.ca + dy * form.sa) / form.rx;
        const v = (-dx * form.sa + dy * form.ca) / form.ry;
        groupScores[form.group] = Math.max(groupScores[form.group], form.strength - Math.hypot(u, v));
      }
      let base = -2;
      let second = -2;
      for (const score of groupScores) {
        if (score > base) { second = base; base = score; }
        else if (score > second) second = score;
      }
      // Plate competition leaves meandering sea passages between landmasses;
      // the warped coordinates keep them from becoming ruler-straight cuts.
      if (archetype !== 'single' && second > -1.5) {
        const closeness = Math.max(0, 1 - (base - second) / .22);
        base -= closeness * (archetype === 'multi' ? .30 : .38);
      }
      for (const island of islands) {
        const dx = wrapDx(wx, island.x) / island.rx;
        const dy = (wy - island.y) / island.ry;
        base = Math.max(base, island.strength - Math.hypot(dx, dy));
      }
      const broad = noise(co * .8, si * .8, latitude * 1.65, 11);
      const mid = noise(co * 2.1, si * 2.1, latitude * 3.8, 29);
      const detail = noise(co * 5.2, si * 5.2, latitude * 9.5, 47);
      const ridge = 1 - Math.abs(noise(co * 2.7, si * 2.7, latitude * 5.4, 63));
      elevation[y * WIDTH + x] = base + broad * .27 + mid * .14 + detail * .055 + ridge * .035;
    }
  }

  const sorted = Array.from(elevation).sort((a, b) => a - b);
  const seaLevel = sorted[Math.max(0, Math.min(sorted.length - 1,
    Math.floor((1 - resolved.landFraction) * sorted.length)))];
  const land = new Uint8Array(elevation.length);
  for (let index = 0; index < land.length; index++) land[index] = elevation[index] >= seaLevel ? 1 : 0;
  let landComponents = components(land);
  for (const group of landComponents) {
    if (group.length <= 3) for (const index of group) land[index] = 0;
  }
  landComponents = components(land);
  return {
    seed, width: WIDTH, height: HEIGHT, controls: resolved, archetype,
    elevation, land, landComponents, coastPaths: coastlinePaths(land, WIDTH, HEIGHT, true),
  };
}
