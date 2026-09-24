import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { setCountryConfig, setWorldMapSettings, updateMapCountry } from '../src/doc/mutations';
import { worldMapsMap } from '../src/doc/schema';
import { renderWorldMapSvg } from '../src/export/world-map';
import { COUNTRY_BIOMES, readWorldMap } from '../src/model/world-map';
import { TEXTURE_PACK_V1, textureForBiome } from '../src/components/map/texture-pack';
import { validTextureDataUrl } from '../src/components/map/map-texture-source';

describe('sabit atlas-v1 doku paketi', () => {
  it('yedi biyomun tamamını ayrı, paket içi PNG URL olarak sunar', () => {
    expect(Object.keys(TEXTURE_PACK_V1).sort()).toEqual([...COUNTRY_BIOMES].sort());
    for (const biome of COUNTRY_BIOMES) {
      expect(textureForBiome(biome)).toBe(TEXTURE_PACK_V1[biome]);
      expect(TEXTURE_PACK_V1[biome]).toMatch(/^data:image\/png;base64,/);
      expect(TEXTURE_PACK_V1[biome].length).toBeGreaterThan(1000);
    }
    expect(new Set(Object.values(TEXTURE_PACK_V1)).size).toBe(7);
  });

  it('renk modunda raster yoktur, dokulu mod aynı ülke yollarını ve etiketlerini korur', () => {
    const doc = new Y.Doc();
    const worldId = 'dn_atlas';
    updateMapCountry(doc, worldId, 'country-1', { name: 'Eshar', biome: 'desert' });
    const colored = renderWorldMapSvg(readWorldMap(worldMapsMap(doc), worldId), {});
    expect(colored).toContain('map-country-country-1');
    expect(colored).toContain('Eshar');
    expect(colored).not.toContain('<pattern');
    setCountryConfig(doc, worldId, { appearance: 'texture' });
    const textured = renderWorldMapSvg(readWorldMap(worldMapsMap(doc), worldId), {});
    expect(textured).toContain('map-country-country-1');
    expect(textured).toContain('Eshar');
    expect(textured).toContain('<pattern');
    expect(textured).toContain('data:image/png;base64,');
    expect(textured).toContain('url(#map-terrain-dn_atlas-desert)');
  });
});

describe('kullanıcı harita dokusu kayıtları', () => {
  it('eski haritayı yazmadan boş yuvalarla açar, sekiz yuvayı bağımsız okur', () => {
    const doc = new Y.Doc();
    const root = worldMapsMap(doc);
    const worldId = 'dn_texture';
    const slots = ['sea', ...COUNTRY_BIOMES] as const;
    expect(readWorldMap(root, worldId).textureOverrides).toEqual({});
    slots.forEach((slot, index) => root.set(`${worldId}/texture/${slot}`, {
      worldId, slot, assetId: `maptex_abcdefghij.${index % 2 ? 'jpg' : 'png'}`,
      fileName: `${slot}.${index % 2 ? 'jpg' : 'png'}`,
    }));
    const before = JSON.stringify(root.toJSON());
    const map = readWorldMap(root, worldId);
    expect(Object.keys(map.textureOverrides)).toEqual(slots);
    expect(map.textureOverrides.sea?.fileName).toBe('sea.png');
    expect(map.textureOverrides.forest?.fileName).toBe('forest.png');
    expect(map.invalidTextureSlots).toEqual([]);
    expect(JSON.stringify(root.toJSON())).toBe(before);
  });

  it('bozuk bilinen yuvayı uyarı için bildirir, dış URL ve sahte yuva kullanmaz', () => {
    const doc = new Y.Doc();
    const root = worldMapsMap(doc);
    root.set('dn_bad/texture/sea', {
      worldId: 'dn_bad', slot: 'sea', assetId: 'https://example.com/sea.png', fileName: 'sea.png',
    });
    root.set('dn_bad/texture/forest', {
      worldId: 'other', slot: 'forest', assetId: 'maptex_abcdefghij.png', fileName: 'forest.png',
    });
    root.set('dn_bad/texture/fake', {
      worldId: 'dn_bad', slot: 'fake', assetId: 'maptex_abcdefghij.png', fileName: 'fake.png',
    });
    const before = JSON.stringify(root.toJSON());
    const map = readWorldMap(root, 'dn_bad');
    expect(map.textureOverrides).toEqual({});
    expect(map.invalidTextureSlots).toEqual(['sea', 'forest']);
    expect(JSON.stringify(root.toJSON())).toBe(before);
  });
});

