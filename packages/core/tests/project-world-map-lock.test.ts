import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import {
  addMapLabel, addMapMarker, addMapOverlay, applyMapDraft, setCountryConfig,
  setWorldMapSettings, updateMapCountry,
} from '../src/doc/mutations';
import { worldMapsMap } from '../src/doc/schema';
import {
  PROJECT_MAP_ID, applyProjectMapDraft, createProjectMap, readProjectMap, setProjectMapLock,
} from '../src/model/project-world-map';
import { MapLayoutError } from '../src/model/world-map-generator';

describe('project map protected geography', () => {
  it('guards all geography writes and preserves authored records after one confirmed application', () => {
    const doc = new Y.Doc();
    createProjectMap(doc, 91);
    updateMapCountry(doc, PROJECT_MAP_ID, 'country-1', { name: 'Arel', note: 'Capital', biomeOverride: 'forest' });
    addMapMarker(doc, PROJECT_MAP_ID, { id: 'm-1', locationId: 'loc-1', x: .4, y: .3, label: 'Gate' });
    addMapLabel(doc, PROJECT_MAP_ID, { id: 'l-1', x: .6, y: .5, text: 'Pass' });
    addMapOverlay(doc, PROJECT_MAP_ID, { id: 'o-1', assetId: 'maptex_abcdefghij.png',
      x: .5, y: .6, scale: 1, rotation: 0, visible: true, order: 2 });
    worldMapsMap(doc).set(`${PROJECT_MAP_ID}/texture/sea`, { worldId: PROJECT_MAP_ID,
      slot: 'sea', assetId: 'maptex_abcdefghik.png', fileName: 'sea.png' });
    setProjectMapLock(doc, true);
    const original = readProjectMap(doc)!;
    const draft = { engineVersion: 2 as const, seed: 92, controls: original.controls, countryCount: 10 };
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => applyProjectMapDraft(doc, draft, { confirmedLocked: false })).toThrowError(MapLayoutError);
    expect(() => applyMapDraft(doc, PROJECT_MAP_ID, draft)).toThrowError(MapLayoutError);
    expect(() => setWorldMapSettings(doc, PROJECT_MAP_ID, { seed: 93 })).toThrowError(MapLayoutError);
    expect(() => setCountryConfig(doc, PROJECT_MAP_ID, { count: 10 })).toThrowError(MapLayoutError);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    applyProjectMapDraft(doc, draft, { confirmedLocked: true });
    const after = readProjectMap(doc)!;
    expect(after).toMatchObject({ seed: 92, engineVersion: 2, locked: true, countryConfig: { count: 10 } });
    expect(after.countries[0]).toMatchObject({ name: 'Arel', note: 'Capital', biomeOverride: 'forest' });
    expect(after.markers).toEqual(original.markers);
    expect(after.labels).toEqual(original.labels);
    expect(after.overlays).toEqual(original.overlays);
    expect(after.textureOverrides).toEqual(original.textureOverrides);
  });

  it('rejects impossible atlas controls before touching a saved project map', () => {
    const doc = new Y.Doc();
    createProjectMap(doc, 91);
    const map = readProjectMap(doc)!;
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => applyProjectMapDraft(doc, { engineVersion: 2, seed: 91,
      controls: { ...map.controls, landFraction: .05, lakeCount: 8, minCountrySpacing: 8 },
      countryCount: 16 }, { confirmedLocked: false })).toThrowError(MapLayoutError);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});
