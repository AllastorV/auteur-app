import { describe, expect, it } from 'vitest';
import { createDoc } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { ProjectSnapshot } from '@storyboard/core/store/snapshot';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { createStroke } from '@storyboard/core/model/objects';
import { buildTimeline, totalDuration } from '@storyboard/core/model/timeline';

/**
 * 100 panellik projede canvas'ın akıcı kalması, her düzenlemede tüm projenin
 * yeniden okunmamasına dayanır. Burada ölçülen; tek bir düzenlemeden sonra
 * anlık görüntünün yeniden üretilme maliyetidir — 60 FPS'te kare başına
 * bütçe 16.6 ms, bu işin payına düşen çok daha azı olmalıdır.
 */
function bigProject(panelCount: number, objectsPerPanel: number) {
  const base = createProject({
    panels: Array.from({ length: panelCount }, () => createPanel()),
  });
  const doc = createDoc(base);
  for (const panel of base.panels) {
    const layerId = panel.layers[1].id;
    const objects = Array.from({ length: objectsPerPanel }, (_, i) =>
      createStroke(
        { layerId, x: 0, y: 0 },
        { points: [i, i, 0.5, i + 10, i + 10, 0.7, i + 20, i, 0.4], color: '#111', width: 3 },
      ),
    );
    M.addObjects(doc, panel.id, objects);
  }
  return { base, doc };
}

describe('Başarım — 100 panel', () => {
  it('tek panel düzenlemesinden sonra anlık görüntü hızlı üretilir', () => {
    const { base, doc } = bigProject(100, 20);
    const snapshot = new ProjectSnapshot(doc);
    doc.on('afterTransaction', (tr) => snapshot.markFromTransaction(tr));

    snapshot.read(); // ilk tam okuma

    const started = performance.now();
    const iterations = 60;
    for (let i = 0; i < iterations; i++) {
      M.updatePanelMeta(doc, base.panels[i % 100].id, { dialogue: `replik ${i}` });
      snapshot.read();
    }
    const perEdit = (performance.now() - started) / iterations;

    // 60 FPS bütçesi 16.6 ms; durum yenilemesi bunun küçük bir kısmı olmalı.
    expect(perEdit).toBeLessThan(6);
  });

  it('değişmeyen paneller yeniden okunmaz', () => {
    const { base, doc } = bigProject(100, 10);
    const snapshot = new ProjectSnapshot(doc);
    doc.on('afterTransaction', (tr) => snapshot.markFromTransaction(tr));

    const before = snapshot.read();
    const layerId = base.panels[7].layers[1].id;
    M.addObject(
      doc,
      base.panels[7].id,
      createStroke({ layerId, x: 0, y: 0 }, { points: [0, 0, 1], color: '#000', width: 2 }),
    );
    const after = snapshot.read();

    const reused = after.panels.filter((p, i) => p === before.panels[i]).length;
    expect(reused).toBe(99);
    expect(after.panels[7].objects.length).toBe(11);
  });

  it('zaman çizelgesi 100 panelde hızlı hesaplanır', () => {
    const { base } = bigProject(100, 0);
    const started = performance.now();
    for (let i = 0; i < 200; i++) {
      buildTimeline(base.panels);
      totalDuration(base.panels);
    }
    expect((performance.now() - started) / 200).toBeLessThan(2);
  });

});
