import { MAP_HEIGHT, MAP_WIDTH, MapLayoutError, type MapPoint } from '../world-map-generator';
import { maskPaths } from './contours';
import { distanceFromWater } from './hydrology';
import type { AtlasWorld } from './world';

export interface AtlasOwnership {
  /** Zero means water or genuinely unclaimed land, not a country record. */
  owners: Uint8Array;
  /** Country i uses sites[i - 1], in the fixed export frame. */
  sites: MapPoint[];
  fillPaths: string[][];
  /** Shared political edges are traced once from the same owner grid. */
  borderPaths: string[];
}

interface QueueItem { cost: number; index: number; owner: number }

class Queue {
  private readonly values: QueueItem[] = [];
  get length(): number { return this.values.length; }
  push(value: QueueItem): void {
    const list = this.values;
    let index = list.length;
    list.push(value);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (list[parent].cost <= value.cost) break;
      list[index] = list[parent];
      index = parent;
    }
    list[index] = value;
  }
  pop(): QueueItem {
    const list = this.values;
    const first = list[0];
    const last = list.pop()!;
    if (list.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= list.length) break;
        const right = left + 1;
        const child = right < list.length && list[right].cost < list[left].cost ? right : left;
        if (list[child].cost >= last.cost) break;
        list[index] = list[child];
        index = child;
      }
      list[index] = last;
    }
    return first;
  }
}

function hash(value: number): number {
  let x = value >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

const pointFor = (index: number, width: number, height: number): MapPoint => ({
  x: ((index % width) + .5) * MAP_WIDTH / width,
  y: (Math.floor(index / width) + .5) * MAP_HEIGHT / height,
});

function wrappedDistance(a: MapPoint, b: MapPoint): number {
  const rawX = Math.abs(a.x - b.x);
  return Math.hypot(Math.min(rawX, MAP_WIDTH - rawX), a.y - b.y);
}

function placeSites(world: AtlasWorld, count: number, spacing: number): number[] {
  const coastDistance = distanceFromWater(world, world.lakes);
  const componentOf = new Int16Array(world.land.length);
  componentOf.fill(-1);
  world.landComponents.forEach((group, component) => {
    for (const cell of group) componentOf[cell] = component;
  });
  const largeComponents = world.landComponents
    .map((group, index) => ({ size: group.filter((cell) => !world.lakes[cell]).length, index }))
    .filter(({ size }) => size > world.land.length * .015)
    .sort((a, b) => b.size - a.size).map(({ index }) => index);
  const candidates: number[] = [];
  for (let index = 0; index < world.land.length; index++) {
    if (world.land[index] && !world.lakes[index] && coastDistance[index] >= 2) candidates.push(index);
  }
  if (candidates.length < count) throw new MapLayoutError('spacing');
  const sites: number[] = [];
  const points: MapPoint[] = [];
  const requiredDistance = Math.max(25, spacing / 100 * MAP_WIDTH);
  for (let country = 0; country < count; country++) {
    const targetComponent = country < largeComponents.length ? largeComponents[country] : null;
    let winner = -1;
    let bestScore = -Infinity;
    for (const index of candidates) {
      if (targetComponent !== null && componentOf[index] !== targetComponent) continue;
      const point = pointFor(index, world.width, world.height);
      const minDistance = points.length ? Math.min(...points.map((other) => wrappedDistance(point, other))) : Infinity;
      if (minDistance < requiredDistance) continue;
      const jitter = hash(index ^ Math.imul(world.seed, 0x9e3779b1)) / 0x100000000;
      const rank = points.length ? minDistance : 0;
      const score = rank + Math.min(16, coastDistance[index]) * 2.2 + jitter * 13 -
        Math.max(0, world.elevation[index] - .55) * 12;
      if (score > bestScore) { bestScore = score; winner = index; }
    }
    if (winner < 0) throw new MapLayoutError('spacing');
    sites.push(winner);
    points.push(pointFor(winner, world.width, world.height));
  }
  return sites;
}

interface BorderEdge { ax: number; ay: number; bx: number; by: number }

function traceBorders(owners: Uint8Array, width: number, height: number): string[] {
  const edges: BorderEdge[] = [];
  const add = (ax: number, ay: number, bx: number, by: number) => edges.push({ ax, ay, bx, by });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = owners[y * width + x];
      if (!here) continue;
      const right = owners[y * width + (x + 1) % width];
      if (right && right !== here) {
        add(x + 1, y, x + 1, y + 1);
        if (x === width - 1) add(0, y, 0, y + 1);
      }
      if (y < height - 1) {
        const below = owners[(y + 1) * width + x];
        if (below && below !== here) add(x, y + 1, x + 1, y + 1);
      }
    }
  }
  const key = (x: number, y: number) => y * (width + 1) + x;
  const adjacent = new Map<number, number[]>();
  edges.forEach((edge, index) => {
    for (const endpoint of [key(edge.ax, edge.ay), key(edge.bx, edge.by)]) {
      const list = adjacent.get(endpoint) ?? [];
      list.push(index);
      adjacent.set(endpoint, list);
    }
  });
  const used = new Uint8Array(edges.length);
  const starts = edges.map((_, index) => index).sort((a, b) => {
    const degree = (edge: BorderEdge) => Math.min(
      adjacent.get(key(edge.ax, edge.ay))?.length ?? 0,
      adjacent.get(key(edge.bx, edge.by))?.length ?? 0);
    return degree(edges[a]) - degree(edges[b]) || a - b;
  });
  const px = (x: number) => (x * MAP_WIDTH / width).toFixed(2);
  const py = (y: number) => (y * MAP_HEIGHT / height).toFixed(2);
  const paths: string[] = [];
  for (const start of starts) {
    if (used[start]) continue;
    const first = edges[start];
    const aDegree = adjacent.get(key(first.ax, first.ay))?.length ?? 0;
    const bDegree = adjacent.get(key(first.bx, first.by))?.length ?? 0;
    const points = aDegree === 2 && bDegree !== 2
      ? [{ x: first.bx, y: first.by }, { x: first.ax, y: first.ay }]
      : [{ x: first.ax, y: first.ay }, { x: first.bx, y: first.by }];
    used[start] = 1;
    while (points.length <= edges.length + 1) {
      const end = points[points.length - 1];
      const node = key(end.x, end.y);
      const connected = adjacent.get(node) ?? [];
      if (connected.length !== 2) break;
      const next = connected.find((index) => !used[index]);
      if (next === undefined) break;
      used[next] = 1;
      const edge = edges[next];
      points.push(edge.ax === end.x && edge.ay === end.y
        ? { x: edge.bx, y: edge.by } : { x: edge.ax, y: edge.ay });
      if (points.at(-1)!.x === points[0].x && points.at(-1)!.y === points[0].y) break;
    }
    if (points.length < 2) continue;
    if (points.length === 2) {
      paths.push(`M ${px(points[0].x)} ${py(points[0].y)} L ${px(points[1].x)} ${py(points[1].y)}`);
      continue;
    }
    const commands = [`M ${px(points[0].x)} ${py(points[0].y)}`];
    for (let i = 1; i < points.length - 1; i++) {
      const middle = points[i];
      const next = points[i + 1];
      commands.push(`Q ${px(middle.x)} ${py(middle.y)} ${px((middle.x + next.x) / 2)} ${py((middle.y + next.y) / 2)}`);
    }
    const end = points[points.length - 1];
    commands.push(`L ${px(end.x)} ${py(end.y)}`);
    paths.push(commands.join(' '));
  }
  return paths;
}

