import { MAP_HEIGHT, MAP_WIDTH, MapLayoutError, type MapPoint } from '../world-map-generator';
import type { AtlasTerrain } from './types';

const neighborIndices = (index: number, width: number, height: number): number[] => {
  const x = index % width;
  const y = Math.floor(index / width);
  const neighbors = [y * width + (x + width - 1) % width, y * width + (x + 1) % width];
  if (y > 0) neighbors.push(index - width);
  if (y < height - 1) neighbors.push(index + width);
  return neighbors;
};

/** Cell steps to the closest water, with the horizontal world seam joined. */
export function distanceFromWater(terrain: AtlasTerrain, lakes?: Uint8Array): Uint16Array {
  const { width, height, land } = terrain;
  const distance = new Uint16Array(land.length);
  distance.fill(0xffff);
  const queue = new Int32Array(land.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < land.length; index++) {
    if (!land[index] || lakes?.[index]) { distance[index] = 0; queue[tail++] = index; }
  }
  while (head < tail) {
    const index = queue[head++];
    for (const next of neighborIndices(index, width, height)) {
      if (distance[next] !== 0xffff) continue;
      distance[next] = distance[index] + 1;
      queue[tail++] = next;
    }
  }
  return distance;
}

const hash = (value: number): number => {
  let x = value >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
};

/** Select small, separated inland basins; fail explicitly if the requested count cannot fit. */
export function placeAtlasLakes(terrain: AtlasTerrain): Uint8Array {
  const { width, height, land, controls, seed } = terrain;
  const lakes = new Uint8Array(land.length);
  if (controls.lakeCount === 0) return lakes;
  const distance = distanceFromWater(terrain);
  const candidates: number[] = [];
  for (let index = 0; index < land.length; index++) {
    if (land[index] && distance[index] >= 9) candidates.push(index);
  }
  candidates.sort((a, b) => {
    const rankA = distance[a] * 300 + (hash(a ^ seed) % 300);
    const rankB = distance[b] * 300 + (hash(b ^ seed) % 300);
    return rankB - rankA || a - b;
  });
  const centers: { x: number; y: number; radius: number }[] = [];
  for (const index of candidates) {
    if (centers.length === controls.lakeCount) break;
    const x = index % width;
    const y = Math.floor(index / width);
    const radius = 3 + (hash(index + seed) % 3);
    if (distance[index] < radius + 5) continue;
    if (centers.some((other) => {
      const dx = Math.min(Math.abs(x - other.x), width - Math.abs(x - other.x));
      return Math.hypot(dx, y - other.y) < radius + other.radius + 8;
    })) continue;
    const basin: number[] = [];
    let valid = true;
    for (let dy = -radius; dy <= radius && valid; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) { valid = false; break; }
      for (let dx = -radius; dx <= radius; dx++) {
        if ((dx * dx) / (radius * radius) + (dy * dy) / ((radius - .7) ** 2) > 1) continue;
        const xx = (x + dx + width) % width;
        const cell = yy * width + xx;
        if (!land[cell] || lakes[cell] || distance[cell] < 3) { valid = false; break; }
        basin.push(cell);
      }
    }
    if (!valid || basin.length < 12) continue;
    for (const cell of basin) lakes[cell] = 1;
    centers.push({ x, y, radius });
  }
  if (centers.length !== controls.lakeCount) throw new MapLayoutError('lakes');
  return lakes;
}

interface HeapItem { height: number; index: number }

class MinHeap {
  private readonly data: HeapItem[] = [];

  get length(): number { return this.data.length; }

  push(item: HeapItem): void {
    const list = this.data;
    let index = list.length;
    list.push(item);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (list[parent].height <= item.height) break;
      list[index] = list[parent];
      index = parent;
    }
    list[index] = item;
  }

  pop(): HeapItem {
    const list = this.data;
    const first = list[0];
    const last = list.pop()!;
    if (list.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= list.length) break;
        const right = left + 1;
        const child = right < list.length && list[right].height < list[left].height ? right : left;
        if (list[child].height >= last.height) break;
        list[index] = list[child];
        index = child;
      }
      list[index] = last;
    }
    return first;
  }
}

export interface AtlasDrainage {
  flowTo: Int32Array;
  drainHeight: Float32Array;
  accumulation: Float32Array;
  rivers: MapPoint[][];
  riverCells: number[][];
}

/** Priority-flood establishes a downhill, acyclic drainage tree to sea/lakes. */
export function deriveAtlasDrainage(terrain: AtlasTerrain, lakes: Uint8Array, moisture: Float32Array): AtlasDrainage {
  const { width, height, land, elevation } = terrain;
  const seen = new Uint8Array(land.length);
  const flowTo = new Int32Array(land.length);
  flowTo.fill(-1);
  const drainHeight = new Float32Array(land.length);
  const heap = new MinHeap();
  const discovered: number[] = [];
  for (let index = 0; index < land.length; index++) {
    if (land[index] && !lakes[index]) continue;
    seen[index] = 1;
    drainHeight[index] = elevation[index];
    heap.push({ height: elevation[index], index });
  }
  while (heap.length) {
    const { index, height: outletHeight } = heap.pop();
    for (const next of neighborIndices(index, width, height)) {
      if (seen[next]) continue;
      seen[next] = 1;
      flowTo[next] = index;
      const filled = Math.max(elevation[next], outletHeight + .0001);
      drainHeight[next] = filled;
      discovered.push(next);
      heap.push({ height: filled, index: next });
    }
  }
  const accumulation = new Float32Array(land.length);
  for (let i = discovered.length - 1; i >= 0; i--) {
    const index = discovered[i];
    accumulation[index] += .3 + moisture[index];
    const next = flowTo[index];
    if (next >= 0 && land[next] && !lakes[next]) accumulation[next] += accumulation[index];
  }
  const riverThreshold = 65;
  const tributaries = new Uint8Array(land.length);
  for (const index of discovered) {
    const next = flowTo[index];
    if (accumulation[index] >= riverThreshold && next >= 0 && land[next] && !lakes[next]) tributaries[next]++;
  }
  const riverCells: number[][] = [];
  const rivers: MapPoint[][] = [];
  for (const source of discovered) {
    if (accumulation[source] < riverThreshold || tributaries[source]) continue;
    const route = [source];
    let index = source;
    while (flowTo[index] >= 0 && route.length <= land.length) {
      index = flowTo[index];
      route.push(index);
      if (!land[index] || lakes[index]) break;
    }
    if (route.length < 3 || (land[index] && !lakes[index])) continue;
    riverCells.push(route);
    rivers.push(route.map((cell) => ({
      x: ((cell % width) + .5) * MAP_WIDTH / width,
      y: (Math.floor(cell / width) + .5) * MAP_HEIGHT / height,
    })));
  }
  return { flowTo, drainHeight, accumulation, rivers, riverCells };
}
