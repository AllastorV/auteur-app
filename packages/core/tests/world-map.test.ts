import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/model/factory';
import { docToProject, loadProjectIntoDoc, worldMapsMap } from '../src/doc/schema';
import { addMapMarker, dunyaEkle, dunyaSil, removeMapMarker, setWorldMapSettings } from '../src/doc/mutations';
import { markerKey, readWorldMap } from '../src/model/world-map';
import { MapLayoutError } from '../src/model/world-map-generator';
import * as mapMutations from '../src/doc/mutations';
import * as mapModel from '../src/model/world-map';
import { useProjectStore } from '../src/store/project';

describe('dünya haritası belge modeli', () => {
  it('eski projede harita kökü yokken boş haritayı güvenle açar', () => {
    const doc = new Y.Doc();
    const project = createProject();
    loadProjectIntoDoc(doc, project);
    const before = JSON.stringify(worldMapsMap(doc).toJSON());
    expect(readWorldMap(worldMapsMap(doc), 'dn_legacy')).toMatchObject({
      worldId: 'dn_legacy', seed: 1, markers: [], overlays: [], labels: [],
      countryConfig: { count: 8, appearance: 'color', texturePack: 'atlas-v1' },
    });
    expect(readWorldMap(worldMapsMap(doc), 'dn_legacy').countries).toHaveLength(8);
    expect(JSON.stringify(worldMapsMap(doc).toJSON())).toBe(before);
    expect(docToProject(doc).script).toEqual(project.script);
  });

  it('eski coğrafya kaydı yeni ölçütleri sıfır varsayar ve okurken belgeyi değiştirmez', () => {
    const doc = new Y.Doc();
    const root = worldMapsMap(doc);
    root.set(mapModel.settingsKey('dn_legacy'), {
      seed: 42, controls: { landFraction: 0.44, islandCount: 4 },
    });
    const before = JSON.stringify(root.toJSON());
    expect(readWorldMap(root, 'dn_legacy').controls).toEqual({
      landFraction: 0.44, islandCount: 4, lakeCount: 0, minCountrySpacing: 0,
    });
    expect(JSON.stringify(root.toJSON())).toBe(before);
  });

  it('göl ve ülke merkezi aralığı tam sayı sınırlarında doğrulanır', () => {
    const parse = (lakeCount: unknown, minCountrySpacing: unknown) =>
      mapModel.parseMapSettings({
        seed: 42, controls: { landFraction: 0.44, islandCount: 4, lakeCount, minCountrySpacing },
      });
    expect(parse(8, 8)?.controls).toEqual({
      landFraction: 0.44, islandCount: 4, lakeCount: 8, minCountrySpacing: 8,
    });
    for (const bad of [-1, 1.5, 9, Number.NaN]) {
      expect(parse(bad, 0)).toBeNull();
      expect(parse(0, bad)).toBeNull();
    }
  });

  it('harita ayarı ve yer işaretini belge kaydında korur', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    setWorldMapSettings(doc, 'dn_1', { seed: 420, controls: { landFraction: 0.6, islandCount: 3 } });
    addMapMarker(doc, 'dn_1', { id: 'm_1', locationId: 'loc_1', x: 0.25, y: 0.75, label: 'Liman' });
    const project = docToProject(doc);
    const reopened = new Y.Doc();
    loadProjectIntoDoc(reopened, project);
    expect(readWorldMap(worldMapsMap(reopened), 'dn_1')).toEqual(readWorldMap(worldMapsMap(doc), 'dn_1'));
  });

  it('farklı işaretleri iki yazardan tek belgeye birleştirir', () => {
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    addMapMarker(left, 'dn_1', { id: 'm_left', locationId: null, x: 0.1, y: 0.2, label: 'Batı' });
    addMapMarker(right, 'dn_1', { id: 'm_right', locationId: null, x: 0.9, y: 0.8, label: 'Doğu' });
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    expect(readWorldMap(worldMapsMap(left), 'dn_1').markers.map((m) => m.id).sort()).toEqual(['m_left', 'm_right']);
    expect(readWorldMap(worldMapsMap(right), 'dn_1').markers.map((m) => m.id).sort()).toEqual(['m_left', 'm_right']);
  });

  it('üretim undo kapsamı harita ekleme ve silmeyi geri alır', () => {
    const { doc, undoManager } = useProjectStore.getState();
    expect(undoManager.scope).toContain(worldMapsMap(doc));
    undoManager.stopCapturing();
    addMapMarker(doc, 'dn_undo', { id: 'm_undo', locationId: null, x: 0.3, y: 0.4, label: 'Test' });
    expect(worldMapsMap(doc).has(markerKey('dn_undo', 'm_undo'))).toBe(true);
    undoManager.undo();
    expect(worldMapsMap(doc).has(markerKey('dn_undo', 'm_undo'))).toBe(false);
    undoManager.redo();
    expect(worldMapsMap(doc).has(markerKey('dn_undo', 'm_undo'))).toBe(true);
    removeMapMarker(doc, 'dn_undo', 'm_undo');
  });

  it('bozuk dış veriyi koordinat veya dosya yolu olarak kullanmaz', () => {
    const doc = new Y.Doc();
    const root = worldMapsMap(doc);
    root.set(markerKey('dn_1', 'bad'), { id: 'bad', worldId: 'dn_1', x: Infinity, y: -2, label: 'Bozuk', locationId: null });
    root.set(markerKey('dn_1', 'path'), { id: 'path', worldId: 'dn_1', x: 0.5, y: 0.5, label: 'X', locationId: '../secret' });
    root.set('dn_1/overlay/bad', { id: 'bad', worldId: 'dn_1', assetId: '../../secret.png', x: 0.5, y: 0.5, scale: 1, rotation: 0, visible: true });
    expect(readWorldMap(root, 'dn_1').markers).toEqual([]);
    expect(readWorldMap(root, 'dn_1').overlays).toEqual([]);
  });

  it('bir Dünya silinince başka Dünyanın haritasını korur', () => {
    const doc = new Y.Doc();
    const first = dunyaEkle(doc, { ad: 'Birinci' });
    const second = dunyaEkle(doc, { ad: 'İkinci' });
    addMapMarker(doc, first.id, { id: 'm_first', locationId: null, x: 0.2, y: 0.2, label: 'İlk' });
    addMapMarker(doc, second.id, { id: 'm_second', locationId: null, x: 0.8, y: 0.8, label: 'İkinci' });
    expect(dunyaSil(doc, first.id)).toBe(true);
    expect(readWorldMap(worldMapsMap(doc), second.id).markers.map((m) => m.id)).toEqual(['m_second']);
  });

  it('ülke sayısı azaltılıp geri alınınca gizlenen ülke bilgisi kaybolmaz', () => {
    const doc = new Y.Doc();
    mapMutations.updateMapCountry(doc, 'dn_old', 'country-12', {
      name: 'Eshar', biome: 'desert', note: 'Salt road', color: '#be8b55',
    });
    mapMutations.setCountryConfig(doc, 'dn_old', { count: 3 });
    expect(readWorldMap(worldMapsMap(doc), 'dn_old').countries).toHaveLength(3);
    mapMutations.setCountryConfig(doc, 'dn_old', { count: 12 });
    expect(readWorldMap(worldMapsMap(doc), 'dn_old').countries[11]).toMatchObject({
      id: 'country-12', name: 'Eshar', biome: 'desert', note: 'Salt road', color: '#be8b55',
    });
  });

  it('coğrafya ve ülke sayısını tek undo adımında uygular', () => {
    useProjectStore.getState().replaceProject(createProject());
    const { doc, undoManager } = useProjectStore.getState();
    undoManager.stopCapturing();
    mapMutations.applyMapDraft(doc, 'dn_draft', {
      seed: 912, controls: { landFraction: 0.6, islandCount: 2 }, countryCount: 5,
    });
    expect(readWorldMap(worldMapsMap(doc), 'dn_draft')).toMatchObject({ seed: 912, countryConfig: { count: 5 } });
    undoManager.undo();
    expect(readWorldMap(worldMapsMap(doc), 'dn_draft')).toMatchObject({ seed: 1, countryConfig: { count: 8 } });
    undoManager.redo();
    expect(readWorldMap(worldMapsMap(doc), 'dn_draft')).toMatchObject({ seed: 912, countryConfig: { count: 5 } });
  });

  it('sığmayan merkez aralığı taslağı ülke bilgilerine ve belgeye dokunmadan reddeder', () => {
    const doc = new Y.Doc();
    mapMutations.updateMapCountry(doc, 'dn_tight', 'country-1', { name: 'Aster', note: 'Başkent' });
    const root = worldMapsMap(doc);
    const before = JSON.stringify(root.toJSON());
    expect(() => mapMutations.applyMapDraft(doc, 'dn_tight', {
      seed: 42,
      controls: { landFraction: 0.05, islandCount: 0, lakeCount: 0, minCountrySpacing: 8 },
      countryCount: 16,
    })).toThrow(MapLayoutError);
    expect(JSON.stringify(root.toJSON())).toBe(before);
    expect(readWorldMap(root, 'dn_tight').countries[0]).toMatchObject({
      name: 'Aster', note: 'Başkent',
    });
  });

  it('bozuk ülke ve görünüm kayıtlarını kullanmaz; geçersiz taslak atomiktir', () => {
    const doc = new Y.Doc();
    const root = worldMapsMap(doc);
    root.set('dn_bad/country-config', { count: 99, appearance: 'texture', texturePack: '../outside' });
    root.set('dn_bad/country/country-1', {
      id: 'country-1', worldId: 'dn_bad', name: 'A', biome: 'poison', note: '', color: '#123456',
    });
    root.set('dn_bad/country/country-2', {
      id: 'country-2', worldId: 'dn_bad', name: 'B', biome: 'forest', note: '', color: 'url(../../secret)',
    });
    const map = readWorldMap(root, 'dn_bad');
    expect(map.countryConfig).toEqual({ count: 8, appearance: 'color', texturePack: 'atlas-v1' });
    expect(map.countries.slice(0, 2).map((country) => country.biome)).toEqual(['plain', 'plain']);
    const before = JSON.stringify(root.toJSON());
    expect(() => mapMutations.applyMapDraft(doc, 'dn_bad', {
      seed: 45, controls: { landFraction: 0.5, islandCount: 2 }, countryCount: 17,
    })).toThrow();
    expect(JSON.stringify(root.toJSON())).toBe(before);
    expect(() => mapMutations.updateMapCountry(doc, 'dn_bad', 'country-1', { biome: 'poison' as any })).toThrow();
    expect(JSON.stringify(root.toJSON())).toBe(before);
  });

  it('iki yazar farklı ülkeleri değiştirince ikisi de kalır', () => {
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    mapMutations.updateMapCountry(left, 'dn_joint', 'country-1', { name: 'Kuzey' });
    mapMutations.updateMapCountry(right, 'dn_joint', 'country-2', { name: 'Güney' });
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    expect(readWorldMap(worldMapsMap(left), 'dn_joint').countries.slice(0, 2).map((country) => country.name)).toEqual(['Kuzey', 'Güney']);
    expect(readWorldMap(worldMapsMap(right), 'dn_joint').countries.slice(0, 2).map((country) => country.name)).toEqual(['Kuzey', 'Güney']);
  });

  it('ülke düzenlemesi Ctrl+Z ile geri alınır ve yinelenir', () => {
    useProjectStore.getState().replaceProject(createProject());
    const { doc, undoManager } = useProjectStore.getState();
    undoManager.stopCapturing();
    mapMutations.updateMapCountry(doc, 'dn_undo_country', 'country-1', { name: 'Veyra' });
    expect(readWorldMap(worldMapsMap(doc), 'dn_undo_country').countries[0].name).toBe('Veyra');
    undoManager.undo();
    expect(readWorldMap(worldMapsMap(doc), 'dn_undo_country').countries[0].name).toBe('');
    undoManager.redo();
    expect(readWorldMap(worldMapsMap(doc), 'dn_undo_country').countries[0].name).toBe('Veyra');
    expect(worldMapsMap(doc).has(mapModel.countryKey('dn_undo_country', 'country-1'))).toBe(true);
  });
});
