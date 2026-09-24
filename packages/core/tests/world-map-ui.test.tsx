// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../src/model/factory';
import { addMapMarker, dunyaEkle, lokasyonEkle, setCountryConfig, setWorldMapSettings, updateMapCountry } from '../src/doc/mutations';
import { worldMapsMap } from '../src/doc/schema';
import { readWorldMap, settingsKey } from '../src/model/world-map';
import { haritaAc, haritadanCik } from '../src/store/mod';
import { adoptLegacyMap, PROJECT_MAP_ID } from '../src/model/project-world-map';
import { useProjectStore } from '../src/store/project';
import { useUiStore } from '../src/store/ui';
import { DunyalarSekmesi } from '../src/components/inspector/DunyalarSekmesi';
import { MapWorkspace } from '../src/components/map/MapWorkspace';
import { MapInspector } from '../src/components/map/MapInspector';
import { renderWorldMapSvg } from '../src/export/world-map';
import { KadroSekmesi } from '../src/components/inspector/KadroSekmesi';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function mount(node: React.ReactNode) {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, close: () => { act(() => root.unmount()); host.remove(); } };
}

function openLegacy(doc: ReturnType<typeof useProjectStore.getState>['doc'], worldId: string) {
  if (!worldMapsMap(doc).has(settingsKey(worldId))) setWorldMapSettings(doc, worldId, { seed: 1 });
  adoptLegacyMap(doc, worldId);
  expect(haritaAc(worldId)).toBe(true);
}

