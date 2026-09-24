import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfPaketiKur } from '@storyboard/core/disa/paket';
import { araligiUygula, VARSAYILAN_FILIGRAN } from '@storyboard/core/disa/pdf';
import { tipProfili } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import { metinKonumlari } from './yardim/pdf-konum';
import zlib from 'node:zlib';
import { PDFArray, PDFName, PDFRawStream } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * §16.2 BORCU: sayfa aralığı, başlık sayfası ve filigran YOKTU.
 *
 * Üçü de listede sayılıyordu. Hepsi VARSAYILAN KAPALI: filigranlı ya da
 * eksik sayfalı bir dosya kazayla teslim edilirse geri alınamaz.
 */

const gerek = createRequire(import.meta.url);
const duz = new Uint8Array(fs.readFileSync(path.join(
  path.dirname(gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf')),
  'CourierPrime_400Regular.ttf',
)));

const blok = (i: number): ScriptBlock =>
  ({ id: `b${i}`, fp: '', type: 'action', text: `Satır ${i} ${'uzun '.repeat(8)}`, scene: '', sceneId: '' });

const BLOKLAR = Array.from({ length: 300 }, (_, i) => blok(i));
const profil = tipProfili('senaryo', 'letter', 'tr');

async function kur(ek: Record<string, unknown> = {}) {
  const { pdf, senaryoSayfa } = await pdfPaketiKur({
    kapsam: 'senaryo',
    profil,
    yaziTipleri: { duz },
    bloklar: BLOKLAR,
    kareler: [],
    ...ek,
  });
  return { pdf, senaryoSayfa, belge: await PDFDocument.load(pdf) };
}

/** Sayfanın içerik akışını düz metin olarak verir (gerekirse açarak). */
function sayfaAkisi(belge: PDFDocument, sayfaNo: number): string {
  const sayfa = belge.getPage(sayfaNo);
  const ham = sayfa.node.Contents();
  if (!ham) return '';
  const akislar = ham instanceof PDFArray
    ? ham.asArray().map((r) => sayfa.node.context.lookup(r))
    : [ham];
  let ops = '';
  for (const a of akislar) {
    if (!(a instanceof PDFRawStream)) continue;
    const bayt = Buffer.from(a.getContents());
    ops += String(a.dict.get(PDFName.of('Filter')) ?? '').includes('FlateDecode')
      ? zlib.inflateSync(bayt).toString('latin1')
      : bayt.toString('latin1');
  }
  return ops;
}

describe('sayfa aralığı', () => {
  const tam = sayfala(BLOKLAR, profil);

  it('belge birden çok sayfa — test anlamlı', () => {
    expect(tam.length).toBeGreaterThan(4);
  });

  it('aralık verilmezse TÜM sayfalar', () => {
    expect(araligiUygula(tam)).toHaveLength(tam.length);
  });

  /* İKİ UCU DAHİL: kullanıcı "3-7. sayfalar" derken yedinciyi de kastediyor.
     Yarı açık aralık programcı sözleşmesidir ve arayüzde yalan söylerdi. */
  it('aralık iki ucu DAHİL', () => {
    expect(araligiUygula(tam, { ilk: 3, son: 7 })).toHaveLength(5);
  });

  it('seçilen sayfalar belgenin AYNI sayfaları — yeniden sayfalanmıyor', () => {
    /* Yalnız seçilen blokları sayfalasaydık sayfa sonu kararları bütün
       belgeninkinden farklı çıkardı: kullanıcı "3-7" isteyip başka bir
       kırılmayla basılmış sayfalar alırdı (Karar 34). */
    const kesit = araligiUygula(tam, { ilk: 3, son: 5 });
    expect(kesit.map((s) => s.no)).toEqual([3, 4, 5]);
    expect(kesit[0]!.satirlar).toEqual(tam[2]!.satirlar);
  });

  /* Aralık arayüz alanından geliyor; ters, sıfır ya da taşan değerler
     SESSİZCE düzeltiliyor çünkü boş bir PDF kullanıcıya hiçbir şey
     anlatmaz. */
  it('ters aralık tek sayfaya iniyor, boş dosya üretmiyor', () => {
    expect(araligiUygula(tam, { ilk: 7, son: 3 })).toHaveLength(1);
  });

  it('taşan ve sıfır sınırlar kırpılıyor', () => {
    expect(araligiUygula(tam, { ilk: 0, son: 999 })).toHaveLength(tam.length);
    expect(araligiUygula(tam, { ilk: -5, son: 1 })).toHaveLength(1);
  });

  it('PDF gerçekten daha az sayfa içeriyor', async () => {
    const { belge } = await kur({ aralik: { ilk: 2, son: 4 } });
    expect(belge.getPageCount()).toBe(3);
  });
});

describe('başlık sayfası', () => {
  it('varsayılan KAPALI', async () => {
    const { belge, senaryoSayfa } = await kur();
    expect(belge.getPageCount()).toBe(senaryoSayfa);
  });

  it('açıkken belgenin BAŞINA bir sayfa ekliyor', async () => {
    const { belge, senaryoSayfa } = await kur({ baslikSayfasi: { baslik: 'KAR', yazar: 'Ayşe' } });
    expect(belge.getPageCount()).toBe(senaryoSayfa + 1);
  });

  /* Başlık sayfası numaralanmaz ve "1 sayfa ≈ 1 dakika" sözleşmesine dahil
     değildir: orada hiçbir şey oynanmıyor. Sayıya eklenseydi programın
     söylediği süre bir dakika uzardı. */
  it('SAYFA SAYISINA girmiyor', async () => {
    const a = await kur();
    const b = await kur({ baslikSayfasi: { baslik: 'KAR' } });
    expect(b.senaryoSayfa).toBe(a.senaryoSayfa);
  });
});

describe('filigran', () => {
  /* İDDİA ÇİZİM AKIŞINDAN, dosya BOYUTUNDAN değil. İlk yazışımda bayt
     uzunluğu karşılaştırıyordum ve test KIRILGANDI: pdf-lib belgeye üretim
     tarihi yazıyor, yani aynı girdi her koşuda birkaç bayt farklı çıkabiliyor.

     `metinKonumlari` de kullanılamadı ve BU DA BİR BULGU: o yardımcı yalnız
     BİRİM matrisli (`1 0 0 1 x y Tm`) çizimleri sayıyor, filigran ise
     DÖNDÜRÜLMÜŞ bir matrisle yazılıyor. Yani onunla ölçmek filigranın
     döndüğünü kanıtlamanın da yolu. */
  const dondurulmusCizim = async (ek: Record<string, unknown>) => {
    const { belge } = await kur(ek);
    const ops = sayfaAkisi(belge, 0);
    const duz = metinKonumlari(belge, 0).length;
    /* Birim OLMAYAN metin matrisi = döndürülmüş çizim. */
    const tumu = (ops.match(/Tm\s*(?:<[0-9A-Fa-f]*>|\((?:[^()\\]|\\.)*\))\s*Tj/gu) ?? []).length;
    return { duz, dondurulmus: tumu - duz };
  };

  it('varsayılan KAPALI — kazayla filigranlı teslim yok', async () => {
    expect((await dondurulmusCizim({ filigran: null })).dondurulmus).toBe(0);
  });

  it('boş metinli filigran hiçbir şey çizmiyor', async () => {
    expect((await dondurulmusCizim({ filigran: { ...VARSAYILAN_FILIGRAN, metin: '' } })).dondurulmus)
      .toBe(0);
  });

  it('metin verilince sayfaya DÖNDÜRÜLMÜŞ bir çizim giriyor', async () => {
    const { duz, dondurulmus } = await dondurulmusCizim({
      filigran: { ...VARSAYILAN_FILIGRAN, metin: 'TASLAK' },
    });
    expect(dondurulmus, 'filigran çapraz basılmalı').toBe(1);
    /* Gövde metni AZALMADI: filigran metnin yerine geçmiyor, altına giriyor. */
    expect(duz).toBe((await dondurulmusCizim({})).duz);
  });

  it('varsayılan açı soldan sağa YUKARI doğru', () => {
    expect(VARSAYILAN_FILIGRAN.aci).toBeGreaterThan(0);
    expect(VARSAYILAN_FILIGRAN.aci).toBeLessThan(90);
  });

  it('varsayılan opaklık gövde metnini okunmaz kılmayacak kadar açık', () => {
    expect(VARSAYILAN_FILIGRAN.opaklik).toBeLessThan(0.25);
    expect(VARSAYILAN_FILIGRAN.opaklik).toBeGreaterThan(0);
  });
});
