import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  dunyaAdiDuzelt,
  dunyaAdiGecerliMi,
  dunyaAnahtari,
  dunyaTuruDuzelt,
  dunyalariSirala,
  gecerliKarakterBaglari,
  gecerliLokasyonBaglari,
  DUNYA_ADI_EN_UZUN,
  VARSAYILAN_DUNYA_TURU,
  type Dunya,
} from '@storyboard/core/model/dunya';
import {
  dunyaEkle,
  dunyaGuncelle,
  dunyaSil,
  dunyaKarakterBagla,
  dunyaKarakterBaginiKaldir,
  dunyaLokasyonBagla,
  dunyaLokasyonBaginiKaldir,
  LOCAL_ORIGIN,
} from '@storyboard/core/doc/mutations';
import { dunyalarMap } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';

describe('dunyaAdiDuzelt', () => {
  it('NFC normalize ediyor ve kırpıyor', () => {
    const ayrik = 'I' + String.fromCharCode(0x0307);
    expect(dunyaAdiDuzelt(`  ${ayrik}  `)).toBe(ayrik.normalize('NFC'));
  });

  it('uzun adı kırpıyor', () => {
    const uzun = 'x'.repeat(DUNYA_ADI_EN_UZUN + 40);
    expect(dunyaAdiDuzelt(uzun)).toHaveLength(DUNYA_ADI_EN_UZUN);
  });

  it('dizge olmayan girdide çökmeden boşa dönüyor', () => {
    expect(dunyaAdiDuzelt(null)).toBe('');
    expect(dunyaAdiDuzelt(42)).toBe('');
  });
});

describe('dunyaTuruDuzelt — belge elle kurcalanmış olabilir', () => {
  it('bilinen türü koruyor', () => {
    expect(dunyaTuruDuzelt('kavram')).toBe('kavram');
    expect(dunyaTuruDuzelt('olay')).toBe('olay');
  });

  it('bilinmeyen değer varsayılana düşüyor', () => {
    expect(dunyaTuruDuzelt('uydurma')).toBe(VARSAYILAN_DUNYA_TURU);
    expect(dunyaTuruDuzelt(undefined)).toBe(VARSAYILAN_DUNYA_TURU);
    expect(dunyaTuruDuzelt(42)).toBe(VARSAYILAN_DUNYA_TURU);
  });
});

describe('dunyaAnahtari — Türkçe İ/ı tuzağından bağımsız', () => {
  it('büyük/küçük Türkçe harf varyasyonları AYNI anahtara düşüyor', () => {
    expect(dunyaAnahtari('IŞIK İMPARATORLUĞU')).toBe(dunyaAnahtari('ışık imparatorluğu'));
  });
});

describe('dunyaAdiGecerliMi', () => {
  const digerleri: Dunya[] = [
    { id: 'd1', ad: 'İmparatorluk', tur: 'kurum', aciklama: '', notlar: '', bagliKarakterler: [], bagliLokasyonlar: [] },
  ];

  it('boş ad geçersiz', () => {
    expect(dunyaAdiGecerliMi('', digerleri)).toEqual({ gecerli: false, hata: 'Dünya adı boş olamaz.' });
  });

  it('çakışan ad (Türkçe katlamayla) geçersiz', () => {
    const sonuc = dunyaAdiGecerliMi('İMPARATORLUK', digerleri);
    expect(sonuc.gecerli).toBe(false);
    expect(sonuc.hata).toContain('İmparatorluk');
    /* `toContain` mesajın gerisini serbest bırakıyordu; kullanıcı KAYITLI
       hâli görmeli — yazdığı büyük harfli sürümü değil. */
    expect(sonuc).toEqual({
      gecerli: false,
      hata: '"İmparatorluk" adıyla zaten bir dünya var.',
    });
    for (const v of ['imparatorluk', 'İMPARATORLUK', 'İmParatorluk']) {
      expect(dunyaAdiGecerliMi(v, digerleri).gecerli, v).toBe(false);
    }
  });

  it('benzersiz ad geçerli', () => {
    expect(dunyaAdiGecerliMi('Kan Yemini', digerleri)).toEqual({ gecerli: true });
  });

  it('kendiId kendi kaydını çakışma saymıyor', () => {
    expect(dunyaAdiGecerliMi('İMPARATORLUK', digerleri, 'd1')).toEqual({ gecerli: true });
  });
});

