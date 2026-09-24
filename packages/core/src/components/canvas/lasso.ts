import type { Panel, SBObject } from '../../model/types';

export interface LassoPoint { x: number; y: number }
export interface LassoRect { x: number; y: number; width: number; height: number }

function pointInside(point: LassoPoint, polygon: LassoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function orientation(a: LassoPoint, b: LassoPoint, c: LassoPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: LassoPoint, b: LassoPoint, p: LassoPoint): boolean {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x)
    && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

function edgesCross(a: LassoPoint, b: LassoPoint, c: LassoPoint, d: LassoPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && onSegment(a, b, c)) return true;
  if (abD === 0 && onSegment(a, b, d)) return true;
  if (cdA === 0 && onSegment(c, d, a)) return true;
  if (cdB === 0 && onSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

/** Both the polygon and node bounds must be in unscaled stage/world coordinates. */
export function polygonIntersectsRect(polygon: LassoPoint[], rect: LassoRect): boolean {
  if (polygon.length < 3 || rect.width <= 0 || rect.height <= 0) return false;
  const area = polygon.reduce((sum, point, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  if (Math.abs(area) < 1) return false;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  if (corners.some((point) => pointInside(point, polygon))) return true;
  if (polygon.some((point) => point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height)) return true;
  for (let i = 0; i < polygon.length; i++) {
    for (let j = 0; j < corners.length; j++) {
      if (edgesCross(polygon[i], polygon[(i + 1) % polygon.length], corners[j], corners[(j + 1) % corners.length])) return true;
    }
  }
  return false;
}

export function lassoSelection(panel: Panel, polygon: LassoPoint[], rectFor: (object: SBObject) => LassoRect | null): string[] {
  const drawable = new Set(panel.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id));
  return panel.objects.filter((object) => {
    if (!drawable.has(object.layerId) || !object.visible || object.locked) return false;
    const rect = rectFor(object);
    return rect !== null && polygonIntersectsRect(polygon, rect);
  }).map((object) => object.id);
}
