import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  BASLIK_SATIR_EN_COK,
  baslikSayfasiDuzelt,
  BASLIK_SAYFASI_ALAN_EN_UZUN,
  ILETISIM_SATIR_EN_COK, YAZAR_SATIR_EN_COK,
  BOS_BASLIK_SAYFASI,
} from '@storyboard/core/model/baslik-sayfasi';
import { baslikSayfasiGuncelle, LOCAL_ORIGIN } from '@storyboard/core/doc/mutations';
import { baslikSayfasiMap, readBaslikSayfasi } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';
import { ORAN, baslikSayfasiCiz } from '@storyboard/core/disa/baslik-sayfasi';

describe('baslikSayfasiDuzelt — belge elle kurcalanmış olabilir', () => {
  it('hiç kayıt yokken tüm alanlar boş çıkıyor', () => {
    // `BOS_BASLIK_SAYFASI` yalnız `{ baslik: '' }` — doğrudan `duzelt`in
    // çıktısıyla KIYASLANMIYOR, o yalnızca doküman boşken store'un ilk
    // değeri (PDF hiçbir satır çizmez, `baslik` zaten tek zorunlu alan).
    expect(baslikSayfasiDuzelt(undefined)).toEqual({
      baslik: '', altBaslik: '', yazar: '', surum: '', tarih: '', iletisim: [],
    });
    expect(baslikSayfasiDuzelt(undefined).baslik).toBe(BOS_BASLIK_SAYFASI.baslik);
  });

  it('dizge olmayan alanlar boşa düşüyor, çökmeden', () => {
    expect(baslikSayfasiDuzelt({ baslik: 42, yazar: null }).baslik).toBe('');
    expect(baslikSayfasiDuzelt({ baslik: 42, yazar: null }).yazar).toBe('');
  });

  it('uzun alan kırpılıyor', () => {
    const uzun = 'x'.repeat(BASLIK_SAYFASI_ALAN_EN_UZUN + 40);
    expect(baslikSayfasiDuzelt({ baslik: uzun }).baslik).toHaveLength(BASLIK_SAYFASI_ALAN_EN_UZUN);
  });

  it('iletişim dizi değilse boş diziye düşüyor', () => {
    expect(baslikSayfasiDuzelt({ iletisim: 'tek satır' }).iletisim).toEqual([]);
  });

  it('iletişim satır sayısı sınırlanıyor', () => {
    const cok = Array.from({ length: ILETISIM_SATIR_EN_COK + 5 }, (_, i) => `satır ${i}`);
    expect(baslikSayfasiDuzelt({ iletisim: cok }).iletisim).toHaveLength(ILETISIM_SATIR_EN_COK);
  });

  it('iletişim İÇİNDEKİ dizge-olmayan girdiler süzülüyor', () => {
    expect(baslikSayfasiDuzelt({ iletisim: ['a', 7, 'b'] }).iletisim).toEqual(['a', 'b']);
    // null, undefined, nesne ve dizi de düşüyor — yalnız sayı değil.
    expect(baslikSayfasiDuzelt({ iletisim: ['a', null, undefined, {}, [], 'b'] }).iletisim)
      .toEqual(['a', 'b']);
  });

  /* DÜZELTİLDİ: İletişim listesi artık `model/breakdown.ts`teki
     `metinListesiDuzelt` ile temizleniyor (Karar 2 — tek ev, iki
     sanitizasyon yolu yok). Boş ve yalnız-boşluktan ibaret girdiler
     düşüyor, kalanlar KIRPILIYOR, SIRA korunuyor. */
  it('boş satır ve baştaki/sondaki boşluk SÜZÜLÜYOR — sıra korunuyor', () => {
    expect(baslikSayfasiDuzelt({ iletisim: ['  a  ', '', '   ', 'b'] }).iletisim)
      .toEqual(['a', 'b']);
    expect(baslikSayfasiDuzelt({ iletisim: ['', '   ', '\t', '\n'] }).iletisim).toEqual([]);
    // Karışık: dizge-olmayan, boş VE boşluklu birlikte — hepsi doğru elenip kırpılıyor.
    expect(baslikSayfasiDuzelt({ iletisim: ['  ceket  ', '', 42, null, '  şapka  ', '   '] }).iletisim)
      .toEqual(['ceket', 'şapka']);
    /* Tek alanlar (baslik/yazar) bu maddenin kapsamı DIŞINDA — yalnız
       İLETİŞİM LİSTESİ düzeltiliyor, tekil metin alanları eskisi gibi
       dokunulmadan kalıyor. */
    expect(baslikSayfasiDuzelt({ baslik: '  Kar  ' }).baslik).toBe('  Kar  ');
    expect(baslikSayfasiDuzelt({ yazar: '\tAyşe\n' }).yazar).toBe('\tAyşe\n');
  });

  /* NFC normalizasyonu VAR ama hiç iddia edilmemişti: NFD gelen bir başlık
     PDF"te görünüşte doğru, kod birimi olarak farklı olurdu (Karar 23). */
  it('alanlar NFC normalize ediliyor', () => {
    const nfd = 'Ayşe'.normalize('NFD');
    expect(nfd).not.toBe('Ayşe'.normalize('NFC'));
    expect(baslikSayfasiDuzelt({ baslik: nfd }).baslik).toBe('Ayşe'.normalize('NFC'));
    expect(baslikSayfasiDuzelt({ iletisim: [nfd] }).iletisim).toEqual(['Ayşe'.normalize('NFC')]);
  });

  it('emoji ve çok satırlı metin bozulmadan geçiyor', () => {
    expect(baslikSayfasiDuzelt({ baslik: '👨‍👩‍👧 Aile' }).baslik).toBe('👨‍👩‍👧 Aile');
    /* BAŞLIK ÇOK SATIRLI (2026-08-30): tek satırlık alanda Enter hiçbir şey
       yapmıyordu ve uzun bir film adı yatayda kayıyordu. Taşma satır SAYISI
       ile sınırlanıyor, satır sonunu yutarak değil. */
    expect(baslikSayfasiDuzelt({ baslik: 'bir\niki' }).baslik).toBe('bir\niki');
    const cokSatir = Array.from({ length: 9 }, (_, i) => 'S' + i).join('\n');
    expect(baslikSayfasiDuzelt({ baslik: cokSatir }).baslik.split('\n')).toHaveLength(
      BASLIK_SATIR_EN_COK,
    );
    /* YAZAR alanı ÇOK SATIRLI: birden fazla yazar alt alta yazılır ve satır
       sonları KORUNUR — çizim her satırı ayrı ortalıyor. */
    expect(baslikSayfasiDuzelt({ yazar: 'Ali\nVeli' }).yazar).toBe('Ali\nVeli');
    /* Ama satır SAYISI sınırlı: sonsuz yazar listesi sayfayı taşırırdı. */
    const cokYazar = Array.from({ length: 20 }, (_, i) => `Yazar ${i}`).join('\n');
    expect(baslikSayfasiDuzelt({ yazar: cokYazar }).yazar!.split('\n')).toHaveLength(
      YAZAR_SATIR_EN_COK,
    );
  });

  /* Kırpma sınırı KOD BİRİMİ mi KOD NOKTASI mı: emoji dolu bir başlık
     sınırda yarım vekil bırakırsa PDF"e bozuk karakter iner. */
  it('uzun emoji başlık kırpılırken yarım vekil bırakmıyor', () => {
    const kirpik = baslikSayfasiDuzelt({ baslik: '😀'.repeat(BASLIK_SAYFASI_ALAN_EN_UZUN) }).baslik;
    expect(kirpik).toHaveLength(BASLIK_SAYFASI_ALAN_EN_UZUN);
    // Yarım vekil kalmadıysa yeniden kodlama kayıpsızdır.
    expect([...kirpik].every((k) => k === '😀' || k.codePointAt(0)! < 0xd800),
      'yarım vekil çifti kaldı').toBe(true);
  });
});

