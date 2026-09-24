// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { MapInspector } from '../src/components/map/MapInspector';
import { MapWorkspace } from '../src/components/map/MapWorkspace';
import { getAtlasScene } from '../src/components/map/atlas-cache';
import { isAtlasLand } from '../src/model/atlas/world';
import { addMapMarker, updateMapCountry } from '../src/doc/mutations';
import { createProject } from '../src/model/factory';
import { createProjectMap, PROJECT_MAP_ID, readProjectMap } from '../src/model/project-world-map';
import { setProjectMapLock } from '../src/model/project-world-map';
import { useProjectStore } from '../src/store/project';
import { useUiStore } from '../src/store/ui';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function mount() {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  act(() => root.render(<><MapWorkspace /><MapInspector /></>));
  const button = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
  return { host, button, close: () => { act(() => root.unmount()); host.remove(); } };
}

describe('world map preview and lock', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createProject());
    useProjectStore.getState().setRole('owner');
    useUiStore.setState({ viewMode: 'harita', activeWorldId: null, mapDraft: null, mapSelection: null });
  });

  it('keeps Yjs untouched through random preview and cancel, then applies only geography', () => {
    const doc = useProjectStore.getState().doc;
    createProjectMap(doc, 91);
    updateMapCountry(doc, PROJECT_MAP_ID, 'country-1', { name: 'Arel', note: 'Capital' });
    addMapMarker(doc, PROJECT_MAP_ID, { id: 'm-1', locationId: 'loc-1', x: .4, y: .3, label: 'Gate' });
    const before = Y.encodeStateAsUpdate(doc);
    const view = mount();
    try {
      act(() => view.button('map-regenerate').click());
      expect(useUiStore.getState().mapDraft?.engineVersion).toBe(2);
      expect(view.host.querySelector('[data-testid="map-preview"]')).not.toBeNull();
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
      act(() => view.button('map-cancel').click());
      expect(useUiStore.getState().mapDraft).toBeNull();
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
      act(() => view.button('map-regenerate').click());
      act(() => view.button('map-apply').click());
      expect(readProjectMap(doc)?.seed).not.toBe(91);
      expect(readProjectMap(doc)?.countries[0]).toMatchObject({ name: 'Arel', note: 'Capital' });
      expect(readProjectMap(doc)?.markers[0]).toMatchObject({ id: 'm-1', locationId: 'loc-1', x: .4, y: .3 });
    } finally { view.close(); }
  });

  it('locks regeneration behind a safe-right dialog; Escape and outside click cancel', () => {
    const doc = useProjectStore.getState().doc;
    createProjectMap(doc, 91);
    const view = mount();
    try {
      act(() => view.button('map-lock').click());
      expect(readProjectMap(doc)?.locked).toBe(true);
      const locked = Y.encodeStateAsUpdate(doc);
      act(() => view.button('map-regenerate').click());
      const dialog = view.host.querySelector('[data-testid="map-regenerate-dialog"]') as HTMLElement;
      expect(dialog).not.toBeNull();
      const buttons = [...dialog.querySelectorAll('button')];
      expect(buttons.map((item) => item.getAttribute('data-testid'))).toEqual(['map-confirm-regenerate', 'map-keep-map']);
      expect(document.activeElement).toBe(view.button('map-keep-map'));
      expect(useUiStore.getState().mapDraft).toBeNull();
      act(() => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expect(view.host.querySelector('[data-testid="map-regenerate-dialog"]')).toBeNull();
      expect(Y.encodeStateAsUpdate(doc)).toEqual(locked);
      act(() => view.button('map-regenerate').click());
      act(() => view.button('map-regenerate-dialog').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      expect(view.host.querySelector('[data-testid="map-regenerate-dialog"]')).toBeNull();
      expect(Y.encodeStateAsUpdate(doc)).toEqual(locked);
    } finally { view.close(); }
  });

  it('one confirmation permits one locked preview session and resets after apply', () => {
    const doc = useProjectStore.getState().doc;
    createProjectMap(doc, 91);
    setProjectMapLock(doc, true);
    const view = mount();
    try {
      act(() => view.button('map-regenerate').click());
      act(() => view.button('map-confirm-regenerate').click());
      expect(view.host.querySelector('[data-testid="map-regenerate-dialog"]')).toBeNull();
      expect(useUiStore.getState().mapDraft).not.toBeNull();
      act(() => view.button('map-regenerate').click());
      expect(view.host.querySelector('[data-testid="map-regenerate-dialog"]')).toBeNull();
      act(() => view.button('map-apply').click());
      expect(readProjectMap(doc)?.locked).toBe(true);
      act(() => view.button('map-regenerate').click());
      expect(view.host.querySelector('[data-testid="map-regenerate-dialog"]')).not.toBeNull();
    } finally { view.close(); }
  });
  it('warns when a preserved linked marker will be underwater in the new geography', () => {
    const doc = useProjectStore.getState().doc;
    createProjectMap(doc, 91);
    const map = readProjectMap(doc)!;
    const beforeWorld = getAtlasScene(91, map.controls, map.countryConfig.count).world;
    const afterWorld = getAtlasScene(92, map.controls, map.countryConfig.count).world;
    let point: { x: number; y: number } | null = null;
    for (let row = 2; row < beforeWorld.height - 2 && !point; row += 3) {
      for (let col = 2; col < beforeWorld.width - 2; col += 3) {
        const x = (col + .5) / beforeWorld.width;
        const y = (row + .5) / beforeWorld.height;
        if (isAtlasLand(beforeWorld, x, y) && !isAtlasLand(afterWorld, x, y)) {
          point = { x, y }; break;
        }
      }
    }
    expect(point).not.toBeNull();
    addMapMarker(doc, PROJECT_MAP_ID, { id: 'coast', locationId: 'loc-1',
      ...point!, label: 'Harbor' });
    const before = Y.encodeStateAsUpdate(doc);
    const view = mount();
    try {
      act(() => useUiStore.setState({ mapDraft: {
        seed: 92, engineVersion: 2, controls: map.controls, countryCount: map.countryConfig.count,
      } }));
      expect(view.host.querySelector('[data-testid="map-marker-water-warning"]')).not.toBeNull();
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
      act(() => view.button('map-apply').click());
      expect(readProjectMap(doc)?.markers[0]).toMatchObject({ id: 'coast', locationId: 'loc-1', ...point! });
    } finally { view.close(); }
  });
});
