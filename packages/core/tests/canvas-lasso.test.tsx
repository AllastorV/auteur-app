import { describe, expect, it } from 'vitest';
import { createPanel } from '../src/model/factory';
import { createRect } from '../src/model/objects';
import { lassoSelection, polygonIntersectsRect } from '../src/components/canvas/lasso';

const square = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
];

describe('kement vuruş testi', () => {
  it('merkezi dışarıda kalan fakat kenarı kementle kesişen nesneyi seçer', () => {
    expect(polygonIntersectsRect(square, { x: 90, y: 30, width: 80, height: 30 })).toBe(true);
    expect(polygonIntersectsRect(square, { x: 150, y: 150, width: 20, height: 20 })).toBe(false);
  });

  it('görünmez/kilitli nesneleri ve katmanları dışlar', () => {
    const panel = createPanel();
    const layerId = panel.layers[0].id;
    const visible = createRect({ layerId, x: 20, y: 20 }, { width: 20, height: 20 });
    const hidden = createRect({ layerId, x: 40, y: 20 }, { width: 20, height: 20 });
    hidden.visible = false;
    const locked = createRect({ layerId, x: 60, y: 20 }, { width: 20, height: 20 });
    locked.locked = true;
    panel.objects = [visible, hidden, locked];
    const bounds = () => ({ x: 10, y: 10, width: 20, height: 20 });
    expect(lassoSelection(panel, square, bounds)).toEqual([visible.id]);
    panel.layers[0].locked = true;
    expect(lassoSelection(panel, square, bounds)).toEqual([]);
  });

  it('yetersiz noktalı iptal edilen hareket seçime dönüşmez', () => {
    expect(polygonIntersectsRect(square.slice(0, 2), { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