describe('baslikSayfasiGuncelle — belge mutasyonu, ALAN BAZLI', () => {
  it('yalnız verilen alanı yazıyor', () => {
    const doc = new Y.Doc();
    baslikSayfasiGuncelle(doc, { baslik: 'Küçük Kıyamet' });
    expect(baslikSayfasiMap(doc).toJSON()).toEqual({ baslik: 'Küçük Kıyamet' });
  });

  it('İKİ AYRI çağrı FARKLI alanları yazınca ikisi de KALIYOR', () => {
    // İki ortak yazarın aynı anda farklı alanları düzenlemesinin simülasyonu:
    // tek bileşik değer olsaydı ikincisi birinciyi ezerdi.
    const doc = new Y.Doc();
    baslikSayfasiGuncelle(doc, { baslik: 'Başlık' });
    baslikSayfasiGuncelle(doc, { yazar: 'Yazar Adı' });
    expect(readBaslikSayfasi(doc)).toEqual({
      baslik: 'Başlık', altBaslik: '', yazar: 'Yazar Adı', surum: '', tarih: '', iletisim: [],
    });
  });

  it('sanitizasyondan geçiyor — uzun başlık kırpılıyor', () => {
    const doc = new Y.Doc();
    const uzun = 'x'.repeat(BASLIK_SAYFASI_ALAN_EN_UZUN + 10);
    baslikSayfasiGuncelle(doc, { baslik: uzun });
    expect((baslikSayfasiMap(doc).get('baslik') as string)).toHaveLength(BASLIK_SAYFASI_ALAN_EN_UZUN);
  });

  it('yazım LOCAL_ORIGIN taşıyor', () => {
    const doc = new Y.Doc();
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    baslikSayfasiGuncelle(doc, { baslik: 'x' });
    expect(originler).toContain(LOCAL_ORIGIN);
    /* `toContain` alan başına AYRI yazım yapan (ve birini origin"siz
       bırakan) bir mutantı görmezdi; o yazım geri alma yığınına girmez ve
       geri alma yarım kalırdı. Çok alanlı yazım da TEK işlem olmalı. */
    expect(originler).toEqual([LOCAL_ORIGIN]);
    originler.length = 0;
    baslikSayfasiGuncelle(doc, { baslik: 'y', yazar: 'z', surum: '1', iletisim: ['a'] });
    expect(originler, 'dört alan TEK işlemde').toEqual([LOCAL_ORIGIN]);
  });

  /* Geri alma yolu hiç sınanmamıştı; LOCAL_ORIGIN"in tek amacı bu ve
     dört alanlık tek işlem sözleşmesi ancak burada anlam kazanıyor. */
  it('geri alınabiliyor — çok alanlı yazım TEK adımda geri dönüyor', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager([baslikSayfasiMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    baslikSayfasiGuncelle(doc, { baslik: 'Kar', yazar: 'Ayşe' });
    expect(baslikSayfasiMap(doc).toJSON()).toEqual({ baslik: 'Kar', yazar: 'Ayşe' });
    undo.undo();
    expect(baslikSayfasiMap(doc).size).toBe(0);
  });

  it('KORUMALI izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    baslikSayfasiGuncelle(doc, { baslik: 'x' });
    expect(protectedProjection(doc)).not.toBe(once);
  });
});

