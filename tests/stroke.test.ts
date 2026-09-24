import { describe, expect, it } from 'vitest';
import {
  hasPressureVariation,
  readStrokePoints,
  smoothPoints,
  strokeGeometry,
  strokeOutline,
} from '@storyboard/core/render/stroke';
import { createStroke } from '@storyboard/core/model/objects';

const base = { layerId: 'lyr', x: 0, y: 0 };

describe('Basınç duyarlı kalem darbesi', () => {
  it('fareyle çizilen yeni kalem sabit merkez çizgisi, fırça değişken dolu iz üretir', () => {
    const opts = { points: [0, 0, 0.5, 2, 0, 0.5, 20, 0, 0.5, 22, 0, 0.5], color: '#000', width: 12, smoothing: 0.5 };
    const pen = strokeGeometry(createStroke(base, { ...opts, brush: false }));
    const brush = strokeGeometry(createStroke(base, { ...opts, brush: true }));
    expect(pen.filled).toBe(false);
    expect(brush.filled).toBe(true);
    expect(brush.points).not.toEqual(pen.points);
    expect(Math.abs(brush.points[1] - brush.points[3])).toBeGreaterThan(0);
  });

  it('basınçlı yeni kalem ince çizgi kalır; fırça basınca tepki verir', () => {
    const opts = { points: [0, 0, 0.2, 10, 0, 0.9, 20, 0, 0.3], color: '#000', width: 14, smoothing: 0 };
    expect(strokeGeometry(createStroke(base, { ...opts, brush: false })).filled).toBe(false);
    expect(strokeGeometry(createStroke(base, { ...opts, brush: true })).filled).toBe(true);
  });

  it('sürüm alanı olmayan eski basınçlı darbeyi eski geometriyle korur', () => {
    const old = createStroke(base, { points: [0, 0, 0.2, 10, 0, 0.9, 20, 0, 0.3], color: '#000', width: 14 });
    delete old.geometryVersion;
    expect(strokeGeometry(old).filled).toBe(true);
  });
  it('[x,y,basınç] üçlülerini okur', () => {
    const pts = readStrokePoints([0, 0, 0.2, 10, 5, 0.8]);
    expect(pts).toHaveLength(2);
    expect(pts[1]).toEqual({ x: 10, y: 5, pressure: 0.8 });
  });

  it('basınçsız [x,y] dizisini varsayılan basınçla okur', () => {
    const pts = readStrokePoints([0, 0, 10, 5]);
    expect(pts).toHaveLength(2);
    expect(pts[0].pressure).toBe(0.5);
  });

  it('basınç değişimini algılar', () => {
    expect(hasPressureVariation(readStrokePoints([0, 0, 0.1, 5, 5, 0.9, 9, 9, 0.5]))).toBe(true);
    expect(hasPressureVariation(readStrokePoints([0, 0, 0.5, 5, 5, 0.5, 9, 9, 0.5]))).toBe(false);
  });

  it('değişken basınçta dolu dış hat üretir', () => {
    const stroke = createStroke(base, {
      points: [0, 0, 0.15, 10, 0, 0.9, 20, 0, 0.2],
      color: '#000',
      width: 20,
    });
    delete stroke.geometryVersion; // sürüm 1 belge davranışı
    const geo = strokeGeometry(stroke);
    expect(geo.filled).toBe(true);
    // İleri ve geri kenar: nokta sayısının iki katı koordinat çifti
    expect(geo.points.length).toBe(3 * 2 * 2);
    expect(geo.points.every(Number.isFinite)).toBe(true);
  });

  it('sabit basınçta çizgi yolu kullanır', () => {
    const stroke = createStroke(base, {
      points: [0, 0, 0.5, 10, 0, 0.5, 20, 0, 0.5],
      color: '#000',
      width: 10,
      smoothing: 0,
    });
    const geo = strokeGeometry(stroke);
    expect(geo.filled).toBe(false);
    expect(geo.points).toEqual([0, 0, 10, 0, 20, 0]);
  });

  it('silgi darbesi her zaman çizgi olarak çizilir', () => {
    const stroke = createStroke(base, {
      points: [0, 0, 0.1, 10, 0, 0.9],
      color: '#000',
      width: 10,
      eraser: true,
    });
    expect(strokeGeometry(stroke).filled).toBe(false);
  });

  it('yumuşatma noktaları ortalar ve sayıyı korur', () => {
    const pts = readStrokePoints([0, 0, 0.5, 10, 40, 0.5, 20, 0, 0.5]);
    const smoothed = smoothPoints(pts, 0.5);
    expect(smoothed).toHaveLength(3);
    expect(smoothed[1].y).toBeLessThan(40);
  });

  it('dış hat uçlarda sivrilir', () => {
    const pts = readStrokePoints([0, 0, 1, 10, 0, 1, 20, 0, 1, 30, 0, 1, 40, 0, 1]);
    const outline = strokeOutline(pts, 20);
    const halfAt = (i: number) => Math.abs(outline[i * 2 + 1]);
    expect(halfAt(0)).toBeLessThan(halfAt(2));
  });
});
