import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import {
  packProject,
  unpackProject,
  migrateProject,
  renderFileNameTemplate,
  safeFileName,
} from '@storyboard/core/model/project-io';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { createImage, createText } from '@storyboard/core/model/objects';
import {
  assetUrlsFrom,
  bytesToDataUrl,
  collectAssets,
  dataUrlToBytes,
  mimeForAsset,
} from '@storyboard/core/util/assets';
import { blockFingerprint, parseFountain } from '@storyboard/core/model/script';
import { reconcileScript } from '@storyboard/core/model/reconcile';
import { docToProject, loadProjectIntoDoc, worldMapsMap } from '@storyboard/core/doc/schema';
import { addMapLabel, addMapMarker, setScript, setWorldMapSettings } from '@storyboard/core/doc/mutations';
import * as mapMutations from '@storyboard/core/doc/mutations';
import { readWorldMap } from '@storyboard/core/model/world-map';
import { ProjectSnapshot } from '@storyboard/core/store/snapshot';
import { PROJECT_SCHEMA_VERSION, type Project } from '@storyboard/core/model/types';

function richProject() {
  const project = createProject({ meta: { name: 'Test Storyboard' } as any });
  const panel = createPanel();
  const layerId = panel.layers[1].id;
  panel.meta = {
    scene: '4',
    shot: '12',
    duration: 2.5,
    dialogue: 'Şu an burada değiliz.',
    action: 'Kamera yavaşça yaklaşır.',
    sound: 'Uzak gök gürültüsü',
    cameraLabel: 'CU — Yakın Plan',
  };
  panel.transition = 'dissolve';
  panel.transitionDuration = 0.75;
  panel.objects.push(
    createText({ layerId, x: 100, y: 80 }, { text: 'Şafak — DIŞ ÇEKİM' }),
  );
  project.panels = [panel, createPanel(), createPanel()];
  return project;
}