describe('dunyalariSirala', () => {
  it('Türkçe alfabetik sıralıyor', () => {
    const a: Dunya = { id: '1', ad: 'Çekirge', tur: 'nesne', aciklama: '', notlar: '', bagliKarakterler: [], bagliLokasyonlar: [] };
    const b: Dunya = { id: '2', ad: 'Ağaç', tur: 'nesne', aciklama: '', notlar: '', bagliKarakterler: [], bagliLokasyonlar: [] };
    expect(dunyalariSirala({ '1': a, '2': b }).map((d) => d.ad)).toEqual(['Ağaç', 'Çekirge']);
  });

  /* İKİ ÖĞE Türkçe sıralamayı KANITLAMIYORDU: `Ağaç` < `Çekirge` ASCII"de
     de doğru, yani `sort()` kullanan bir mutant geçerdi. Türkçe alfabenin
     ASCII"den AYRILDIĞI yerler (`Ç` C"den sonra, `İ` I"den sonra, `Ö` O"dan
     sonra, `Ş` S"den sonra, `Ü` U"dan sonra) ancak tam alfabeyle görünür. */
  const yap = (id: string, ad: string): Dunya =>
    ({ id, ad, tur: 'nesne', aciklama: '', notlar: '', bagliKarakterler: [], bagliLokasyonlar: [] });

  it('Türkçe alfabe sırası ASCII"den AYRILIYOR — tam alfabeyle', () => {
    const adlar = ['Zeytin', 'Üzüm', 'Şeftali', 'Portakal', 'Öksüz', 'Nar',
      'Limon', 'İncir', 'Ihlamur', 'Elma', 'Dut', 'Çilek', 'Ceviz', 'Armut'];
    const kayit = Object.fromEntries(adlar.map((ad, i) => [`d${i}`, yap(`d${i}`, ad)]));
    expect(dunyalariSirala(kayit).map((d) => d.ad)).toEqual([
      'Armut', 'Ceviz', 'Çilek', 'Dut', 'Elma', 'Ihlamur', 'İncir',
      'Limon', 'Nar', 'Öksüz', 'Portakal', 'Şeftali', 'Üzüm', 'Zeytin',
    ]);
    // ASCII sıralaması FARKLI olurdu — mutantı ayıran nokta bu.
    expect([...adlar].sort()).not.toEqual(dunyalariSirala(kayit).map((d) => d.ad));
  });

  it('boş kayıt ve tek kayıt çökmüyor', () => {
    expect(dunyalariSirala({})).toEqual([]);
    expect(dunyalariSirala({ x: yap('x', 'Tek') }).map((d) => d.ad)).toEqual(['Tek']);
  });

  /* ÖLÇEK + KARARLILIK: aynı adı taşıyan kayıtlarda sıralama çökmemeli ve
     beş yüz kayıtta da tam sıralı olmalı. */
  it('ÖLÇEK: 500 kayıt sıralı, eş adlar kaybolmuyor', () => {
    const kayit: Record<string, Dunya> = {};
    for (let i = 0; i < 500; i++) kayit[`d${i}`] = yap(`d${i}`, `Dünya ${i % 250}`);
    const sirali = dunyalariSirala(kayit);
    expect(sirali).toHaveLength(500);
    // Eş adların ikisi de duruyor — biri ötekini ezmiyor.
    expect(new Set(sirali.map((d) => d.id)).size).toBe(500);
    const adlar = sirali.map((d) => d.ad);
    expect(adlar).toEqual([...adlar].sort((a, b) => a.localeCompare(b, 'tr')));
  });
});

