// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { PanelGrid } from '@storyboard/core/components/grid/PanelGrid';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';

vi.mock('@storyboard/core/components/grid/PanelThumbnail', () => ({
  PanelThumbnail: () => <div data-testid="thumb-stub" />,
}));

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

it('Cards carries Gallery scene/link filters without changing panel order', () => {
  const panels = [
    createPanel({ id: 'a', meta: { scene: '1' }, scriptRefs: ['b1'] }),
    createPanel({ id: 'b', meta: { scene: '2' }, scriptRefs: [] }),
    createPanel({ id: 'c', meta: { scene: '1' }, scriptRefs: ['b2'] }),
  ];
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, { ...createProject({ panels: [] }), panels }, 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  useUiStore.setState({ viewMode: 'grid' });
  const ids = () => useProjectStore.getState().project.panels.map((p) => p.id);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<PanelGrid editable />));
  expect(host.querySelectorAll('[data-testid="cards-card"]')).toHaveLength(3);
  const linked = host.querySelector('[data-testid="cards-filter-linked"]') as HTMLButtonElement;
  const scene = host.querySelector('[data-testid="cards-scene-select"]') as HTMLSelectElement;
  expect(linked).not.toBeNull();
  expect(scene).not.toBeNull();
  act(() => linked.click());
  expect(host.querySelectorAll('[data-testid="cards-card"]')).toHaveLength(2);
  act(() => { scene.value = '1'; scene.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelectorAll('[data-testid="cards-card"]')).toHaveLength(2);
  expect(ids()).toEqual(['a', 'b', 'c']);
  act(() => {
    host!.querySelectorAll('[data-testid="cards-card"]')[1]
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  expect(useProjectStore.getState().activePanelId).toBe('c');
  expect(useUiStore.getState().viewMode).toBe('board');
});
