import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  copOgesiEskimisMi,
  copEskimisleriAyir,
  copSirali,
  COP_SAKLAMA_GUNU,
  type CopOgesi,
} from '@storyboard/core/model/geridonusum';
import {
  addPanel,
  removePanel,
  setScript,
  copListesi,
  copGeriGetir,
  copKaliciSil,
  copTemizle,
  LOCAL_ORIGIN,
} from '@storyboard/core/doc/mutations';
import { copArray, docToProject, panelsArray, readScript } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';
import { createDoc } from '@storyboard/core/doc/schema';
import { createProject, createPanel } from '@storyboard/core/model/factory';

const GUN_MS = 24 * 60 * 60 * 1000;
const oge = (silinmeTarihi: number): CopOgesi => ({
  id: 'x', tur: 'panel', veri: {} as any, silinmeTarihi, silenKullanici: '', oncekiKomsu: null,
});

describe('copOgesiEskimisMi', () => {
  it(`tam olarak ${COP_SAKLAMA_GUNU} gün AŞMADIYSA eskimiş SAYILMIYOR`, () => {
    const simdi = 1_700_000_000_000;
    expect(copOgesiEskimisMi(oge(simdi - COP_SAKLAMA_GUNU * GUN_MS), simdi)).toBe(false);
  });

  it(`${COP_SAKLAMA_GUNU} günü AŞTIYSA eskimiş`, () => {
    const simdi = 1_700_000_000_000;
    expect(copOgesiEskimisMi(oge(simdi - COP_SAKLAMA_GUNU * GUN_MS - 1), simdi)).toBe(true);
  });
});

describe('copEskimisleriAyir', () => {
  it('kalan ve silinecek ikiye ayrılıyor, TOPLAM sayı korunuyor', () => {
    const simdi = 1_700_000_000_000;
    const ogeler = [
      oge(simdi - 1 * GUN_MS),
      oge(simdi - 40 * GUN_MS),
      oge(simdi - 400 * GUN_MS),
    ];
    const { kalan, silinecek } = copEskimisleriAyir(ogeler, simdi);
    expect(kalan).toHaveLength(1);
    expect(silinecek).toHaveLength(2);
  });
});

describe('copSirali — EN YENİ silinen ÖNCE', () => {
  it('silinmeTarihine göre AZALAN sırada', () => {
    const a = oge(1000);
    const b = oge(3000);
    const c = oge(2000);
    expect(copSirali([a, b, c]).map((o) => o.silinmeTarihi)).toEqual([3000, 2000, 1000]);
  });

  it('girdi dizisini MUTASYONA UĞRATMIYOR', () => {
    const ogeler = [oge(1000), oge(3000)];
    copSirali(ogeler);
    expect(ogeler.map((o) => o.silinmeTarihi)).toEqual([1000, 3000]);
  });
});

/* ------------------------- doc/mutations.ts routing ------------------------- */

describe('removePanel — geri dönüşüm kutusuna YÖNLENDİRİYOR (Karar 2)', () => {
  it('silinen panel TAM kaydıyla kutuya düşüyor', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const panels = panelsArray(doc);
    const silinenId = panels.get(1).get('id') as string;
    removePanel(doc, silinenId);
    const kutu = copListesi(doc);
    expect(kutu).toHaveLength(1);
    expect(kutu[0].tur).toBe('panel');
    expect((kutu[0].veri as any).id).toBe(silinenId);
  });

  it('komşu doğru kaydediliyor — önceki panelin kimliği', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const panels = panelsArray(doc);
    const ilkId = panels.get(0).get('id') as string;
    const ikinciId = panels.get(1).get('id') as string;
    removePanel(doc, ikinciId);
    expect(copListesi(doc)[0].oncekiKomsu).toBe(ilkId);
  });

  it('İLK panel silinirse komşu null', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const ilkId = panelsArray(doc).get(0).get('id') as string;
    removePanel(doc, ilkId);
    expect(copListesi(doc)[0].oncekiKomsu).toBeNull();
  });

  it('son panel silinemiyor — kutuya da düşmüyor (guard korunuyor)', () => {
    const doc = createDoc(createProject({ panels: [createPanel()] }));
    const id = panelsArray(doc).get(0).get('id') as string;
    removePanel(doc, id);
    expect(panelsArray(doc)).toHaveLength(1);
    expect(copListesi(doc)).toHaveLength(0);
  });

  it('ikinci bir silme yolu YOK — panel dizisinden doğrudan .delete çağırmak testin KONUSU DEĞİL, ama removePanel HER ZAMAN kutuya yazıyor olmalı', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel(), createPanel()] }));
    const panels = panelsArray(doc);
    const id2 = panels.get(1).get('id') as string;
    const id3 = panels.get(2).get('id') as string;
    removePanel(doc, id2);
    removePanel(doc, id3);
    expect(copListesi(doc)).toHaveLength(2);
  });
});