describe('ORAN dışa aktarılmış — ekran önizlemesi PDF ile AYNI oranı okuyor', () => {
  it('beklenen anahtarları ve DEĞERLERİ taşıyor', () => {
    expect(Object.keys(ORAN).sort()).toEqual(
      ['altBaslikUst', 'baslikUst', 'iletisimAlt', 'surumAlt', 'tarihAlt', 'yazanUst', 'yazarUst'].sort(),
    );
    /* Anahtar listesi, DEĞERLERİ hiç ölçmüyordu: hepsini 0 yapan ya da
       ikisini takas eden bir mutant geçerdi — ekran önizlemesi ile PDF"in
       "aynı oranı okuduğu" sözü tam da bu sayılarla tutuyor. */
    expect(ORAN).toEqual({
      baslikUst: 0.38, altBaslikUst: 0.44, yazanUst: 0.52,
      yazarUst: 0.56, iletisimAlt: 0.12, surumAlt: 0.12, tarihAlt: 0.09,
    });
  });

  /* Sayfadaki DİKEY SIRA: başlık → alt başlık → "yazan" → yazar, hepsi
     üstten; iletişim ve sürüm alttan. Bu sıra bozulursa PDF"te alanlar
     birbirinin üstüne biner ve tek tek doğru olan sayılar bunu göstermez. */
  it('oranlar sayfada DOĞRU SIRAYLA — üstten aşağı artıyor', () => {
    expect(ORAN.baslikUst).toBeLessThan(ORAN.altBaslikUst);
    expect(ORAN.altBaslikUst).toBeLessThan(ORAN.yazanUst);
    expect(ORAN.yazanUst).toBeLessThan(ORAN.yazarUst);
    // Üstten ölçülenler sayfanın içinde, alttan ölçülenlerle çakışmıyor.
    for (const [ad, v] of Object.entries(ORAN)) {
      expect(v, ad).toBeGreaterThan(0);
      expect(v, ad).toBeLessThan(1);
    }
    expect(ORAN.yazarUst + ORAN.iletisimAlt, 'üst blok ile alt blok çakışıyor')
      .toBeLessThan(1);
  });

  it('baslikSayfasiCiz hâlâ export ediliyor — dışa aktarım kırılmadı', () => {
    expect(typeof baslikSayfasiCiz).toBe('function');
  });
});