describe('.sbp proje dosyası', () => {
  it('yalnız referanslı özel dokuları paketler, ilgisiz görselleri ve doğru manifest sayısını korur', async () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    const worldId = 'dn_archive';
    const root = worldMapsMap(doc);
    root.set(`${worldId}/texture/sea`, {
      worldId, slot: 'sea', assetId: 'maptex_abcdefghij.png', fileName: 'water.png',
    });
    root.set(`${worldId}/texture/forest`, {
      worldId, slot: 'forest', assetId: 'maptex_abcdefghik.jpg', fileName: 'forest.jpg',
    });
    root.set(`${worldId}/texture/desert`, {
      worldId: 'other', slot: 'desert', assetId: 'maptex_abcdefghil.png', fileName: 'bad.png',
    });
    root.set(`${worldId}/overlay/map_custom_overlay`, {
      worldId, id: 'map_custom_overlay', assetId: 'maptex_abcdefghin.png',
      x: 0.5, y: 0.5, scale: 1, rotation: 0, order: 0, visible: true,
    });
    const assets = {
      'maptex_abcdefghij.png': new Uint8Array([1]),
      'maptex_abcdefghik.jpg': new Uint8Array([2]),
      'maptex_abcdefghil.png': new Uint8Array([3]),
      'maptex_abcdefghim.png': new Uint8Array([4]),
      'maptex_abcdefghin.png': new Uint8Array([6]),
      'overlay.png': new Uint8Array([5]),
    };
    const JSZip = (await import('jszip')).default;
    const packed = await packProject({ project: docToProject(doc), assets });
    const zip = await JSZip.loadAsync(packed);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.assetCount).toBe(4);
    const restored = await unpackProject(packed);
    expect(Object.keys(restored.assets).sort()).toEqual([
      'maptex_abcdefghij.png', 'maptex_abcdefghik.jpg', 'maptex_abcdefghin.png', 'overlay.png',
    ].sort());
    expect(restored.assets['maptex_abcdefghij.png']).toEqual(new Uint8Array([1]));
    expect(restored.assets['maptex_abcdefghik.jpg']).toEqual(new Uint8Array([2]));
    expect(restored.project.belge?.worldMaps?.[`${worldId}/texture/sea`]).toEqual(root.get(`${worldId}/texture/sea`));
    expect(Object.keys(assets)).toHaveLength(6);
  });
  it('eski coğrafya kaydını dönüştürmeden saklar, yeni ölçütleri yalnızca okurken varsayar', async () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    const legacy = { seed: 42, controls: { landFraction: 0.44, islandCount: 4 } };
    worldMapsMap(doc).set('dn_legacy/settings', legacy);
    const unrelated = new Uint8Array([12, 34, 56]);
    const restored = await unpackProject(await packProject({
      project: docToProject(doc), assets: { 'note.png': unrelated },
    }));
    const reopened = new Y.Doc();
    loadProjectIntoDoc(reopened, restored.project);
    const before = JSON.stringify(worldMapsMap(reopened).toJSON());
    expect(readWorldMap(worldMapsMap(reopened), 'dn_legacy').controls).toEqual({
      landFraction: 0.44, islandCount: 4, lakeCount: 0, minCountrySpacing: 0,
    });
    expect(JSON.stringify(worldMapsMap(reopened).toJSON())).toBe(before);
    expect(worldMapsMap(reopened).get('dn_legacy/settings')).toEqual(legacy);
    expect(Array.from(restored.assets['note.png'])).toEqual([12, 34, 56]);
  });

  it('harita kökünü gerçek .sbp gidiş dönüşünde kaybetmez', async () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    setWorldMapSettings(doc, 'dn_zip', { seed: 8765, controls: { landFraction: 0.65, islandCount: 8 } });
    addMapMarker(doc, 'dn_zip', { id: 'm_zip', locationId: 'loc_zip', x: 0.3, y: 0.7, label: 'Kale' });
    addMapLabel(doc, 'dn_zip', { id: 'l_zip', x: 0.5, y: 0.2, text: 'Kuzey' });
    const packed = await packProject({ project: docToProject(doc), assets: {} });
    const restored = await unpackProject(packed);
    const reopened = new Y.Doc();
    loadProjectIntoDoc(reopened, restored.project);
    expect(readWorldMap(worldMapsMap(reopened), 'dn_zip')).toEqual(readWorldMap(worldMapsMap(doc), 'dn_zip'));
  });
  it('ülke görünümü, biyomu ve gizlenen ülke .sbp açılınca korunur', async () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject());
    mapMutations.updateMapCountry(doc, 'dn_zip_country', 'country-12', {
      name: 'Eshar', biome: 'desert', note: 'Salt road', color: '#be8b55',
    });
    mapMutations.setCountryConfig(doc, 'dn_zip_country', { count: 3, appearance: 'texture' });
    const restored = await unpackProject(await packProject({ project: docToProject(doc), assets: {} }));
    const reopened = new Y.Doc();
    loadProjectIntoDoc(reopened, restored.project);
    expect(readWorldMap(worldMapsMap(reopened), 'dn_zip_country').countryConfig).toMatchObject({ count: 3, appearance: 'texture' });
    mapMutations.setCountryConfig(reopened, 'dn_zip_country', { count: 12 });
    expect(readWorldMap(worldMapsMap(reopened), 'dn_zip_country').countries[11]).toMatchObject({
      name: 'Eshar', biome: 'desert', note: 'Salt road', color: '#be8b55',
    });
  });
  it('paketleme ve açma sonrası proje birebir geri yüklenir', async () => {
    const project = richProject();
    const assets: Record<string, Uint8Array> = {
      'bake_1.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
    };

    const bytes = await packProject({ project, assets });
    const restored = await unpackProject(bytes);

    // updatedAt kayıt anında tazelenir; diğer her şey aynı kalmalıdır.
    expect(restored.project.meta.id).toBe(project.meta.id);
    expect(restored.project.meta.name).toBe(project.meta.name);
    expect(restored.project.settings).toEqual(project.settings);
    expect(restored.project.panels).toEqual(project.panels);
    expect(Array.from(restored.assets['bake_1.png'])).toEqual(Array.from(assets['bake_1.png']));
  });

  it('ZIP içinde project.json ve manifest bulunur', async () => {
    const bytes = await packProject({ project: createProject(), assets: {} });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('project.json')).toBeTruthy();
    expect(zip.file('manifest.json')).toBeTruthy();
  });

  it('eksik alanlı eski projeyi varsayılanlarla tamamlar', () => {
    const migrated = migrateProject({ schemaVersion: 1, meta: { name: 'Eski' }, panels: [] });
    expect(migrated.meta.name).toBe('Eski');
    expect(migrated.panels.length).toBeGreaterThan(0);
    expect(migrated.settings.aspect).toBe('16:9');
  });

  it('daha yeni şema sürümünü reddeder', () => {
    expect(() => migrateProject({ schemaVersion: 99 })).toThrow(/daha yeni/);
  });

  it('dosya adı şablonunu doldurur', () => {
    expect(
      renderFileNameTemplate('S{sahne}_C{cekim}.png', { sahne: '2', cekim: '7', panel: 3, ad: 'X' }),
    ).toBe('S2_C7.png');
    expect(
      renderFileNameTemplate('{ad}_{panel}.png', { sahne: '1', cekim: '1', panel: 5, ad: 'proje' }),
    ).toBe('proje_005.png');
  });

  it('dosya adını güvenli hale getirir', () => {
    expect(safeFileName('a/b:c*d?')).toBe('a-b-c-d-');
  });
});

