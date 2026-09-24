import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDoc, docToProject, findPanelMap, panelsArray, readAssets } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createProject, createPanel } from '@storyboard/core/model/factory';
import { createStroke, createText } from '@storyboard/core/model/objects';
import { ProjectSnapshot } from '@storyboard/core/store/snapshot';

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

function threeWaySync(docs: Y.Doc[]) {
  for (const a of docs) {
    for (const b of docs) {
      if (a !== b) Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    }
  }
}

describe('CRDT ortak çalışma', () => {
  it('3 kullanıcı farklı panelleri düzenlerken veri kaybı olmaz', () => {
    const base = createProject({
      panels: [createPanel(), createPanel(), createPanel()],
    });
    const server = createDoc(base);
    const seed = Y.encodeStateAsUpdate(server);

    const clients = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    for (const c of clients) Y.applyUpdate(c, seed);

    const panelIds = base.panels.map((p) => p.id);

    // Her kullanıcı kendi panelinde 20 çizim yapar — hepsi çevrimdışı.
    clients.forEach((doc, index) => {
      const panelId = panelIds[index];
      const layerId = base.panels[index].layers[1].id;
      for (let i = 0; i < 20; i++) {
        M.addObject(
          doc,
          panelId,
          createStroke(
            { layerId, x: 0, y: 0 },
            { points: [i, i, 0.5, i + 5, i + 5, 0.6], color: '#000', width: 3 },
          ),
        );
      }
      M.updatePanelMeta(doc, panelId, { action: `Kullanıcı ${index + 1} notu` });
    });

    threeWaySync(clients);
    for (const c of clients) Y.applyUpdate(server, Y.encodeStateAsUpdate(c, Y.encodeStateVector(server)));
    threeWaySync([...clients, server]);

    const merged = docToProject(server);
    for (let i = 0; i < 3; i++) {
      const panel = merged.panels.find((p) => p.id === panelIds[i])!;
      expect(panel.objects.length, `panel ${i}`).toBe(20);
      expect(panel.meta.action).toBe(`Kullanıcı ${i + 1} notu`);
    }

    // Tüm istemciler aynı sonuca yakınsar.
    for (const c of clients) {
      expect(JSON.stringify(docToProject(c))).toBe(JSON.stringify(merged));
    }
  });

  it('aynı panelde eşzamanlı düzenlemeler birleşir', () => {
    const base = createProject({ panels: [createPanel()] });
    const a = createDoc(base);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const panelId = base.panels[0].id;
    const layerId = base.panels[0].layers[1].id;

    M.addObject(a, panelId, createText({ layerId, x: 10, y: 10 }, { text: 'A tarafı' }));
    M.addObject(b, panelId, createText({ layerId, x: 90, y: 90 }, { text: 'B tarafı' }));

    sync(a, b);

    const panelA = docToProject(a).panels[0];
    const panelB = docToProject(b).panels[0];
    expect(panelA.objects).toHaveLength(2);
    expect(panelB.objects).toHaveLength(2);
    expect(panelA.objects.map((o) => (o as any).text).sort()).toEqual(['A tarafı', 'B tarafı']);
  });

  it('çevrimdışı yapılan değişiklikler bağlanınca birleşir', () => {
    const base = createProject({ panels: [createPanel(), createPanel()] });
    const online = createDoc(base);
    const offline = new Y.Doc();
    Y.applyUpdate(offline, Y.encodeStateAsUpdate(online));

    M.updatePanelMeta(online, base.panels[0].id, { dialogue: 'Çevrimiçi replik' });
    M.updatePanelMeta(offline, base.panels[1].id, { dialogue: 'Çevrimdışı replik' });
    M.addPanel(offline);

    sync(online, offline);

    const project = docToProject(online);
    expect(project.panels).toHaveLength(3);
    expect(project.panels[0].meta.dialogue).toBe('Çevrimiçi replik');
    expect(project.panels[1].meta.dialogue).toBe('Çevrimdışı replik');
  });

  it('geri alma yalnızca yerel değişiklikleri etkiler', () => {
    const base = createProject({ panels: [createPanel()] });
    const local = createDoc(base);
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));

    const undoManager = new Y.UndoManager(
      [local.getArray('panels')],
      { trackedOrigins: new Set([M.LOCAL_ORIGIN]) },
    );

    const panelId = base.panels[0].id;
    const layerId = base.panels[0].layers[1].id;

    M.addObject(local, panelId, createText({ layerId, x: 0, y: 0 }, { text: 'yerel' }));
    M.addObject(remote, panelId, createText({ layerId, x: 0, y: 0 }, { text: 'uzak' }));
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(local)));

    expect(docToProject(local).panels[0].objects).toHaveLength(2);
    undoManager.undo();

    const texts = docToProject(local).panels[0].objects.map((o) => (o as any).text);
    expect(texts).toEqual(['uzak']);
  });

  it('panel sıralaması senkronize edilir', () => {
    const base = createProject({ panels: [createPanel(), createPanel(), createPanel()] });
    const a = createDoc(base);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    M.movePanel(a, base.panels[2].id, 0);
    sync(a, b);
    expect(docToProject(b).panels[0].id).toBe(base.panels[2].id);
  });
});

