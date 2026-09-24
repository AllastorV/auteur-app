// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Inspector } from '../src/components/inspector/Inspector';
import { useProjectStore } from '../src/store/project';
import { useUiStore } from '../src/store/ui';
import { loadProjectIntoDoc } from '../src/doc/schema';
import { addObject, setScript } from '../src/doc/mutations';
import { arayuzDiliniAyarla } from '../src/dil/arayuz';
import { createPanel, createProject } from '../src/model/factory';
import { createRect } from '../src/model/objects';

// This suite checks Inspector routing; screenplay subpanels have their own tests.
vi.mock('../src/components/script/ScriptNavigator', () => ({ ScriptNavigator: () => <div data-testid="navigator-stub" /> }));
vi.mock('../src/components/inspector/YazimSekmesi', () => ({ YazimSekmesi: () => <div data-testid="writing-stub" /> }));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let doc: Y.Doc;

const query = (id: string) => host!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const renderInspector = (editable = true) => {
  const panel = useProjectStore.getState().project.panels[0];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Inspector panel={panel} editable={editable} />));
};

beforeEach(() => {
  doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel({ id: 'panel-1', scriptRefs: ['b1'] })] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  setScript(doc, { name: 'Scene', blocks: [{ id: 'b1', fp: 'b1', type: 'action', text: 'A scene', scene: '', sceneId: 's1' }] });
  useUiStore.setState({ viewMode: 'board', panoSekmesi: 'katman', inspectorTab: 'sahne', selection: [] });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  doc.destroy();
  arayuzDiliniAyarla('tr');
});

describe('Moda göre sağ panel', () => {
  it('dolu senaryoda Storyboard yalnız çizim sekmelerini açar ve Katmanlar ile başlar', () => {
    renderInspector();
    expect(query('denetci-sekmeleri')).toBeNull();
    expect(query('pano-sekme-katman')).toBeTruthy();
    expect(query('pano-sekme-boya')).toBeTruthy();
    expect(query('pano-sekme-ozellik')).toBeTruthy();
    expect(query('pano-sekme-rehber')).toBeTruthy();
    expect(query('pano-sekme-katman')?.getAttribute('aria-current')).toBe('true');
    expect(host!.textContent).toContain('Katmanlar');
  });

  it('İngilizce storyboard katman ipucunu ve süre birimini çevirir', () => {
    arayuzDiliniAyarla('en');
    useUiStore.setState({ panoSekmesi: 'ozellik' });
    renderInspector();
    expect(query('storyboard-cue')?.textContent).toContain('Background');
    const duration = [...host!.querySelectorAll('label')]
      .find((label) => label.querySelector('span')?.textContent === 'Duration');
    expect(duration).toBeTruthy();
    expect(duration!.textContent).toContain('s');
    expect(duration!.textContent).not.toContain('sn');
  });

  it('Kartlar yalnız seçili kart bilgisini ve çizimi aç eylemini gösterir', () => {
    useUiStore.setState({ viewMode: 'grid' });
    renderInspector();
    expect(query('cards-inspector')).toBeTruthy();
    expect(query('denetci-sekmeleri')).toBeNull();
    expect(query('pano-sekmeleri')).toBeNull();
    expect(host!.textContent).toContain('1 senaryo satırı');
    act(() => query('cards-open-board')!.click());
    expect(useUiStore.getState().viewMode).toBe('board');
  });

  it('Senaryo son seçilen grubunu korur, sunumda denetçi içerik çizmez', () => {
    useUiStore.setState({ viewMode: 'senaryo', inspectorTab: 'yazim' });
    renderInspector();
    expect(query('denetci-sekmeleri')).toBeTruthy();
    expect(query('pano-sekmeleri')).toBeNull();
    act(() => useUiStore.setState({ viewMode: 'board' }));
    act(() => useUiStore.setState({ viewMode: 'senaryo' }));
    expect(query('sekme-yazim')?.getAttribute('aria-current')).toBe('true');
    act(() => useUiStore.setState({ viewMode: 'sunum' }));
    expect(host!.textContent).toBe('');
  });

  it('salt okunur Kartlar alanları belgeyi değiştiremez', () => {
    useUiStore.setState({ viewMode: 'grid' });
    renderInspector(false);
    const before = Y.encodeStateAsUpdate(doc);
    expect(Array.from(host!.querySelectorAll('input')).every((input) => input.disabled)).toBe(true);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  it('obje seçimi Özellikleri bir kez açar; sonraki elle seçilen sekmeyi bozmaz', () => {
    const panel = useProjectStore.getState().project.panels[0];
    const rect = createRect({ layerId: panel.layers[0].id, x: 20, y: 20 }, { width: 30, height: 20 });
    addObject(doc, panel.id, rect);
    useUiStore.setState({ selection: [rect.id] });
    renderInspector();
    expect(query('pano-sekme-ozellik')?.getAttribute('aria-current')).toBe('true');
    act(() => query('pano-sekme-katman')!.click());
    expect(query('pano-sekme-katman')?.getAttribute('aria-current')).toBe('true');
    act(() => useUiStore.setState({ selection: [] }));
    act(() => useUiStore.setState({ selection: [rect.id] }));
    expect(query('pano-sekme-katman')?.getAttribute('aria-current')).toBe('true');
  });
});
