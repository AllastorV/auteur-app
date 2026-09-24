// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Y from 'yjs';
import { describe, expect, it, vi } from 'vitest';
import { MapArtwork, type MapArtworkSelection } from '../src/components/map/MapArtwork';
import { getAtlasScene } from '../src/components/map/atlas-cache';
import { maskPaths } from '../src/model/atlas/contours';
import { TEXTURE_PACK_V1 } from '../src/components/map/texture-pack';
import { setCountryConfig, updateMapCountry } from '../src/doc/mutations';
import { worldMapsMap } from '../src/doc/schema';
import { renderWorldMapSvg } from '../src/export/world-map';
import { applyProjectMapDraft, createProjectMap, PROJECT_MAP_ID, readProjectMap } from '../src/model/project-world-map';
import { MAP_HEIGHT, MAP_WIDTH } from '../src/model/world-map-generator';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function projectMap(seed = 42) {
  const doc = new Y.Doc();
  createProjectMap(doc, seed);
  return { doc, map: readProjectMap(doc)! };
}

describe('shared atlas rendering', () => {
  it('renders a world-first scene with neutral terrain, lakes, rivers and countries', () => {
    const { map } = projectMap(42);
    const svg = renderWorldMapSvg(map, {});
    expect(svg).toContain('data-map-layer="relief"');
    expect(svg).toContain('data-map-layer="rivers"');
    expect(svg).toContain('data-map-layer="countries"');
    expect(svg).toContain('data-map-unclaimed="true"');
    expect(svg).toContain('data-map-country="country-1"');
    expect(svg).toContain('data-map-coast="true"');
    expect(svg).not.toContain('NaN');
  });

  it('cuts lake holes from all land fills when exporting transparent water', () => {
    const { doc } = projectMap(91);
    applyProjectMapDraft(doc, { engineVersion: 2, seed: 91, countryCount: 8,
      controls: { landFraction: .44, islandCount: 4, lakeCount: 1, minCountrySpacing: 0 },
    }, { confirmedLocked: false });
    const map = readProjectMap(doc)!;
    const { world } = getAtlasScene(map.seed, map.controls, map.countryConfig.count);
    expect(world.lakes.some((cell) => cell === 1)).toBe(true);
    const dry = Uint8Array.from(world.land, (cell, index) => cell && !world.lakes[index] ? 1 : 0);
    const dryPath = maskPaths(dry, world.width, world.height, true).join(' ');
    const svg = renderWorldMapSvg(map, {}, { showSea: false });
    expect(svg).toContain(`d="${dryPath}" fill-rule="evenodd"`);
    expect(svg).toMatch(/data-map-layer="lakes"[^>]*><path[^>]*fill="none"/);
  });

  it('caches only a few deterministic scenes and never mutates the accepted map', () => {
    const { map } = projectMap(91);
    const before = JSON.stringify(map);
    const a = getAtlasScene(map.seed, map.controls, map.countryConfig.count);
    const b = getAtlasScene(map.seed, map.controls, map.countryConfig.count);
    const c = getAtlasScene(map.seed + 1, map.controls, map.countryConfig.count);
    expect(a).toBe(b);
    expect(a.world.land).not.toEqual(c.world.land);
    expect(JSON.stringify(map)).toBe(before);
    expect(a.ownership.owners.some((owner, index) => owner === 0 && a.world.land[index] === 1 &&
      a.world.lakes[index] === 0)).toBe(true);
  });

  it('selects a country or genuinely unclaimed terrain with map coordinates', () => {
    const { map } = projectMap(91);
    const scene = getAtlasScene(map.seed, map.controls, map.countryConfig.count);
    const cell = scene.ownership.owners.findIndex((owner, index) => owner === 0 &&
      scene.world.land[index] === 1 && scene.world.lakes[index] === 0);
    const x = ((cell % scene.world.width) + .5) * MAP_WIDTH / scene.world.width;
    const y = (Math.floor(cell / scene.world.width) + .5) * MAP_HEIGHT / scene.world.height;
    const onSelect = vi.fn<(selection: MapArtworkSelection) => void>();
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
      act(() => root.render(<svg width={MAP_WIDTH} height={MAP_HEIGHT}>
        <MapArtwork map={map} assets={{}} onSelect={onSelect} />
      </svg>));
      const country = host.querySelector('[data-map-country="country-1"]')!;
      act(() => country.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
      expect(onSelect).toHaveBeenLastCalledWith({ type: 'country', id: 'country-1' });
      const unclaimed = host.querySelector('[data-map-unclaimed="true"]')!;
      act(() => unclaimed.dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true, button: 0, clientX: x, clientY: y,
      })));
      expect(onSelect).toHaveBeenLastCalledWith({
        type: 'terrain', x: expect.closeTo(x / MAP_WIDTH, 2), y: expect.closeTo(y / MAP_HEIGHT, 2),
      });
    } finally { act(() => root.unmount()); host.remove(); }
  });

  it('honors custom sea and biome textures while preserving terrain under country color', () => {
    const { doc } = projectMap(91);
    applyProjectMapDraft(doc, { engineVersion: 2, seed: 91, countryCount: 8,
      controls: { landFraction: .44, islandCount: 4, lakeCount: 1, minCountrySpacing: 0 },
    }, { confirmedLocked: false });
    const seaId = 'maptex_abcdefghij.png';
    const forestId = 'maptex_abcdefghik.png';
    setCountryConfig(doc, PROJECT_MAP_ID, { appearance: 'texture' });
    for (const [slot, assetId] of [['sea', seaId], ['forest', forestId]] as const) {
      worldMapsMap(doc).set(`${PROJECT_MAP_ID}/texture/${slot}`, {
        worldId: PROJECT_MAP_ID, slot, assetId, fileName: `${slot}.png`,
      });
    }
    const assets = { [seaId]: TEXTURE_PACK_V1.forest,
      [forestId]: TEXTURE_PACK_V1.forest };
    const textures = {
      sea: { kind: 'custom' as const, url: assets[seaId], fileName: 'sea.png' },
      forest: { kind: 'custom' as const, url: assets[forestId], fileName: 'forest.png' },
    };
    const svg = renderWorldMapSvg(readProjectMap(doc)!, assets, { textures });
    expect(svg).toContain('data-map-texture="sea"');
    expect(svg).toMatch(/data-map-lake="1"[^>]*fill="url\(#map-atlas-[^\"]+-sea\)"/);
    expect(svg).toContain('data-map-texture="forest"');
    expect(svg).toContain('data-map-country="country-1"');
    updateMapCountry(doc, PROJECT_MAP_ID, 'country-1', { biomeOverride: 'desert' });
    expect(renderWorldMapSvg(readProjectMap(doc)!, assets, { textures }))
      .toContain('data-map-biome-override="desert"');
  });

  it('uses four layer switches in both screen and exported SVG tree', () => {
    const { map } = projectMap(91);
    const screen = renderToStaticMarkup(<svg width={MAP_WIDTH} height={MAP_HEIGHT}>
      <MapArtwork map={map} assets={{}} layers={{ relief: false, rivers: false, countries: false, labels: false }} />
    </svg>);
    const exportSvg = renderWorldMapSvg(map, {}, {
      layers: { relief: false, rivers: false, countries: false, labels: false },
    });
    for (const svg of [screen, exportSvg]) {
      expect(svg).not.toContain('data-map-layer="relief"');
      expect(svg).not.toContain('data-map-layer="rivers"');
      expect(svg).not.toContain('data-map-layer="countries"');
      expect(svg).not.toContain('data-map-layer="labels"');
      expect(svg).toContain('data-map-unclaimed="true"');
      expect(svg).toContain('data-map-coast="true"');
    }
    const complete = renderWorldMapSvg(map, {});
    expect(complete).toContain('data-map-layer="labels"');
  });
});
