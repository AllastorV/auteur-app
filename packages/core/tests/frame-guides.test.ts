import { describe, expect, it } from 'vitest';
import { goldenSpiralGeometry, PHI } from '../src/render/goldenSpiral';

describe('Altın spiral rehberi', () => {
  for (const [width, height] of [[1000, 1000], [1200, 900], [1920, 1080]]) {
    it(`${width}×${height} kadraja taşmadan gerçek altın dikdörtgen kurar`, () => {
      const spiral = goldenSpiralGeometry(width, height);
      expect(spiral.rect.width / spiral.rect.height).toBeCloseTo(PHI, 10);
      expect(spiral.rect.x).toBeGreaterThanOrEqual(0);
      expect(spiral.rect.y).toBeGreaterThanOrEqual(0);
      expect(spiral.rect.x + spiral.rect.width).toBeLessThanOrEqual(width + 1e-6);
      expect(spiral.rect.y + spiral.rect.height).toBeLessThanOrEqual(height + 1e-6);
      expect(spiral.arcs).toHaveLength(8);
      for (let i = 0; i < spiral.arcs.length; i++) {
        const arc = spiral.arcs[i];
        for (const point of [arc.start, arc.end]) {
          expect(point.x).toBeGreaterThanOrEqual(spiral.rect.x - 1e-6);
          expect(point.y).toBeGreaterThanOrEqual(spiral.rect.y - 1e-6);
          expect(point.x).toBeLessThanOrEqual(spiral.rect.x + spiral.rect.width + 1e-6);
          expect(point.y).toBeLessThanOrEqual(spiral.rect.y + spiral.rect.height + 1e-6);
        }
        if (i > 0) {
          expect(spiral.arcs[i - 1].end.x).toBeCloseTo(arc.start.x, 6);
          expect(spiral.arcs[i - 1].end.y).toBeCloseTo(arc.start.y, 6);
          expect(spiral.arcs[i - 1].radius / arc.radius).toBeCloseTo(PHI, 8);
        }
      }
      expect((spiral.path.match(/ A /g) ?? []).length).toBe(8);
    });
  }
});
