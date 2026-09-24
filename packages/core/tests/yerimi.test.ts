import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  ETIKET_EN_UZUN,
  VARSAYILAN_RENK,
  YER_IMI_RENKLERI,
  imdeGez,
  imiDuzelt,
  rengiDuzelt,
  siraliImler,
  type YerImi,
} from '@storyboard/core/model/yerimi';
import { yerImiCevir, yerImiKaldir, yerImiKoy, LOCAL_ORIGIN } from '@storyboard/core/doc/mutations';
import { yerImleriMap } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';

const im = (etiket: string, renk: string = VARSAYILAN_RENK): YerImi =>
  ({ etiket, renk }) as YerImi;

describe('değer temizliği — belge elle kurcalanmış olabilir', () => {
  it('paletin dışındaki renk varsayılana düşüyor', () => {
    expect(rengiDuzelt('turkuaz')).toBe(VARSAYILAN_RENK);
    expect(rengiDuzelt(42)).toBe(VARSAYILAN_RENK);
    expect(rengiDuzelt(undefined)).toBe(VARSAYILAN_RENK);
  });

  it('paletteki renk korunuyor', () => {
    for (const r of YER_IMI_RENKLERI) expect(rengiDuzelt(r)).toBe(r);
  });

  /* Boş etiket GEÇERLİ: kullanıcı hızlıca im koyup adlandırmayı sonraya
     bırakabilmeli. */
  it('boş etiket kabul ediliyor', () => {
    expect(imiDuzelt({ etiket: '', renk: 'mavi' }).etiket).toBe('');
  });

  it('uzun etiket kırpılıyor — çekmecede okunmaz olmasın', () => {
    const uzun = 'x'.repeat(ETIKET_EN_UZUN + 40);
    expect(imiDuzelt({ etiket: uzun }).etiket).toHaveLength(ETIKET_EN_UZUN);
  });

  it('etiket NFC normalize ediliyor — §6.2 ile aynı kural', () => {
    const ayrik = 'I' + String.fromCharCode(0x0307);
    expect(imiDuzelt({ etiket: ayrik }).etiket).toBe(ayrik.normalize('NFC'));
  });

  it('tamamen bozuk girdi çökmeden ime dönüyor', () => {
    expect(imiDuzelt(null)).toEqual({ etiket: '', renk: VARSAYILAN_RENK });
    expect(imiDuzelt('dizge')).toEqual({ etiket: '', renk: VARSAYILAN_RENK });
  });
});

describe('sıra BELGE KONUMUNA göre, ekleme sırasına göre değil', () => {
  /* Ekleme sırasına göre gezilseydi "sonraki im" yukarı doğru atlar ve
     sıçramalar rastgele görünürdü. */
  const bloklar = ['b0', 'b1', 'b2', 'b3', 'b4'];

  it('sonradan eklenen üstteki im ÖNE geliyor', () => {
    const imler = new Map<string, YerImi>([
      ['b3', im('sonra')],
      ['b1', im('once')],
    ]);
    expect(siraliImler(imler, bloklar).map((i) => i.blockId)).toEqual(['b1', 'b3']);
  });

  it('sıra bloğun indeksi — gezinme bunun üstüne kuruluyor', () => {
    const imler = { b2: im('a'), b4: im('b') };
    expect(siraliImler(imler, bloklar).map((i) => i.sira)).toEqual([2, 4]);
  });

  /* Bayat im (silinmiş bloğa ait) okurken SÜZÜLÜR, hevesle silinmez: silme
     bir geri-almayla yarışırsa im kalıcı olarak kaybolur. */
  it('silinmiş bloğun imi SÜZÜLÜYOR ama veriden atılmıyor', () => {
    const imler = new Map<string, YerImi>([['b1', im('var')], ['yok', im('bayat')]]);
    const sonuc = siraliImler(imler, bloklar);
    expect(sonuc.map((i) => i.blockId)).toEqual(['b1']);
    // Kaynak harita DOKUNULMADAN duruyor.
    expect(imler.has('yok')).toBe(true);
  });

  it('hiç im yoksa boş dönüyor', () => {
    expect(siraliImler({}, bloklar)).toEqual([]);
  });
});

