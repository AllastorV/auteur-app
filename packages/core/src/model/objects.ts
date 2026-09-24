import { uid } from '../util/id';
import type {
  CameraOverlayObject,
  EllipseObject,
  ImageObject,
  LineObject,
  PolygonObject,
  RectObject,
  SBObject,
  StrokeObject,
  TextObject,
} from './types';

interface Base {
  layerId: string;
  x: number;
  y: number;
  z?: number;
  name?: string;
  opacity?: number;
}

function base(kind: SBObject['kind'], b: Base) {
  return {
    id: uid(kind.slice(0, 3)),
    kind,
    layerId: b.layerId,
    name: b.name ?? '',
    x: b.x,
    y: b.y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: b.opacity ?? 1,
    locked: false,
    visible: true,
    z: b.z ?? Date.now() % 1_000_000,
  };
}

export function createStroke(
  b: Base,
  opts: { points: number[]; color: string; width: number; eraser?: boolean; brush?: boolean; smoothing?: number; opacity?: number },
): StrokeObject {
  return {
    ...base('stroke', { ...b, opacity: opts.opacity ?? b.opacity }),
    kind: 'stroke',
    geometryVersion: 2,
    name: b.name ?? (opts.eraser ? 'Silgi' : opts.brush ? 'Fırça' : 'Kalem'),
    points: opts.points,
    color: opts.color,
    width: opts.width,
    eraser: opts.eraser ?? false,
    brush: opts.brush ?? false,
    smoothing: opts.smoothing ?? 0.5,
  };
}

export function createRect(
  b: Base,
  opts: { width: number; height: number; fill?: string | null; stroke?: string | null; strokeWidth?: number; cornerRadius?: number },
): RectObject {
  return {
    ...base('rect', b),
    kind: 'rect',
    name: b.name ?? 'Dikdörtgen',
    width: opts.width,
    height: opts.height,
    fill: opts.fill ?? null,
    stroke: opts.stroke ?? '#111827',
    strokeWidth: opts.strokeWidth ?? 3,
    cornerRadius: opts.cornerRadius ?? 0,
  };
}

export function createEllipse(
  b: Base,
  opts: { radiusX: number; radiusY: number; fill?: string | null; stroke?: string | null; strokeWidth?: number },
): EllipseObject {
  return {
    ...base('ellipse', b),
    kind: 'ellipse',
    name: b.name ?? 'Elips',
    radiusX: opts.radiusX,
    radiusY: opts.radiusY,
    fill: opts.fill ?? null,
    stroke: opts.stroke ?? '#111827',
    strokeWidth: opts.strokeWidth ?? 3,
  };
}

export function createLine(
  b: Base,
  opts: { points: number[]; stroke?: string; strokeWidth?: number; arrow?: boolean; dash?: number[] | null },
): LineObject {
  return {
    ...base(opts.arrow ? 'arrow' : 'line', b),
    kind: opts.arrow ? 'arrow' : 'line',
    name: b.name ?? (opts.arrow ? 'Ok' : 'Çizgi'),
    points: opts.points,
    stroke: opts.stroke ?? '#111827',
    strokeWidth: opts.strokeWidth ?? 3,
    dash: opts.dash ?? null,
  };
}

export function createPolygon(
  b: Base,
  opts: { points: number[]; closed?: boolean; fill?: string | null; stroke?: string | null; strokeWidth?: number },
): PolygonObject {
  return {
    ...base('polygon', b),
    kind: 'polygon',
    name: b.name ?? 'Çokgen',
    points: opts.points,
    closed: opts.closed ?? true,
    fill: opts.fill ?? null,
    stroke: opts.stroke ?? '#111827',
    strokeWidth: opts.strokeWidth ?? 3,
  };
}

export function createText(
  b: Base,
  opts: { text: string; fontSize?: number; fontFamily?: string; fill?: string; width?: number; align?: TextObject['align'] },
): TextObject {
  return {
    ...base('text', b),
    kind: 'text',
    name: b.name ?? 'Metin',
    text: opts.text,
    fontFamily: opts.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSize: opts.fontSize ?? 32,
    fontStyle: 'normal',
    align: opts.align ?? 'left',
    fill: opts.fill ?? '#111827',
    stroke: null,
    strokeWidth: 0,
    width: opts.width ?? 320,
    lineHeight: 1.25,
  };
}

export function createImage(
  b: Base,
  opts: { assetId: string; width: number; height: number },
): ImageObject {
  return {
    ...base('image', b),
    kind: 'image',
    name: b.name ?? 'Görsel',
    assetId: opts.assetId,
    width: opts.width,
    height: opts.height,
  };
}

export function createCameraOverlay(
  b: Base,
  opts: { presetId: string; label: string; width: number; height: number; showArrow?: boolean; color?: string },
): CameraOverlayObject {
  return {
    ...base('cameraOverlay', b),
    kind: 'cameraOverlay',
    name: b.name ?? opts.label,
    presetId: opts.presetId,
    showArrow: opts.showArrow ?? true,
    color: opts.color ?? '#f97316',
    width: opts.width,
    height: opts.height,
    label: opts.label,
  };
}
