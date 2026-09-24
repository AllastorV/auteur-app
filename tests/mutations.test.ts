import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDoc, docToProject } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { createRect, createText } from '@storyboard/core/model/objects';
import { defaultDrawLayerId } from '@storyboard/core/model/layers';

function fixture() {
  const base = createProject({ panels: [createPanel(), createPanel()] });
  return { base, doc: createDoc(base) };
}

describe('Doküman mutasyonları', () => {
  it('panel ekler ve sahne/çekim numarasını devam ettirir', () => {
    const { base, doc } = fixture();
    M.updatePanelMeta(doc, base.panels[1].id, { scene: '3', shot: '7' });
    M.addPanel(doc);
    const project = docToProject(doc);
    expect(project.panels).toHaveLength(3);
    expect(project.panels[2].meta.scene).toBe('3');
    expect(project.panels[2].meta.shot).toBe('8');
  });

  it('panel çoğaltırken kimlikleri yeniler ve katman bağlarını korur', () => {
    const { base, doc } = fixture();
    const layerId = base.panels[0].layers[1].id;
    M.addObject(doc, base.panels[0].id, createText({ layerId, x: 0, y: 0 }, { text: 'kopyala' }));

    const newId = M.duplicatePanel(doc, base.panels[0].id)!;
    const project = docToProject(doc);
    const copy = project.panels.find((p) => p.id === newId)!;

    expect(copy.id).not.toBe(base.panels[0].id);
    expect(copy.objects).toHaveLength(1);
    expect(copy.objects[0].id).not.toBe(project.panels[0].objects[0].id);
    // Kopyanın objesi kopyanın katmanına bağlı olmalı
    expect(copy.layers.map((l) => l.id)).toContain(copy.objects[0].layerId);
    expect(base.panels[0].layers.map((l) => l.id)).not.toContain(copy.objects[0].layerId);
  });

  it('son panel silinemez', () => {
    const base = createProject({ panels: [createPanel()] });
    const doc = createDoc(base);
    M.removePanel(doc, base.panels[0].id);
    expect(docToProject(doc).panels).toHaveLength(1);
  });

  it('katman silinince o katmandaki objeler de silinir', () => {
    const { base, doc } = fixture();
    const panel = base.panels[0];
    const layerId = panel.layers[1].id;
    M.addObject(doc, panel.id, createRect({ layerId, x: 0, y: 0 }, { width: 10, height: 10 }));
    M.addObject(doc, panel.id, createRect({ layerId: panel.layers[0].id, x: 0, y: 0 }, { width: 5, height: 5 }));

    M.removeLayer(doc, panel.id, layerId);
    const result = docToProject(doc).panels[0];
    expect(result.layers.find((l) => l.id === layerId)).toBeUndefined();
    expect(result.objects).toHaveLength(1);
  });

  it('katman sırası değişince order alanları yeniden numaralanır', () => {
    const { base, doc } = fixture();
    const panel = base.panels[0];
    M.reorderLayer(doc, panel.id, panel.layers[0].id, 2);
    const result = docToProject(doc).panels[0];
    expect(result.layers.map((l) => l.order)).toEqual([0, 1, 2]);
    expect(result.layers[2].id).toBe(panel.layers[0].id);
  });

  it('obje sırası öne/arkaya taşınır', () => {
    const { base, doc } = fixture();
    const panel = base.panels[0];
    const layerId = panel.layers[1].id;
    const a = createRect({ layerId, x: 0, y: 0, z: 1 }, { width: 5, height: 5 });
    const b = createRect({ layerId, x: 0, y: 0, z: 2 }, { width: 5, height: 5 });
    M.addObjects(doc, panel.id, [a, b]);

    M.reorderObject(doc, panel.id, a.id, 'front');
    const objects = docToProject(doc).panels[0].objects;
    const za = objects.find((o) => o.id === a.id)!.z;
    const zb = objects.find((o) => o.id === b.id)!.z;
    expect(za).toBeGreaterThan(zb);
  });

  it('çoklu obje güncellemesi tek transaction içinde uygulanır', () => {
    const { base, doc } = fixture();
    const panel = base.panels[0];
    const layerId = panel.layers[1].id;
    const objs = [1, 2, 3].map((i) =>
      createRect({ layerId, x: i * 10, y: 0 }, { width: 5, height: 5 }),
    );
    M.addObjects(doc, panel.id, objs);

    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    M.updateObjects(doc, panel.id, objs.map((o) => o.id), () => ({ opacity: 0.4 }));
    expect(transactions).toBe(1);

    for (const o of docToProject(doc).panels[0].objects) expect(o.opacity).toBe(0.4);
  });


  it('doküman ↔ proje dönüşümü kayıpsızdır', () => {
    const base = createProject({ panels: [createPanel(), createPanel()] });
    const doc = createDoc(base);
    const round = docToProject(doc);
    expect(round.panels).toEqual(base.panels);
    expect(round.settings).toEqual(base.settings);
  });
});

describe('Geri alma yığını', () => {
  it('en az 50 adım geri alınabilir', () => {
    const base = createProject({ panels: [createPanel()] });
    const doc = createDoc(base);
    const panelId = base.panels[0].id;
    const layerId = base.panels[0].layers[1].id;

    const undoManager = new Y.UndoManager(
      [doc.getMap('meta'), doc.getMap('settings'), doc.getArray('panels'), doc.getArray('customPoses')],
      { trackedOrigins: new Set([M.LOCAL_ORIGIN]), captureTimeout: 0 },
    );

    const steps = 60;
    for (let i = 0; i < steps; i++) {
      M.addObject(doc, panelId, createText({ layerId, x: i, y: i }, { text: `adım ${i}` }));
    }
    expect(docToProject(doc).panels[0].objects).toHaveLength(steps);

    for (let i = 0; i < steps; i++) {
      expect(undoManager.canUndo(), `adım ${i}`).toBe(true);
      undoManager.undo();
    }
    expect(docToProject(doc).panels[0].objects).toHaveLength(0);

    // İleri alma da aynı derinlikte çalışmalı.
    for (let i = 0; i < steps; i++) undoManager.redo();
    expect(docToProject(doc).panels[0].objects).toHaveLength(steps);
  });
});

describe('Varsayılan çizim katmanı', () => {
  const layers = [
    { id: 'bg', kind: 'main' as const, locked: false, visible: true },
    { id: 'draw', kind: 'main' as const, locked: false, visible: true },
    { id: 'note', kind: 'annotation' as const, locked: false, visible: true },
  ];

  it('düzenleme yetkisi olan kullanıcı en üstteki ana katmana çizer', () => {
    expect(defaultDrawLayerId(layers, true)).toBe('draw');
  });

  it('yalnızca yorum yetkisi olan kullanıcı işaretleme katmanına çizer', () => {
    expect(defaultDrawLayerId(layers, false)).toBe('note');
  });

  it('kilitli ve gizli katmanlar atlanır', () => {
    const partial = [
      { id: 'bg', kind: 'main' as const, locked: false, visible: true },
      { id: 'draw', kind: 'main' as const, locked: true, visible: true },
      { id: 'hidden', kind: 'main' as const, locked: false, visible: false },
    ];
    expect(defaultDrawLayerId(partial, true)).toBe('bg');
  });

  it('işaretleme katmanı yoksa yorumcu için de bir katman döner', () => {
    const onlyMain = [{ id: 'bg', kind: 'main' as const, locked: false, visible: true }];
    expect(defaultDrawLayerId(onlyMain, false)).toBe('bg');
  });
});
