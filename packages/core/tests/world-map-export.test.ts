// @vitest-environment jsdom
import * as Y from 'yjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEXTURE_PACK_V1 } from '../src/components/map/texture-pack';
import { setCountryConfig, setWorldMapSettings, updateMapCountry } from '../src/doc/mutations';
import { assetsMap, docToProject, loadProjectIntoDoc, worldMapsMap } from '../src/doc/schema';
import {
  MapImageError, placeMapImage, placeMapTexture, resetMapTexture,
  renderWorldMapSvg, renderWorldMapToDataURL, validateMapImage, validateMapTexture,
  MAX_MAP_IMAGE_BYTES,
} from '../src/export/world-map';
import { createProject } from '../src/model/factory';
import { adoptLegacyMap, createProjectMap, PROJECT_MAP_ID, readProjectMap } from '../src/model/project-world-map';
import { packProject, unpackProject } from '../src/model/project-io';
import { readWorldMap } from '../src/model/world-map';
import { MAP_TEXTURE_SLOTS } from '../src/model/world-map-textures';
import { generateAtlasWorld } from '../src/model/atlas/world';
import { useProjectStore } from '../src/store/project';
import { assetUrlsFrom, collectAssets, dataUrlToBytes } from '../src/util/assets';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
const jpg = new Uint8Array([255, 216, 255, 224, 0, 1, 2, 3]);
const file = (bytes: Uint8Array, mime: string, name: string) => new File([new Uint8Array(bytes)], name, { type: mime });

describe('project-map v1 export compatibility', () => {
  it('renders an adopted legacy map through the existing export scene', () => {
    const doc = new Y.Doc();
    setWorldMapSettings(doc, 'dn_export', { seed: 31 });
    updateMapCountry(doc, 'dn_export', 'country-1', { name: 'Arel', biome: 'forest' });
    adoptLegacyMap(doc, 'dn_export');
    const map = readProjectMap(doc)!;
    expect(map.engineVersion).toBe(1);
    const svg = renderWorldMapSvg(map, {});
    expect(svg).toContain('Arel');
    expect(svg).toContain('map-country-country-1');
  });
});

