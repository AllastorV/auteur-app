// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDoc, docToProject } from '../src/doc/schema';
import { reorderLayer, updateLayer, LOCAL_ORIGIN } from '../src/doc/mutations';
import { createPanel, createProject } from '../src/model/factory';
import { LayersPanel } from '../src/components/inspector/LayersPanel';
import { useProjectStore } from '../src/store/project';
import { useUiStore } from '../src/store/ui';
import { arayuzDiliniAyarla } from '../src/dil/arayuz';

let doc: Y.Doc;
let panelId: string;
let ids: string[];
let host: HTMLDivElement | null;
let root: Root | null;
const ordered = () => [...docToProject(doc).panels[0].layers].sort((a, b) => a.order - b.order).map((layer) => layer.id);
const render = (editable: boolean) => {
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  act(() => root!.render(<LayersPanel panel={docToProject(doc).panels[0]} editable={editable} />));
};

beforeEach(() => {
  const panel = createPanel();
  doc = createDoc(createProject({ panels: [panel] }));
  panelId = panel.id;
  ids = panel.layers.map((layer) => layer.id);
  useProjectStore.getState().attachDoc(doc, 'owner');
  useUiStore.setState({ activeLayerId: ids[1] });
  host = null;
  root = null;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  doc.destroy();
  arayuzDiliniAyarla('tr');
});

describe('Katman sırası', () => {
  it('varsayılan katmanları İngilizce gösterir, özel adı korur', () => {
    arayuzDiliniAyarla('en');
    render(true);
    const names = () => [...host!.querySelectorAll<HTMLInputElement>('[data-testid="layer-row"] input:not([type])')].map((input) => input.value);
    expect(names()).toEqual(['Markup', 'Drawing', 'Background']);
    expect(host!.textContent).toContain('Note');
    act(() => root!.unmount());
    root = null;
    host?.remove();
    host = null;
    updateLayer(doc, panelId, ids[1], { name: 'Moonlight' });
    render(true);
    expect(names()).toContain('Moonlight');
  });
  it('alt, orta ve üste taşıma order alanlarıyla çalışır; katman kimliği ve meta korunur', () => {
    const layers = (doc.getArray('panels').get(0) as Y.Map<any>).get('layers') as Y.Array<Y.Map<any>>;
    const originalMap = layers.get(0);
    updateLayer(doc, panelId, ids[0], { opacity: 0.36, name: 'Gece' });
    reorderLayer(doc, panelId, ids[0], 2);
    expect(ordered()).toEqual([ids[1], ids[2], ids[0]]);
    expect(layers.toArray()).toContain(originalMap);
    expect(originalMap.get('name')).toBe('Gece');
    expect(originalMap.get('opacity')).toBe(0.36);
    expect(useUiStore.getState().activeLayerId).toBe(ids[1]);
    reorderLayer(doc, panelId, ids[0], 1);
    expect(ordered()).toEqual([ids[1], ids[0], ids[2]]);
    reorderLayer(doc, panelId, ids[0], 0);
    expect(ordered()).toEqual(ids);
  });

  it('sıralama geri alınır ve yeniden uygulanır', () => {
    const undo = new Y.UndoManager(doc.getArray('panels'), { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 0 });
    reorderLayer(doc, panelId, ids[0], 2);
    expect(ordered()).toEqual([ids[1], ids[2], ids[0]]);
    undo.undo();
    expect(ordered()).toEqual(ids);
    undo.redo();
    expect(ordered()).toEqual([ids[1], ids[2], ids[0]]);
    undo.destroy();
  });

  it('kilitli ve salt okunur katman sürüklemesi kapalıdır; Yukarı/Aşağı düğmesi yoktur', () => {
    updateLayer(doc, panelId, ids[2], { locked: true });
    render(false);
    expect(host!.querySelectorAll('[data-testid="layer-grip"]:not([disabled])')).toHaveLength(0);
    expect(host!.textContent).not.toContain('Yukarı');
    expect(host!.textContent).not.toContain('Aşağı');
    const before = Y.encodeStateAsUpdate(doc);
    act(() => (host!.querySelector('[title="Gizle"]') as HTMLButtonElement).click());
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    act(() => root!.render(<LayersPanel panel={docToProject(doc).panels[0]} editable />));
    const grips = [...host!.querySelectorAll<HTMLButtonElement>('[data-testid="layer-grip"]')];
    expect(grips.filter((grip) => grip.disabled)).toHaveLength(1);
  });

  it('Alt+Ok tuşları tutma kolundan aynı sıralama mutasyonunu uygular', () => {
    render(true);
    const grip = host!.querySelectorAll<HTMLButtonElement>('[data-testid="layer-grip"]')[1];
    act(() => grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true })));
    expect(ordered()).toEqual([ids[0], ids[2], ids[1]]);
  });
});