describe('bayat bağ süzme — silinen kayda işaret eden bağ SÜZÜLÜR, kaydı DEĞİŞTİRMEZ', () => {
  const dunya: Pick<Dunya, 'bagliKarakterler' | 'bagliLokasyonlar'> = {
    bagliKarakterler: ['k1', 'k2-silinmis'],
    bagliLokasyonlar: ['l1-silinmis'],
  };

  it('mevcut olmayan karakter kimliği listeden düşüyor', () => {
    expect(gecerliKarakterBaglari(dunya, new Set(['k1']))).toEqual(['k1']);
  });

  it('hiçbiri mevcut değilse boş dizi dönüyor — çökmez', () => {
    expect(gecerliLokasyonBaglari(dunya, new Set())).toEqual([]);
  });

  it('ORİJİNAL dizi MUTASYONA UĞRAMIYOR — geri alınabilir silme için', () => {
    gecerliKarakterBaglari(dunya, new Set(['k1']));
    expect(dunya.bagliKarakterler).toEqual(['k1', 'k2-silinmis']);
  });
});

describe('belge mutasyonları', () => {
  it('dünya eklenip okunuyor — kimlik üretiliyor, boş bağ dizileriyle başlıyor', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'İmparatorluk', tur: 'kurum', aciklama: 'Büyük güç' });
    expect(d.id).toMatch(/^dn_/);
    expect(dunyalarMap(doc).get(d.id)).toEqual({
      id: d.id, ad: 'İmparatorluk', tur: 'kurum', aciklama: 'Büyük güç', notlar: '',
      bagliKarakterler: [], bagliLokasyonlar: [],
    });
    expect(d).toEqual(dunyalarMap(doc).get(d.id));
  });

  /* Ön ek deseni BENZERSİZLİĞİ ölçmüyordu: sabit kimlik döndüren bir mutant
     her yeni dünyayı bir öncekinin üstüne yazardı. */
  it('ÖLÇEK: 500 kimlik BENZERSİZ ve hepsi dn_ ön ekli', () => {
    const doc = new Y.Doc();
    const idler = Array.from({ length: 500 }, (_, i) => dunyaEkle(doc, { ad: `D${i}` }).id);
    expect(new Set(idler).size).toBe(500);
    for (const id of idler) expect(id, id).toMatch(/^dn_/);
    expect(dunyalarMap(doc).size).toBe(500);
    // Bağ dizileri PAYLAŞILMIYOR: birine bağ eklemek ötekini etkilemiyor.
    dunyaKarakterBagla(doc, idler[0]!, ['k1']);
    expect(dunyalarMap(doc).get(idler[0]!)!.bagliKarakterler).toEqual(['k1']);
    expect(dunyalarMap(doc).get(idler[1]!)!.bagliKarakterler).toEqual([]);
  });

  it('boş ad fırlatıyor — sessiz reddedilmiyor', () => {
    const doc = new Y.Doc();
    expect(() => dunyaEkle(doc, { ad: '' })).toThrow('Dünya adı boş olamaz.');
    expect(dunyalarMap(doc).size).toBe(0);
  });

  it('çakışan ad fırlatıyor', () => {
    const doc = new Y.Doc();
    dunyaEkle(doc, { ad: 'İmparatorluk' });
    expect(() => dunyaEkle(doc, { ad: 'İMPARATORLUK' })).toThrow(/zaten bir dünya var/);
    expect(dunyalarMap(doc).size).toBe(1);
  });

  it('güncelleme verilmeyen alanı KORUYOR', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'İmparatorluk', tur: 'kurum' });
    dunyaGuncelle(doc, d.id, { notlar: 'yeni not' });
    expect(dunyalarMap(doc).get(d.id)).toEqual({
      id: d.id, ad: 'İmparatorluk', tur: 'kurum', aciklama: '', notlar: 'yeni not',
      bagliKarakterler: [], bagliLokasyonlar: [],
    });
  });

  it('yeniden adlandırma başka kayıtla çakışırsa fırlıyor ve ESKİ ad kalıyor', () => {
    const doc = new Y.Doc();
    dunyaEkle(doc, { ad: 'İmparatorluk' });
    const b = dunyaEkle(doc, { ad: 'Veba' });
    expect(() => dunyaGuncelle(doc, b.id, { ad: 'İMPARATORLUK' })).toThrow(/zaten bir dünya var/);
    expect(dunyalarMap(doc).get(b.id)!.ad).toBe('Veba');
  });

  it('olmayan kayıt güncellenemiyor — false', () => {
    const doc = new Y.Doc();
    expect(dunyaGuncelle(doc, 'yok', { ad: 'x' })).toBe(false);
  });

  it('silme yoksa false, varsa true', () => {
    const doc = new Y.Doc();
    expect(dunyaSil(doc, 'yok')).toBe(false);
    const d = dunyaEkle(doc, { ad: 'İmparatorluk' });
    expect(dunyaSil(doc, d.id)).toBe(true);
    expect(dunyalarMap(doc).size).toBe(0);
  });

  it('yazım LOCAL_ORIGIN taşıyor', () => {
    const doc = new Y.Doc();
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    dunyaEkle(doc, { ad: 'İmparatorluk' });
    expect(originler).toContain(LOCAL_ORIGIN);
    /* `toContain` origin"siz İKİNCİ bir yazımı görmezdi; o yazım geri alma
       yığınına girmez ve geri alma yarım kalırdı. Bağlama/çıkarma yolları
       da aynı sözleşmede — onlar hiç sınanmamıştı. */
    expect(originler).toEqual([LOCAL_ORIGIN]);
    const d = dunyaEkle(doc, { ad: 'Veba' });
    for (const eylem of [
      () => dunyaGuncelle(doc, d.id, { notlar: 'x' }),
      () => dunyaKarakterBagla(doc, d.id, ['k1']),
      () => dunyaKarakterBaginiKaldir(doc, d.id, ['k1']),
      () => dunyaLokasyonBagla(doc, d.id, ['l1']),
      () => dunyaSil(doc, d.id),
    ]) {
      originler.length = 0;
      eylem();
      expect(originler).toEqual([LOCAL_ORIGIN]);
    }
  });

  it('geri alınabiliyor', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager([dunyalarMap(doc)], { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    dunyaEkle(doc, { ad: 'İmparatorluk' });
    undo.undo();
    expect(dunyalarMap(doc).size).toBe(0);
  });
});