describe('harita görselleri', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 240, height: 120, close: vi.fn() })));
  });

  it('PNG/JPG doğrular, yerleşim ve dönüşümü varlık kimliğiyle saklar', async () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    const first = await placeMapImage(doc, 'dn_img', file(png, 'image/png', 'overlay.png'), {
      x: 0.25, y: 0.75, scale: 1.4, rotation: 35,
    });
    const second = await placeMapImage(doc, 'dn_img', file(jpg, 'image/jpeg', 'photo.jpg'), {
      x: 0.6, y: 0.2, scale: 0.5, rotation: -12,
    });
    const map = readWorldMap(worldMapsMap(doc), 'dn_img');
    expect(map.overlays).toMatchObject([
      { id: first.id, assetId: first.assetId, x: 0.25, y: 0.75, scale: 1.4, rotation: 35 },
      { id: second.id, assetId: second.assetId, x: 0.6, y: 0.2, scale: 0.5, rotation: -12 },
    ]);
    expect(assetsMap(doc).get(first.assetId)).toMatch(/^data:image\/png;base64,/);
    expect(assetsMap(doc).get(second.assetId)).toMatch(/^data:image\/jpeg;base64,/);
    const svg = renderWorldMapSvg(map, Object.fromEntries(assetsMap(doc).entries()));
    expect(svg).toContain('rotate(35');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('reddedilen tür, bozuk dosya ve aşırı boyut mevcut haritayı değiştirmez', async () => {
    const doc = new Y.Doc();
    const root = worldMapsMap(doc);
    const before = JSON.stringify(root.toJSON());
    await expect(placeMapImage(doc, 'dn_img', file(png, 'image/gif', 'bad.gif'), { x: 0.5, y: 0.5 })).rejects.toThrow();
    await expect(placeMapImage(doc, 'dn_img', file(jpg, 'image/png', 'bad.png'), { x: 0.5, y: 0.5 })).rejects.toThrow();
    const huge = { ...file(png, 'image/png', 'huge.png'), size: MAX_MAP_IMAGE_BYTES + 1 } as File;
    await expect(placeMapImage(doc, 'dn_img', huge, { x: 0.5, y: 0.5 })).rejects.toThrow();
    expect(JSON.stringify(root.toJSON())).toBe(before);
    expect(assetsMap(doc).size).toBe(0);
  });

  it('çözümlenmiş görsel sınırını ve iptal edilen yüklemeyi yazarak geçmez', async () => {
    const doc = new Y.Doc();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 9000, height: 100, close })));
    await expect(placeMapImage(doc, 'dn_img', file(png, 'image/png', 'wide.png'), { x: 0.5, y: 0.5 })).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
    const signal = new AbortController();
    signal.abort();
    await expect(placeMapImage(doc, 'dn_img', file(png, 'image/png', 'cancel.png'), { x: 0.5, y: 0.5 }, signal.signal)).rejects.toThrow();
    expect(worldMapsMap(doc).size).toBe(0);
    expect(assetsMap(doc).size).toBe(0);
  });

  it('görsel baytlarını .sbp kayıt/açma boyunca birebir korur', async () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    const overlay = await placeMapImage(doc, 'dn_img', file(png, 'image/png', 'overlay.png'), { x: 0.5, y: 0.5 });
    const assets = collectAssets(Object.fromEntries(assetsMap(doc).entries()));
    const restored = await unpackProject(await packProject({ project: docToProject(doc), assets }));
    expect(restored.assets[overlay.assetId]).toEqual(png);
    const reopened = new Y.Doc();
    loadProjectIntoDoc(reopened, restored.project);
    const assetUrls = assetUrlsFrom(restored.assets);
    expect(collectAssets(assetUrls)[overlay.assetId]).toEqual(png);
    expect(readWorldMap(worldMapsMap(reopened), 'dn_img').overlays[0].assetId).toBe(overlay.assetId);
  });

  it('gizli ülke meta verisini ve mevcut görsel baytlarını .sbp içinde korur', async () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    const overlay = await placeMapImage(doc, 'dn_img', file(png, 'image/png', 'overlay.png'), { x: 0.5, y: 0.5 });
    setCountryConfig(doc, 'dn_img', { count: 12, appearance: 'texture' });
    updateMapCountry(doc, 'dn_img', 'country-12', { name: 'Eshar', biome: 'desert', note: 'Salt road' });
    setCountryConfig(doc, 'dn_img', { count: 3 });
    const saved = await packProject({ project: docToProject(doc), assets: collectAssets(Object.fromEntries(assetsMap(doc).entries())) });
    const restored = await unpackProject(saved);
    const reopened = new Y.Doc();
    loadProjectIntoDoc(reopened, restored.project);
    expect(restored.assets[overlay.assetId]).toEqual(png);
    expect(readWorldMap(worldMapsMap(reopened), 'dn_img').countryConfig).toMatchObject({ count: 3, appearance: 'texture' });
    setCountryConfig(reopened, 'dn_img', { count: 12 });
    expect(readWorldMap(worldMapsMap(reopened), 'dn_img').countries[11]).toMatchObject({ name: 'Eshar', biome: 'desert', note: 'Salt road' });
  });

  it('bozuk doku dışa aktarımını reddeder, renk modunu etkilemez', async () => {
    const doc = new Y.Doc();
    const texture = TEXTURE_PACK_V1.plain;
    const sources: string[] = [];
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        sources.push(value);
        queueMicrotask(() => value === texture ? this.onerror?.() : this.onload?.());
      }
    }
    vi.stubGlobal('Image', TestImage);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:map-svg'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,ok');
    const color = readWorldMap(worldMapsMap(doc), 'dn_img');
    await expect(renderWorldMapToDataURL(color, {}, 'image/png')).resolves.toMatch(/^data:image\/png/);
    expect(sources).not.toContain(texture);
    setCountryConfig(doc, 'dn_img', { appearance: 'texture' });
    await expect(renderWorldMapToDataURL(readWorldMap(worldMapsMap(doc), 'dn_img'), {}, 'image/png'))
      .rejects.toMatchObject({ code: 'corrupt' } satisfies Partial<MapImageError>);
    expect(sources).toContain(texture);
  });
});

