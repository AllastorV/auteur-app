import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import {
  addMapLabel, addMapMarker, addMapOverlay, setCountryConfig,
  setWorldMapSettings, updateMapCountry, LOCAL_ORIGIN,
} from '../src/doc/mutations';
import { docToProject, dunyalarMap, loadProjectIntoDoc, worldMapsMap } from '../src/doc/schema';
import { createProject } from '../src/model/factory';
import { packProject, unpackProject } from '../src/model/project-io';
import {
  PROJECT_MAP_ID, adoptLegacyMap, createProjectMap, legacyMapSources,
  readProjectMap, setProjectMapLock,
} from '../src/model/project-world-map';
import { countryKey, settingsKey } from '../src/model/world-map';

function legacyDoc(): Y.Doc {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject());
  for (const [id, ad] of [['dn-a', 'Arel'], ['dn-b', 'Borel']]) {
    dunyalarMap(doc).set(id, {
      id, ad, tur: 'mekan', aciklama: '', notlar: '', bagliKarakterler: [], bagliLokasyonlar: [],
    });
    setWorldMapSettings(doc, id, { seed: 36, controls: { landFraction: 0.52, islandCount: 3 } });
  }
  updateMapCountry(doc, 'dn-a', 'country-1', { name: 'Arel', biome: 'desert', note: 'Salt road' });
  setCountryConfig(doc, 'dn-a', { count: 12 });
  updateMapCountry(doc, 'dn-a', 'country-12', { name: 'Hidden' });
  setCountryConfig(doc, 'dn-a', { count: 8 });
  addMapMarker(doc, 'dn-a', { id: 'm-1', locationId: 'loc-1', x: .4, y: .3, label: 'Gate' });
  addMapLabel(doc, 'dn-a', { id: 'l-1', x: .6, y: .5, text: 'Pass' });
  addMapOverlay(doc, 'dn-a', {
    id: 'o-1', assetId: 'maptex_abcdefghij.png', x: .5, y: .6,
    scale: 1, rotation: 0, visible: true, order: 2,
  });
  worldMapsMap(doc).set('dn-a/texture/sea', {
    worldId: 'dn-a', slot: 'sea', assetId: 'maptex_1234567890.jpg', fileName: 'sea.jpg',
  });
  return doc;
}

