import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  lokasyonAdiDuzelt,
  lokasyonAdiGecerliMi,
  lokasyonAnahtari,
  lokasyonSatirlari,
  lokasyonTipiDuzelt,
  lokasyonlariTopla,
  LOKASYON_ADI_EN_UZUN,
  VARSAYILAN_LOKASYON_TIPI,
  type Lokasyon,
} from '@storyboard/core/model/lokasyon';
import type { ScriptBlock } from '@storyboard/core/model/script';
import {
  lokasyonEkle,
  lokasyonGuncelle,
  lokasyonSil,
  LOCAL_ORIGIN,
} from '@storyboard/core/doc/mutations';
import { lokasyonlarMap } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';

const blok = (i: number, tip: ScriptBlock['type'], metin: string): ScriptBlock => ({
  id: `b${i}`, fp: `f${i}`, type: tip, text: metin, scene: '', sceneId: `s${i}`,
});

describe('lokasyonAdiDuzelt', () => {
  it('NFC normalize ediyor ve kırpıyor', () => {
    const ayrik = 'I' + String.fromCharCode(0x0307);
    expect(lokasyonAdiDuzelt(`  ${ayrik}  `)).toBe(ayrik.normalize('NFC'));
  });

  it('uzun adı kırpıyor', () => {
    const uzun = 'x'.repeat(LOKASYON_ADI_EN_UZUN + 40);
    expect(lokasyonAdiDuzelt(uzun)).toHaveLength(LOKASYON_ADI_EN_UZUN);
  });

  it('dizge olmayan girdide çökmeden boşa dönüyor', () => {
    expect(lokasyonAdiDuzelt(null)).toBe('');
  });
});

describe('lokasyonTipiDuzelt — belge elle kurcalanmış olabilir', () => {
  it('geçerli değerler korunuyor', () => {
    expect(lokasyonTipiDuzelt('ic')).toBe('ic');
    expect(lokasyonTipiDuzelt('dis')).toBe('dis');
  });

  it('bilinmeyen değer varsayılana düşüyor', () => {
    expect(lokasyonTipiDuzelt('bilinmeyen')).toBe(VARSAYILAN_LOKASYON_TIPI);
    expect(lokasyonTipiDuzelt(undefined)).toBe(VARSAYILAN_LOKASYON_TIPI);
    expect(lokasyonTipiDuzelt(3)).toBe(VARSAYILAN_LOKASYON_TIPI);
  });
});

describe('lokasyonAnahtari — Türkçe İ/ı tuzağından bağımsız', () => {
  it('büyük/küçük Türkçe harf varyasyonları AYNI anahtara düşüyor', () => {
    expect(lokasyonAnahtari('MUTFAK')).toBe(lokasyonAnahtari('mutfak'));
    expect(lokasyonAnahtari('IŞIKLI SALON')).toBe(lokasyonAnahtari('ışıklı salon'));
  });
});

describe('lokasyonAdiGecerliMi', () => {
  const digerleri: Lokasyon[] = [
    { id: 'l1', ad: 'Mutfak', tip: 'ic', aciklama: '', notlar: '' },
  ];

  it('boş ad geçersiz', () => {
    expect(lokasyonAdiGecerliMi('', digerleri).gecerli).toBe(false);
  });

  it('çakışan ad geçersiz', () => {
    const sonuc = lokasyonAdiGecerliMi('MUTFAK', digerleri);
    expect(sonuc.gecerli).toBe(false);
    expect(sonuc.hata).toContain('Mutfak');
    /* `toContain` mesajın gerisini serbest bırakıyordu; kullanıcı KAYITLI
       hâli ("Mutfak") ve hangi listede çakıştığını ("lokasyon") görmeli. */
    expect(sonuc).toEqual({
      gecerli: false,
      hata: '"Mutfak" adıyla zaten bir lokasyon var.',
    });
    for (const v of ['mutfak', 'MUTFAK', 'MuTfAk']) {
      expect(lokasyonAdiGecerliMi(v, digerleri).gecerli, v).toBe(false);
    }
  });

  /* Boş ad mesajı hiç iddia edilmemişti — yalnız `gecerli === false`
     bakılıyordu ve mesajı boşaltan bir mutant sessiz bir diyalog üretirdi. */
  it('boş ad mesajı TANILAYICI', () => {
    expect(lokasyonAdiGecerliMi('', digerleri)).toEqual({
      gecerli: false,
      hata: 'Lokasyon adı boş olamaz.',
    });
    expect(lokasyonAdiGecerliMi('   ', digerleri).hata).toBe('Lokasyon adı boş olamaz.');
  });

  it('benzersiz ad geçerli', () => {
    expect(lokasyonAdiGecerliMi('Salon', digerleri)).toEqual({ gecerli: true });
  });

  it('kendiId kendi kaydını çakışma saymıyor', () => {
    expect(lokasyonAdiGecerliMi('MUTFAK', digerleri, 'l1')).toEqual({ gecerli: true });
  });
});