describe('kullanıcı harita dokusu yükleme ve geri alma', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 240, height: 120, close: vi.fn() })));
  });

  it('sekiz yuvanın her birine ayrı PNG/JPG baytı ve kısa görünen ad yazar', async () => {
    const doc = new Y.Doc();
    const ids = new Set<string>();
    for (const [index, slot] of MAP_TEXTURE_SLOTS.entries()) {
      const bytes = index % 2 ? jpg : png;
      const mime = index % 2 ? 'image/jpeg' : 'image/png';
      const originalName = index === 0 ? 'folder/' + 'a'.repeat(90) + '.png' : `${slot}.${index % 2 ? 'jpg' : 'png'}`;
      const override = await placeMapTexture(doc, 'dn_texture', slot, file(bytes, mime, originalName));
      expect(override.slot).toBe(slot);
      expect(override.fileName.length).toBeLessThanOrEqual(80);
      expect(override.fileName).not.toMatch(/[\\/]/);
      expect(override.assetId).toMatch(/^maptex_[a-z0-9]{10}\.(png|jpg)$/);
      expect(dataUrlToBytes(assetsMap(doc).get(override.assetId)!)).toEqual(bytes);
      ids.add(override.assetId);
    }
    expect(ids.size).toBe(8);
    expect(Object.keys(readWorldMap(worldMapsMap(doc), 'dn_texture').textureOverrides)).toHaveLength(8);
  });

  it('tür, imza, çözme, boyut ve iptal hatalarında ne referans ne bayt yazar', async () => {
    const doc = new Y.Doc();
    const upload = (input: File, signal?: AbortSignal) => placeMapTexture(doc, 'dn_texture', 'sea', input, signal);
    await expect(upload(file(png, 'image/gif', 'bad.gif'))).rejects.toMatchObject({ code: 'unsupported' });
    await expect(upload(file(jpg, 'image/png', 'bad.png'))).rejects.toMatchObject({ code: 'corrupt' });
    const huge = file(png, 'image/png', 'huge.png');
    Object.defineProperty(huge, 'size', { value: 4 * 1024 * 1024 + 1 });
    await expect(upload(huge)).rejects.toMatchObject({ code: 'oversized' });
    for (const side of [0, 2049]) {
      vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: side, height: 120, close: vi.fn() })));
      await expect(upload(file(png, 'image/png', 'wide.png'))).rejects.toMatchObject({ code: 'oversized' });
    }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode'); }));
    await expect(upload(file(png, 'image/png', 'corrupt.png'))).rejects.toMatchObject({ code: 'corrupt' });
    const abort = new AbortController();
    abort.abort();
    await expect(upload(file(png, 'image/png', 'cancel.png'), abort.signal))
      .rejects.toMatchObject({ code: 'aborted' });
    expect(worldMapsMap(doc).size).toBe(0);
    expect(assetsMap(doc).size).toBe(0);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 240, height: 120, close: vi.fn() })));
    expect((await validateMapImage(file(png, 'image/png', 'overlay.png'))).width).toBe(240);
    expect((await validateMapTexture(file(png, 'image/png', 'texture.png'))).width).toBe(240);
  });

  it('değiştirme/sıfırlama bir Undo adımında hem referansı hem baytları geri getirir', async () => {
    useProjectStore.getState().replaceProject(createProject());
    const { doc, undoManager } = useProjectStore.getState();
    const first = await placeMapTexture(doc, 'dn_undo', 'sea', file(png, 'image/png', 'first.png'));
    undoManager.stopCapturing();
    const second = await placeMapTexture(doc, 'dn_undo', 'sea', file(jpg, 'image/jpeg', 'second.jpg'));
    expect(assetsMap(doc).has(first.assetId)).toBe(false);
    expect(assetsMap(doc).has(second.assetId)).toBe(true);
    undoManager.undo();
    expect(readWorldMap(worldMapsMap(doc), 'dn_undo').textureOverrides.sea).toEqual(first);
    expect(assetsMap(doc).has(first.assetId)).toBe(true);
    expect(assetsMap(doc).has(second.assetId)).toBe(false);
    undoManager.redo();
    expect(readWorldMap(worldMapsMap(doc), 'dn_undo').textureOverrides.sea).toEqual(second);
    undoManager.stopCapturing();
    resetMapTexture(doc, 'dn_undo', 'sea');
    expect(readWorldMap(worldMapsMap(doc), 'dn_undo').textureOverrides.sea).toBeUndefined();
    expect(assetsMap(doc).has(second.assetId)).toBe(false);
    undoManager.undo();
    expect(readWorldMap(worldMapsMap(doc), 'dn_undo').textureOverrides.sea).toEqual(second);
    expect(assetsMap(doc).has(second.assetId)).toBe(true);
  });

  it('iki yazar aynı yuvayı eşzamanlı değiştirince ad ve bayt aynı kazanan yazara aittir', async () => {
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    const first = await placeMapTexture(left, 'dn_sync', 'sea', file(png, 'image/png', 'left.png'));
    const second = await placeMapTexture(right, 'dn_sync', 'sea', file(jpg, 'image/jpeg', 'right.jpg'));
    expect(first.assetId).not.toBe(second.assetId);
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    for (const doc of [left, right]) {
      const winner = readWorldMap(worldMapsMap(doc), 'dn_sync').textureOverrides.sea!;
      expect(winner).toEqual(readWorldMap(worldMapsMap(left), 'dn_sync').textureOverrides.sea);
      const expected = winner.fileName === 'left.png' ? png : jpg;
      expect(dataUrlToBytes(assetsMap(doc).get(winner.assetId)!)).toEqual(expected);
    }
  });

  it('başka yuvanın da kullandığı eski varlığı değiştirme sırasında silmez', async () => {
    const doc = new Y.Doc();
    const first = await placeMapTexture(doc, 'dn_shared', 'sea', file(png, 'image/png', 'shared.png'));
    worldMapsMap(doc).set('dn_shared/texture/forest', {
      ...first, slot: 'forest', fileName: 'shared.png',
    });
    await placeMapTexture(doc, 'dn_shared', 'sea', file(jpg, 'image/jpeg', 'new.jpg'));
    expect(assetsMap(doc).has(first.assetId)).toBe(true);
    resetMapTexture(doc, 'dn_shared', 'forest');
    expect(assetsMap(doc).has(first.assetId)).toBe(false);
    worldMapsMap(doc).set('dn_shared/texture/swamp', { assetId: 'https://invalid', slot: 'swamp' });
    resetMapTexture(doc, 'dn_shared', 'swamp');
    expect(worldMapsMap(doc).has('dn_shared/texture/swamp')).toBe(false);
  });
});

