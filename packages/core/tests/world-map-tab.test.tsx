// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toolbar, type ToolbarActions } from '../src/components/Toolbar';
import { MapWorkspace } from '../src/components/map/MapWorkspace';
import { MapInspector } from '../src/components/map/MapInspector';
import { dunyaEkle, setWorldMapSettings, updateMapCountry } from '../src/doc/mutations';
import { worldMapsMap } from '../src/doc/schema';
import { createProject } from '../src/model/factory';
import { createProjectMap, PROJECT_MAP_ID, readProjectMap } from '../src/model/project-world-map';
import { readWorldMap } from '../src/model/world-map';
import { moduDegistir, haritaAc } from '../src/store/mod';
import { useProjectStore } from '../src/store/project';
import { useUiStore } from '../src/store/ui';
import { getAtlasScene } from '../src/components/map/atlas-cache';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function mount(node: React.ReactNode) {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, close: () => { act(() => root.unmount()); host.remove(); } };
}

const actions = new Proxy({}, { get: () => () => undefined }) as ToolbarActions;

describe('project World Map tab', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createProject());
    useProjectStore.getState().setRole('owner');
    useUiStore.setState({ viewMode: 'senaryo', activeWorldId: null, mapDraft: null, mapSelection: null });
  });

  it('places World Map directly after Storyboard and opens without a World note', () => {
    const view = mount(<Toolbar actions={actions} />);
    try {
      const board = view.host.querySelector('[data-testid="mod-board"]');
      expect(board?.nextElementSibling?.getAttribute('data-testid')).toBe('mod-harita');
      act(() => (view.host.querySelector('[data-testid="mod-harita"]') as HTMLButtonElement).click());
      expect(useUiStore.getState().viewMode).toBe('harita');
      expect(useUiStore.getState().activeWorldId).toBeNull();
    } finally { view.close(); }
  });

  it('shows an empty state and creates one project map without making a World note', () => {
    act(() => moduDegistir('harita'));
    const view = mount(<><MapWorkspace /><MapInspector /></>);
    try {
      expect(view.host.querySelector('[data-testid="map-empty-state"]')).not.toBeNull();
      expect(view.host.querySelector('[data-testid="map-inspector"]')).not.toBeNull();
      act(() => (view.host.querySelector('[data-testid="map-create"]') as HTMLButtonElement).click());
      expect(readProjectMap(useProjectStore.getState().doc)?.engineVersion).toBe(2);
      expect(view.host.querySelector('[data-testid="map-canvas"]')).not.toBeNull();
      expect(Object.keys(useProjectStore.getState().dunyalar)).toHaveLength(0);
    } finally { view.close(); }
  });

  it('offers explicit legacy-source choice, copies one and preserves every original', () => {
    const doc = useProjectStore.getState().doc;
    const first = dunyaEkle(doc, { ad: 'Aster' });
    const second = dunyaEkle(doc, { ad: 'Beloran' });
    setWorldMapSettings(doc, first.id, { seed: 11 });
    setWorldMapSettings(doc, second.id, { seed: 17 });
    updateMapCountry(doc, second.id, 'country-1', { name: 'Second realm' });
    act(() => moduDegistir('harita'));
    const view = mount(<MapWorkspace />);
    try {
      expect(view.host.querySelectorAll('[data-testid^="map-adopt-"]')).toHaveLength(2);
      expect(readProjectMap(doc)).toBeNull();
      act(() => (view.host.querySelector(`[data-testid="map-adopt-${second.id}"]`) as HTMLButtonElement).click());
      expect(readProjectMap(doc)?.countries[0].name).toBe('Second realm');
      expect(readWorldMap(worldMapsMap(doc), first.id).worldId).toBe(first.id);
      expect(readWorldMap(worldMapsMap(doc), second.id).countries[0].name).toBe('Second realm');
    } finally { view.close(); }
  });

  it('World-note shortcut opens the same project map and keeps optional World focus', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    createProjectMap(doc, 91);
    expect(haritaAc(world.id)).toBe(true);
    expect(useUiStore.getState().activeWorldId).toBe(world.id);
    const view = mount(<MapWorkspace />);
    try {
      expect(view.host.querySelector('[data-testid="map-canvas"]')).not.toBeNull();
      expect(readProjectMap(doc)?.worldId).toBe(PROJECT_MAP_ID);
    } finally { view.close(); }
  });
  it('lets readers hide or show atlas features without changing saved geography', () => {
    const doc = useProjectStore.getState().doc;
    createProjectMap(doc, 91);
    const before = JSON.stringify(readProjectMap(doc));
    const view = mount(<MapWorkspace />);
    try {
      expect(view.host.querySelector('[data-map-layer="rivers"]')).not.toBeNull();
      const checkbox = view.host.querySelector('[data-testid="map-layer-rivers"]') as HTMLInputElement;
      expect(checkbox?.checked).toBe(true);
      act(() => checkbox.click());
      expect(view.host.querySelector('[data-map-layer="rivers"]')).toBeNull();
      expect(JSON.stringify(readProjectMap(doc))).toBe(before);
    } finally { view.close(); }
  });

  it('shows unclaimed terrain metrics and allows a country to return to natural biome', () => {
    const doc = useProjectStore.getState().doc;
    createProjectMap(doc, 91);
    const map = readProjectMap(doc)!;
    const scene = getAtlasScene(map.seed, map.controls, map.countryConfig.count);
    const cell = scene.ownership.owners.findIndex((owner, index) => owner === 0 &&
      scene.world.land[index] === 1 && scene.world.lakes[index] === 0);
    expect(cell).toBeGreaterThanOrEqual(0);
    useUiStore.setState({ mapTab: 'settings', mapSelection: {
      type: 'terrain', x: ((cell % scene.world.width) + .5) / scene.world.width,
      y: (Math.floor(cell / scene.world.width) + .5) / scene.world.height,
    } });
    const view = mount(<MapInspector />);
    try {
      expect(view.host.querySelector('[data-testid="map-terrain-details"]')?.textContent).toMatch(/Height|Yükseklik/);
      act(() => useUiStore.setState({ mapTab: 'countries', mapSelection: { type: 'country', id: 'country-1' } }));
      const biome = view.host.querySelector('[data-testid="map-country-biome"]') as HTMLSelectElement;
      expect(biome.value).toBe('natural');
      act(() => { biome.value = 'desert'; biome.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(readProjectMap(doc)?.countries[0].biomeOverride).toBe('desert');
      act(() => { biome.value = 'natural'; biome.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(readProjectMap(doc)?.countries[0].biomeOverride).toBeNull();
    } finally { view.close(); }
  });
});