describe('Gömülü görseller', () => {
  it('dataURL ↔ ikili dönüşümü kayıpsızdır', () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128, 64]);
    const dataUrl = bytesToDataUrl('foto.png', bytes);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(Array.from(dataUrlToBytes(dataUrl))).toEqual(Array.from(bytes));
  });

  it('MIME türü uzantıdan çıkarılır', () => {
    expect(mimeForAsset('a.png')).toBe('image/png');
    expect(mimeForAsset('a.jpg')).toBe('image/jpeg');
    expect(mimeForAsset('a.webp')).toBe('image/webp');
    expect(mimeForAsset('a.svg')).toBe('image/svg+xml');
  });

  it('bozuk dataURL kaydı engellemez', () => {
    const assets = collectAssets({ 'iyi.png': bytesToDataUrl('iyi.png', new Uint8Array([1, 2, 3])), 'kotu.png': 'bozuk' });
    expect(Object.keys(assets)).toEqual(['iyi.png']);
  });


  it('görsel obje ve varlığı kaydedilip birebir geri yüklenir', async () => {
    const project = createProject({ panels: [createPanel()] });
    const panel = project.panels[0];
    const layerId = panel.layers[1].id;
    const bytes = new Uint8Array(Array.from({ length: 512 }, (_, i) => i % 256));
    const assetId = 'img_test.png';

    panel.objects.push(
      createImage({ layerId, x: 300, y: 200, name: 'kare.png' }, { assetId, width: 640, height: 480 }),
    );

    const assetUrls = { [assetId]: bytesToDataUrl(assetId, bytes) };
    const packed = await packProject({ project, assets: collectAssets(assetUrls) });
    const restored = await unpackProject(packed);

    expect(restored.project.panels[0].objects[0]).toEqual(panel.objects[0]);
    expect(Array.from(restored.assets[assetId])).toEqual(Array.from(bytes));
    expect(assetUrlsFrom(restored.assets)[assetId]).toBe(assetUrls[assetId]);
  });
});

describe('Dosya adı güvenliği', () => {
  it('yol ayraçlarını ve kontrol karakterlerini temizler', () => {
    expect(safeFileName('a/b\\c:d')).toBe('a-b-c-d');
    expect(safeFileName('proje\u0000adı')).toBe('projeadı');
  });

  it('Windows ayrılmış adlarını kullanılabilir hale getirir', () => {
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('nul')).toBe('nul_');
    expect(safeFileName('com1')).toBe('com1_');
    expect(safeFileName('konsol')).toBe('konsol');
  });

  it('sondaki nokta ve boşlukları kırpar', () => {
    expect(safeFileName('proje...')).toBe('proje');
    expect(safeFileName('proje   ')).toBe('proje');
    expect(safeFileName('   ')).toBe('storyboard');
  });
});