describe('lokasyonlariTopla — otomatik toplama', () => {
  it('İÇ. başlığından iç mekân çıkarıyor', () => {
    const bloklar = [blok(0, 'scene', 'İÇ. MUTFAK - GÜN')];
    const sonuc = lokasyonlariTopla(bloklar, 'tr');
    expect(sonuc).toEqual([{ ad: 'MUTFAK', tip: 'ic', ilkBlokId: 'b0' }]);
  });

  it('DIŞ. başlığından dış mekân çıkarıyor', () => {
    const bloklar = [blok(0, 'scene', 'DIŞ. SOKAK - GECE')];
    expect(lokasyonlariTopla(bloklar, 'tr')).toEqual([{ ad: 'SOKAK', tip: 'dis', ilkBlokId: 'b0' }]);
  });

  it('aynı mekân farklı sahnelerde TEK kayda düşüyor, İLK geçiş korunuyor', () => {
    const bloklar = [
      blok(0, 'scene', 'İÇ. MUTFAK - GÜN'),
      blok(1, 'scene', 'İÇ. mutfak - gece'),
    ];
    const sonuc = lokasyonlariTopla(bloklar, 'tr');
    expect(sonuc).toHaveLength(1);
    expect(sonuc[0].ilkBlokId).toBe('b0');
  });

  it('mekân terimi çözülemeyen başlık VARSAYILAN tipe düşüyor, yutulmuyor', () => {
    const bloklar = [blok(0, 'scene', 'GENEL')];
    expect(lokasyonlariTopla(bloklar, 'tr')).toEqual([
      { ad: 'GENEL', tip: VARSAYILAN_LOKASYON_TIPI, ilkBlokId: 'b0' },
    ]);
  });

  it('scene DIŞI bloklar yok sayılıyor', () => {
    const bloklar = [blok(0, 'action', 'İÇ. MUTFAK - GÜN yazan bir aksiyon satırı')];
    expect(lokasyonlariTopla(bloklar, 'tr')).toEqual([]);
  });

  /* ÖLÇEK: tek-iki bloklu testler tekilleştirmeyi gerçekten zorlamıyordu.
     Beş yüz sahne, iki yüz elli ayrı mekânın ikişer geçişi — birleştirme
     ve İLK geçişin korunması ölçekte sınanıyor. */
  it('ÖLÇEK: 500 sahne / 250 mekân — tekilleştirme ve İLK geçiş korunuyor', () => {
    const bloklar = Array.from({ length: 500 }, (_, i) =>
      blok(i, 'scene', `İÇ. ODA ${i % 250} - GÜN`));
    const sonuc = lokasyonlariTopla(bloklar, 'tr');
    expect(sonuc).toHaveLength(250);
    // Sıra belge sırası; her kayıt İLK geçtiği bloğu taşıyor (b0…b249).
    expect(sonuc.map((l) => l.ad)).toEqual(
      Array.from({ length: 250 }, (_, i) => `ODA ${i}`),
    );
    expect(sonuc.map((l) => l.ilkBlokId)).toEqual(
      Array.from({ length: 250 }, (_, i) => `b${i}`),
    );
    for (const l of sonuc) expect(l.tip, l.ad).toBe('ic');
  });

  /* NFD, emoji ve çok uzun mekân adı: sahne başlığı doğrudan yazarın
     metninden geliyor ve bu girdiler hiç sınanmamıştı. */
  it('NFD ve emoji mekân adları çökmeden toplanıyor', () => {
    const sonuc = lokasyonlariTopla([
      blok(0, 'scene', 'İÇ. IŞIKLI SALON - GÜN'.normalize('NFD')),
      blok(1, 'scene', 'DIŞ. 😀 PARKI - GECE'),
      blok(2, 'scene', 'İÇ. IŞIKLI SALON - GECE'.normalize('NFC')),
    ], 'tr');
    // NFD ve NFC aynı mekân: anahtar normalize ediliyor, TEK kayıt.
    expect(sonuc).toHaveLength(2);
    expect(sonuc[0].ad.normalize('NFC')).toBe('IŞIKLI SALON');
    expect(sonuc[0].ilkBlokId).toBe('b0');
    expect(sonuc[1]).toEqual({ ad: '😀 PARKI', tip: 'dis', ilkBlokId: 'b1' });
  });
});