describe('özel doku sahnesi güvenli çözünür', () => {
  const custom = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl3NfkAAAAASUVORK5CYII=';
  const forestId = 'maptex_abcdefghij.png';
  const seaId = 'maptex_abcdefghik.png';

  it('çözülmemiş özel doku URL adresini SVG içine almaz, doğrulanmış biyomu harita-geneli tek desende kullanır', () => {
    const doc = new Y.Doc();
    const worldId = 'dn_art';
    updateMapCountry(doc, worldId, 'country-1', { biome: 'forest', name: 'Bir' });
    updateMapCountry(doc, worldId, 'country-2', { biome: 'forest', name: 'İki' });
    setCountryConfig(doc, worldId, { appearance: 'texture' });
    worldMapsMap(doc).set(`${worldId}/texture/forest`, {
      worldId, slot: 'forest', assetId: forestId, fileName: 'my-forest.png',
    });
    const map = readWorldMap(worldMapsMap(doc), worldId);
    const assets = { [forestId]: custom };
    const unresolved = renderWorldMapSvg(map, assets);
    expect(unresolved).not.toContain(custom);
    expect(unresolved).toContain('data-testid="map-texture-broken-forest"');
    const verified = renderWorldMapSvg(map, assets, { textures: {
      forest: { kind: 'custom', url: custom, fileName: 'my-forest.png' },
    } as any });
    expect(verified).toContain(custom);
    expect(verified.match(/id="map-terrain-dn_art-forest"/g)).toHaveLength(1);
    expect(verified).toContain('patternUnits="userSpaceOnUse"');
    expect(verified).toContain('Bir');
    expect(verified).toContain('İki');
    expect(verified).toContain('url(#map-terrain-dn_art-forest)');
  });

  it('özel deniz yalnız doku modunda suyu ve göl boşluğunu doldurur; sahte URL sahneye sızmaz', () => {
    const doc = new Y.Doc();
    const worldId = 'dn_water';
    setWorldMapSettings(doc, worldId, { seed: 42, controls: {
      landFraction: 0.44, islandCount: 4, lakeCount: 1, minCountrySpacing: 0,
    } });
    worldMapsMap(doc).set(`${worldId}/texture/sea`, {
      worldId, slot: 'sea', assetId: seaId, fileName: 'water.png',
    });
    const map = readWorldMap(worldMapsMap(doc), worldId);
    const assets = { [seaId]: custom };
    const color = renderWorldMapSvg(map, assets);
    expect(color).not.toContain(custom);
    setCountryConfig(doc, worldId, { appearance: 'texture' });
    const textured = readWorldMap(worldMapsMap(doc), worldId);
    const safe = renderWorldMapSvg(textured, assets, { textures: {
      sea: { kind: 'custom', url: custom, fileName: 'water.png' },
    } as any });
    expect(safe).toContain(custom);
    expect(safe).toContain('url(#map-water-dn_water)');
    expect(safe).toContain('data-testid="map-lake-lake-1"');
    const forged = renderWorldMapSvg(textured, assets, { textures: {
      sea: { kind: 'custom', url: 'https://evil.example/track.svg', fileName: 'water.png' },
    } as any });
    expect(forged).not.toContain('https://evil.example');
  });

  it('dış, dosya, SVG, yanlış MIME, bozuk base64 ve aşırı PNG boyutu SVG adresine geçmez', () => {
    const doc = new Y.Doc();
    const worldId = 'dn_hostile';
    updateMapCountry(doc, worldId, 'country-1', { biome: 'forest' });
    setCountryConfig(doc, worldId, { appearance: 'texture' });
    worldMapsMap(doc).set(`${worldId}/texture/forest`, {
      worldId, slot: 'forest', assetId: forestId, fileName: 'forest.png',
    });
    const map = readWorldMap(worldMapsMap(doc), worldId);
    const badUrls = [
      'https://evil.example/track.png', 'file:///C:/secret.png',
      'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,/9j/2Q==',
      'data:image/png;base64,%%%%',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAACAEAAAABCAQAAAC1HAwC',
    ];
    for (const url of badUrls) {
      expect(validTextureDataUrl(forestId, url)).toBe(false);
      const svg = renderWorldMapSvg(map, { [forestId]: url }, { textures: {
        forest: { kind: 'custom', url, fileName: 'forest.png' },
      } as any });
      expect(svg.includes(url)).toBe(false);
      expect(svg.includes('map-texture-broken-forest')).toBe(true);
    }
    expect(renderWorldMapSvg(map, {}).includes('map-texture-broken-forest')).toBe(true);
    setCountryConfig(doc, worldId, { appearance: 'color' });
    expect(renderWorldMapSvg(readWorldMap(worldMapsMap(doc), worldId), {}).includes('map-texture-broken-forest')).toBe(false);
  });
});