describe('karakter/lokasyon bağlama — birleşim (küme), çıkarma (fark)', () => {
  it('bağlama BİRLEŞTİRİR — mevcut bağlar korunur', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'X' });
    dunyaKarakterBagla(doc, d.id, ['k1']);
    dunyaKarakterBagla(doc, d.id, ['k2']);
    expect(dunyalarMap(doc).get(d.id)!.bagliKarakterler.sort()).toEqual(['k1', 'k2']);
  });

  it('aynı kimlik iki kez bağlanınca YİNELENMİYOR', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'X' });
    dunyaKarakterBagla(doc, d.id, ['k1']);
    dunyaKarakterBagla(doc, d.id, ['k1']);
    expect(dunyalarMap(doc).get(d.id)!.bagliKarakterler).toEqual(['k1']);
  });

  it('bağ kaldırma yalnız verileni çıkarır, diğerini bırakır', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'X' });
    dunyaKarakterBagla(doc, d.id, ['k1', 'k2']);
    dunyaKarakterBaginiKaldir(doc, d.id, ['k1']);
    expect(dunyalarMap(doc).get(d.id)!.bagliKarakterler).toEqual(['k2']);
  });

  it('lokasyon bağlama/kaldırma da AYNI şekilde çalışıyor', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'X' });
    dunyaLokasyonBagla(doc, d.id, ['l1', 'l2']);
    dunyaLokasyonBaginiKaldir(doc, d.id, ['l1']);
    expect(dunyalarMap(doc).get(d.id)!.bagliLokasyonlar).toEqual(['l2']);
  });

  it('olmayan dünyaya bağlama false dönüyor', () => {
    const doc = new Y.Doc();
    expect(dunyaKarakterBagla(doc, 'yok', ['k1'])).toBe(false);
    expect(dunyaLokasyonBaginiKaldir(doc, 'yok', ['l1'])).toBe(false);
  });
});

describe('dünyalar KORUMALI izdüşümde', () => {
  it('ekleme izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    dunyaEkle(doc, { ad: 'İmparatorluk' });
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('bağlama izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'İmparatorluk' });
    const once = protectedProjection(doc);
    dunyaKarakterBagla(doc, d.id, ['k1']);
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('silme izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const d = dunyaEkle(doc, { ad: 'İmparatorluk' });
    const once = protectedProjection(doc);
    dunyaSil(doc, d.id);
    expect(protectedProjection(doc)).not.toBe(once);
  });
});