describe('Anlık görüntü önbelleği', () => {
  it('değişmeyen paneller aynı nesne referansını korur', () => {
    const base = createProject({ panels: [createPanel(), createPanel(), createPanel()] });
    const doc = createDoc(base);
    const snapshot = new ProjectSnapshot(doc);
    doc.on('afterTransaction', (tr) => snapshot.markFromTransaction(tr));

    const first = snapshot.read();
    M.updatePanelMeta(doc, base.panels[1].id, { dialogue: 'değişti' });
    const second = snapshot.read();

    expect(second.panels[0]).toBe(first.panels[0]);
    expect(second.panels[2]).toBe(first.panels[2]);
    expect(second.panels[1]).not.toBe(first.panels[1]);
    expect(second.panels[1].meta.dialogue).toBe('değişti');
  });

  it('100 panellik projede tek panel düzenlemesi diğerlerini yeniden okumaz', () => {
    const base = createProject({ panels: Array.from({ length: 100 }, () => createPanel()) });
    const doc = createDoc(base);
    const snapshot = new ProjectSnapshot(doc);
    doc.on('afterTransaction', (tr) => snapshot.markFromTransaction(tr));

    const before = snapshot.read();
    M.updatePanelMeta(doc, base.panels[42].id, { scene: '9' });
    const after = snapshot.read();

    let reused = 0;
    for (let i = 0; i < 100; i++) if (after.panels[i] === before.panels[i]) reused++;
    expect(reused).toBe(99);
  });
});

describe('WebSocket mesaj tipleri', () => {
  it('özel tipler y-websocket’in ayırdığı aralıkla çakışmaz', async () => {
    const { MSG } = await import('@storyboard/core/collab/protocol');
    // y-websocket: 0=sync, 1=awareness, 2=auth, 3=queryAwareness. 3 aynı odayı
    // açan sekmeler arasında BroadcastChannel üzerinden de yayınlanır; o tipi
    // ezmek sekmeler arası senkronu bozar.
    const RESERVED = [0, 1, 2, 3];
    expect(RESERVED).not.toContain(MSG.DENIED);
    expect(RESERVED).not.toContain(MSG.ROLE);
    expect(MSG.DENIED).not.toBe(MSG.ROLE);
  });
});

describe('Gömülü varlıklar', () => {
  it('iki istemci arasında senkronlanır', () => {
    const a = createDoc(createProject());
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    M.setAsset(a, 'img_abc.png', 'data:image/png;base64,AAAA');
    sync(a, b);

    expect(readAssets(b)['img_abc.png']).toBe('data:image/png;base64,AAAA');
  });

  it('proje dosyasından yüklenen varlıklar da dokümana girer', () => {
    const doc = createDoc(createProject());
    M.setAssets(doc, { 'a.png': 'data:image/png;base64,BBBB' }, 'load');
    expect(readAssets(doc)).toEqual({ 'a.png': 'data:image/png;base64,BBBB' });
  });
});
