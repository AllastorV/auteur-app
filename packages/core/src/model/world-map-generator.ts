import { parseMapSettings, type GeographyControls, type ResolvedGeographyControls } from './world-map';

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 750;

export interface MapPoint { x: number; y: number }
export interface LandPolygon { id: string; points: MapPoint[] }
export interface MapGeometry {
  seed: number;
  controls: ResolvedGeographyControls;
  polygons: LandPolygon[];
  lakes: LandPolygon[];
}

export class MapLayoutError extends Error {
  constructor(public readonly code: 'invalid' | 'lakes' | 'spacing' | 'locked') {
    super(`Map layout ${code}`);
  }
}

/** Shared land/water hit test, including polygon boundaries. */
export function pointInPolygon(point: MapPoint, points: MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 1e-12 &&
        point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) &&
        point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)) return true;
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Local PRNG: no Math.random(), global state or platform-dependent noise. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

function coast(
  id: string, cx: number, cy: number, rx: number, ry: number,
  random: () => number, count: number,
): LandPolygon {
  const phase = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;
  const phase3 = random() * Math.PI * 2;
  const frequency = 3 + Math.floor(random() * 3);
  const points: MapPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const wave = 1 + 0.105 * Math.sin(frequency * angle + phase) +
      0.05 * Math.sin(2 * frequency * angle + phase2) +
      0.026 * Math.cos(11 * angle + phase3);
    points.push({
      x: Math.max(0.002, Math.min(0.998, cx + Math.cos(angle) * rx * wave)),
      y: Math.max(0.002, Math.min(0.998, cy + Math.sin(angle) * ry * wave)),
    });
  }
  return { id, points };
}

function px(point: MapPoint): MapPoint {
  return { x: point.x * MAP_WIDTH, y: point.y * MAP_HEIGHT };
}

function cross(a: MapPoint, b: MapPoint, c: MapPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function edgesCross(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function pointSegmentDistance(point: MapPoint, a: MapPoint, b: MapPoint): number {
  const p = px(point);
  const start = px(a);
  const end = px(b);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t = Math.max(0, Math.min(1,
    ((p.x - start.x) * dx + (p.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - start.x - t * dx, p.y - start.y - t * dy);
}

function separated(candidate: LandPolygon, other: LandPolygon, marginPx: number): boolean {
  if (candidate.points.some((point) => pointInPolygon(point, other.points)) ||
      other.points.some((point) => pointInPolygon(point, candidate.points))) return false;
  for (let i = 0; i < candidate.points.length; i++) {
    const a = candidate.points[i];
    const b = candidate.points[(i + 1) % candidate.points.length];
    for (let j = 0; j < other.points.length; j++) {
      const c = other.points[j];
      const d = other.points[(j + 1) % other.points.length];
      if (edgesCross(a, b, c, d) ||
          pointSegmentDistance(a, c, d) < marginPx ||
          pointSegmentDistance(c, a, b) < marginPx) return false;
    }
  }
  return true;
}

function findLake(main: LandPolygon, existing: LandPolygon[], random: () => number, index: number): LandPolygon | null {
  const xs = main.points.map((point) => point.x);
  const ys = main.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  for (let attempt = 0; attempt < 512; attempt++) {
    const x = minX + random() * (maxX - minX);
    const y = minY + random() * (maxY - minY);
    const radiusX = 0.011 + random() * 0.007;
    const radiusY = 0.011 + random() * 0.007;
    const lake = coast(`lake-${index + 1}`, x, y, radiusX, radiusY, random, 32);
    if (!lake.points.every((point) => pointInPolygon(point, main.points))) continue;
    // The water ring must not graze or cross the coast, even at concave bends.
    if (lake.points.some((point, i) => {
      const next = lake.points[(i + 1) % lake.points.length];
      for (let j = 0; j < main.points.length; j++) {
        const coastA = main.points[j];
        const coastB = main.points[(j + 1) % main.points.length];
        if (edgesCross(point, next, coastA, coastB) ||
            pointSegmentDistance(point, coastA, coastB) < 6) return true;
      }
      return false;
    })) continue;
    if (existing.some((other) => !separated(lake, other, 5))) continue;
    return lake;
  }
  return null;
}

/** Generates stable, bounded coastline geometry in normalized map coordinates. */
export function generateGeography(seed: number, controls: GeographyControls): MapGeometry {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid map seed');
  const resolved = parseMapSettings({ seed, controls })?.controls;
  if (!resolved) throw new Error('Invalid geography controls');
  const random = seededRandom(seed);
  const spread = Math.sqrt(controls.landFraction / 0.9);
  const cx = 0.47 + (random() - 0.5) * 0.07;
  const cy = 0.5 + (random() - 0.5) * 0.07;
  const rx = 0.16 + 0.2 * spread;
  const ry = 0.13 + 0.17 * spread;
  const polygons = [coast('main', cx, cy, rx, ry, random, 96)];
  for (let i = 0; i < controls.islandCount; i++) {
    let x = 0.08;
    let y = 0.08;
    // Keep islands legible beside the continent; bounded attempts preserve determinism.
    for (let attempt = 0; attempt < 24; attempt++) {
      x = 0.08 + random() * 0.84;
      y = 0.08 + random() * 0.84;
      const dx = (x - cx) / (rx + 0.055);
      const dy = (y - cy) / (ry + 0.055);
      if (dx * dx + dy * dy > 1.15) break;
    }
    const radius = 0.022 + random() * 0.038;
    polygons.push(coast(`island-${i + 1}`, x, y, radius, radius * (0.65 + random() * 0.7), random, 48));
  }
  const lakes: LandPolygon[] = [];
  const lakeRandom = seededRandom((seed ^ 0x6c616b65) >>> 0);
  for (let index = 0; index < resolved.lakeCount; index++) {
    const lake = findLake(polygons[0], lakes, lakeRandom, index);
    if (!lake) throw new MapLayoutError('lakes');
    lakes.push(lake);
  }
  return { seed, controls: resolved, polygons, lakes };
}

/** Shared by preview and export; coordinates are mapped into the fixed export frame. */
export function geographyPath(polygon: LandPolygon): string {
  if (!polygon.points.length) return '';
  return polygon.points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${(point.x * MAP_WIDTH).toFixed(2)} ${(point.y * MAP_HEIGHT).toFixed(2)}`,
  ).join(' ') + ' Z';
}
