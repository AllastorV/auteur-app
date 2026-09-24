import {
  MAP_HEIGHT, MAP_WIDTH, MapLayoutError, generateGeography, pointInPolygon,
  type MapGeometry, type MapPoint,
} from './world-map-generator';
import type { GeographyControls } from './world-map';

export interface CountryRegion { id: string; site: MapPoint; points: MapPoint[] }

/** Pure polygon hit test. Ocean is never a country, even inside an un-clipped Voronoi cell. */
export function pointInLand(point: MapPoint, geometry: MapGeometry): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return false;
  return geometry.polygons.some(({ points }) => pointInPolygon(point, points)) &&
    !geometry.lakes.some(({ points }) => pointInPolygon(point, points));
}

function seededRandom(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

function halfPlaneValue(point: MapPoint, a: MapPoint, b: MapPoint): number {
  return 2 * (b.x - a.x) * point.x + 2 * (b.y - a.y) * point.y -
    (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y);
}

/** Clip a convex cell against the closer-to-a side of the a/b bisector. */
function clip(points: MapPoint[], a: MapPoint, b: MapPoint): MapPoint[] {
  const output: MapPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    const ds = halfPlaneValue(start, a, b);
    const de = halfPlaneValue(end, a, b);
    const startInside = ds <= 0;
    const endInside = de <= 0;
    if (startInside !== endInside) {
      const t = ds / (ds - de);
      output.push({ x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) });
    }
    if (endInside) output.push(end);
  }
  return output.filter((point, index) => {
    const previous = output[(index - 1 + output.length) % output.length];
    return Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) > 1e-12;
  });
}

function mainLandFallback(geometry: MapGeometry, index: number): MapPoint {
  const main = geometry.polygons[0].points;
  const center = main.reduce((sum, point) => ({ x: sum.x + point.x / main.length, y: sum.y + point.y / main.length }), { x: 0, y: 0 });
  // Center-to-coast interpolation stays inside the star-shaped generated continent.
  const edge = main[(index * 17) % main.length];
  const t = 0.25 + (index % 5) * 0.1;
  const candidate = { x: center.x + (edge.x - center.x) * t, y: center.y + (edge.y - center.y) * t };
  return pointInLand(candidate, geometry) ? candidate : center;
}

/** Stable sites and Voronoi cells; the drawing layer clips these cells to land. */
export function generateCountries(seed: number, controls: GeographyControls, count: number): CountryRegion[] {
  if (!Number.isInteger(count) || count < 2 || count > 16) throw new Error('Invalid country count');
  const geometry = generateGeography(seed, controls);
  const random = seededRandom(seed);
  const sites: MapPoint[] = [];
  if (geometry.controls.lakeCount === 0 && geometry.controls.minCountrySpacing === 0) {
    for (let index = 0; index < count; index++) {
      let candidate: MapPoint | null = null;
      for (let attempt = 0; attempt < 256; attempt++) {
        const point = { x: random(), y: random() };
        if (pointInLand(point, geometry)) { candidate = point; break; }
      }
      sites.push(candidate ?? mainLandFallback(geometry, index));
    }
  } else {
    const threshold = geometry.controls.minCountrySpacing / 100 * MAP_WIDTH;
    for (let index = 0; index < count; index++) {
      let candidate: MapPoint | null = null;
      for (let attempt = 0; attempt < 4096; attempt++) {
        const point = { x: random(), y: random() };
        if (!pointInLand(point, geometry)) continue;
        if (sites.every((site) => {
          const dx = (point.x - site.x) * MAP_WIDTH;
          const dy = (point.y - site.y) * MAP_HEIGHT;
          return Math.hypot(dx, dy) >= Math.max(threshold, 1e-7);
        })) { candidate = point; break; }
      }
      if (!candidate) throw new MapLayoutError('spacing');
      sites.push(candidate);
    }
  }
  return sites.map((site, index) => {
    let points: MapPoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    for (let other = 0; other < sites.length && points.length >= 3; other++) {
      if (other !== index) points = clip(points, site, sites[other]);
    }
    return { id: `country-${index + 1}`, site, points };
  });
}

export function countryPath(region: CountryRegion): string {
  if (region.points.length < 3) return '';
  return region.points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${(point.x * MAP_WIDTH).toFixed(2)} ${(point.y * MAP_HEIGHT).toFixed(2)}`,
  ).join(' ') + ' Z';
}
