import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument, PDFName } from 'pdf-lib';
import { pdfPaketiKur, type Kapsam } from '@storyboard/core/disa/paket';
import {
  sigdir,
  storyboardSayfaSayisi,
  type StoryboardKare,
} from '@storyboard/core/disa/storyboard-pdf';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';
import { pngUret } from './yardim/png';

const gerek = createRequire(import.meta.url);
const duz = new Uint8Array(
  fs.readFileSync(
    path.join(
      path.dirname(
        gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf'),
      ),
      'CourierPrime_400Regular.ttf',
    ),
  ),
);

const profil = profilOlustur('amerikan', 'letter', 'tr');

let sayac = 0;
const b = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${sayac++}`, fp: '', type, text, scene: '', sceneId: '',
});

const senaryo = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    b(i % 5 === 0 ? 'scene' : 'action', i % 5 === 0 ? `İÇ. ODA ${i} - GECE` : `Satır ${i} biraz metin taşır.`),
  );

/* Her panelin görseli BAŞKA genişlikte: sayfaya hangi panelin bastığı ancak
   böyle ölçülebilir. Hepsi aynı görsel olsaydı, ikinci sayfaya birinci
   sayfanın panellerini basan bir hata sayfa sayısını değiştirmediği için
   sessizce geçerdi. */
const GORSELLER = Array.from({ length: 40 }, (_, i) => pngUret(32 + i, 18));
const kareler = (n: number): StoryboardKare[] =>
  Array.from({ length: n }, (_, i) => ({
    dataUrl: GORSELLER[i],
    sahne: `${i + 1}`,
    cekim: 'A',
    sure: 2.5,
    not: 'Ayşe kapıyı iter.',
  }));

/** Bir sayfadaki gömülü görsellerin piksel genişlikleri. */
function sayfadakiGorselGenislikleri(belge: PDFDocument, sayfaNo: number): number[] {
  const xo = belge.getPage(sayfaNo).node.Resources()?.lookup(PDFName.of('XObject')) as
    | { keys(): unknown[]; lookup(k: unknown): { dict: { get(n: unknown): unknown } } }
    | undefined;
  if (!xo) return [];
  return xo
    .keys()
    .map((k) => Number(String(xo.lookup(k).dict.get(PDFName.of('Width')))))
    .sort((a, b) => a - b);
}

const kur = (kapsam: Kapsam, blokSayisi: number, panelSayisi: number) =>
  pdfPaketiKur({
    kapsam,
    profil,
    yaziTipleri: { duz },
    bloklar: senaryo(blokSayisi),
    kareler: kareler(panelSayisi),
  });

describe('§16.2 — senaryo ve storyboard AYRI AYRI aktarılabiliyor', () => {
  /* Kullanıcı kararı, bağlayıcı. İkisi farklı alıcılara gider; tek bir
     "projeyi aktar" düğmesi kullanıcıyı istemediği yarısını taşımaya
     zorlardı. Kapsam dışı bölüm GİZLENMİYOR, hiç çizilmiyor. */
  it('yalnız senaryo: storyboard sayfası HİÇ oluşmaz', async () => {
    const paket = await kur('senaryo', 40, 9);
    expect(paket.storyboardSayfa).toBe(0);
    expect(paket.senaryoSayfa).toBe(sayfala(senaryo(40), profil).length);
    const okunan = await PDFDocument.load(paket.pdf);
    expect(okunan.getPageCount()).toBe(paket.senaryoSayfa);
  }, 60_000);

  it('yalnız storyboard: senaryo sayfası HİÇ oluşmaz', async () => {
    const paket = await kur('storyboard', 40, 9);
    expect(paket.senaryoSayfa).toBe(0);
    expect(paket.storyboardSayfa).toBe(2); // 9 panel / sayfa başına 6
    const okunan = await PDFDocument.load(paket.pdf);
    expect(okunan.getPageCount()).toBe(2);
  }, 60_000);

  /* Bu test kapsam kapısının GERÇEKTEN çalıştığını ölçüyor: kapı yok
     sayılsaydı ya da ters çevrilseydi toplam tutmazdı. */
  it('ikisi birlikte = tam olarak iki ayrı aktarımın toplamı', async () => {
    const yalnizSenaryo = await kur('senaryo', 40, 9);
    const yalnizBoard = await kur('storyboard', 40, 9);
    const ikisi = await kur('ikisi', 40, 9);

    expect(ikisi.senaryoSayfa).toBe(yalnizSenaryo.senaryoSayfa);
    expect(ikisi.storyboardSayfa).toBe(yalnizBoard.storyboardSayfa);
    const okunan = await PDFDocument.load(ikisi.pdf);
    expect(okunan.getPageCount()).toBe(
      yalnizSenaryo.senaryoSayfa + yalnizBoard.storyboardSayfa,
    );
  }, 120_000);

  it('senaryo ÖNCE, storyboard ARKADA', async () => {
    /* Senaryo sayfası dolu metin taşır, storyboard sayfası görsel. İlk
       sayfaların metin akışı, son sayfaların görsel taşıması gerekir. */
    const paket = await kur('ikisi', 40, 9);
    const okunan = await PDFDocument.load(paket.pdf);
    const nesneler = okunan.context.enumerateIndirectObjects();
    // Gömülü PNG'ler yalnız storyboard bölümünde olabilir.
    expect(nesneler.map(([, n]) => String(n)).join(' ')).toContain('/Image');
    /* `> 0` senaryo sayfası sayısını hiç ölçmüyordu: 40 blokluk bu senaryo
       TAM İKİ sayfa tutuyor ve storyboard bölümü 9 panel / 6 = 2 sayfa.
       Toplam da çivili — kapsam kapısı yer değiştirse sayılar tutmaz. */
    expect(paket.senaryoSayfa).toBe(2);
    expect(paket.storyboardSayfa).toBe(2);
    expect(okunan.getPageCount()).toBe(paket.senaryoSayfa + paket.storyboardSayfa);
    expect(okunan.getPageCount()).toBe(4);
    /* SIRA da ölçülüyor: gömülü PNG"ler YALNIZ son iki sayfada olmalı.
       "/Image geçiyor" iddiası storyboard"u öne alan bir mutantı görmezdi. */
    expect(sayfadakiGorselGenislikleri(okunan, 0), 'ilk senaryo sayfası görselsiz').toEqual([]);
    expect(sayfadakiGorselGenislikleri(okunan, 1), 'ikinci senaryo sayfası görselsiz').toEqual([]);
    expect(sayfadakiGorselGenislikleri(okunan, 2)).toEqual([32, 33, 34, 35, 36, 37]);
    expect(sayfadakiGorselGenislikleri(okunan, 3)).toEqual([38, 39, 40]);
  }, 60_000);

  it('panelsiz proje: storyboard bölümü sıfır sayfa (boş kağıt basılmaz)', async () => {
    const paket = await kur('ikisi', 10, 0);
    expect(paket.storyboardSayfa).toBe(0);
    expect((await PDFDocument.load(paket.pdf)).getPageCount()).toBe(paket.senaryoSayfa);
  }, 60_000);
});

describe('panel ızgarası matematiği', () => {
  /* `floor` kullanmak yedi panelin sonuncusunu sessizce düşürürdü. */
  it('son sayfa dolu olmasa da SAYILIR', () => {
    expect(storyboardSayfaSayisi(1, 6)).toBe(1);
    expect(storyboardSayfaSayisi(6, 6)).toBe(1);
    expect(storyboardSayfaSayisi(7, 6)).toBe(2);
    expect(storyboardSayfaSayisi(12, 6)).toBe(2);
    expect(storyboardSayfaSayisi(13, 6)).toBe(3);
  });

  it('panelsizken sıfır sayfa', () => {
    expect(storyboardSayfaSayisi(0, 6)).toBe(0);
  });

  it('yedinci panel gerçekten İKİNCİ sayfaya basılıyor', async () => {
    const paket = await kur('storyboard', 0, 7);
    const okunan = await PDFDocument.load(paket.pdf);
    expect(okunan.getPageCount()).toBe(2);
    /* Sayfa numarasına göre indeksleme bozulursa (örn. sayfa ofseti
       düşerse) ikinci sayfa yine BASILIR ama üstünde ilk panel olur —
       sayfa sayısı bunu yakalamaz, görsel kimliği yakalar. */
    expect(sayfadakiGorselGenislikleri(okunan, 0)).toEqual([32, 33, 34, 35, 36, 37]);
    expect(sayfadakiGorselGenislikleri(okunan, 1)).toEqual([38]);
  }, 60_000);

  it('her panel BİR kez basılıyor — hiçbiri tekrarlanmıyor, düşmüyor', async () => {
    const paket = await kur('storyboard', 0, 9);
    const okunan = await PDFDocument.load(paket.pdf);
    const hepsi = [
      ...sayfadakiGorselGenislikleri(okunan, 0),
      ...sayfadakiGorselGenislikleri(okunan, 1),
    ].sort((a, b) => a - b);
    expect(hepsi).toEqual([32, 33, 34, 35, 36, 37, 38, 39, 40]);
  }, 60_000);
});

describe('görsel hücreye sığdırılıyor, kırpılmıyor', () => {
  /* Yalnız genişliğe göre ölçeklemek geniş paneli alt yazının üstüne
     bindirir; yalnız yüksekliğe göre ölçeklemek hücrenin dışına taşırır. */
  /* Aşağıdaki dört testte YALNIZ bir eksen çiviliydi; öteki `<=` ile
     serbest bırakılmıştı ve görüntüyü dikeyde ezen (ör. yüksekliği yarıya
     indiren) bir mutant hepsini geçerdi. İKİ EKSEN de tam değeriyle. */
  it('geniş görsel: yükseklik kutuyu aşmaz — 100×56,25', () => {
    const { gen, yuk } = sigdir(1920, 1080, 100, 100);
    expect(gen).toBeLessThanOrEqual(100);
    expect(yuk).toBeLessThanOrEqual(100);
    expect(gen).toBeCloseTo(100, 6);
    expect(yuk).toBeCloseTo(56.25, 6);
  });

  it('uzun görsel: genişlik kutuyu aşmaz — 56,25×100', () => {
    const { gen, yuk } = sigdir(1080, 1920, 100, 100);
    expect(gen).toBeLessThanOrEqual(100);
    expect(yuk).toBeCloseTo(100, 6);
    expect(gen).toBeCloseTo(56.25, 6);
  });

  it('oran KORUNUYOR — 88,89×50', () => {
    const { gen, yuk } = sigdir(1920, 1080, 200, 50);
    expect(gen / yuk).toBeCloseTo(1920 / 1080, 6);
    expect(gen).toBeLessThanOrEqual(200);
    expect(yuk).toBeLessThanOrEqual(50);
    expect(gen).toBeCloseTo(88.8888889, 6);
    expect(yuk).toBeCloseTo(50, 6);
  });

  it('küçük görsel BÜYÜTÜLÜR — hücre boş kalmaz, kare kare kalır', () => {
    const { gen, yuk } = sigdir(10, 10, 100, 100);
    expect(gen).toBeCloseTo(100, 6);
    expect(yuk).toBeCloseTo(100, 6);
  });

  /* Tek ekseni sıfır olan görsel: ölçek sıfıra iniyor ama sayı SONLU
     kalıyor — pdf-lib görünmez bir görsel çizer, sayfa bozulmaz. */
  it('tek ekseni sıfır olan görselde sonlu ölçü dönüyor', () => {
    for (const [g, y] of [[0, 100], [100, 0]] as const) {
      const { gen, yuk } = sigdir(g, y, 100, 100);
      expect(Number.isFinite(gen), `${g}×${y} genişlik`).toBe(true);
      expect(Number.isFinite(yuk), `${g}×${y} yükseklik`).toBe(true);
      expect(gen, `${g}×${y}`).toBeLessThanOrEqual(100);
      expect(yuk, `${g}×${y}`).toBeLessThanOrEqual(100);
    }
  });

  /* DÜZELTİLDİ: `sigdir(0, 0, ...)` artık NaN DEĞİL, sonlu (sıfır) ölçü
     döndürüyor. Görsel ölçüleri gömülü PNG"den okunuyor ve bozuk ya da
     sıfır boyutlu bir veri URL"i (kullanıcının panele sürüklediği bozuk
     dosya) buraya 0×0 olarak inebiliyordu; pdf-lib NaN koordinatla çizim
     çağrısı alırsa PDF sessizce bozulur. Artık böyle bir görsel sıfır
     boyutla çiziliyor — hücrede iz bırakmıyor ama sayfayı bozmuyor. */
  it('0×0 görsel artık NaN değil, SIFIR (sonlu) ölçü üretiyor', () => {
    const { gen, yuk } = sigdir(0, 0, 100, 100);
    expect(Number.isNaN(gen)).toBe(false);
    expect(Number.isNaN(yuk)).toBe(false);
    expect(gen).toBe(0);
    expect(yuk).toBe(0);
  });

  /* ÖLÇEK + değişmez: rastgele boyutların HİÇBİRİNDE kutu aşılmıyor ve
     oran korunuyor. Tek tek örnek testler bir kenar durumunu kaçırabilir. */
  it('bin farklı boyutta kutu aşılmıyor ve oran korunuyor', () => {
    for (let i = 1; i <= 1000; i++) {
      const g = 1 + ((i * 37) % 4000);
      const y = 1 + ((i * 53) % 3000);
      const kg = 10 + (i % 500);
      const ky = 10 + (i % 300);
      const { gen, yuk } = sigdir(g, y, kg, ky);
      expect(gen, `${g}×${y} → ${kg}×${ky}`).toBeLessThanOrEqual(kg + 1e-9);
      expect(yuk, `${g}×${y} → ${kg}×${ky}`).toBeLessThanOrEqual(ky + 1e-9);
      expect(gen / yuk, `${g}×${y} oran`).toBeCloseTo(g / y, 6);
      // En az bir eksen kutuya TAM dayanıyor — hücre boş kalmıyor.
      expect(Math.abs(gen - kg) < 1e-6 || Math.abs(yuk - ky) < 1e-6,
        `${g}×${y} hiçbir eksen dolmadı`).toBe(true);
    }
  });
});