describe('Şema 3 yükseltmesi', () => {
  it('şema 2 senaryosuna parmak izi ve sahne kimliği eklenir', () => {
    const eski = {
      schemaVersion: 2,
      meta: { id: 'prj_y', name: 'Eski Proje' },
      settings: {},
      panels: [{ id: 'pnl_y', meta: {}, layers: [], objects: [], scriptRefs: ['sb_abc'] }],
      script: {
        name: 'eski.fountain',
        blocks: [
          { id: 'sb_abc', type: 'scene', text: 'İÇ. MUTFAK - GECE', scene: '1' },
          { id: 'sb_def', type: 'action', text: 'Buzdolabı uğulduyor.', scene: '1' },
        ],
      },
    };

    const proje = migrateProject(eski);

    // Kimlikler AYNEN korunur — yoksa mevcut panel bağları kopar.
    expect(proje.script.blocks.map((b) => b.id)).toEqual(['sb_abc', 'sb_def']);
    expect(proje.panels[0].scriptRefs).toEqual(['sb_abc']);

    // Yeni alanlar üretilir.
    for (const b of proje.script.blocks) {
      expect(b.fp).toBeTruthy();
      expect(b.sceneId).toMatch(/^sc_/);
    }
    // Aynı sahne numarasındakiler aynı sahne kimliğini paylaşır.
    expect(proje.script.blocks[0].sceneId).toBe(proje.script.blocks[1].sceneId);
  });

  it('şema 3 projesi olduğu gibi okunur', () => {
    const blocks = [
      { id: 'sb_1', fp: 'aa', type: 'scene', text: 'İÇ. EV - GÜN', scene: '1', sceneId: 'sc_1' },
    ];
    const proje = migrateProject({
      schemaVersion: 3,
      meta: { id: 'prj_z', name: 'Yeni' },
      settings: {},
      panels: [],
      script: { name: 'y.fountain', blocks },
    });
    expect(proje.script.blocks[0].sceneId).toBe('sc_1');
    expect(proje.script.blocks[0].fp).toBe('aa');
  });

  /* Yükseltmenin en sinsi tuzağı: migrasyonun ürettiği `fp`, `parseFountain`'in
     ürettiğiyle BİREBİR aynı biçimde olmalı. Aksi hâlde yükseltilen proje
     yeniden içe aktarıldığında hiçbir çapa eşleşmez ve `reconcileScript`
     bütün kimlikleri kaybeder — panel bağları sessizce kopar. */
  it('üretilen parmak izi parseFountain biçimiyle birebir aynıdır', () => {
    const kaynak =
      'İÇ. MUTFAK - GECE\n\nBuzdolabı uğulduyor.\n\nAYŞE\nGeldim.\n\nBuzdolabı uğulduyor.\n';
    const taze = parseFountain(kaynak);
    expect(taze.length).toBeGreaterThan(3);

    // Şema 2 projesi: bloklarda `fp` ve `sceneId` alanları henüz yoktu.
    const sema2Bloklar = taze.map(({ fp: _fp, sceneId: _sceneId, ...kalan }) => kalan);
    const proje = migrateProject({
      schemaVersion: 2,
      meta: { id: 'prj_fp', name: 'Parmak izi' },
      settings: {},
      panels: [],
      script: { name: 'k.fountain', blocks: sema2Bloklar },
    });

    expect(proje.script.blocks.map((b) => b.fp)).toEqual(taze.map((b) => b.fp));
  });

  /* Ö-1: tekrar sayacı `fp` taşıyan bloklarla da beslenmeli. `parseFountain`
     her blokta sayacı ilerletir; migrasyon yalnız `fp` boş olanlarda ilerletirse
     aynı `type+text`'e sahip iki blok aynı `fp`'yi alır. O çift `fp`,
     `reconcileScript`'in 1. geçişinde tek anahtar altında iki indeksli kuyruk
     kurar ve çapa yanlış bloğa bağlanabilir. */
  it('parmak izi taşıyan blok da tekrar sayacını ilerletir', () => {
    const kaynak = 'Aynı satır.\n\nAynı satır.\n';
    const taze = parseFountain(kaynak);
    expect(taze).toHaveLength(2);
    expect(taze[1].fp).toBe(taze[0].fp + '_2');

    // Karışık kayıt: ilk bloğun `fp`'si duruyor, ikincisininki eksik.
    const bloklar = [
      { ...taze[0] },
      { id: taze[1].id, type: taze[1].type, text: taze[1].text, scene: taze[1].scene },
    ];
    const proje = migrateProject({
      schemaVersion: 2,
      meta: { id: 'prj_sayac', name: 'Sayaç' },
      settings: {},
      panels: [],
      script: { name: 's.fountain', blocks: bloklar },
    });

    expect(proje.script.blocks[1].fp).not.toBe(proje.script.blocks[0].fp);
    expect(proje.script.blocks.map((b) => b.fp)).toEqual(taze.map((b) => b.fp));
  });

  /* Ö-1: `sceneId` sayacı da beslenmeli — `fp` tuzağının birebir aynısı.
     Kısmi `sceneId` taşıyan projede dolu alan haritaya kaydedilmezse aynı
     sahne ikiye bölünür ve sahnenin yarısı taze bir kimliğe kayar. */
  it('sceneId taşıyan blok sahne kimliğini besler — sahne ikiye bölünmez', () => {
    const proje = migrateProject({
      schemaVersion: 2,
      meta: { id: 'prj_kismi', name: 'Kısmi sahne kimliği' },
      settings: {},
      panels: [],
      script: {
        name: 'k.fountain',
        blocks: [
          { id: 'sb_1', type: 'scene', text: 'İÇ. EV - GÜN', scene: '1' },
          { id: 'sb_2', type: 'action', text: 'Kapı açılır.', scene: '1', sceneId: 'sc_kalici' },
          { id: 'sb_3', type: 'action', text: 'Işık söner.', scene: '1' },
        ],
      },
    });

    const kimlikler = proje.script.blocks.map((b) => b.sceneId);
    expect(new Set(kimlikler).size).toBe(1);
    // Kalıcı olan kazanır; taze uid üretilip üzerine yazılmaz.
    expect(kimlikler[0]).toBe('sc_kalici');
  });

  /* Ö-2: sahne kimliği görünen sahne NUMARASINA göre gruplanamaz. Numara
     kullanıcı verisidir; `#1#` iki kez geçerse iki ayrı sahne tek `sceneId`
     altında birleşir. Gruplama ölçütü sahne başlığı bloğunun kendisidir. */
  it('tekrarlı sahne numarası iki sahneyi birleştirmez', () => {
    const proje = migrateProject({
      schemaVersion: 2,
      meta: { id: 'prj_numara', name: 'Tekrarlı numara' },
      settings: {},
      panels: [],
      script: {
        name: 'n.fountain',
        blocks: [
          { id: 'sb_1', type: 'scene', text: 'İÇ. EV - GÜN', scene: '1' },
          { id: 'sb_2', type: 'action', text: 'Kapı açılır.', scene: '1' },
          { id: 'sb_3', type: 'scene', text: 'DIŞ. SOKAK - GÜN', scene: '2' },
          { id: 'sb_4', type: 'scene', text: 'İÇ. EV - GECE', scene: '1' },
        ],
      },
    });

    const kimlikler = proje.script.blocks.map((b) => b.sceneId);
    // Üç başlık = üç sahne. Numarası tekrar eden ilk ve son sahne AYRI kalmalı.
    expect(new Set(kimlikler).size).toBe(3);
    expect(kimlikler[0]).toBe(kimlikler[1]);
    expect(kimlikler[3]).not.toBe(kimlikler[0]);
  });

  /* Ö-3: `type` güven sınırıdır. Dosya dışarıdan gelir, bozuk ya da elle
     kurcalanmış olabilir; doğrulanmayan değer `ScriptBlockType`'a sızar. */
  it('tanınmayan blok tipi action’a düşürülür', () => {
    const proje = migrateProject({
      schemaVersion: 3,
      meta: { id: 'prj_tip', name: 'Bozuk tip' },
      settings: {},
      panels: [],
      script: {
        name: 't.fountain',
        blocks: [
          { id: 'sb_1', fp: 'aa', type: 'SAÇMA', text: 'Kapı çarpar.', scene: '1', sceneId: 'sc_1' },
          { id: 'sb_2', fp: 'bb', type: null, text: 'Işık söner.', scene: '1', sceneId: 'sc_1' },
          { id: 'sb_3', fp: 'cc', type: 'dialogue', text: 'Geldim.', scene: '1', sceneId: 'sc_1' },
        ],
      },
    });

    expect(proje.script.blocks.map((b) => b.type)).toEqual(['action', 'action', 'dialogue']);
  });

  /* k-2: kimliksiz blok hiçbir panelin bağlanamayacağı bloktur. Boş dizeyi
     olduğu gibi bırakmak kimlik vermek değil, kimliksizliği kalıcılaştırmaktır. */
  it('boş dizeli kimlik taze bir kimlikle doldurulur', () => {
    const proje = migrateProject({
      schemaVersion: 2,
      meta: { id: 'prj_bos', name: 'Boş kimlik' },
      settings: {},
      panels: [],
      script: {
        name: 'b.fountain',
        blocks: [{ id: '', type: 'action', text: 'Kapı çarpar.', scene: '1' }],
      },
    });
    expect(proje.script.blocks[0].id).toMatch(/^sb_/);
  });

  /* Çapa sağlaması: senaryoya yeni bir satır eklenip yeniden içe aktarılır.
     Parmak izi doğru biçimdeyse eski bloklar 1. geçişte çapaya oturur ve
     kimliklerini korur. Biçim tutmazsa 2. geçiş sırayla hizalar ve YENİ blok
     eski bloğun kimliğini çalar — panel bağı sessizce yanlış bloğa kayar. */
  it('yükseltilen proje değişmiş senaryoyla yeniden içe aktarıldığında kimlikler korunur', () => {
    const kaynak = 'İÇ. MUTFAK - GECE\n\nBuzdolabı uğulduyor.\n\nAYŞE\nGeldim.\n';
    const degismis = 'İÇ. MUTFAK - GECE\n\nPencere aralık.\n\nBuzdolabı uğulduyor.\n\nAYŞE\nGeldim.\n';

    const taze = parseFountain(kaynak);
    const sema2Bloklar = taze.map(({ fp: _fp, sceneId: _sceneId, ...kalan }) => kalan);
    const proje = migrateProject({
      schemaVersion: 2,
      meta: { id: 'prj_capa', name: 'Çapa' },
      settings: {},
      panels: [],
      script: { name: 'k.fountain', blocks: sema2Bloklar },
    });

    const yeniden = reconcileScript(proje.script.blocks, parseFountain(degismis));

    const eskiKimlik = (metin: string, liste: { id: string; text: string }[]) =>
      liste.find((b) => b.text === metin)!.id;
    for (const metin of ['İÇ. MUTFAK - GECE', 'Buzdolabı uğulduyor.', 'AYŞE', 'Geldim.']) {
      expect(eskiKimlik(metin, yeniden)).toBe(eskiKimlik(metin, proje.script.blocks));
    }
    // Yeni satır kendi taze kimliğiyle gelir, kimseden çalmaz.
    expect(proje.script.blocks.map((b) => b.id)).not.toContain(eskiKimlik('Pencere aralık.', yeniden));
  });
});