describe('Dünya haritası çalışma alanı', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createProject());
    useProjectStore.getState().setRole('owner');
    useUiStore.setState({ viewMode: 'senaryo' });
  });

  it('Dünya notundan açılır, geri döner; geçersiz Dünya odağı bozmaz', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    expect(haritaAc('missing')).toBe(false);
    expect(useUiStore.getState().viewMode).toBe('senaryo');
    expect(haritaAc(world.id)).toBe(true);
    expect(useUiStore.getState().viewMode).toBe('harita');
    expect(useUiStore.getState().activeWorldId).toBe(world.id);
    haritadanCik();
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  it('Dünya kartında açık harita eylemi görünür', () => {
    const world = dunyaEkle(useProjectStore.getState().doc, { ad: 'Aster' });
    const view = mount(<DunyalarSekmesi />);
    try {
      const button = view.host.querySelector(`[data-testid="dunya-harita-${world.id}"]`) as HTMLButtonElement;
      expect(button).not.toBeNull();
      act(() => button.click());
      expect(useUiStore.getState().activeWorldId).toBe(world.id);
    } finally { view.close(); }
  });

  it('boş harita, eksik mekân rozeti ve haritaya özgü sağ panel gösterir', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    addMapMarker(doc, world.id, { id: 'm_lost', locationId: 'loc_lost', x: 0.4, y: 0.6, label: 'Kayıp liman' });
    openLegacy(doc, world.id);
    const view = mount(<><MapWorkspace /><MapInspector /></>);
    try {
      expect(view.host.querySelector('[data-testid="map-workspace"]')).not.toBeNull();
      expect(view.host.textContent).toContain('Kayıp liman');
      expect(view.host.textContent).toMatch(/mekân bulunamadı|Location not found/);
      expect(view.host.querySelector('[data-testid="map-inspector"]')).not.toBeNull();
      expect(view.host.textContent).not.toContain('Çekim dökümü');
    } finally { view.close(); }
  });

  it('yenileme taslağını iptal edince tohum değişmez; uygula kalıcılaştırır', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    const view = mount(<MapInspector />);
    try {
      const draft = view.host.querySelector('[data-testid="map-regenerate"]') as HTMLButtonElement;
      act(() => draft.click());
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).seed).toBe(1);
      act(() => (view.host.querySelector('[data-testid="map-cancel"]') as HTMLButtonElement).click());
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).seed).toBe(1);
      act(() => draft.click());
      act(() => (view.host.querySelector('[data-testid="map-apply"]') as HTMLButtonElement).click());
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).seed).not.toBe(1);
    } finally { view.close(); }
  });

  it('harita ayarları göl sayısı ve ülke merkezi aralığını açıklayıcı etiketlerle sunar', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    const view = mount(<MapInspector />);
    try {
      const lakes = view.host.querySelector('[data-testid="map-lakes"]') as HTMLInputElement;
      const spacing = view.host.querySelector('[data-testid="map-spacing"]') as HTMLInputElement;
      expect(lakes?.type).toBe('range');
      expect(spacing?.type).toBe('range');
      expect(lakes?.max).toBe('8');
      expect(spacing?.max).toBe('8');
      expect(view.host.textContent).toContain('Ülke merkezleri arası en az');
      expect(view.host.textContent).toContain('%');
      act(() => useProjectStore.getState().setRole('viewer'));
      expect((view.host.querySelector('[data-testid="map-lakes"]') as HTMLInputElement).disabled).toBe(true);
      expect((view.host.querySelector('[data-testid="map-spacing"]') as HTMLInputElement).disabled).toBe(true);
    } finally { view.close(); }
  });

  it('sığmayan taslakta son geçerli harita görünür ve Uygula kapalıdır', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    const view = mount(<><MapWorkspace /><MapInspector /></>);
    try {
      const path = view.host.querySelector('[data-testid="map-country-country-1"]')?.getAttribute('d');
      const before = JSON.stringify(worldMapsMap(doc).toJSON());
      act(() => useUiStore.setState({ mapDraft: {
        seed: 42,
        controls: { landFraction: 0.05, islandCount: 0, lakeCount: 8, minCountrySpacing: 8 },
        countryCount: 16,
      } }));
      expect(view.host.querySelector('[data-testid="map-draft-error"]')?.textContent).toBeTruthy();
      expect((view.host.querySelector('[data-testid="map-apply"]') as HTMLButtonElement).disabled).toBe(true);
      expect(view.host.querySelector('[data-testid="map-country-country-1"]')?.getAttribute('d')).toBe(path);
      expect(JSON.stringify(worldMapsMap(doc).toJSON())).toBe(before);
    } finally { view.close(); }
  });

  it('göl çizimleri kara boyasını ve ülke seçim bölgesini aynı boşlukta keser', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    setWorldMapSettings(doc, world.id, { seed: 42, controls: {
      landFraction: 0.44, islandCount: 4, lakeCount: 2, minCountrySpacing: 0,
    } });
    const svg = renderWorldMapSvg(readWorldMap(worldMapsMap(doc), world.id), {});
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain('data-testid="map-lake-lake-1"');
    expect(svg).toContain('data-testid="map-lake-lake-2"');
  });

  it('ülke sekmesinde görünür slotları listeler ve seçilen ülkeyi düzenlemeye açar', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    const view = mount(<><MapWorkspace /><MapInspector /></>);
    try {
      expect(view.host.querySelectorAll('[data-testid^="map-country-country-"]')).toHaveLength(8);
      const region = view.host.querySelector('[data-testid="map-country-country-1"]') as SVGPathElement;
      act(() => region.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
      expect(useUiStore.getState().mapSelection).toEqual({ type: 'country', id: 'country-1' });
      expect(useUiStore.getState().mapTab).toBe('countries');
      expect(view.host.querySelector('[data-testid="map-country-name"]')).not.toBeNull();
      act(() => updateMapCountry(doc, PROJECT_MAP_ID, 'country-1', { name: 'Eshar', biome: 'desert' }));
      expect(view.host.querySelector('[data-testid="map-canvas"]')?.textContent).toContain('Eshar');
      const countryLabel = [...view.host.querySelectorAll('svg text')].find((label) => label.textContent === 'Eshar');
      expect(countryLabel?.closest('[clip-path]')).toBeNull();
    } finally { view.close(); }
  });

  it('ülke sayısı taslağı iptalde belgeyi değiştirmez, uygulamada metadata kaybolmaz', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    updateMapCountry(doc, world.id, 'country-12', { name: 'Gizli krallık' });
    openLegacy(doc, world.id);
    const view = mount(<MapInspector />);
    try {
      const count = view.host.querySelector('[data-testid="map-country-count"]') as HTMLInputElement;
      expect(count).not.toBeNull();
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(count, '12');
        count.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).countryConfig.count).toBe(8);
      act(() => (view.host.querySelector('[data-testid="map-cancel"]') as HTMLButtonElement).click());
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).countryConfig.count).toBe(8);
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(count, '12');
        count.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => (view.host.querySelector('[data-testid="map-apply"]') as HTMLButtonElement).click());
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).countries[11].name).toBe('Gizli krallık');
    } finally { view.close(); }
  });

  it('Renk/Doku görünümünü kalıcı değiştirir; salt okunur kullanıcı anahtarı göremez', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    const view = mount(<MapWorkspace />);
    try {
      expect(view.host.querySelector('svg pattern')).toBeNull();
      act(() => (view.host.querySelector('[data-testid="map-appearance-texture"]') as HTMLButtonElement).click());
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).countryConfig.appearance).toBe('texture');
      expect(view.host.querySelector('svg pattern')).not.toBeNull();
      act(() => useProjectStore.getState().setRole('viewer'));
      expect(view.host.querySelector('[data-testid="map-appearance-color"]')).toBeNull();
      expect(view.host.querySelector('[data-testid="map-appearance-readonly"]')?.textContent).toBeTruthy();
      expect(readWorldMap(worldMapsMap(doc), PROJECT_MAP_ID).countryConfig.appearance).toBe('texture');
    } finally { view.close(); }
  });

  it('özel doku ayarı yalnız doku görünümünde sekiz kaynak ve düzenleme yetkisiyle açılır', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    const view = mount(<><MapWorkspace /><MapInspector /></>);
    try {
      expect(view.host.querySelector('[data-testid="map-custom-textures"]')).toBeNull();
      act(() => setCountryConfig(doc, PROJECT_MAP_ID, { appearance: 'texture' }));
      const section = view.host.querySelector('[data-testid="map-custom-textures"]') as HTMLDetailsElement;
      expect(section).not.toBeNull();
      act(() => { section.open = true; section.dispatchEvent(new Event('toggle', { bubbles: true })); });
      expect(view.host.querySelectorAll('[data-testid^="map-texture-row-"]')).toHaveLength(8);
      expect(view.host.textContent).toMatch(/Deniz ve göller|Sea and lakes/);
      expect(view.host.querySelector('[data-testid="map-texture-input-sea"]')).not.toBeNull();
      act(() => useProjectStore.getState().setRole('viewer'));
      expect(view.host.querySelectorAll('[data-testid^="map-texture-row-"]')).toHaveLength(8);
      expect(view.host.querySelector('[data-testid="map-texture-input-sea"]')).toBeNull();
      expect(view.host.querySelector('[data-testid="map-texture-reset-sea"]')).toBeNull();
    } finally { view.close(); }
  });

  it('bozuk deniz kaydını görünür uyarır ve sıfırlayarak varsayılana döner', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    setCountryConfig(doc, PROJECT_MAP_ID, { appearance: 'texture' });
    worldMapsMap(doc).set(`${PROJECT_MAP_ID}/texture/sea`, {
      worldId: 'other', slot: 'sea', assetId: 'https://evil.example/sea.png', fileName: 'bad.png',
    });
    const view = mount(<><MapWorkspace /><MapInspector /></>);
    try {
      expect(view.host.querySelector('[data-testid="map-texture-warning-sea"]')).not.toBeNull();
      expect(view.host.querySelector('[data-testid="map-texture-broken-sea"]')).not.toBeNull();
      act(() => (view.host.querySelector('[data-testid="map-texture-reset-sea"]') as HTMLButtonElement).click());
      expect(worldMapsMap(doc).has(`${PROJECT_MAP_ID}/texture/sea`)).toBe(false);
      expect(view.host.querySelector('[data-testid="map-texture-warning-sea"]')).toBeNull();
      expect(view.host.querySelector('[data-testid="map-texture-broken-sea"]')).toBeNull();
    } finally { view.close(); }
  });

  it('işaretin bağlı mekân notunu açar ve notu gerçek kayıttan gösterir', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    const place = lokasyonEkle(doc, { ad: 'Liman', aciklama: 'Sisli kıyı', notlar: 'Fener var' });
    addMapMarker(doc, world.id, { id: 'm_port', locationId: place.id, x: 0.4, y: 0.6, label: 'Liman' });
    openLegacy(doc, world.id);
    useUiStore.setState({ mapTab: 'places', mapSelection: { type: 'marker', id: 'm_port' } });
    const inspector = mount(<MapInspector />);
    try {
      const open = [...inspector.host.querySelectorAll('button')].find((button) => button.textContent?.includes('Mekân notunu aç') || button.textContent?.includes('Open place note'));
      expect(open).toBeDefined();
      act(() => open!.click());
      expect(useUiStore.getState().viewMode).toBe('senaryo');
      const note = mount(<KadroSekmesi />);
      try {
        expect(note.host.querySelector('[data-testid="focused-location-note"]')?.textContent).toContain('Liman');
        expect((note.host.querySelector('textarea[aria-label="Mekân açıklaması"]') as HTMLTextAreaElement)?.value).toBe('Sisli kıyı');
      } finally { note.close(); }
    } finally { inspector.close(); }
  });

  it('salt okunur rolde harita gezintisi sürer, düzenleme eylemleri görünmez', () => {
    const doc = useProjectStore.getState().doc;
    const world = dunyaEkle(doc, { ad: 'Aster' });
    openLegacy(doc, world.id);
    useProjectStore.getState().setRole('viewer');
    const view = mount(<><MapWorkspace /><MapInspector /></>);
    try {
      expect(view.host.querySelector('[data-testid="map-zoom"]')).not.toBeNull();
      expect(view.host.querySelector('[data-testid="map-regenerate"]')).toBeNull();
      expect(view.host.querySelector('[data-testid="map-add-marker"]')).toBeNull();
      act(() => (view.host.querySelector('[data-testid="map-tab-countries"]') as HTMLButtonElement).click());
      expect(view.host.querySelectorAll('[data-testid^="map-country-list-"]')).toHaveLength(8);
      act(() => (view.host.querySelector('[data-testid="map-country-list-country-1"]') as HTMLButtonElement).click());
      expect((view.host.querySelector('[data-testid="map-country-name"]') as HTMLInputElement).disabled).toBe(true);
      expect((view.host.querySelector('[data-testid="map-country-biome"]') as HTMLSelectElement).disabled).toBe(true);
    } finally { view.close(); }
  });
});