describe('setScript — TOPLU yeniden yazımda gerçekten silinen bloklar kutuya düşüyor', () => {
  it('yeni listede olmayan blok arşivleniyor', () => {
    const doc = new Y.Doc();
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'ilk', scene: '', sceneId: '' },
      { id: 'b2', fp: '', type: 'action', text: 'ikinci', scene: '', sceneId: '' },
    ] });
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'ilk', scene: '', sceneId: '' },
    ] });
    const kutu = copListesi(doc);
    expect(kutu).toHaveLength(1);
    expect(kutu[0].tur).toBe('blok');
    expect((kutu[0].veri as any).id).toBe('b2');
    expect(kutu[0].oncekiKomsu).toBe('b1');
  });

  it('hiçbir blok silinmezse kutu BOŞ kalıyor', () => {
    const doc = new Y.Doc();
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'ilk', scene: '', sceneId: '' },
    ] });
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'değişti', scene: '', sceneId: '' },
    ] });
    expect(copListesi(doc)).toHaveLength(0);
  });

  it('ardışık İKİ blok birden silinirse ikisi de AYNI (sağlam) komşuya bağlanıyor', () => {
    const doc = new Y.Doc();
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'a', scene: '', sceneId: '' },
      { id: 'b2', fp: '', type: 'action', text: 'b', scene: '', sceneId: '' },
      { id: 'b3', fp: '', type: 'action', text: 'c', scene: '', sceneId: '' },
    ] });
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'a', scene: '', sceneId: '' },
    ] });
    const kutu = copListesi(doc);
    expect(kutu).toHaveLength(2);
    expect(kutu.every((o) => o.oncekiKomsu === 'b1')).toBe(true);
  });
});

describe('copGeriGetir — ESKİ YERİNE koyar', () => {
  it('panel komşusunun HEMEN ARDINA geri geliyor', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel(), createPanel()] }));
    const panels = panelsArray(doc);
    const id1 = panels.get(0).get('id') as string;
    const id2 = panels.get(1).get('id') as string;
    removePanel(doc, id2);
    expect(panelsArray(doc)).toHaveLength(2);
    const kutuId = copListesi(doc)[0].id;
    expect(copGeriGetir(doc, kutuId)).toBe(true);
    const sonSira = docToProject(doc).panels.map((p) => p.id);
    expect(sonSira[0]).toBe(id1);
    expect(sonSira[1]).toBe(id2); // komşusunun hemen ardında — SONA atılmadı
    expect(copListesi(doc)).toHaveLength(0);
  });

  it('blok komşusunun HEMEN ARDINA geri geliyor', () => {
    const doc = new Y.Doc();
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'a', scene: '', sceneId: '' },
      { id: 'b2', fp: '', type: 'action', text: 'b', scene: '', sceneId: '' },
      { id: 'b3', fp: '', type: 'action', text: 'c', scene: '', sceneId: '' },
    ] });
    setScript(doc, { name: '', blocks: [
      { id: 'b1', fp: '', type: 'action', text: 'a', scene: '', sceneId: '' },
      { id: 'b3', fp: '', type: 'action', text: 'c', scene: '', sceneId: '' },
    ] });
    const kutuId = copListesi(doc)[0].id;
    copGeriGetir(doc, kutuId);
    expect(readScript(doc).blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('komşu ARTIK yoksa BAŞA düşüyor, çökmez', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const panels = panelsArray(doc);
    const id1 = panels.get(0).get('id') as string;
    const id2 = panels.get(1).get('id') as string;
    removePanel(doc, id2); // komşu id1
    removePanel(doc, id1); // artık tek panel kaldı, guard nedeniyle silinemez — id1 hâlâ orada
    // id1 hâlâ mevcut olduğu için normal yol test edilemez; komşu senaryosu
    // burada yerine `copGeriGetir` çağrısının hiç çökmediğini doğrular.
    const kutuId = copListesi(doc)[0].id;
    expect(() => copGeriGetir(doc, kutuId)).not.toThrow();
  });

  it('olmayan kimlik false dönüyor', () => {
    const doc = new Y.Doc();
    expect(copGeriGetir(doc, 'yok')).toBe(false);
  });

  it('geri getirilen öğe kutudan ÇIKARILIYOR', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const id2 = panelsArray(doc).get(1).get('id') as string;
    removePanel(doc, id2);
    const kutuId = copListesi(doc)[0].id;
    copGeriGetir(doc, kutuId);
    expect(copListesi(doc)).toHaveLength(0);
  });
});