describe('lokasyonSatirlari — kayıtlı ve senaryodaki birleşimi', () => {
  const bloklar = [blok(0, 'scene', 'İÇ. MUTFAK - GÜN')];

  it('yalnız senaryoda geçen lokasyon — id YOK', () => {
    expect(lokasyonSatirlari({}, bloklar, 'tr')).toEqual([
      { id: undefined, ad: 'MUTFAK', tip: 'ic', aciklama: '', ilkBlokId: 'b0' },
    ]);
  });

  it('hem kayıtlı hem senaryoda geçen lokasyon TEK satırda birleşiyor', () => {
    const kayit: Lokasyon = { id: 'l1', ad: 'Mutfak', tip: 'ic', aciklama: 'Ev içi', notlar: '' };
    expect(lokasyonSatirlari({ l1: kayit }, bloklar, 'tr')).toEqual([
      { id: 'l1', ad: 'Mutfak', tip: 'ic', aciklama: 'Ev içi', ilkBlokId: 'b0' },
    ]);
  });
});

describe('belge mutasyonları', () => {
  it('lokasyon eklenip okunuyor — kimlik üretiliyor, varsayılan tip İÇ', () => {
    const doc = new Y.Doc();
    const l = lokasyonEkle(doc, { ad: 'Mutfak' });
    expect(l.id).toMatch(/^lk_/);
    expect(lokasyonlarMap(doc).get(l.id)).toEqual({
      id: l.id, ad: 'Mutfak', tip: 'ic', aciklama: '', notlar: '',
    });
    expect(l).toEqual(lokasyonlarMap(doc).get(l.id));
  });

  /* Ön ek deseni BENZERSİZLİĞİ ölçmüyordu: sabit kimlik döndüren bir mutant
     her yeni lokasyonu bir öncekinin üstüne yazardı. */
  it('ÖLÇEK: 500 kimlik BENZERSİZ ve hepsi lk_ ön ekli', () => {
    const doc = new Y.Doc();
    const idler = Array.from({ length: 500 }, (_, i) => lokasyonEkle(doc, { ad: `L${i}` }).id);
    expect(new Set(idler).size).toBe(500);
    for (const id of idler) expect(id, id).toMatch(/^lk_/);
    expect(lokasyonlarMap(doc).size).toBe(500);
  });

  it('boş ad fırlatıyor', () => {
    const doc = new Y.Doc();
    expect(() => lokasyonEkle(doc, { ad: '' })).toThrow('Lokasyon adı boş olamaz.');
    expect(lokasyonlarMap(doc).size).toBe(0);
  });

  it('çakışan ad fırlatıyor', () => {
    const doc = new Y.Doc();
    lokasyonEkle(doc, { ad: 'Mutfak' });
    expect(() => lokasyonEkle(doc, { ad: 'MUTFAK' })).toThrow(/zaten bir lokasyon var/);
    expect(lokasyonlarMap(doc).size).toBe(1);
  });

  it('tip güncellemesi doğrulanıyor — bozuk değer varsayılana düşüyor', () => {
    const doc = new Y.Doc();
    const l = lokasyonEkle(doc, { ad: 'Sokak', tip: 'dis' });
    lokasyonGuncelle(doc, l.id, { tip: 'gecersiz' as never });
    expect(lokasyonlarMap(doc).get(l.id)!.tip).toBe(VARSAYILAN_LOKASYON_TIPI);
  });

  it('güncelleme verilmeyen alanı KORUYOR', () => {
    const doc = new Y.Doc();
    const l = lokasyonEkle(doc, { ad: 'Mutfak', tip: 'ic' });
    lokasyonGuncelle(doc, l.id, { aciklama: 'geniş' });
    expect(lokasyonlarMap(doc).get(l.id)).toEqual({
      id: l.id, ad: 'Mutfak', tip: 'ic', aciklama: 'geniş', notlar: '',
    });
  });

  it('yeniden adlandırma başka kayıtla çakışırsa fırlıyor ve ESKİ ad kalıyor', () => {
    const doc = new Y.Doc();
    lokasyonEkle(doc, { ad: 'Mutfak' });
    const b = lokasyonEkle(doc, { ad: 'Salon' });
    expect(() => lokasyonGuncelle(doc, b.id, { ad: 'MUTFAK' })).toThrow(/zaten bir lokasyon var/);
    expect(lokasyonlarMap(doc).get(b.id)!.ad).toBe('Salon');
  });

  it('olmayan kayıt güncellenemiyor — false', () => {
    const doc = new Y.Doc();
    expect(lokasyonGuncelle(doc, 'yok', { ad: 'x' })).toBe(false);
  });

  it('silme yoksa false, varsa true', () => {
    const doc = new Y.Doc();
    expect(lokasyonSil(doc, 'yok')).toBe(false);
    const l = lokasyonEkle(doc, { ad: 'Mutfak' });
    expect(lokasyonSil(doc, l.id)).toBe(true);
    expect(lokasyonlarMap(doc).size).toBe(0);
  });

  it('yazım LOCAL_ORIGIN taşıyor', () => {
    const doc = new Y.Doc();
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    lokasyonEkle(doc, { ad: 'Mutfak' });
    expect(originler).toContain(LOCAL_ORIGIN);
    /* `toContain` origin"siz İKİNCİ bir yazımı görmezdi; o yazım geri alma
       yığınına girmez ve geri alma yarım kalırdı. TEK yazım, TEK origin. */
    expect(originler).toEqual([LOCAL_ORIGIN]);
    const l = lokasyonEkle(doc, { ad: 'Salon' });
    originler.length = 0;
    lokasyonGuncelle(doc, l.id, { aciklama: 'x' });
    expect(originler).toEqual([LOCAL_ORIGIN]);
    originler.length = 0;
    lokasyonSil(doc, l.id);
    expect(originler).toEqual([LOCAL_ORIGIN]);
  });

  it('geri alınabiliyor', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager([lokasyonlarMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    lokasyonEkle(doc, { ad: 'Mutfak' });
    undo.undo();
    expect(lokasyonlarMap(doc).size).toBe(0);
  });
});

describe('lokasyonlar KORUMALI izdüşümde', () => {
  it('ekleme izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    lokasyonEkle(doc, { ad: 'Mutfak' });
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('silme izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const l = lokasyonEkle(doc, { ad: 'Mutfak' });
    const once = protectedProjection(doc);
    lokasyonSil(doc, l.id);
    expect(protectedProjection(doc)).not.toBe(once);
  });
});
