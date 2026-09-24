import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateGeography, geographyPath, type MapPoint } from '../src/model/world-map-generator';

function inside(point: MapPoint, polygon: MapPoint[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

describe('deterministik dünya coğrafyası', () => {
  const controls = { landFraction: 0.47, islandCount: 5 };

  it('aynı tohum ve ayarlar için birebir aynı kıyıyı üretir', () => {
    const first = generateGeography(4096, controls);
    expect(JSON.stringify(generateGeography(4096, controls))).toBe(JSON.stringify(first));
    expect(first.polygons).toHaveLength(6);
    expect(first.polygons.every((polygon) => geographyPath(polygon).startsWith('M '))).toBe(true);
  });

  it.each([
    [0, '3be8d26d97146df0cc7f80ea26d8075708f0d80c08546c36ddf1b27ec2689c07'],
    [42, 'd785ab6e125e3e9fb1302ded964052f7925751f8432fd77371fb5819a6d107ed'],
    [4096, 'ebc2846054138eadd70fec335be9882df916347833a24161c0ec210e39efe2b2'],
  ])('eski sıfır ayarlarda %i tohumunun kıyı yolları bayt düzeyinde değişmez', (seed, digest) => {
    const paths = generateGeography(seed, { landFraction: 0.44, islandCount: 4 }).polygons
      .map(geographyPath).join('|');
    expect(createHash('sha256').update(paths).digest('hex')).toBe(digest);
  });

  it('göl sayısı tam üretilir; eski kıyı akışı değişmez ve göller ana karanın içindedir', () => {
    const controls = { landFraction: 0.44, islandCount: 4 };
    const original = generateGeography(42, controls);
    for (const lakeCount of [0, 1, 4, 8]) {
      const geography = generateGeography(42, { ...controls, lakeCount });
      expect(geography.polygons).toEqual(original.polygons);
      expect(geography.lakes).toHaveLength(lakeCount);
      expect(generateGeography(42, { ...controls, lakeCount }).lakes).toEqual(geography.lakes);
      for (const lake of geography.lakes) {
        expect(lake.points.every((point) => inside(point, geography.polygons[0].points))).toBe(true);
      }
      for (let i = 0; i < geography.lakes.length; i++) {
        for (let j = i + 1; j < geography.lakes.length; j++) {
          expect(geography.lakes[i].points.some((point) => inside(point, geography.lakes[j].points))).toBe(false);
          expect(geography.lakes[j].points.some((point) => inside(point, geography.lakes[i].points))).toBe(false);
        }
      }
    }
  });

  it('farklı tohum farklı coğrafya üretir', () => {
    expect(generateGeography(4096, controls)).not.toEqual(generateGeography(4097, controls));
  });

  it('seyrek ve yoğun kara ayarlarında bütün noktalar harita içinde kalır', () => {
    for (const seed of [0, 1, 2, 7, 42, 999, 0xffffffff]) {
      for (const landFraction of [0.05, 0.22, 0.55, 0.9]) {
        for (const islandCount of [0, 1, 7, 20]) {
          const geometry = generateGeography(seed, { landFraction, islandCount });
          expect(geometry.polygons).toHaveLength(islandCount + 1);
          for (const polygon of geometry.polygons) {
            expect(polygon.points.length).toBeGreaterThanOrEqual(32);
            for (const point of polygon.points) {
              expect(Number.isFinite(point.x)).toBe(true);
              expect(Number.isFinite(point.y)).toBe(true);
              expect(point.x).toBeGreaterThanOrEqual(0);
              expect(point.x).toBeLessThanOrEqual(1);
              expect(point.y).toBeGreaterThanOrEqual(0);
              expect(point.y).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('geçersiz parametreleri sessizce rastgeleleştirmez', () => {
    expect(() => generateGeography(Number.NaN, controls)).toThrow(/seed/i);
    expect(() => generateGeography(1, { landFraction: 2, islandCount: 1 })).toThrow(/controls/i);
  });
});