/**
 * F1b-1 senaryo metnini Y.Map+düz diziden Y.XmlFragment'e taşıdı — bu yalnız
 * BELLEK İÇİ depoyu değiştirdi. `project.json`'daki düz `script.blocks`
 * dizisi hiç değişmedi: `loadProjectIntoDoc` diziyi yükleme anında fragment'e
 * yazar, `ProjectSnapshot.read()` (dolayısıyla `packProject`'in yazacağı
 * biçim) fragment'ten aynı düz diziyi geri üretir.
 *
 * Karar 30 (plandan sapma): `PROJECT_SCHEMA_VERSION` 4'e ÇIKARILMAZ. Biçim
 * değişmediği için sürüm yükseltmek, `migrateProject`'teki
 * `version > PROJECT_SCHEMA_VERSION` kontrolü yüzünden hâlâ şema-3 istemcilerin
 * (biçim aynı olduğu hâlde) dosyayı açamamasına yol açardı — spec §15'e
 * (veri güvenliği) aykırı. Bkz. task-3-brief.md.
 */
describe('Disk yuvarlak-gidiş sözleşmesi (Karar 30 — PROJECT_SCHEMA_VERSION 3’te kalır)', () => {
  /** Şema 3 biçiminde ELLE kurulmuş bir project.json nesnesi. Blok id'leri
   *  `sb_` önekli, elle yazılmış, tahmin edilemez değerler — üretilen bir
   *  id ile karışmasın diye. `fp` değerleri KANONİKTİR: `blockFingerprint`
   *  ile üretildi, çünkü gerçek bir kayıtta `fp` de tam olarak böyle üretilir
   *  (`readScript` fp'yi SAKLAMAZ, her okumada içerikten yeniden HESAPLAR —
   *  bkz. doc/schema.ts). Rastgele bir `fp` kullansaydık, yuvarlak gidişin
   *  onu "değiştirmesi" bug değil tasarım gereği olurdu; bu yüzden burada
   *  gerçek disk verisini temsil eden değer kullanılıyor.
   */
  function diskFikstur() {
    const gorulen = new Map<string, number>();
    const sahneMetni = 'İÇ. STÜDYO - GÜN';
    const aksiyonMetni = 'Kamera çalışır.';
    const fp1 = blockFingerprint('scene', sahneMetni, gorulen);
    const fp2 = blockFingerprint('action', aksiyonMetni, gorulen);
    return {
      schemaVersion: 3,
      meta: {
        id: 'prj_disk_ozel', name: 'Disk Sözleşmesi',
        createdAt: 1700000000000, updatedAt: 1700000000000, author: '', description: '',
      },
      settings: {},
      panels: [createPanel({ id: 'pnl_disk_ozel', scriptRefs: ['sb_ozel_a'] })],
      customPoses: [],
      script: {
        name: 'disk-sozlesmesi.fountain',
        blocks: [
          { id: 'sb_ozel_a', fp: fp1, type: 'scene', text: sahneMetni, scene: '1', sceneId: 'sc_ozel_1' },
          { id: 'sb_ozel_b', fp: fp2, type: 'action', text: aksiyonMetni, scene: '1', sceneId: 'sc_ozel_1' },
        ],
      },
    };
  }

  /** `migrateProject` çıktısını bir `Y.Doc`'a yükleyip `ProjectSnapshot.read()`
   *  ile geri okur — dosya açma sırasında uygulamanın izlediği yolun ta kendisi. */
  function okunanProje(proje: Project): Project {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, proje);
    // Kirlilik takibi BİLEREK bağlanmıyor: yükleme işlemi zaten bu satırdan
    // önce bitiyor ve sonrasında hiç işlem yok — bağlamak sınanmayan ölü kod olurdu.
    return new ProjectSnapshot(doc).read();
  }

  it('iddia 1: blok kimlikleri disk → doc → okuma boyunca birebir aynı sırada kalır', () => {
    const proje = migrateProject(diskFikstur());
    const okunan = okunanProje(proje);
    expect(okunan.script.blocks.map((b) => b.id)).toEqual(['sb_ozel_a', 'sb_ozel_b']);
  });

  /* Karar 30'un GEREKÇESİ ölçüldü ve düzeltildi: diskteki BAYTLAR birebir aynı
     değil — biçim aynı, bazı TÜRETİLMİŞ değerler kayıtta yeniden hesaplanıyor.
     Aşağıdaki test bunu görünür kılıyor; sürümün 3'te kalması bundan sonra da
     doğru, çünkü eski istemci dosyayı hâlâ açabiliyor: anahtar kümesi ve tipler
     değişmiyor, kimlik yalnızca opak bir dizgi. */
  it('onarımdan TÜREYEN kimlik diske yazılır ve dosya şema 3 kalır (Karar 10’un görünmeyen yarısı)', () => {
    const blok = (id: string, text: string) =>
      ({ id, fp: '', type: 'action' as const, text, scene: '1', sceneId: 'sc_1' });
    const a = new Y.Doc();
    const b = new Y.Doc();
    setScript(a, { name: 'x', blocks: [blok('sb_dup', 'A yazdı.')] });
    setScript(b, { name: 'x', blocks: [blok('sb_dup', 'B yazdı.')] });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    const okunan = new ProjectSnapshot(a).read();
    // ÖN KOŞUL: birleşme gerçekten yinelenen kimlik üretmiş olmalı.
    expect(okunan.script.blocks).toHaveLength(2);
    // Kaydedilen dosya artık depoda HİÇ bulunmayan bir kimlik taşıyor.
    expect(okunan.script.blocks.map((x) => x.id)).toEqual(['sb_dup', 'sb_dup__2']);
    // Yine de şema 3: eski istemci bu dosyayı açabilir.
    expect(okunan.schemaVersion).toBe(3);
  });

  it('iddia 1b: okunan bloklar DİSKTEKİ bloklarla alan alan aynıdır', () => {
    // İddia 1 yalnız `id`'ye bakıyordu; iddia 5 ise iki turu BİRBİRİYLE
    // karşılaştırdığı için determinist bir KAYBI göremez. `text`, `type` veya
    // `scene` diskten doc'a giderken sessizce bozulsa bu blok — adı "disk
    // yuvarlak-gidiş sözleşmesi" olmasına rağmen — yeşil kalırdı.
    const fikstur = diskFikstur();
    const okunan = okunanProje(migrateProject(fikstur));
    expect(okunan.script.blocks).toEqual(fikstur.script.blocks);
  });

  it('iddia 2: scriptRefs hâlâ var olan bloklara işaret eder', () => {
    const proje = migrateProject(diskFikstur());
    const okunan = okunanProje(proje);
    // Ön koşul: bağ boş olmasın.
    expect(okunan.panels[0].scriptRefs.length).toBeGreaterThan(0);
    const blokKimlikleri = new Set(okunan.script.blocks.map((b) => b.id));
    for (const ref of okunan.panels[0].scriptRefs) {
      expect(blokKimlikleri.has(ref)).toBe(true);
    }
  });

  /* migrateProject'in fp KORUMA davranışı — `readScript` fp'yi zaten her
     okumada yeniden hesapladığı için (bkz. yukarıdaki yorum) bunu tam
     yuvarlak gidiş üzerinden sınamak anlamsız: kanonik bir fp her koşulda
     aynı kanonik değere "yeniden hesaplanır", ayırt edici değildir. Bu yüzden
     migrateProject'in kendisini, diskte duran (kanonik OLMAYAN, elle yazılmış)
     bir fp'yi ezip ezmediğini doğrudan sınıyoruz. */
  it('iddia 3a: migrateProject diskteki fp değerini korur, yeniden hesaplamaz', () => {
    const raw = {
      schemaVersion: 3,
      meta: { id: 'prj_fp_koru', name: 'fp koruma' },
      settings: {},
      panels: [],
      script: {
        name: 'fp.fountain',
        blocks: [
          { id: 'sb_fpkoru', fp: 'FP_ELLE_YAZILMIS', type: 'action', text: 'Herhangi bir metin.', scene: '1', sceneId: 'sc_fpkoru' },
        ],
      },
    };
    expect(migrateProject(raw).script.blocks[0].fp).toBe('FP_ELLE_YAZILMIS');
  });

  it('iddia 3b: sceneId disk → doc → okuma boyunca değişmez', () => {
    const proje = migrateProject(diskFikstur());
    // Ön koşul: fikstürde dolu sceneId olsun.
    expect(proje.script.blocks.every((b) => b.sceneId)).toBe(true);
    const okunan = okunanProje(proje);
    expect(okunan.script.blocks.map((b) => b.sceneId)).toEqual(['sc_ozel_1', 'sc_ozel_1']);
  });

  it('iddia 4: migrateProject idempotanttır', () => {
    const raw = diskFikstur();
    const bir = migrateProject(raw);
    const iki = migrateProject(bir);
    const zamanSiz = (p: Project) => ({ ...p, meta: { ...p.meta, updatedAt: 0, createdAt: 0 } });
    expect(zamanSiz(iki)).toEqual(zamanSiz(bir));
  });

  it('iddia 5: yuvarlak gidiş idempotanlığı — disk→doc→disk→doc→disk iki turda aynı script', async () => {
    const proje1 = migrateProject(diskFikstur());
    const okunan1 = okunanProje(proje1);
    // Ön koşul: birinci turun blocks dizisi boş olmasın.
    expect(okunan1.script.blocks.length).toBeGreaterThan(0);

    const bytes = await packProject({ project: okunan1, assets: {} });
    const { project: proje2 } = await unpackProject(bytes);
    const okunan2 = okunanProje(proje2);

    expect(okunan2.script).toEqual(okunan1.script);
  });

  it('iddia 6: boş script çökmez', () => {
    for (const raw of [
      { schemaVersion: 3, panels: [], script: {} },
      { schemaVersion: 3, panels: [] }, // script alanı hiç yok
    ]) {
      const proje = migrateProject(raw);
      expect(proje.script.blocks).toEqual([]);
      const doc = new Y.Doc();
      expect(() => loadProjectIntoDoc(doc, proje)).not.toThrow();
      const snap = new ProjectSnapshot(doc);
      doc.on('afterTransaction', (tr: Y.Transaction) => snap.markFromTransaction(tr));
      let okunan: Project | undefined;
      expect(() => { okunan = snap.read(); }).not.toThrow();
      expect(okunan!.script.blocks).toEqual([]);
    }
  });

  /* Bu test KASITLIDIR: ileride biri biçimi değiştirmeden sürümü yükseltmeye
     kalkarsa (Karar 30'u görmeden) buradan geçemesin. */
  it('iddia 7: PROJECT_SCHEMA_VERSION 3 kalır, packProject bunu project.json + manifest.json’a yazar', async () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(3);
    const bytes = await packProject({ project: migrateProject(diskFikstur()), assets: {} });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(bytes);
    const projectJson = JSON.parse(await zip.file('project.json')!.async('string'));
    const manifestJson = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(projectJson.schemaVersion).toBe(3);
    expect(manifestJson.schemaVersion).toBe(3);
  });
});

