import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH, generateGeography, type MapPoint } from '../src/model/world-map-generator';
import { countryPath, generateCountries, pointInLand } from '../src/model/world-map-countries';

function inside(point: MapPoint, polygon: MapPoint[]): boolean {
  let contained = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) contained = !contained;
  }
  return contained;
}

describe('ülke geometrisi', () => {
  it('aynı tohum ve kontroller bire bir aynı bölgeleri verir', () => {
    const controls = { landFraction: 0.44, islandCount: 4 };
    expect(JSON.stringify(generateCountries(42, controls, 8))).toBe(JSON.stringify(generateCountries(42, controls, 8)));
  });

  it.each([
    [0, 'be029ca06e475eae4a47a9e15b7a4229a95aaf6f86666e976d8c80d1fe112b51'],
    [42, '6450c60bbcdc4a28c251bb92448aeeeb5226558f99acc133bed211df5857a428'],
    [4096, 'b925beaea30ce7724d2641090c687baa0f778422058e8383e6a789b1ede9e429'],
  ])('eski sıfır ayarlarda %i tohumunun ülke yolları bayt düzeyinde değişmez', (seed, digest) => {
    const paths = generateCountries(seed, { landFraction: 0.44, islandCount: 4 }, 8)
      .map(countryPath).join('|');
    expect(createHash('sha256').update(paths).digest('hex')).toBe(digest);
  });

  it('ülke merkezleri göl dışında ve istenen piksel mesafesinde yerleşir', () => {
    const controls = { landFraction: 0.44, islandCount: 4, lakeCount: 3, minCountrySpacing: 5 };
    const geometry = generateGeography(42, controls);
    const regions = generateCountries(42, controls, 8);
    expect(regions).toHaveLength(8);
    for (let i = 0; i < regions.length; i++) {
      expect(pointInLand(regions[i].site, geometry)).toBe(true);
      for (let j = i + 1; j < regions.length; j++) {
        const dx = (regions[i].site.x - regions[j].site.x) * MAP_WIDTH;
        const dy = (regions[i].site.y - regions[j].site.y) * MAP_HEIGHT;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(60 - 1e-7);
      }
    }
    for (const lake of geometry.lakes) {
      const center = lake.points.reduce((point, vertex) => ({
        x: point.x + vertex.x / lake.points.length,
        y: point.y + vertex.y / lake.points.length,
      }), { x: 0, y: 0 });
      expect(pointInLand(center, geometry)).toBe(false);
    }
  });

  it('fiziksel olarak sığmayan merkez mesafesini sessizce küçültmez', () => {
    expect(() => generateCountries(42, {
      landFraction: 0.05, islandCount: 0, lakeCount: 0, minCountrySpacing: 8,
    }, 16)).toThrow(expect.objectContaining({ code: 'spacing' }));
  });

  it.each([2, 8, 16])('%i ülke için kararlı slot kimlikleri oluşturur', (count) => {
    const regions = generateCountries(42, { landFraction: 0.44, islandCount: 4 }, count);
    expect(regions.map((region) => region.id)).toEqual(Array.from({ length: count }, (_, i) => `country-${i + 1}`));
    expect(regions.every((region) => region.points.length >= 3 && countryPath(region).endsWith(' Z'))).toBe(true);
  });

  it.each([0, 1, 42, 0xffffffff])('tohum %i için seyrekten yoğuna bütün siteler karadadır', (seed) => {
    for (const landFraction of [0.05, 0.44, 0.9]) {
      const controls = { landFraction, islandCount: 20 };
      const geography = generateGeography(seed, controls);
      const regions = generateCountries(seed, controls, 16);
      expect(regions).toHaveLength(16);
      for (const region of regions) {
        expect(pointInLand(region.site, geography)).toBe(true);
        expect(inside(region.site, region.points)).toBe(true);
      }
    }
  });

  it('örneklenen her kara noktası tam bir hücreye, deniz ise hiçbir seçilebilir ülkeye aittir', () => {
    const controls = { landFraction: 0.05, islandCount: 20 };
    const geography = generateGeography(42, controls);
    const regions = generateCountries(42, controls, 16);
    let landSamples = 0;
    let seaSamples = 0;
    for (let yi = 1; yi < 60; yi++) for (let xi = 1; xi < 80; xi++) {
      const point = { x: (xi + 0.17) / 80, y: (yi + 0.23) / 60 };
      const selectable = pointInLand(point, geography) ? regions.filter((region) => inside(point, region.points)) : [];
      if (pointInLand(point, geography)) {
        landSamples++;
        expect(selectable).toHaveLength(1);
      } else {
        seaSamples++;
        expect(selectable).toHaveLength(0);
      }
    }
    expect(landSamples).toBeGreaterThan(100);
    expect(seaSamples).toBeGreaterThan(100);
  });

  it('64 tohumda hücreleri pozitif alanlı ve harita sınırları içinde tutar', () => {
    for (let seed = 0; seed < 64; seed++) {
      const controls = { landFraction: seed % 2 ? 0.05 : 0.9, islandCount: seed % 3 ? 20 : 0 };
      const geography = generateGeography(seed, controls);
      const regions = generateCountries(seed, controls, 16);
      for (const region of regions) {
        expect(pointInLand(region.site, geography)).toBe(true);
        expect(region.points.length).toBeGreaterThanOrEqual(3);
        expect(region.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) &&
          p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
        const area = Math.abs(region.points.reduce((sum, p, i) => {
          const next = region.points[(i + 1) % region.points.length];
          return sum + p.x * next.y - next.x * p.y;
        }, 0)) / 2;
        expect(area).toBeGreaterThan(0);
      }
    }
  });

  it('geçersiz sayı, tohum ve coğrafyayı reddeder', () => {
    const controls = { landFraction: 0.44, islandCount: 4 };
    for (const count of [0, 1, 17, 2.5, NaN]) expect(() => generateCountries(1, controls, count)).toThrow();
    for (const seed of [-1, 0x100000000, NaN]) expect(() => generateCountries(seed, controls, 8)).toThrow();
    expect(() => generateCountries(1, { landFraction: -1, islandCount: 4 }, 8)).toThrow();
  });
});