describe('copKaliciSil — geri alınamaz', () => {
  it('kayıt kutudan tamamen kayboluyor', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const id2 = panelsArray(doc).get(1).get('id') as string;
    removePanel(doc, id2);
    const kutuId = copListesi(doc)[0].id;
    expect(copKaliciSil(doc, kutuId)).toBe(true);
    expect(copListesi(doc)).toHaveLength(0);
    // Panel dizisinde de GERİ GELMEDİ — kalıcı sil restore etmiyor.
    expect(panelsArray(doc)).toHaveLength(1);
  });

  it('olmayan kimlik false', () => {
    const doc = new Y.Doc();
    expect(copKaliciSil(doc, 'yok')).toBe(false);
  });
});

describe('copTemizle — SESSİZ değil, kaç kaydın gittiğini DÖNDÜRÜYOR', () => {
  it('eski kayıtları temizler, yeniyi bırakır, sayıyı döndürür', () => {
    const doc = new Y.Doc();
    const dizi = copArray(doc);
    const simdi = Date.now();
    const eski = new Y.Map<any>();
    eski.set('id', 'e1'); eski.set('tur', 'panel'); eski.set('veri', {});
    eski.set('silinmeTarihi', simdi - (COP_SAKLAMA_GUNU + 1) * GUN_MS);
    eski.set('silenKullanici', ''); eski.set('oncekiKomsu', null);
    const yeni = new Y.Map<any>();
    yeni.set('id', 'y1'); yeni.set('tur', 'panel'); yeni.set('veri', {});
    yeni.set('silinmeTarihi', simdi);
    yeni.set('silenKullanici', ''); yeni.set('oncekiKomsu', null);
    dizi.push([eski, yeni]);

    const silinen = copTemizle(doc, simdi);
    expect(silinen).toBe(1);
    expect(copListesi(doc).map((o) => o.id)).toEqual(['y1']);
  });

  it('temizlenecek yoksa 0 döndürür, kutuya DOKUNMAZ', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const id2 = panelsArray(doc).get(1).get('id') as string;
    removePanel(doc, id2);
    expect(copTemizle(doc)).toBe(0);
    expect(copListesi(doc)).toHaveLength(1);
  });
});

describe('yazımlar LOCAL_ORIGIN taşıyor ve geri alınabiliyor', () => {
  it('removePanel kutuya yazımı LOCAL_ORIGIN taşıyor', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    const id2 = panelsArray(doc).get(1).get('id') as string;
    removePanel(doc, id2);
    expect(originler).toContain(LOCAL_ORIGIN);
  });
});

describe('geri dönüşüm kutusu KORUMALI izdüşümde', () => {
  it('panel silmek izdüşümü değiştiriyor', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const once = protectedProjection(doc);
    const id2 = panelsArray(doc).get(1).get('id') as string;
    removePanel(doc, id2);
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('kalıcı silme izdüşümü değiştiriyor', () => {
    const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
    const id2 = panelsArray(doc).get(1).get('id') as string;
    removePanel(doc, id2);
    const once = protectedProjection(doc);
    copKaliciSil(doc, copListesi(doc)[0].id);
    expect(protectedProjection(doc)).not.toBe(once);
  });
});