describe('içe aktarımda meta ve panel GÜVEN SINIRI', () => {
  /* `meta.id` §15'in disk katmanında doğrudan dizin adı oluyor. Dosya ortak
     çalışandan gelebilir; ham geçirilseydi `../..` içeren bir kimlik veri
     kökünün dışına yazdırırdı. Blok tipleri aynı fonksiyonda titizce
     denetleniyordu, meta ham yayılıyordu. */
  const proje = (meta: unknown) =>
    migrateProject({ schemaVersion: 3, meta, panels: [], script: { name: '', blocks: [] } });

  it('yol geçişi içeren kimlik REDDEDİLİYOR, proje yine açılıyor', () => {
    for (const kotu of ['../../kacis', 'a/b', '..', '.', '']) {
      const p = proje({ id: kotu, name: 'X' });
      expect(p.meta.id).not.toBe(kotu);
      expect(p.meta.id.length).toBeGreaterThan(0);
      // Kimlik dışındaki alanlar KORUNUYOR — proje kurcalanmış sayılmıyor.
      expect(p.meta.name).toBe('X');
    }
  });

  it('ters ayraç içeren kimlik de reddediliyor', () => {
    const kotu = 'a' + String.fromCharCode(92) + 'b';
    expect(proje({ id: kotu }).meta.id).not.toBe(kotu);
  });

  it('normal kimlik AYNEN korunuyor — bağlar kopmasın', () => {
    expect(proje({ id: 'prj_abc123' }).meta.id).toBe('prj_abc123');
  });

  it('nesne olmayan panel girdileri düşürülüyor', () => {
    const p = migrateProject({
      schemaVersion: 3,
      panels: [null, 'bozuk', 42, { id: 'pn1' }],
      script: { name: '', blocks: [] },
    });
    expect(p.panels).toHaveLength(1);
    expect(p.panels[0].id).toBe('pn1');
  });
});