/** Multi-source minimum-cost growth over one water-safe grid, stopped before all land is claimed. */
export function generateAtlasCountries(world: AtlasWorld, count: number, minCountrySpacing: number): AtlasOwnership {
  if (!Number.isInteger(count) || count < 2 || count > 16 ||
      !Number.isInteger(minCountrySpacing) || minCountrySpacing < 0 || minCountrySpacing > 8)
    throw new MapLayoutError('invalid');
  const { width, height, land, lakes } = world;
  const siteIndices = placeSites(world, count, minCountrySpacing);
  const owners = new Uint8Array(land.length);
  const bestCost = new Float32Array(land.length);
  bestCost.fill(Infinity);
  const bestOwner = new Uint8Array(land.length);
  const queue = new Queue();
  siteIndices.forEach((index, i) => {
    bestCost[index] = 0;
    bestOwner[index] = i + 1;
    queue.push({ cost: 0, index, owner: i + 1 });
  });
  let available = 0;
  let coastLevel = Infinity;
  for (let index = 0; index < land.length; index++) {
    if (land[index] && !lakes[index]) {
      available++;
      coastLevel = Math.min(coastLevel, world.elevation[index]);
    }
  }
  const targetFraction = .75 + (hash(world.seed ^ 0x706f6c69) % 1000) / 1000 * .09;
  const target = Math.floor(available * targetFraction);
  let claimed = 0;
  while (queue.length && claimed < target) {
    const item = queue.pop();
    if (owners[item.index] || item.owner !== bestOwner[item.index] ||
        item.cost > bestCost[item.index] + .00001) continue;
    owners[item.index] = item.owner;
    claimed++;
    const x = item.index % width;
    const y = Math.floor(item.index / width);
    const neighbors = [y * width + (x + width - 1) % width, y * width + (x + 1) % width];
    if (y > 0) neighbors.push(item.index - width);
    if (y < height - 1) neighbors.push(item.index + width);
    for (const next of neighbors) {
      if (!land[next] || lakes[next] || owners[next]) continue;
      const ridge = Math.max(0, world.elevation[next] - coastLevel - .28);
      const river = world.accumulation[next] > 65 || world.accumulation[item.index] > 65 ? .75 : 0;
      const variation = (hash(next ^ Math.imul(world.seed, 0x85ebca6b)) / 0x100000000) * .5;
      const candidate = item.cost + 1 + ridge * 1.7 + river + variation;
      if (candidate >= bestCost[next]) continue;
      bestCost[next] = candidate;
      bestOwner[next] = item.owner;
      queue.push({ cost: candidate, index: next, owner: item.owner });
    }
  }
  const fillPaths: string[][] = [];
  for (let owner = 1; owner <= count; owner++) {
    const mask = new Uint8Array(land.length);
    for (let index = 0; index < mask.length; index++) mask[index] = owners[index] === owner ? 1 : 0;
    fillPaths.push(maskPaths(mask, width, height, true));
  }
  return {
    owners,
    sites: siteIndices.map((index) => pointFor(index, width, height)),
    fillPaths,
    borderPaths: traceBorders(owners, width, height),
  };
}

/** Hit-test normalized [0,1] coordinates; null also means unclaimed land. */
export function countryAt(ownership: AtlasOwnership, world: AtlasWorld, x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  const col = Math.floor(x * world.width) % world.width;
  const row = Math.min(world.height - 1, Math.floor(y * world.height));
  const index = row * world.width + col;
  if (!world.land[index] || world.lakes[index]) return null;
  return ownership.owners[index] || null;
}