describe('doğrulanmış özel doku dışa aktarımı', () => {
  it('görünür orman ve denizi çözüp PNG sahnesine taşır; kayıp denizde dosya üretmez', async () => {
    const doc = new Y.Doc();
    const worldId = 'dn_export';
    setCountryConfig(doc, worldId, { appearance: 'texture' });
    updateMapCountry(doc, worldId, 'country-1', { biome: 'forest' });
    const forestId = 'maptex_abcdefghij.png';
    const seaId = 'maptex_abcdefghik.png';
    worldMapsMap(doc).set(`${worldId}/texture/forest`, {
      worldId, slot: 'forest', assetId: forestId, fileName: 'forest.png',
    });
    worldMapsMap(doc).set(`${worldId}/texture/sea`, {
      worldId, slot: 'sea', assetId: seaId, fileName: 'sea.png',
    });
    const assets = {
      [forestId]: TEXTURE_PACK_V1.desert,
      [seaId]: TEXTURE_PACK_V1.swamp,
    };
    const sources: string[] = [];
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 32;
      naturalHeight = 32;
      set src(value: string) { sources.push(value); queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', TestImage);
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:map-svg'; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,ok');
    await expect(renderWorldMapToDataURL(readWorldMap(worldMapsMap(doc), worldId), assets, 'image/png'))
      .resolves.toMatch(/^data:image\/png/);
    expect(sources).toContain(assets[forestId]);
    expect(sources).toContain(assets[seaId]);
    expect(blobs).toHaveLength(1);
    delete (assets as Partial<typeof assets>)[seaId];
    await expect(renderWorldMapToDataURL(readWorldMap(worldMapsMap(doc), worldId), assets, 'image/png'))
      .rejects.toMatchObject({ code: 'corrupt' });
    expect(blobs).toHaveLength(1);
    setCountryConfig(doc, worldId, { appearance: 'color' });
    await expect(renderWorldMapToDataURL(readWorldMap(worldMapsMap(doc), worldId), assets, 'image/png'))
      .resolves.toMatch(/^data:image\/png/);
  });
});

describe('atlas export texture parity', () => {
  it('rejects a broken natural forest texture even when every authored country is plain', async () => {
    const doc = new Y.Doc();
    createProjectMap(doc, 42);
    const map = readProjectMap(doc)!;
    expect(generateAtlasWorld(map.seed, map.controls).biome.includes(1)).toBe(true);
    setCountryConfig(doc, PROJECT_MAP_ID, { appearance: 'texture' });
    worldMapsMap(doc).set(`${PROJECT_MAP_ID}/texture/forest`, {
      worldId: PROJECT_MAP_ID, slot: 'forest',
      assetId: 'maptex_abcdefghij.png', fileName: 'forest.png',
    });
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 32;
      naturalHeight = 32;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', TestImage);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:map-atlas'), revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,ok');
    await expect(renderWorldMapToDataURL(readProjectMap(doc)!, {}, 'image/png'))
      .rejects.toMatchObject({ code: 'corrupt' });
  });
});