describe('project-scoped world map', () => {
  it('reports an empty project as empty without writing defaults', () => {
    const doc = new Y.Doc();
    const before = Y.encodeStateAsUpdate(doc);
    expect(readProjectMap(doc)).toBeNull();
    expect(legacyMapSources(doc)).toEqual([]);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  it('offers named legacy sources and adopts only the selected source', () => {
    const doc = legacyDoc();
    expect(legacyMapSources(doc)).toEqual([
      { worldId: 'dn-a', name: 'Arel' }, { worldId: 'dn-b', name: 'Borel' },
    ]);
    adoptLegacyMap(doc, 'dn-a');
    const map = readProjectMap(doc)!;
    expect(map).toMatchObject({
      worldId: PROJECT_MAP_ID, seed: 36, engineVersion: 1, locked: false,
      countryConfig: { count: 8 },
    });
    expect(map.countries[0]).toMatchObject({ name: 'Arel', biome: 'desert', note: 'Salt road' });
    expect(map.markers).toMatchObject([{ worldId: PROJECT_MAP_ID, locationId: 'loc-1' }]);
    expect(map.labels).toMatchObject([{ worldId: PROJECT_MAP_ID, text: 'Pass' }]);
    expect(map.overlays).toMatchObject([{ worldId: PROJECT_MAP_ID, assetId: 'maptex_abcdefghij.png' }]);
    expect(map.textureOverrides.sea).toMatchObject({ worldId: PROJECT_MAP_ID, assetId: 'maptex_1234567890.jpg' });
    expect(worldMapsMap(doc).get(countryKey(PROJECT_MAP_ID, 'country-12'))).toMatchObject({ name: 'Hidden' });
    expect(worldMapsMap(doc).has(countryKey('dn-b', 'country-1'))).toBe(false);
    expect(worldMapsMap(doc).has(settingsKey('dn-b'))).toBe(true);
    expect(worldMapsMap(doc).has(countryKey('dn-a', 'country-1'))).toBe(true);
    expect(() => adoptLegacyMap(doc, 'dn-b')).toThrow();
  });

  it('offers authored legacy markers even when defaults were never written as settings', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    dunyalarMap(doc).set('dn-orphan', {
      id: 'dn-orphan', ad: 'Old world', tur: 'mekan', aciklama: '', notlar: '',
      bagliKarakterler: [], bagliLokasyonlar: [],
    });
    addMapMarker(doc, 'dn-orphan', { id: 'm-1', locationId: null, x: .25, y: .5, label: 'Lighthouse' });
    expect(worldMapsMap(doc).has(settingsKey('dn-orphan'))).toBe(false);
    expect(legacyMapSources(doc)).toEqual([{ worldId: 'dn-orphan', name: 'Old world' }]);
    adoptLegacyMap(doc, 'dn-orphan');
    expect(readProjectMap(doc)?.markers[0].label).toBe('Lighthouse');
    expect(worldMapsMap(doc).has(settingsKey('dn-orphan'))).toBe(false);
  });

  it('copies only validated entries and rejects missing source without mutation', () => {
    const doc = legacyDoc();
    const root = worldMapsMap(doc);
    root.set('dn-a/marker/bad', { id: 'bad', worldId: 'dn-a', locationId: null, x: Infinity, y: 0, label: 'Bad' });
    root.set('dn-a/texture/forest', { worldId: 'dn-a', slot: 'forest', assetId: '../bad', fileName: 'bad' });
    const before = JSON.stringify(root.toJSON());
    expect(() => adoptLegacyMap(doc, 'absent')).toThrow();
    expect(JSON.stringify(root.toJSON())).toBe(before);
    adoptLegacyMap(doc, 'dn-a');
    expect(root.has('@project/marker/bad')).toBe(false);
    expect(root.has('@project/texture/forest')).toBe(false);
  });

  it('creates a v2 map and persists lock state while rejecting an invalid seed', () => {
    const doc = new Y.Doc();
    expect(() => createProjectMap(doc, -1)).toThrow();
    expect(readProjectMap(doc)).toBeNull();
    createProjectMap(doc, 247);
    expect(readProjectMap(doc)).toMatchObject({ seed: 247, engineVersion: 2, locked: false });
    setProjectMapLock(doc, true);
    expect(readProjectMap(doc)?.locked).toBe(true);
  });

  it('adoption is a single undoable transaction and never deletes the source', () => {
    const doc = legacyDoc();
    const undo = new Y.UndoManager(worldMapsMap(doc), { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    undo.stopCapturing();
    adoptLegacyMap(doc, 'dn-a');
    expect(readProjectMap(doc)?.countries[0].name).toBe('Arel');
    undo.undo();
    expect(readProjectMap(doc)).toBeNull();
    expect(worldMapsMap(doc).has(countryKey('dn-a', 'country-1'))).toBe(true);
    undo.redo();
    expect(readProjectMap(doc)?.countries[0].name).toBe('Arel');
  });

  it('SBP pack/unpack preserves project-map texture and dedicated overlay bytes', async () => {
    const doc = legacyDoc();
    adoptLegacyMap(doc, 'dn-a');
    const sea = new Uint8Array([1, 2, 3]);
    const overlay = new Uint8Array([4, 5, 6]);
    const packed = await packProject({
      project: docToProject(doc),
      assets: { 'maptex_1234567890.jpg': sea, 'maptex_abcdefghij.png': overlay },
    });
    const unpacked = await unpackProject(packed);
    expect(unpacked.assets['maptex_1234567890.jpg']).toEqual(sea);
    expect(unpacked.assets['maptex_abcdefghij.png']).toEqual(overlay);
    const reopened = new Y.Doc();
    loadProjectIntoDoc(reopened, unpacked.project);
    expect(readProjectMap(reopened)?.textureOverrides.sea?.assetId).toBe('maptex_1234567890.jpg');
    expect(readProjectMap(reopened)?.overlays[0].assetId).toBe('maptex_abcdefghij.png');
    expect(worldMapsMap(reopened).has(settingsKey('dn-a'))).toBe(true);
  });
});