describe('gezinme — SARMALAYARAK ileri ve geri', () => {
  const sirali = siraliImler(
    { b1: im('a'), b3: im('b'), b5: im('c') },
    ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
  );

  it('imleç imsiz bir satırdayken SONRAKİ imi buluyor', () => {
    expect(imdeGez(sirali, 2, 1)).toBe('b3');
  });

  it('imli satırdayken bir SONRAKİNE geçiyor, yerinde saymıyor', () => {
    expect(imdeGez(sirali, 3, 1)).toBe('b5');
  });

  /* Sarmasaydı son imdeyken tuş sessizce hiçbir şey yapmaz ve kullanıcı
     kısayolun bozulduğunu sanardı. */
  it('son imden sonra BAŞA dönüyor', () => {
    expect(imdeGez(sirali, 5, 1)).toBe('b1');
    expect(imdeGez(sirali, 6, 1)).toBe('b1');
  });

  it('geriye giderken önceki imi buluyor', () => {
    expect(imdeGez(sirali, 4, -1)).toBe('b3');
    expect(imdeGez(sirali, 3, -1)).toBe('b1');
  });

  it('ilk imden önce SONA sarmalıyor', () => {
    expect(imdeGez(sirali, 1, -1)).toBe('b5');
    expect(imdeGez(sirali, 0, -1)).toBe('b5');
  });

  it('imleç hiç yokken ileri ilk, geri son ime gidiyor', () => {
    expect(imdeGez(sirali, null, 1)).toBe('b1');
    expect(imdeGez(sirali, null, -1)).toBe('b5');
  });

  it('hiç im yoksa null — çağıran uydurmuyor', () => {
    expect(imdeGez([], 3, 1)).toBeNull();
    expect(imdeGez([], null, -1)).toBeNull();
  });

  it('tek im varsa her iki yön de ona götürüyor', () => {
    const tek = siraliImler({ b2: im('x') }, ['b0', 'b1', 'b2']);
    expect(imdeGez(tek, 2, 1)).toBe('b2');
    expect(imdeGez(tek, 2, -1)).toBe('b2');
  });
});

describe('belge mutasyonları', () => {
  it('im koyup okunuyor', () => {
    const doc = new Y.Doc();
    yerImiKoy(doc, 'b1', { etiket: 'Arzu itirafi', renk: 'kırmızı' });
    expect(yerImleriMap(doc).get('b1')).toEqual({ etiket: 'Arzu itirafi', renk: 'kırmızı' });
  });

  /* Aynı satıra ikinci kez im koymak İKİNCİ girdi açmaz — `Y.Map` seçilme
     gerekçesi bu. */
  it('aynı bloğa ikinci im tek girdiye yakınsıyor', () => {
    const doc = new Y.Doc();
    yerImiKoy(doc, 'b1', { etiket: 'ilk' });
    yerImiKoy(doc, 'b1', { etiket: 'ikinci' });
    expect(yerImleriMap(doc).size).toBe(1);
    expect(yerImleriMap(doc).get('b1')!.etiket).toBe('ikinci');
  });

  it('güncelleme verilmeyen alanı KORUYOR', () => {
    const doc = new Y.Doc();
    yerImiKoy(doc, 'b1', { etiket: 'ad', renk: 'mavi' });
    yerImiKoy(doc, 'b1', { etiket: 'yeni ad' });
    expect(yerImleriMap(doc).get('b1')!.renk).toBe('mavi');
  });

  it('kaldırma yoksa false döner', () => {
    const doc = new Y.Doc();
    expect(yerImiKaldir(doc, 'b1')).toBe(false);
    yerImiKoy(doc, 'b1');
    expect(yerImiKaldir(doc, 'b1')).toBe(true);
    expect(yerImleriMap(doc).size).toBe(0);
  });

  it('çevirme açıp kapatıyor ve SON durumu dönüyor', () => {
    const doc = new Y.Doc();
    expect(yerImiCevir(doc, 'b1')).toBe(true);
    expect(yerImleriMap(doc).size).toBe(1);
    expect(yerImiCevir(doc, 'b1')).toBe(false);
    expect(yerImleriMap(doc).size).toBe(0);
  });

  it('boş blok kimliği yazılmıyor', () => {
    const doc = new Y.Doc();
    yerImiKoy(doc, '', { etiket: 'x' });
    expect(yerImleriMap(doc).size).toBe(0);
  });

  /* Sunucu reddettiğinde istemcinin tek toparlanma yolu `store.undo()`;
     origin'siz yazım ALAKASIZ bir düzenlemeyi geri alırdı (sözlükte tam
     olarak bu hata yapılmıştı). */
  it('yazım LOCAL_ORIGIN taşıyor', () => {
    const doc = new Y.Doc();
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    yerImiKoy(doc, 'b1');
    expect(originler).toContain(LOCAL_ORIGIN);
  });

  it('geri alınabiliyor', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager([yerImleriMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    yerImiKoy(doc, 'b1', { etiket: 'x' });
    undo.undo();
    expect(yerImleriMap(doc).size).toBe(0);
  });
});

describe('yer imleri KORUMALI izdüşümde', () => {
  /* Dışarıda kalsalardı İzleyici ve Yorumcu sınırsız im yazabilir,
     başkasının imlerini silebilirdi. */
  it('im koymak izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    yerImiKoy(doc, 'b1', { etiket: 'x' });
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('etiketi değiştirmek de izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    yerImiKoy(doc, 'b1', { etiket: 'x' });
    const once = protectedProjection(doc);
    yerImiKoy(doc, 'b1', { etiket: 'y' });
    expect(protectedProjection(doc)).not.toBe(once);
  });
});
